# Artifact generation: call model and load analysis

> Scope: every function, external API call, Mongo operation and Redis operation on the path from "user clicks Generate" to "artifact on screen", for POST, POLL and DOCUMENT, INITIAL and REFINE. Then what happens when 100 users do it at once. Read from the code on `main` at `de27671` (2026-10-18). Latency figures marked **est.** are estimates, not measurements; §5 says how to measure them.

> **Superseded in parts.** [artifact-generation-performance-plan.md](./artifact-generation-performance-plan.md) §2 corrects several items below after a code review (A7, D1, D3, D7, D10, priorities, the index key), and its §4 is the implementation plan.

## 1. Topology

```
Browser ──► Vercel (apps/web, rewrite /api/v1/* → BACKEND_API_URL)
              │
              ▼
        API process (Railway, NestJS HTTP)  ──►  MongoDB  ◄──  Worker process (Railway)
              │                                              │
              └──── Redis (BullMQ queue, throttler, run event streams) ────┘
                                                             │
                                  OpenRouter · Tavily · Browserless · R2
```

The API does only cheap work: gate, create the records, enqueue, and relay progress. Every model, search, render and upload call happens in the worker.

## 2. The function model

### 2.1 HTTP: `POST /artifacts` (INITIAL)

```
ArtifactController.create                       artifact/artifact.controller.ts
├─ ClerkAuthGuard.canActivate                    auth/clerk/clerk-auth.guard.ts
│  ├─ verifyToken (Clerk JWKS; network only when keys are not cached / no CLERK_JWT_KEY)
│  └─ UserProvisioningService.findOrCreate
│     └─ [M] users.findOne({clerkId})            (first sight only: Clerk API getUser + 2–3 more [M])
├─ UserThrottlerGuard                            [R] throttler counter (1 script call)
└─ ArtifactGenerationService.launchInitialRun   artifact/artifact-generation.service.ts
   ├─ pinDesignSystem → DesignSystemsService.getActive        (in-memory)
   ├─ if withResearch: FeatureGatingService.assertResearchAccess
   │  └─ resolveEntitlement
   │     ├─ [M] subscriptions.findOne({userId}).sort(updatedAt)
   │     └─ [M] tiers.findById(sub.tierId)  or  tiers.findOne({isDefault})
   ├─ CreditMeterService.assertBalance → FeatureGatingService.assertBalance
   │  ├─ resolveEntitlementTier → resolveEntitlement           [M] subscriptions.findOne, [M] tiers.find*
   │  ├─ resolveUsagePeriodStart → resolveUsagePeriod          [M] subscriptions.findOne   (same doc, again)
   │  └─ getUsageCount                                          [M] usages.findOne
   ├─ ArtifactService.createArtifact                           [M] artifacts.insertOne
   └─ persistAndEnqueueRun
      ├─ WorkflowRunService.createRun                          [M] workflowruns.insertOne
      └─ WorkflowQueue.addArtifactRunJob                       [R] BullMQ add (jobId = runId, attempts 3, backoff 1s exp)
→ 202 { artifactId, runId }
```

Every call above is sequential. **Mongo round trips: 7 (no research) or 9 (research).** The subscription document is read 2–3 times and the tier 1–2 times in one request.

### 2.2 HTTP: `POST /artifacts/:id/refine` (REFINE)

```
auth + throttle                                  [M] users.findOne, [R] throttler
launchRefineRun
├─ assertBalance                                 [M] ×4 (as above)
├─ ArtifactService.appendRefineVersion
│  ├─ [M] artifacts.findOne({_id, user})        (whole document, every version)
│  ├─ DOCUMENT: designSystems.pinForRefine       (in-memory; [M] design_systems.findOne on a cache miss)
│  └─ [M] artifacts.updateOne($push GENERATING attempt, guarded)
├─ [M] workflowruns.insertOne
└─ [R] BullMQ add
```

**Mongo round trips: 8.**

### 2.3 HTTP: `GET /runs/:runId/events` (SSE, open for the whole run)

