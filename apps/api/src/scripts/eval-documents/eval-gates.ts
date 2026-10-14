import type { DocumentRunRow } from '../../diagnostics/document-metrics';
import { FailureCode } from '../../workflow/workflow.constants';
import type { EvalRunRecord } from './eval-record';

/** Gate limits from spec §11.3. */
export const FAILING_RUNS_LIMIT = 1;
export const SLOWEST_RUN_LIMIT_MS = 4 * 60 * 1000;
export const COST_SPREAD_LIMIT = 3;

export interface GateResult {
  id:
    | 'failing-runs'
    | 'truncated'
    | 'egress'
    | 'slowest'
    | 'cost-spread'
    | 'default-system';
  label: string;
  pass: boolean;
  detail: string;
}

/** What spec §11.3 says to do with a system, from its INITIAL runs. */
export type SystemVerdict = 'LIST' | 'RERUN_OR_UNLIST' | 'UNLIST';

export interface SystemResult {
  designSystemId: string;
  /** The system's INITIAL runs; its Refinements are not counted. */
  runs: number;
  failures: number;
  verdict: SystemVerdict;
}

export interface EvalEvaluation {
  gates: GateResult[];
  systems: SystemResult[];
  /** True when every automatic gate passed. */
  passed: boolean;
}

export interface EvalEvaluationInput {
  records: EvalRunRecord[];
  /** The terminal rows `DocumentMetricsService.listRuns` returned for the eval's runs. */
  rows: DocumentRunRow[];
  /** The systems the matrix covered, in matrix order. */
  designSystemIds: readonly string[];
  defaultDesignSystemId: string;
}

const EGRESS_CODE = 'render.egress';

/** Applies the spec §11.3 gates to what the eval's runs did. Pure. */
export function evaluateEval({
  records,
  rows,
  designSystemIds,
  defaultDesignSystemId,
}: EvalEvaluationInput): EvalEvaluation {
  const rowsById = new Map(
    rows.flatMap((row) => (row.runId ? [[row.runId, row] as const] : [])),
  );
  const rowOf = (record: EvalRunRecord) =>
    record.runId ? rowsById.get(record.runId) : undefined;
  const succeeded = (record: EvalRunRecord) =>
    rowOf(record)?.outcome === 'READY';

  const systems = designSystemIds.map((designSystemId) =>
    systemResult(designSystemId, records, succeeded),
  );
  const defaultSystem = systems.find(
    (system) => system.designSystemId === defaultDesignSystemId,
  );

  const gates = [
    failingRunsGate(records, rowOf, succeeded),
    truncatedGate(rows),
    egressGate(rows),
    slowestGate(records, rows),
    costSpreadGate(records, rowOf),
    defaultSystemGate(defaultDesignSystemId, defaultSystem),
  ];
  return { gates, systems, passed: gates.every((gate) => gate.pass) };
}

function failingRunsGate(
  records: EvalRunRecord[],
  rowOf: (record: EvalRunRecord) => DocumentRunRow | undefined,
  succeeded: (record: EvalRunRecord) => boolean,
): GateResult {
  const failing = records.filter((record) => !succeeded(record));
  const names = failing.map(
    (record) => `${record.key} (${rowOf(record)?.failureCode ?? record.state})`,
  );
  return {
    id: 'failing-runs',
    label: `Runs failing ≤ ${FAILING_RUNS_LIMIT}`,
    pass: failing.length <= FAILING_RUNS_LIMIT,
    detail:
      failing.length === 0
        ? `0 failing of ${records.length}`
        : `${failing.length} failing of ${records.length}: ${names.join(', ')}`,
  };
}

function truncatedGate(rows: DocumentRunRow[]): GateResult {
  // A truncation that a job retry absorbed still counts: the code is on the
  // job attempt, not just on a run that ended with it.
  const truncated = rows.filter((row) =>
    row.jobAttemptFailureCodes.includes(FailureCode.DOCUMENT_TRUNCATED),
  );
  return {
    id: 'truncated',
    label: 'document.truncated = 0',
    pass: truncated.length === 0,
    detail: `${truncated.length} run(s) truncated${listRunIds(truncated)}`,
  };
}

