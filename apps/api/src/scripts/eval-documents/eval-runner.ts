import type {
  DocumentMetrics,
  DocumentRunRow,
} from '../../diagnostics/document-metrics';
import type { DocumentMetricsQuery } from '../../diagnostics/document-metrics.service';
import {
  buildEvalMatrix,
  switchTarget,
  type RefineEvalEntry,
} from './eval-matrix';
import { evaluateEval, type EvalEvaluation } from './eval-gates';
import type { EvalRunRecord } from './eval-record';

/** The launch set (spec §3.6): six listed systems, so the matrix is 20 runs. */
export const LAUNCH_SET_SIZE = 6;

export interface EvalOptions {
  /** Runs in flight at once, so queue wait does not distort wall time. */
  concurrency: number;
  /** One budget for the whole eval, launch to last poll. */
  timeoutMs: number;
  pollMs: number;
}

/** What the eval asks of the generation service: a launch per run. */
export interface EvalGeneration {
  launchInitialRun(
    userId: string,
    input: { prompt: string; designSystemId: string },
  ): Promise<{ artifactId: string; runId: string }>;
  launchRefineRun(
    userId: string,
    artifactId: string,
    feedback: string,
    designSystemId?: string,
  ): Promise<{ artifactId: string; runId: string; version: number }>;
}

/**
 * Everything the eval touches, narrowed to what it uses. The entrypoint wires
 * the real services; tests pass fakes.
 */
export interface EvalDeps {
  designSystems: { listActive(): { id: string }[] };
  defaultDesignSystemId: string;
  /** The Mongo-only eval user whose runs these are. */
  account: { userId: string; resetCredits(): Promise<void> };
  /** The same service path `POST /artifacts` and `POST /artifacts/:id/refine` call. */
  generation: EvalGeneration;
  /** `status` is the run record's `RunStatus`: `RUNNING`, `COMPLETED` or `FAILED`. */
  runs: { getRun(runId: string): Promise<{ status: string } | null> };
  metrics: {
    aggregate(query: DocumentMetricsQuery): Promise<DocumentMetrics>;
    listRuns(query: DocumentMetricsQuery): Promise<DocumentRunRow[]>;
  };
  /** A presigned URL for a version's cover, if it has one. */
  covers: {
    coverUrl(artifactId: string, version: number): Promise<string | undefined>;
  };
  clock: { now(): number; sleep(ms: number): Promise<void> };
  log(message: string): void;
}

/** One `READY` run for a person to review. */
export interface CoverReviewEntry {
  runId: string;
  key: string;
  designSystemId?: string;
  pageCount?: number;
  coverUrl?: string;
  /** Why there is no URL. */
  note?: string;
}

export interface EvalResult {
  startedAt: string;
  finishedAt: string;
  options: EvalOptions;
  designSystemIds: string[];
  defaultDesignSystemId: string;
  records: EvalRunRecord[];
  /** The eval's own runs, one row each, as the gates read them. */
  rows: DocumentRunRow[];
  /** Spec §11.5's aggregates over exactly the eval's runs. */
  metrics: DocumentMetrics;
  evaluation: EvalEvaluation;
  covers: CoverReviewEntry[];
}

/**
 * Runs the pre-rollout eval (spec §11.3): launches the 20-run matrix through
 * the real generation service, waits for the worker to end every run, then
 * reads the run records back and applies the gates. It never executes a run
 * itself: a worker process must be consuming the same queue.
 */
export async function runDocumentEval(
  deps: EvalDeps,
  options: EvalOptions,
): Promise<EvalResult> {
  const startedAtMs = deps.clock.now();
  const deadline = startedAtMs + options.timeoutMs;

  const designSystemIds = deps.designSystems.listActive().map(({ id }) => id);
  assertLaunchSet(designSystemIds, deps.defaultDesignSystemId);

  const matrix = buildEvalMatrix(designSystemIds);
  const records: EvalRunRecord[] = matrix.initial.map((entry) => ({
    key: entry.key,
    kind: 'INITIAL',
    requestedDesignSystemId: entry.designSystemId,
    requestedPages: entry.pages,
    state: 'NOT_RUN',
  }));

  const launch = createLauncher(deps, options, deadline);
  await runPool(matrix.initial, options.concurrency, async (entry, index) => {
    await launch(records[index], async () => {
      const { artifactId, runId } = await deps.generation.launchInitialRun(
        deps.account.userId,
        { prompt: entry.prompt, designSystemId: entry.designSystemId },
      );
      return { artifactId, runId, version: 1 };
    });
  });

  // Only a READY run can be refined, and an artifact takes one Attempt at a
  // time, so the two Refinements start from the first two distinct READY runs.
  const ready = records.filter((record) => record.state === 'COMPLETED');
  const refinements = matrix.refine.map((entry, index) =>
    refineRecord(entry, ready[index], designSystemIds),
  );
  records.push(...refinements.map(({ record }) => record));
  await runPool(refinements, options.concurrency, async (refinement) => {
    const { record, source, feedback, designSystemId } = refinement;
    const sourceArtifactId = source?.artifactId;
    if (!sourceArtifactId) return;
    await launch(record, async () => {
      const { artifactId, runId, version } =
        await deps.generation.launchRefineRun(
          deps.account.userId,
          sourceArtifactId,
          feedback,
          designSystemId,
        );
      return { artifactId, runId, version };
    });
  });

  const runIds = records.flatMap(({ runId }) => (runId ? [runId] : []));
  const [rows, metrics] = await Promise.all([
    deps.metrics.listRuns({ runIds }),
    deps.metrics.aggregate({ runIds }),
  ]);
  const evaluation = evaluateEval({
    records,
    rows,
    designSystemIds,
    defaultDesignSystemId: deps.defaultDesignSystemId,
  });

  return {
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(deps.clock.now()).toISOString(),
    options,
    designSystemIds,
    defaultDesignSystemId: deps.defaultDesignSystemId,
    records,
    rows,
    metrics,
    evaluation,
    covers: await coverReview(deps, records, rows),
  };
}

