/**
 * Pre-rollout document eval (document generation spec §11.3). Run from
 * `apps/api`:
 *
 *   bun run eval:documents [--concurrency 2] [--timeout-min 120] [--json out.json]
 *
 * It launches the 20-run matrix (6 Design Systems x a 4-, 8- and 15-page
 * brief, plus a Refinement that carries the pin and one that switches system)
 * through the same service path as `POST /artifacts` and `.../refine`, then
 * waits for the worker to run them. The worker is a separate process
 * (`bun run start:worker`) and must run against the same MongoDB and Redis:
 * this script only enqueues, then reads the run records back, so the model and
 * Browserless calls are the worker's real ones and its diagnostics are the
 * normal `documentDiagnostics`. It prints the §11.5 aggregates, each §11.3
 * gate with PASS or FAIL, and a cover review table, and exits non-zero when
 * an automatic gate fails. See docs/document-eval-runbook.md.
 *
 * The runs belong to a dedicated Mongo-only user (`eval@marquill.internal`,
 * no `clerkId`, nothing in Clerk) on the default Tier. Before each launch the
 * script zeroes that one user's `credits` Usage, so credit gating never stops
 * the 20 runs; research is off for every run.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { AppModule } from '../app.module';
import { createEvalDeps } from './eval-documents/eval-deps';
import { parseEvalArgs } from './eval-documents/eval-options';
import { formatEvalReport } from './eval-documents/eval-report';
import { runDocumentEval } from './eval-documents/eval-runner';

async function run(): Promise<boolean> {
  const options = parseEvalArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await runDocumentEval(await createEvalDeps(app), options);
    console.log(formatEvalReport(result));
    if (options.jsonPath) {
      await writeFile(options.jsonPath, JSON.stringify(result, null, 2));
      console.log(`\nFull result written to ${options.jsonPath}`);
    }
    return result.evaluation.passed;
  } finally {
    await app.close();
  }
}

run()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((error: unknown) => {
    console.error(
      '[eval:documents]',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