```
auth + throttle                                  [M] users.findOne, [R] throttler
RunEventStreamService.relay                      artifact/run-event-stream.service.ts
├─ [M] workflowruns.findById
├─ terminal run: [R] XREAD (+ XLEN) → replay, snapshot or 204
└─ live run: client.duplicate()  ← a NEW Redis connection per open stream
   └─ loop: [R] XREAD BLOCK 15000 COUNT 100 STREAMS workflow:run:{id} <cursor>
            (heartbeat every 15 s while idle; ends on run.completed / run.failed)
```

A reconnect (network blip, Vercel proxy cut) repeats all of it: auth, run read, new Redis connection.

### 2.4 Worker: one job attempt

`ArtifactRunProcessor.process` (`workflow/workers/artifact-run.worker.handler.ts`) → `runWorkflow` (`workflow/engine/workflow.engine.ts`). Steps come from `buildWorkflow`:

| Type / kind | Steps |
| --- | --- |
| POST, POLL · INITIAL | RESOLVE_INPUT → [RESEARCH] → GENERATE → PERSIST_VERSION |
| POST, POLL · REFINE | RESOLVE_INPUT → GENERATE → PERSIST_VERSION |
| DOCUMENT · INITIAL | RESOLVE_INPUT → [RESEARCH] → GENERATE → RENDER_PDF → PERSIST_VERSION |
| DOCUMENT · REFINE | RESOLVE_INPUT → GENERATE → RENDER_PDF → PERSIST_VERSION |

```
process(job)
├─ INITIAL+research: assertResearchAccess                     [M] ×2   (already checked over HTTP)
├─ DOCUMENT: run.readDocumentDiagnostics                       [M] workflowruns.findById (projection)
└─ runWorkflow
   ├─ emit run.started                                         [R] XADD
   ├─ meter.assertBalance                                      [M] ×4   (already checked over HTTP)
   ├─ for each step:
   │  ├─ run.setCurrentStep                                    [M] workflowruns.updateOne
   │  ├─ emit step.started / step.completed                    [R] XADD ×2
   │  └─ handler(state, ctx)  ── see below
   ├─ run.complete(credits)                                    [M] workflowruns.updateOne
   ├─ meter.commit → FeatureGatingService.debit                [M] subscriptions.findOne, [M] usages.updateOne(upsert)
   └─ emit run.completed                                       [R] XADD + EXPIRE 3600
DOCUMENT only: recordDocumentRun → saveDocumentDiagnostics     [M] workflowruns.updateOne (+ run_candidate_sources upsert on failure)
```

Every `usage.tick` (one per model turn, one per search, one per render bill) is also an `XADD`.

**RESOLVE_INPUT** (`steps/resolve-input.step.ts`)
- `artifacts.readVersion` → [M] `artifacts.findById` (full document).
- DOCUMENT: `designSystems.resolve` (in-memory cache) + `renderPromptFragment` (CPU).
- REFINE: `readRefineInput` → [M] `artifacts.findById` again; `getLatestCompletedResearch` → [M] `workflowruns.findOne(...).sort(createdAt)` (indexed).
- DOCUMENT REFINE: [API] R2 `GetObject candidate.html` + sha256.

**RESEARCH** (`steps/research.step.ts` → `AgentRunnerService.research` → `run`)
- Up to `RESEARCH_MAX_STEPS` (5) turns of [API] OpenRouter `chat.send` with tools, model `RESEARCH_MODEL` (`gpt-5-mini`), each followed by a wave of [API] Tavily `search` (advanced depth, 5 results) run in parallel, capped at 5 successful searches. A run that spends every turn makes one more tools-free completion: **≤ 6 LLM calls, ≤ 5 searches.**
- [M] `workflowruns.updateOne(researchContext)`.

**GENERATE, POST/POLL** (`steps/generate.step.ts` → `AgentRunnerService.generate`)
- 1 [API] OpenRouter structured completion (`GENERATION_MODEL`, `gpt-5.4`, `max_tokens` 8192), + 1 repair completion if Zod fails. **1–2 LLM calls.** No Mongo.

**GENERATE, DOCUMENT** (`generateDocument` + `steps/document-repair.ts`)
- [M] `readAcceptedCandidate`: `workflowruns.findById` (+ `run_candidate_sources.findOne` if a checkpoint exists, in which case the model is skipped).
- Draft: 1 [API] OpenRouter completion (`max_tokens` 16384), + 1 envelope repair if the JSON fails Zod.
- Static check loop: `check()` (CPU, `document-source/candidate-check.ts`) → [M] `workflowruns.updateOne($push documentChecks)` per check. Each static Repair is another full-document [API] completion. Repair budget 2, shared with RENDER_PDF.

