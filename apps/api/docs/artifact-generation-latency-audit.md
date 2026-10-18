# Artifact generation: per-run latency audit

> What one user waits for between clicking Generate and seeing the artifact, per artifact type, and what can come off that wait. Companion to [artifact-generation-performance-model.md](./artifact-generation-performance-model.md), which covers the call map and behaviour under load. Read from `main` at `de27671` on 2026-10-18.
>
> **Superseded in parts.** [artifact-generation-performance-plan.md](./artifact-generation-performance-plan.md) §2 corrects several items below after a code review (A7, D1, D3, D7, D10, priorities, the index key), and its §4 is the implementation plan.

> **Measured** means read from the local Mongo `workflowruns` (40 recent DOCUMENT runs: `documentDiagnostics`, `renderAttempts[].phaseMs`) or from the live OpenRouter `/models` endpoint. **Est.** means inferred. Most of the local runs used remote Browserless and R2 from a dev machine, so their network figures are pessimistic.

## 1. The finding that decides the rest: reasoning effort is never set

`OpenRouterStrategy.send` (`llm/strategies/openrouter.strategy.ts`) sends no `reasoning` field, so every call gets the model's default. That default depends on which model is configured (OpenRouter `/models`, read 2026-10-18):

| Model | Where it is configured | Reasoning by default |
| --- | --- | --- |
| `openai/gpt-5.4` | `.env.example` `GENERATION_MODEL` | off |
| `openai/gpt-6-luna-pro` | local `apps/api/.env` `GENERATION_MODEL` | **on, `medium`** |
| `openai/gpt-5-mini` | `RESEARCH_MODEL` | **mandatory, `medium`** (lowest is `minimal`) |

**Measured on the local runs:** clean DOCUMENT drafts used 9–22k output tokens, yet the accepted HTML was 3–14k characters (about 1–4k tokens). One draft spent 9,342 output tokens and 60.8 s on 3,262 characters. One REFINE that barely reasoned wrote 4.8k characters with 1,847 tokens in 15.4 s. Measured throughput was about 120–200 tok/s. **On a reasoning-default model, most of the GENERATE wait is hidden reasoning.**

`toUsage` (`openrouter.strategy.ts:35-43`) discards `completionTokensDetails.reasoningTokens` and `promptTokensDetails.cachedTokens`, so production cannot show this split today. **Check which `GENERATION_MODEL` production runs.** If it is a Luna model, item D1 below is the largest win in this document.

Also verified: the OpenRouter SDK defaults to **no request timeout** and retries 5xx/connection errors for up to **1 hour** (`node_modules/@openrouter/sdk/esm/funcs/chatSend.js:54,69`), before BullMQ's 3 job attempts.

## 2. What the user waits for, per type

| Run | Wait today (est. unless marked) | Dominated by |
| --- | --- | --- |
| POLL | 5–12 s | 1 generation call |
| POST | 8–20 s | 1 generation call (+1 repair on a Zod miss) |
| + research | +20–45 s | 2–6 serial `gpt-5-mini` turns at medium reasoning, Tavily `advanced` |
| DOCUMENT | **60–200 s GENERATE + 2–20 s RENDER_PDF (measured)** | draft call; half of runs spend ≥1 Repair (measured 20/40), and each render Repair adds 35–50 s (measured) |
| Plumbing on every run | 0.4–1.3 s | client navigation before the stream opens, sequential Mongo reads |

## 3. Findings, ranked by seconds saved

`Waste` = the user waits for something that need not be on their path. `Faster` = necessary work done more quickly.

### Every type