function assertLaunchSet(
  designSystemIds: string[],
  defaultDesignSystemId: string,
): void {
  if (designSystemIds.length !== LAUNCH_SET_SIZE) {
    throw new Error(
      `The eval expects the ${LAUNCH_SET_SIZE} launch Design Systems to be listed, but found ${designSystemIds.length}: ${designSystemIds.join(', ') || 'none'}. Run \`bun run seed:design-systems\`; an unlisted system cannot be evaluated.`,
    );
  }
  if (!designSystemIds.includes(defaultDesignSystemId)) {
    throw new Error(
      `The default Design System (${defaultDesignSystemId}) is not listed.`,
    );
  }
}

interface Refinement {
  record: EvalRunRecord;
  source?: EvalRunRecord;
  feedback: string;
  designSystemId?: string;
}

/** Fixes a Refinement's source and, for a switch, its target system. */
function refineRecord(
  entry: RefineEvalEntry,
  source: EvalRunRecord | undefined,
  designSystemIds: string[],
): Refinement {
  const designSystemId =
    entry.mode === 'switch' && source?.requestedDesignSystemId
      ? switchTarget(designSystemIds, source.requestedDesignSystemId)
      : undefined;
  const record: EvalRunRecord = {
    key: entry.key,
    kind: 'REFINE',
    requestedDesignSystemId: designSystemId,
    requestedPages: source?.requestedPages ?? 0,
    sourceKey: source?.key,
    state: 'NOT_RUN',
    ...(source ? {} : { error: 'no READY run left to refine' }),
  };
  return { record, source, feedback: entry.feedback, designSystemId };
}

/**
 * Launches one run and follows it to a terminal status, or to the eval's
 * deadline. The credits reset comes first, so the eval user never runs dry.
 */
function createLauncher(
  deps: EvalDeps,
  options: EvalOptions,
  deadline: number,
) {
  return async (
    record: EvalRunRecord,
    start: () => Promise<{
      artifactId: string;
      runId: string;
      version: number;
    }>,
  ): Promise<void> => {
    if (deps.clock.now() >= deadline) {
      record.error = 'the eval timed out before this run started';
      deps.log(`[${record.key}] not run: ${record.error}`);
      return;
    }
    try {
      await deps.account.resetCredits();
      Object.assign(record, await start());
    } catch (error: unknown) {
      record.state = 'LAUNCH_FAILED';
      record.error = error instanceof Error ? error.message : String(error);
      deps.log(`[${record.key}] launch failed: ${record.error}`);
      return;
    }
    deps.log(`[${record.key}] launched run ${record.runId}`);

    for (;;) {
      const run = await deps.runs.getRun(record.runId!);
      if (!run) {
        record.state = 'FAILED';
        record.error = 'the run record is missing';
        break;
      }
      if (run.status !== 'RUNNING') {
        record.state = run.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
        break;
      }
      if (deps.clock.now() >= deadline) {
        record.state = 'TIMED_OUT';
        record.error = 'the run had not ended when the eval timed out';
        break;
      }
      await deps.clock.sleep(options.pollMs);
    }
    deps.log(`[${record.key}] ${record.state}`);
  };
}

async function coverReview(
  deps: EvalDeps,
  records: EvalRunRecord[],
  rows: DocumentRunRow[],
): Promise<CoverReviewEntry[]> {
  const rowsById = new Map(rows.map((row) => [row.runId, row]));
  const entries: CoverReviewEntry[] = [];
  for (const record of records) {
    const row = rowsById.get(record.runId);
    if (row?.outcome !== 'READY' || !record.artifactId || !record.runId) {
      continue;
    }
    const entry: CoverReviewEntry = {
      runId: record.runId,
      key: record.key,
      designSystemId: row.designSystemId,
      pageCount: row.pageCount,
    };
    try {
      entry.coverUrl = await deps.covers.coverUrl(
        record.artifactId,
        record.version ?? 1,
      );
      if (!entry.coverUrl) entry.note = 'no cover was captured';
    } catch (error: unknown) {
      entry.note = `cover URL failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    entries.push(entry);
  }
  return entries;
}

/** Runs `work` over `items`, at most `concurrency` at a time, in order of start. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}