**RENDER_PDF, DOCUMENT** (`steps/render-pdf.step.ts`)
Per render loop:
- `assemble()` (CPU).
- `saveAcceptedCandidate` → [M] `run_candidate_sources.updateOne(upsert)` + [M] `workflowruns.updateOne`.
- `renderDocumentSession` → [API] Browserless over WebSocket: `puppeteer.connect`, `newPage`, JS off, request interception, `emulateMediaType`, `setViewport`, `setContent` (fetches Google Fonts), probe `evaluate`, CDP `DOM.getDocument` + `querySelectorAll` + one `CSS.getPlatformFontsForNode` per text element (parallel), `screenshot`, `pdf`, `disconnect`. 60 s deadline; 13–17 s for 2–4 pages per the spec.
- `judge()` (CPU) → [M] `$push documentChecks`.
- Not passed: [M] `$push renderAttempts`; a `retry` finding sleeps 2 s and renders again once; `repair` findings spend a Repair (LLM) and re-run the static loop.
On pass: [API] R2 `PutObject` ×3–4, **sequential** (`candidate.html`, `source.html`, `document.pdf`, `cover.png`), [M] `$push renderAttempts`.

**PERSIST_VERSION** (`steps/persist-version.step.ts` → `ArtifactService.promoteVersion`)
- [M] `artifacts.findById` + [M] `artifacts.updateOne` (guarded promote). A replay adds one more `findById`.

### 2.5 After the run

The client sees `run.completed`, closes the stream, and loads the artifact: `GET /artifacts/:id` → [M] `users.findOne`, [M] `artifacts.findById`, [M] `workflowruns.find` (attempt run ids), plus for a DOCUMENT a locally signed R2 URL (no network) and a cached Design System lookup.

### 2.6 Totals per happy-path run

| Run | Mongo ops (HTTP + worker + SSE + reload) | Redis ops (ex. BullMQ internals) | LLM calls | Tavily | Browserless | R2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| POST/POLL · INITIAL | 7 + 13 + 2 + 3 = **25** | ~12 | 1 (2 with repair) | 0 | 0 | 0 |
| POST/POLL · INITIAL + research | 9 + 17 + 2 + 3 = **31** | ~20 | 3–8 | 1–5 | 0 | 0 |
| POST/POLL · REFINE | 8 + 15 + 2 + 3 = **28** | ~12 | 1–2 | 0 | 0 | 0 |
| DOCUMENT · INITIAL, clean | 7 + 21 + 2 + 3 = **33** | ~16 | 1 | 0 | 1 session | 3–4 PUT |
| DOCUMENT · INITIAL, 2 Repairs + 1 render retry | ~45 | ~25 | 3–5 | 0 | 2–4 sessions | 3–4 PUT |
| DOCUMENT · REFINE | ~36 | ~16 | 1–5 | 0 | 1–4 sessions | 1 GET + 3–4 PUT |

Of the ~13–21 worker Mongo ops, **6–8 are entitlement reads already done over HTTP** (subscription ×3, tier ×1–2, usage ×1, plus the research check).

## 3. Where the time goes (one run, no contention)

`gpt-5.4` is published at ~1 s TTFT and ~57 output tok/s (`ai-document-visual-review-research.md` §2.5). Reasoning tokens bill and stream as output, so real figures can be several times higher. The local measurements in [artifact-generation-latency-audit.md](./artifact-generation-latency-audit.md) supersede this table for DOCUMENT: 60–200 s GENERATE on a reasoning-default model, at ~120–200 tok/s.

| Run | Dominant cost | **est.** worker wall time |
| --- | --- | --- |
| POLL | 1 completion, ~300–500 tokens | 8–12 s |
| POST | 1 completion, ~600–1,000 tokens | 12–20 s |
| + research | 2–6 `gpt-5-mini` turns + Tavily advanced waves | +20–45 s |
| DOCUMENT, clean | draft (~4–8k tokens of HTML in JSON) + 1 render | 90–160 s |
| DOCUMENT, each Repair | another full-document completion (+ render if a render Repair) | +70–150 s |
| DOCUMENT ceiling | `DOCUMENT_RUN_DEADLINE_MS` per job attempt | 360 s, ×3 attempts |