function egressGate(rows: DocumentRunRow[]): GateResult {
  const egress = rows.filter((row) =>
    row.candidates.some(({ checks }) =>
      checks.some(({ violations }) =>
        violations.some(({ code }) => code === EGRESS_CODE),
      ),
    ),
  );
  return {
    id: 'egress',
    label: 'render.egress = 0',
    pass: egress.length === 0,
    detail: `${egress.length} run(s) hit render.egress${listRunIds(egress)}`,
  };
}

function slowestGate(
  records: EvalRunRecord[],
  rows: DocumentRunRow[],
): GateResult {
  const label = `Slowest run ≤ ${formatDuration(SLOWEST_RUN_LIMIT_MS)}`;
  const unfinished = records.filter((record) => record.state === 'TIMED_OUT');
  if (unfinished.length > 0) {
    return {
      id: 'slowest',
      label,
      pass: false,
      detail: `${unfinished.map((record) => record.key).join(', ')} had not ended when the eval timed out`,
    };
  }
  const slowest = rows.reduce<DocumentRunRow | undefined>(
    (max, row) => (!max || row.wallTimeMs > max.wallTimeMs ? row : max),
    undefined,
  );
  return {
    id: 'slowest',
    label,
    pass: !slowest || slowest.wallTimeMs <= SLOWEST_RUN_LIMIT_MS,
    detail: slowest
      ? `${formatDuration(slowest.wallTimeMs)} (${slowest.runId})`
      : 'no run ended',
  };
}

/**
 * Spec §11.3: the most expensive successful run is at most 3× the cheapest at
 * the same page count. A run is grouped by the pages its document has, which
 * is what drives cost, and by the brief's page count when it left none.
 */
function costSpreadGate(
  records: EvalRunRecord[],
  rowOf: (record: EvalRunRecord) => DocumentRunRow | undefined,
): GateResult {
  const groups = new Map<number, number[]>();
  for (const record of records) {
    const row = rowOf(record);
    if (row?.outcome !== 'READY') continue;
    const pages = row.pageCount ?? record.requestedPages;
    groups.set(pages, [...(groups.get(pages) ?? []), row.credits]);
  }
  const spreads = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pages, credits]) => {
      const min = Math.min(...credits);
      const max = Math.max(...credits);
      return { pages, min, max, pass: max <= COST_SPREAD_LIMIT * min };
    });
  return {
    id: 'cost-spread',
    label: `Costliest successful run ≤ ${COST_SPREAD_LIMIT}× the cheapest at the same page count`,
    pass: spreads.every(({ pass }) => pass),
    detail:
      spreads.length === 0
        ? 'no successful run'
        : spreads
            .map(
              ({ pages, min, max, pass }) =>
                `${pages} pages: ${min}–${max} credits${pass ? '' : ' (over)'}`,
            )
            .join('; '),
  };
}

function defaultSystemGate(
  defaultDesignSystemId: string,
  defaultSystem: SystemResult | undefined,
): GateResult {
  const failures = defaultSystem?.failures ?? 0;
  return {
    id: 'default-system',
    label: `Default design system (${defaultDesignSystemId}) has no failures`,
    pass: defaultSystem !== undefined && failures === 0,
    detail:
      defaultSystem === undefined
        ? `${defaultDesignSystemId} was not part of the matrix`
        : failures === 0
          ? `${defaultDesignSystemId}: 0 failures`
          : `${defaultDesignSystemId} has ${failures} failure(s) and may never be unlisted, so rollout is blocked until it passes or the default changes (spec §11.4)`,
  };
}

function systemResult(
  designSystemId: string,
  records: EvalRunRecord[],
  succeeded: (record: EvalRunRecord) => boolean,
): SystemResult {
  const initial = records.filter(
    (record) =>
      record.kind === 'INITIAL' &&
      record.requestedDesignSystemId === designSystemId,
  );
  const failures = initial.filter((record) => !succeeded(record)).length;
  return {
    designSystemId,
    runs: initial.length,
    failures,
    verdict:
      failures === 0 ? 'LIST' : failures === 1 ? 'RERUN_OR_UNLIST' : 'UNLIST',
  };
}

function listRunIds(rows: DocumentRunRow[]): string {
  const ids = rows.flatMap((row) => (row.runId ? [row.runId] : []));
  return ids.length > 0 ? `: ${ids.join(', ')}` : '';
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}
