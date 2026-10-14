import type { RenderSessionOutcome } from '../document-render/render-usage.types';
import type { CandidateDiagnostics } from '../workflow/engine/workflow.types';
import { FailureCode } from '../workflow/workflow.constants';

/**
 * One terminal DOCUMENT run, reduced to what the metrics read (spec §11.5).
 * `DocumentMetricsService` projects it from `documentDiagnostics` and
 * `renderAttempts`; tests and other callers can build it directly.
 */
export interface DocumentRunRow {
  /** The pinned Design System's id; absent only for a run that carried no pin. */
  designSystemId?: string;
  outcome: 'READY' | 'FAILED';
  failureCode?: FailureCode;
  /** Every job attempt's code, so a truncation that a retry absorbed counts. */
  jobAttemptFailureCodes: FailureCode[];
  candidates: CandidateDiagnostics[];
  repairRounds: number;
  wallTimeMs: number;
  credits: number;
  renderAttempts: {
    outcome: RenderSessionOutcome;
    billed: boolean;
    units: number;
  }[];
}

export interface Percentiles {
  p50: number | null;
  p95: number | null;
}

/** A violation code and how often it showed up. */
export interface ViolationTally {
  code: string;
  /** Checks that failed with this code: the share of Repairs it caused. */
  checks: number;
  /** Violations with this code, summed over those checks. */
  count: number;
}

/** The metrics of one group of runs: all of them, or one Design System's. */
export interface DocumentMetricsBucket {
  runs: number;
  ready: number;
  /** `ready / runs`; null when there are no runs. */
  readyRate: number | null;
  /** FAILED runs per final `failureCode`. */
  failures: Partial<Record<FailureCode, number>>;
  /**
   * Runs whose first Candidate Source passed every check it went through,
   * the render check included, out of runs that produced a candidate.
   */
  firstCandidate: { runs: number; passed: number; passRate: number | null };
  /** Runs per Repair rounds spent (`"0"`, `"1"`, ...). */
  repairRounds: Record<string, number>;
  /** The ten most frequent violation codes, per check phase. */
  violations: { static: ViolationTally[]; render: ViolationTally[] };
  /** Runs where any job attempt failed with `document.truncated`. */
  truncations: number;
  renderSessions: {
    total: number;
    /** Sessions per run; null when there are no runs. */
    perRun: number | null;
    /** Sessions that ended in a `retry` finding. */
    retries: number;
    billedUnits: number;
    /** Units of sessions that were not billed to the user. */
    absorbedUnits: number;
  };
  wallTimeMs: Percentiles;
  credits: Percentiles;
}

export interface DocumentMetrics {
  /** Start of the window, or null when it was not bounded. */
  since: Date | null;
  overall: DocumentMetricsBucket;
  /** By Design System id, ids in alphabetical order. */
  byDesignSystem: Record<string, DocumentMetricsBucket>;
}

const UNPINNED = 'unpinned';
const TOP_VIOLATIONS = 10;

/** Pure: the same rows always give the same metrics. */
export function computeDocumentMetrics(
  rows: DocumentRunRow[],
  since: Date | null = null,
): DocumentMetrics {
  const groups = new Map<string, DocumentRunRow[]>();
  for (const row of rows) {
    const key = row.designSystemId ?? UNPINNED;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const byDesignSystem: Record<string, DocumentMetricsBucket> = {};
  for (const key of [...groups.keys()].sort()) {
    byDesignSystem[key] = bucketOf(groups.get(key) ?? []);
  }
  return { since, overall: bucketOf(rows), byDesignSystem };
}

function bucketOf(rows: DocumentRunRow[]): DocumentMetricsBucket {
  const ready = rows.filter((row) => row.outcome === 'READY').length;
  const failures: Partial<Record<FailureCode, number>> = {};
  for (const row of rows) {
    if (row.outcome === 'READY' || !row.failureCode) continue;
    failures[row.failureCode] = (failures[row.failureCode] ?? 0) + 1;
  }
  return {
    runs: rows.length,
    ready,
    readyRate: rate(ready, rows.length),
    failures,
    firstCandidate: firstCandidateOf(rows),
    repairRounds: repairRoundsOf(rows),
    violations: {
      static: topViolations(rows, 'static'),
      render: topViolations(rows, 'render'),
    },
    truncations: rows.filter((row) =>
      row.jobAttemptFailureCodes.includes(FailureCode.DOCUMENT_TRUNCATED),
    ).length,
    renderSessions: renderSessionsOf(rows),
    wallTimeMs: percentiles(rows.map((row) => row.wallTimeMs)),
    credits: percentiles(rows.map((row) => row.credits)),
  };
}

function firstCandidateOf(
  rows: DocumentRunRow[],
): DocumentMetricsBucket['firstCandidate'] {
  const first = rows.flatMap((row) => row.candidates.slice(0, 1));
  const passed = first.filter(
    (candidate) =>
      candidate.checks.some(({ phase }) => phase === 'render') &&
      candidate.checks.every(({ passed }) => passed),
  ).length;
  return { runs: first.length, passed, passRate: rate(passed, first.length) };
}

function repairRoundsOf(rows: DocumentRunRow[]): Record<string, number> {
  const histogram: Record<string, number> = {};
  for (const { repairRounds } of [...rows].sort(
    (a, b) => a.repairRounds - b.repairRounds,
  )) {
    histogram[repairRounds] = (histogram[repairRounds] ?? 0) + 1;
  }
  return histogram;
}

function topViolations(
  rows: DocumentRunRow[],
  phase: 'static' | 'render',
): ViolationTally[] {
  const tallies = new Map<string, ViolationTally>();
  for (const { candidates } of rows) {
    for (const { checks } of candidates) {
      for (const check of checks) {
        if (check.phase !== phase) continue;
        for (const { code, count } of check.violations) {
          const tally = tallies.get(code) ?? { code, checks: 0, count: 0 };
          tally.checks += 1;
          tally.count += count;
          tallies.set(code, tally);
        }
      }
    }
  }
  return [...tallies.values()]
    .sort(
      (a, b) =>
        b.checks - a.checks ||
        b.count - a.count ||
        a.code.localeCompare(b.code),
    )
    .slice(0, TOP_VIOLATIONS);
}

function renderSessionsOf(
  rows: DocumentRunRow[],
): DocumentMetricsBucket['renderSessions'] {
  const sessions = rows.flatMap((row) => row.renderAttempts);
  const units = (billed: boolean) =>
    sessions
      .filter((session) => session.billed === billed)
      .reduce((sum, session) => sum + session.units, 0);
  return {
    total: sessions.length,
    perRun: rows.length === 0 ? null : sessions.length / rows.length,
    retries: sessions.filter((session) => session.outcome === 'RETRY').length,
    billedUnits: units(true),
    absorbedUnits: units(false),
  };
}

/**
 * Nearest-rank percentiles, computed here rather than with Mongo's
 * `$percentile`: it needs MongoDB 7+, and the rest of the metrics are derived
 * per run, so one projected read keeps every number in one pure, testable
 * function. The read is one small row per run, and a week holds hundreds.
 */
function percentiles(values: number[]): Percentiles {
  if (values.length === 0) return { p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
  return { p50: at(0.5), p95: at(0.95) };
}

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}