Mongo, Redis, R2 and CPU together are a few hundred milliseconds per run if Mongo is in the same region as Railway. The LLM is >90% of wall time for every type.

## 4. 100 users generating at once

Assume a burst of 100 launches: 40 POST, 20 POLL, 40 DOCUMENT, 30 of them with research, and the current deployment of one worker replica.

### 4.1 The worker processes one job at a time

`new Worker(QUEUE_NAME, …)` at `workflow/workers/workflow.worker.ts:76` passes no `concurrency`, so BullMQ 5.66 uses its default of **1** (`node_modules/bullmq/dist/esm/classes/worker.js:32`). `ai-document-visual-review-research.md` §1.3 already noted this.

Serial work for the burst, **est.**: 40×15 + 20×10 + 40×110 + 30×30 ≈ **6,100 s ≈ 100 minutes**. The 100th user gets a result about 1 h 40 min after clicking Generate, the median user about 50 minutes. While they wait, the worker sits on network I/O for nearly the whole time: one Node process can hold dozens of these jobs at once.

It is also one FIFO queue for every type. A 10-second POLL queued behind 40 documents waits over an hour. This is head-of-line blocking, and it gets worse in proportion to the document share of traffic.

With concurrency C on one replica, the burst drains in roughly `max(6,100 / C, longest job)`: about 5 minutes at C = 20, about 2–3 minutes (bounded by the slowest document) at C = 50. Raising C moves the bottleneck to the external services below.

### 4.2 What breaks once concurrency is raised

1. **Browserless session cap.** 40 documents need 40+ render sessions within a few minutes. Each session holds a browser for ~15 s. When the plan's concurrent-session limit is exceeded, Browserless queues and then rejects (the local compose sets `CONCURRENT: 4`, `QUEUED: 10`). A rejected `puppeteer.connect` becomes `RenderSessionError` → transient → **whole-job retry** with a 1 s / 2 s backoff, too short to wait out saturation. After 3 attempts the run fails as `render.unavailable`. The checkpoint saves the LLM spend, but the user still loses the run. Nothing in the code limits concurrent renders.

2. **LLM rate limits and slow calls.** 429 and 5xx are classified retryable (`llm/errors/llm.error.ts`), but the retry is the **whole job from step 1**:
   - POST/POLL with research: a 429 on the GENERATE call re-runs the entire research loop (up to 6 LLM calls and 5 Tavily searches), because RESEARCH does not read the `researchContext` its earlier attempt already saved. The user is charged once (`meter.reset()`), but the operator pays for every attempt.
   - The OpenRouter call has no request timeout, and POST/POLL have no run deadline (`RunDeadline` is checked only in DOCUMENT steps). A hung completion holds a worker slot indefinitely while BullMQ keeps renewing the lock.
   The OpenRouter SDK also retries 5xx and connection errors internally for up to an hour, and sets no request timeout by default (`node_modules/@openrouter/sdk/esm/funcs/chatSend.js:54,69`).

3. **Deploys restart in-flight runs.** The worker installs no SIGTERM handler and never calls `worker.close()`. On a Railway deploy, in-flight jobs are abandoned, detected as stalled after `stalledInterval` (30 s) and re-run from step 1. At concurrency 1 that is one run; at concurrency 30 it is 30 runs re-billed to the operator, with ~30 s of dead air on every user's progress bar. `maxStalledCount: 1` means a second stall fails the job.

4. **One Redis connection per watcher.** `relayLive` calls `client.duplicate()` per open SSE stream (`artifact/run-event-stream.service.ts:136`), so 100 watchers are 100 extra Redis connections on the API, each with its own TCP/TLS + AUTH handshake, re-made on every reconnect. Under concurrency 1, with users waiting up to 100 minutes, those connections are held for the whole wait, and every proxy cut repeats auth + run lookup + connection setup. Fine at 100, but it grows linearly with concurrent watchers, and managed Redis plans cap connections.

5. **The SSE path runs through the Vercel rewrite.** Long-lived streams to an external destination are subject to Vercel's proxy limits. Reconnect with `Last-Event-ID` makes this survivable, but each reconnect costs the work in item 4. Check this against Vercel's current limits.

