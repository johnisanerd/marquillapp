# Pre-rollout document eval — runbook

How to run `bun run eval:documents` and record the result. The gates and the verdicts come from
[document-generation-spec.md](document-generation-spec.md) §11.3 and §11.4; the aggregates are §11.5's.
Issue: [#175](https://github.com/krispamB/marquillapp/issues/175).

The script is agent-written and the run is human work: it spends real model and Browserless budget, and
a person reviews the covers.

## What it does

It launches 20 runs through the same service path as `POST /artifacts` and `POST /artifacts/:id/refine`,
then polls the run records until every run ends:

| Runs | What |
|---|---|
| 18 INITIAL | the 6 listed launch Design Systems (read live from `DesignSystemsService.listActive()`) × a 4-, 8- and 15-page brief |
| 1 REFINE (carry) | a Refinement of the first `READY` initial run, with no `designSystemId`: it keeps the pin |
| 1 REFINE (switch) | a Refinement of the second `READY` initial run, switching to the first listed system that is not its own |

The briefs are fixtures in `src/scripts/eval-documents/briefs.ts`. Every system gets the same three, so a
failure is comparable across systems. Research is off for every run.

A run's status can end a moment before the worker saves its diagnostics, so after the last run ends the
script waits up to 2 minutes for every ended run's diagnostics. A run with none after that counts as failing.

The script only **enqueues**. The model calls, the Browserless sessions and the normal
`documentDiagnostics` all come from the **worker process**, so the numbers are the real pipeline's. If no
worker is consuming the queue, the runs sit `RUNNING` until `--timeout-min` and the eval fails.
The worker takes one workflow job at a time, so budget about 80 minutes in the worst case (20 runs × the 4-minute
limit); a healthy eval takes much less.

## Prerequisites

1. **`apps/api/.env`** with real values for the target environment: `MONGO_URI`, Redis, `OPENROUTER_API_KEY`,
   `GENERATION_MODEL`, the `BROWSERLESS_*` keys and the `R2_*` keys (the cover URLs are presigned from R2).
   The script prints nothing from it, but it **does write** to that environment's MongoDB and Redis, so
   check `MONGO_URI` points where you mean it to.
2. **Design Systems seeded:** `bun run seed:design-systems`. The six launch systems must all be `ACTIVE`
   and listed; the script refuses to start otherwise. An unlisted system cannot be evaluated, so run the
   eval before listing decisions land.
3. **Tiers seeded** (`bun run seed:tiers:temp`), so the eval user has a Tier to subscribe to.
4. **A worker running against the same MongoDB and Redis**, started separately:
   ```bash
   cd apps/api
   bun run build
   bun run start:worker
   ```
   Restart it after any `seed:design-systems` run: Design Systems are cached for the life of a process.
5. MongoDB and Redis reachable (`docker compose up -d` from the root for a local run).

## Run

From `apps/api`:

```bash
bun run eval:documents                                    # defaults
bun run eval:documents --concurrency 3 --timeout-min 90 --json eval-result.json
```

| Flag | Default | |
|---|---|---|
| `--concurrency <n>` | `2` | Runs the script keeps in flight. The worker takes one workflow job at a time (BullMQ's default; `workflow.worker.ts` sets no concurrency), so extra in-flight runs wait in the queue. That wait is not in the gates: they use each run's own `wallTimeMs` from its diagnostics, which counts from when the job starts. 2 keeps the queue primed. Raise it only if you run the worker with more concurrency. |
| `--timeout-min <m>` | `120` | One budget for the whole eval. A run still going when it ends is `TIMED_OUT`; runs not yet launched are `NOT_RUN`. Both count as failing. |
| `--json <path>` | none | Also writes the full result (records, per-run rows, aggregates, gates, covers). |

The exit code is **non-zero when any automatic gate fails**. Progress goes to stdout as each run launches
and ends, and run ids are printed at launch, so a crashed script can be picked up from Mongo.

### The eval user and credits

The runs belong to `eval@marquill.internal` ("Document Eval"): a Mongo-only `User` with no `clerkId`, so
it cannot sign in, and nothing is created in Clerk.

Credit gating (`FeatureGatingService.assertBalance`) refuses a run once the user's `credits` Usage for the
period reaches the Tier's limit, and it checks twice: when the script launches the run, and again when the
worker starts it. Twenty document runs would exceed the Free allowance (120 credits), and the worker starts
the next queued run the moment the last one settles, so resetting before launch alone can lose that race.
So the script does both:

- it upserts an **active Subscription** for the eval user on the active Tier with the most credits
  (the top paid tier in the tier seeds), valid for a year from each run of the script. It is a Mongo
  document with no Paddle or Polar id, so no billing webhook can touch it;
- before **each launch** it deletes that one user's `credits` Usage rows. It never touches any other user, and
  a run's own credits are read from its diagnostics, which the reset does not affect.

**Run it against a dev environment.** The Subscription row makes the eval user look like a paying subscriber
to anything that counts Subscription documents; remove the user's Subscription afterwards if that matters.

The user and its runs stay in the database. Re-running the eval reuses the user.

## Reading the output

1. **Runs** — each matrix entry, its state and run id. `NOT_RUN` and `LAUNCH_FAILED` carry the reason.
2. **Aggregates** — `DocumentMetricsService.aggregate({ runIds })` over exactly this eval's runs (§11.5),
   overall and per system, each with its failure codes, Repair rounds, top violations and first-candidate
   pass rate. Per-system figures group by the pin, so they include the Refinements that landed on that system.
3. **Gates** — each §11.3 gate, `PASS` or `FAIL`:
   - runs failing ≤ 1. A run that timed out, never launched or left no diagnostics counts as failing.
   - `document.truncated` = 0, counting a truncation that a job retry absorbed.
   - `render.egress` = 0, from the render checks in each run's diagnostics.
   - slowest run ≤ 4 minutes, from `documentDiagnostics.wallTimeMs`, failed runs included.
   - costliest successful run ≤ 3× the cheapest at the same page count, grouped by the pages the brief asked
     for. Only the 18 INITIAL runs are compared: a Refinement's prompt carries its source document, so it
     costs more by construction.
   - the default Design System (`margin`) has no failures. This is §11.4: the default may never be
     unlisted, so a failing default blocks rollout.
4. **Alerts** are log lines only, so the script cannot gate on them. It prints the window to search: check
   Railway logs for `[ALERT` between the printed start and end. Any alert is a failure.
5. **Per-system verdict** from each system's 3 INITIAL runs: 0 failures → *list it*; 1 → *re-run its 3 or
   ship it unlisted*; 2 or more → *unlist it*. Refinements are not counted.
6. **First-candidate pass rate** is printed, not gated.
7. **Cover review** — one row per `READY` run with its system, page count and a presigned cover URL (valid
   24 hours).

## What a person does

1. Run the eval as above.
2. Search the Railway logs for `[ALERT` over the printed window.
3. Open **every** cover in the table and look for text over gradients and positioning that escapes the
   spacing scale (§11.3). Note which run ids look wrong.
4. Comment on [#175](https://github.com/krispamB/marquillapp/issues/175) with: the gate table, the
   per-system verdicts, the first-candidate pass rate, the alert search result and the cover findings.
   **Do not paste the presigned cover URLs** into the issue: anyone with the link can read the image for
   24 hours. Refer to covers by run id.
5. File definition and prompt-fragment fixes the run surfaces as **new issues**; they are not fixed in #175.
6. For systems that fail, follow §11.4: ship them unlisted by adding them to `UNLISTED_DESIGN_SYSTEMS`
   (a deploy). A failing default blocks the rollout until it passes or the default changes to a system that
   passed.