| # | Kind | Change | Where | Saves | Size |
| --- | --- | --- | --- | --- | --- |
| A1 | Waste | Open the SSE stream as soon as the page has a `runId`, in parallel with the artifact GET, not after hydration. Replay with `seq` dedupe makes early opening safe. | `apps/web/app/redesign/ArtifactConversationClient.tsx:219` (`enabled: isHydrated`), `useArtifactRun.ts` | 0.3–1 s to first progress | S |
| A2 | Waste | Emit `run.completed` right after `run.complete`, then debit. The debit is already best-effort; "persist before announcing" covers the run record, not the debit. Don't `Promise.all` complete + debit: a retry after a failed complete would double-debit. | `workflow/engine/workflow.engine.ts:95-104` | 10–40 ms | XS |
| A3 | Waste | Stop awaiting `setCurrentStep` (fire-and-forget with a logged catch), or drop it. Nothing reads `currentStep`. The only reader is a legacy dashboard modal polling an endpoint that no longer exists. | `workflow.engine.ts:75` | 25–100 ms | XS |
| A4 | Waste | Resolve the entitlement once: one subscription read gives both tier and period. Cache tiers in process. Parallelise the worker's research check, diagnostics read and balance check. Pre-generate `_id`s and insert artifact + run together. | `feature-gating.service.ts:211`, `artifact-generation.service.ts`, `artifact-run.worker.handler.ts:98`, `workflow.engine.ts:57` | 0.1–0.3 s | S–M |
| A5 | Faster | Put the POST/POLL content in `run.completed` (keep the GET as the fallback for replays and snapshots), so the reload round trip disappears. | `run-event.types.ts`, `useArtifactRun.ts` | 0.1–0.25 s | M |
| A6 | Faster | Replace `router.replace(cleanArtifactUrl)` after completion with `history.replaceState`. Today it re-renders the server page and its uncached workspace fetches while the result loads. | `ArtifactConversationClient.tsx:202` | background load | XS |
| A7 | Tail | Set `timeoutMs` and a bounded `retryConfig.maxElapsedTime` on the OpenRouter client. Today a hung call never times out and a flapping one retries for up to an hour. | `openrouter.strategy.ts` constructor | bounds the tail | XS |
| A8 | Guard | Pin `reasoning.effort` per call site from config, and record `reasoningTokens` and `cachedTokens` in usage. | `openrouter.strategy.ts:35-43`, `agent-runner.service.ts` | 0 s today, prevents silent regressions | XS |

### POST and POLL

| # | Kind | Change | Where | Saves | Size |
| --- | --- | --- | --- | --- | --- |
| P1 | Faster | **Stream the commentary.** `stream: true`, parse `commentary` incrementally, emit throttled `step.progress { partial }`. The SSE contract already allows step-defined progress fields. Total time is unchanged, but text appears after about 1 s instead of at the end. | `openrouter.strategy.ts`, `agent-runner.service.ts`, `docs/sse-progress-contract-design.md`, web renderer | ~10 s **perceived** | M |
| P2 | Waste | Enforce in the schema, or fix in code, what Zod `.refine()` checks but strict json_schema cannot: make `durationDays` a literal enum, and handle the 30-character option cap, the 140-character question cap and option uniqueness. Today a miss costs a full repair call. Count `first draft failed validation` warnings to size this. | `artifact/schemas/artifact-content.schema.ts:21-79` | 4–15 s on runs that miss | S |
| P3 | Faster | A faster model for POLL (output is about 100–300 tokens, so it is TTFT-bound) and possibly POST. Needs an eval, because writing quality is the product. | `GENERATION_MODEL` split per type | POST est. 5–9 s, POLL 1–2 s | S + eval |

### Research (POST/POLL/DOCUMENT with `withResearch`)

| # | Kind | Change | Where | Saves | Size |
| --- | --- | --- | --- | --- | --- |
| R1 | Waste | Set `reasoning.effort: 'minimal'` on research turns. | `agent-runner.service.ts` `run()` | est. 30–60% of each turn | XS |
| R2 | Waste | Rewrite the prompt from "run several searches with progressively refined queries" to "issue all queries in one turn (parallel tool calls), then answer", and lower `RESEARCH_MAX_STEPS` to 2–3. Tool waves already run in parallel. | `agent/prompts/research.prompts.ts:16-17`, `.env` | 10–30 s | S |
| R3 | Faster | Tavily `searchDepth: 'basic'` or `'fast'` (the SDK supports `basic`, `advanced`, `fast` and `ultra-fast`) with an explicit timeout; the SDK default is 60 s. | `agent/tools/search-web.tool.ts:40` | 1–3 s per wave | XS |
| R4 | Faster | Bigger change: drop the agent loop. One cheap query-generation call, one parallel Tavily wave, and raw deduped snippets (capped) passed straight to generation in place of a `gpt-5-mini` prose synthesis. | `agent-runner.service.ts:160-290`, `research.step.ts`, refine reuse | research from 20–45 s to ~3–5 s | M |
| R5 | Retry | Resume RESEARCH from the saved `researchContext` on a job retry. | `research.step.ts` | 20–45 s per retried run | S |

### DOCUMENT

