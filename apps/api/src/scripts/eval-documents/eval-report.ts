import type {
  DocumentMetricsBucket,
  Percentiles,
  ViolationTally,
} from '../../diagnostics/document-metrics';
import { formatDuration, type SystemVerdict } from './eval-gates';
import type { EvalResult } from './eval-runner';

const VERDICT_TEXT: Record<SystemVerdict, string> = {
  LIST: 'list it',
  RERUN_OR_UNLIST: 're-run its 3 or ship it unlisted',
  UNLIST: 'unlist it',
};

/** The eval's result as the text a person reads and pastes into the issue. */
export function formatEvalReport(result: EvalResult): string {
  const { evaluation, metrics } = result;
  const lines: string[] = [];
  const section = (title: string) => lines.push('', `== ${title} ==`);

  lines.push(
    'Pre-rollout document eval',
    `Started ${result.startedAt}, finished ${result.finishedAt}; ${result.records.length} runs, concurrency ${result.options.concurrency}`,
  );

  section('Runs');
  const failureCodes = new Map(
    result.rows.map((row) => [row.runId, row.failureCode]),
  );
  lines.push(
    ...table(
      ['run', 'state', 'run id', 'note'],
      result.records.map((record) => [
        record.key,
        record.state,
        record.runId ?? '-',
        record.error ??
          failureCodes.get(record.runId) ??
          (record.sourceKey ? `refines ${record.sourceKey}` : ''),
      ]),
    ),
  );

  section('Aggregates (spec §11.5)');
  lines.push(
    ...table(
      [
        'scope',
        'runs',
        'ready',
        'ready %',
        'trunc',
        'sessions/run',
        'retries',
        'absorbed units',
        'wall p50 / p95',
        'credits p50 / p95',
      ],
      [
        bucketRow('overall', metrics.overall),
        ...Object.entries(metrics.byDesignSystem).map(([id, bucket]) =>
          bucketRow(id, bucket),
        ),
      ],
    ),
  );
  const failureBreakdown = Object.entries(metrics.overall.failures);
  lines.push(
    '',
    `Failure codes: ${failureBreakdown.length === 0 ? 'none' : failureBreakdown.map(([code, count]) => `${code}: ${count}`).join(', ')}`,
    `Repair rounds (runs per rounds spent): ${JSON.stringify(metrics.overall.repairRounds)}`,
    `Top static violations: ${violations(metrics.overall.violations.static)}`,
    `Top render violations: ${violations(metrics.overall.violations.render)}`,
  );
  const first = metrics.overall.firstCandidate;
  lines.push(
    '',
    `First-candidate pass rate: ${percent(first.passRate)} (${first.passed} of ${first.runs}) — recorded, not gated`,
  );

  section('Gates (spec §11.3)');
  for (const gate of evaluation.gates) {
    lines.push(
      `${gate.pass ? 'PASS' : 'FAIL'}  ${gate.label}`,
      `      ${gate.detail}`,
    );
  }
  lines.push(
    '',
    `Alerts: check Railway logs for \`[ALERT\` between ${result.startedAt} and ${result.finishedAt} (alerts are log lines only, so this gate is manual)`,
  );

  section('Per-system verdict (3 INITIAL runs each)');
  lines.push(
    ...table(
      ['system', 'failures', 'verdict'],
      evaluation.systems.map((system) => [
        system.designSystemId,
        `${system.failures} of ${system.runs} failed`,
        VERDICT_TEXT[system.verdict],
      ]),
    ),
  );
  const defaultSystem = evaluation.systems.find(
    ({ designSystemId }) => designSystemId === result.defaultDesignSystemId,
  );
  if (!defaultSystem || defaultSystem.verdict !== 'LIST') {
    lines.push(
      '',
      `DEFAULT DESIGN SYSTEM (${result.defaultDesignSystemId}) FAILED: ROLLOUT IS BLOCKED until it passes or the default changes to a system that passed (spec §11.4)`,
    );
  }

  section(
    'Cover review (every READY run: text over gradients, positioning outside the spacing scale)',
  );
  lines.push(
    ...table(
      ['run id', 'system', 'pages', 'cover (presigned, expires in 24 h)'],
      result.covers.map((cover) => [
        cover.runId,
        cover.designSystemId ?? '-',
        String(cover.pageCount ?? '-'),
        cover.coverUrl ?? cover.note ?? '-',
      ]),
    ),
  );

  lines.push('', `RESULT: ${evaluation.passed ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

function bucketRow(scope: string, bucket: DocumentMetricsBucket): string[] {
  return [
    scope,
    String(bucket.runs),
    String(bucket.ready),
    percent(bucket.readyRate),
    String(bucket.truncations),
    bucket.renderSessions.perRun?.toFixed(1) ?? 'n/a',
    String(bucket.renderSessions.retries),
    String(bucket.renderSessions.absorbedUnits),
    spread(bucket.wallTimeMs, formatDuration),
    spread(bucket.credits, String),
  ];
}

function spread(
  { p50, p95 }: Percentiles,
  format: (value: number) => string,
): string {
  return p50 === null || p95 === null
    ? 'n/a'
    : `${format(p50)} / ${format(p95)}`;
}

function violations(tallies: ViolationTally[]): string {
  return tallies.length === 0
    ? 'none'
    : tallies.map(({ code, checks }) => `${code} (${checks})`).join(', ');
}

function percent(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
}

/** Left-aligned columns, two spaces apart, indented under their heading. */
function table(header: string[], rows: string[][]): string[] {
  const all = [header, ...rows];
  const widths = header.map((_, column) =>
    Math.max(...all.map((row) => row[column].length)),
  );
  return all.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths[column]))
      .join('  ')
      .trimEnd(),
  );
}