6. **Mongo pool of 10 per process** (`database/database.module.ts:45`). Not a problem at concurrency 1. At concurrency 30–50, each run's ~20 short worker operations plus the SSE and launch traffic on the API can queue on 10 sockets. Raise it with concurrency, and make it configurable per process.

### 4.3 What does not break

- **Mongo load.** ~30 operations per run × 100 runs ≈ 3,000 small indexed operations spread over minutes. Every hot query is indexed except `artifacts.user` (§5, item 13).
- **Redis load.** ~15–25 `XADD`s per run plus BullMQ bookkeeping: trivial.
- **Worker memory.** A DOCUMENT run holds a candidate (tens of KB), a PDF and a PNG (around 1–2 MB together). 50 concurrent documents stay well under 200 MB.
- **Worker CPU.** `check()`, `judge()`, `assemble()`, sha256, and `z.toJSONSchema` on every LLM call are synchronous on the event loop. Likely milliseconds each, but unmeasured; at high concurrency they serialise, so profile them before going past ~50.
- **Throttling.** 10 launches per user per minute is per user, so 100 users are not throttled. Nothing stops one user from occupying 10 worker slots, though.

## 5. Optimisation backlog, by impact at 100 concurrent users

| # | Change | Effect | Size |
| --- | --- | --- | --- |
| 1 | Set `concurrency` on the `workflow` Worker from env (e.g. `WORKFLOW_CONCURRENCY`, start at 10–20) | Burst from ~100 min to minutes | S |
| 2 | Split text and document work: separate queues (or BullMQ priorities) so POST/POLL never wait behind DOCUMENT | Removes head-of-line blocking | S–M |
| 3 | Gate Browserless: a Redis-backed semaphore sized to the plan's session limit, waited on before `connect` (inside the run deadline) | Saturation causes a wait, not a failed run | M |
| 4 | Retry LLM 429/5xx/timeouts in place (per call, jittered backoff, honour `Retry-After`) and set a request timeout | A rate-limit blip no longer replays the whole job | S–M |
| 5 | RESEARCH resumes from the saved `researchContext` on a job retry, as GENERATE does from its checkpoint | No re-paid research on retry | S |
| 6 | Graceful worker shutdown: on SIGTERM, `worker.close()` (stop taking jobs, let in-flight ones finish within the platform's drain window) | Deploys stop re-running live jobs | S |
| 7 | Resolve entitlement once per request: one subscription read, period start derived from the same document, tiers cached in memory (they change only on seed) | Launch path from 7–9 sequential round trips to ~4 | S |
| 8 | Let the worker skip the re-check, or make it one usage read against an entitlement carried in the job, keeping the drained-wallet guard | −6 to −8 Mongo ops per run | S |
| 9 | Multiplex SSE: one blocking `XREAD` connection per API process over all watched stream keys, fanning out to responses | Redis connections constant rather than per watcher | M |
| 10 | Raise and configure `maxPoolSize` per process | Avoids pool queueing at high concurrency | XS |
| 11 | Per-user cap on in-flight runs (BullMQ groups, or a counter checked at launch) | One user cannot take every slot | M |
| 12 | `Promise.all` the R2 PUTs in `publish`; project only needed fields in `readVersion`/`promoteVersion`; memoise the provider JSON schema per Zod schema; build the Tavily client once | Small latency and CPU wins | XS each |
| 13 | Add an index on `artifacts { user: 1, createdAt: -1 }` (library list and dashboard aggregate; not the generation path) | Keeps reads fast as the collection grows | XS |

Items 1, 4, 5 and 6 should ship together. Concurrency multiplies the cost of whole-job retries and of deploy restarts.

## 6. Before tuning: measure

The estimates in §3 are the weakest part of this document. Data that already exists:

- `workflowruns.renderAttempts[].durationMs` and the phase trace give real render times.
- DOCUMENT `documentDiagnostics` has model turns and repairs spent per run.
- `createdAt` → `updatedAt` on completed `workflowruns` gives end-to-end time, including queue wait.

Not yet recorded: queue wait (job `timestamp` → `processedOn`), per-LLM-call latency, Tavily latency. Add these to the run record or logs before load testing. Then run a load test of N concurrent launches against staging with a real Browserless plan to find the actual session ceiling.