| # | Kind | Change | Where | Saves | Size |
| --- | --- | --- | --- | --- | --- |
| D1 | Waste | **Pin reasoning effort on the draft and the Repairs** (start at `low` for the draft and `low`/`minimal` for Repairs; choose with `document-eval-runbook.md`). Only applies if production uses a reasoning-default model. | `agent-runner.service.ts:598-611`, `openrouter.strategy.ts` | **est. 40–120 s per draft, 20–40 s per Repair** | XS + eval |
| D2 | Faster | **Patch-based Repairs**: the model answers with `{edits: [{find, replace}]}`, applied deterministically, with a full re-emit when a `find` is not unique. Static violations still go back to the model, because spec §4.4 forbids sanitising them. | `agent/prompts/artifact-generation.prompts.ts:287-295`, `workflow/steps/document-repair.ts` | est. 8–25 s per Repair | M |
| D3 | Waste | Cut the Repair rate: add prompt lines aimed at the most common codes (`page.safeArea`, `render.overlap`, `icons.colors`, `palette.pairings`, measured). Half of runs repair today. | document prompts / Design System fragment | 35–50 s on every run moved to zero Repairs (measured cost) | S + eval |
| D4 | Waste | `Promise.all` the 3–4 R2 PUTs in `publish`, keeping the cover's own try/catch. "Written before promotion" still holds. Deferring the PDF upload is blocked: the client loads it immediately. | `workflow/steps/render-pdf.step.ts:387-414` | 0.3–1 s prod, 2–4 s measured dev | XS |
| D5 | Faster | Co-locate Browserless with the Railway worker. Remote sessions measured 11–15 s; the same documents locally took ~2 s, and every remote phase reads as round trips. Check production `renderAttempts[].phaseMs` first. | infra | est. 8–12 s per session | infra |
| D6 | Faster | Fewer CDP round trips: send page setup calls together, don't await `cdp.detach()`, reuse Browserless's initial page. | `document-render/render-session.ts:117-179` | 1–3 s remote, ~0 co-located | S |
| D7 | Faster | Inline the Google Fonts as `@font-face` data URIs, fetched once per process for each definition. The load phase took 0.7–1.5 s even locally, and this removes most `render.fonts.failed` retries (2 s sleep + another session). The request filter must allow `data:` fonts, or the refusal becomes a terminal `render.egress`. Amends spec §4.5. | `document-source/assemble.ts:173-182`, `render-session.ts:125-136` | 0.5–1.4 s per session | M |
| D8 | Waste | A session headed for FINDINGS still captures the cover and prints the PDF. Skip the cover when probe findings already exist (the PDF is still needed for the page count). | `render-session.ts:182-202` | 0.1–0.9 s per failing session | S |
| D9 | Faster | REFINE: read the base candidate from `run_candidate_sources` while it has not expired (falling back to R2), in parallel with `getLatestCompletedResearch`. | `workflow/steps/resolve-input.step.ts:73-110` | 0.6–1.7 s measured dev | S |
| D10 | Faster | Drop the JSON envelope for the HTML (escaped `"` and `\n` add about 5–10% tokens), and let `assemble()` write the derivable boilerplate (doctype, head, `:root` tokens, reset). Changes the Candidate Source contract and `check()`. | prompts, `assemble.ts`, `candidate-check.ts` | est. 5–10% of draft time | M |
| D11 | Faster | Pass `sessionId: runId` so the draft and its Repairs (byte-identical system prompt) stay on one warm provider cache. | `openrouter.strategy.ts` | est. 0.2–1 s per Repair | XS |

## 4. Checked and not worth doing

- BullMQ pickup: an idle worker wakes on the marker in about one round trip (`BZPOPMIN`); `drainDelay` adds no latency.
- No artificial delays or minimum display times in the progress UI.
- SSE headers, compression bypass and terminal-event delivery are already correct.
- Mongo writes during a DOCUMENT run: milliseconds each (PERSIST_VERSION measured 8–29 ms). CPU (`check`, `judge`, `assemble`, sha256): within ~150 ms per run measured.
- `recordDocumentRun` already runs after `run.completed`.
- `max_tokens` values, title generation, schema conversion per call, and Tavily client construction: all negligible.
- Pre-connecting Browserless during the draft: it would bill idle 30 s units against a 70 s Browserless timeout.

## 5. Order of work

1. **A8 + D1 + R1**: record reasoning tokens, then pin effort per call site behind config, gated by the document eval. Smallest change, largest saving.
2. **A7, D4, A2, A3**: XS each, safe, independent.
3. **R2 + R3**, then decide on **R4**.
4. **A1** (first progress sooner) and **P1** (streamed posts): the two changes users will notice in how the wait feels.
5. **D3 → D2**: fewer Repairs, then cheaper Repairs.
6. Measure production `phaseMs`, then **D5** or **D6/D7**.

Before and after each step, compare GENERATE wall time and output-token split per run from `documentDiagnostics`, which step 1 makes possible.
