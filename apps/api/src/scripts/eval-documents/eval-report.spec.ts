import {
  computeDocumentMetrics,
  type DocumentRunRow,
} from '../../diagnostics/document-metrics';
import { FailureCode } from '../../workflow/workflow.constants';
import { evaluateEval } from './eval-gates';
import type { EvalRunRecord } from './eval-record';
import { formatEvalReport } from './eval-report';
import type { EvalResult } from './eval-runner';

const SYSTEMS = ['margin', 'afterglow'];

const makeRow = (overrides: Partial<DocumentRunRow>): DocumentRunRow => ({
  runId: 'run',
  designSystemId: 'margin',
  outcome: 'READY',
  jobAttemptFailureCodes: [],
  candidates: [],
  repairRounds: 0,
  wallTimeMs: 90_000,
  credits: 120,
  pageCount: 4,
  renderAttempts: [],
  ...overrides,
});

const makeResult = (config: { failMargin?: boolean } = {}): EvalResult => {
  const records: EvalRunRecord[] = [];
  const rows: DocumentRunRow[] = [];
  for (const designSystemId of SYSTEMS) {
    for (const pages of [4, 8]) {
      const runId = `${designSystemId}-${pages}`;
      const failed =
        config.failMargin && designSystemId === 'margin' && pages === 4;
      records.push({
        key: `${designSystemId}/${pages}p`,
        kind: 'INITIAL',
        requestedDesignSystemId: designSystemId,
        requestedPages: pages,
        artifactId: `artifact-${runId}`,
        runId,
        version: 1,
        state: failed ? 'FAILED' : 'COMPLETED',
      });
      rows.push(
        makeRow({
          runId,
          designSystemId,
          pageCount: pages,
          ...(failed
            ? {
                outcome: 'FAILED',
                failureCode: FailureCode.DOCUMENT_REPAIR_EXHAUSTED,
              }
            : {}),
        }),
      );
    }
  }
  records.push({
    key: 'refine/switch-system',
    kind: 'REFINE',
    requestedDesignSystemId: 'afterglow',
    requestedPages: 8,
    sourceKey: 'margin/8p',
    state: 'NOT_RUN',
    error: 'no READY run left to refine',
  });
  const designSystemIds = SYSTEMS;
  return {
    startedAt: '2026-10-14T10:00:00.000Z',
    finishedAt: '2026-10-14T10:41:00.000Z',
    options: { concurrency: 2, timeoutMs: 7_200_000, pollMs: 10_000 },
    designSystemIds,
    defaultDesignSystemId: 'margin',
    records,
    rows,
    metrics: computeDocumentMetrics(rows),
    evaluation: evaluateEval({
      records,
      rows,
      designSystemIds,
      defaultDesignSystemId: 'margin',
    }),
    covers: rows
      .filter((row) => row.outcome === 'READY')
      .map((row) => ({
        runId: row.runId!,
        key: `${row.designSystemId}/${row.pageCount}p`,
        designSystemId: row.designSystemId,
        pageCount: row.pageCount,
        coverUrl: `https://r2.example/${row.runId}.png`,
      })),
  };
};

describe('formatEvalReport', () => {
  it('should print every gate with PASS or FAIL', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toMatch(/PASS\s+Runs failing \u2264 1/);
    expect(report).toMatch(/PASS\s+document\.truncated = 0/);
    expect(report).toMatch(/PASS\s+render\.egress = 0/);
    expect(report).toMatch(/PASS\s+Slowest run \u2264 4m00s/);
    expect(report).toMatch(/PASS\s+Costliest successful run \u2264 3\u00d7/);
  });

  it('should mark a failing gate FAIL and the eval failed', () => {
    const failing = makeResult({ failMargin: true });

    const report = formatEvalReport(failing);

    expect(report).toMatch(/FAIL\s+Runs failing \u2264 1/);
    expect(report).toMatch(/FAIL\s+Default design system \(margin\)/);
    expect(report).toContain('RESULT: FAIL');
  });

  it('should report RESULT: PASS when every gate passes', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toContain('RESULT: PASS');
  });

  it('should tell a person to check Railway logs for alerts over the eval window', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toContain(
      'Alerts: check Railway logs for `[ALERT` between 2026-10-14T10:00:00.000Z and 2026-10-14T10:41:00.000Z',
    );
  });

  it("should print each system's verdict in plain words", () => {
    const report = formatEvalReport(makeResult({ failMargin: true }));

    expect(report).toMatch(
      /margin\s+1 of 2 failed\s+re-run its 3 or ship it unlisted/,
    );
    expect(report).toMatch(/afterglow\s+0 of 2 failed\s+list it/);
  });

  it('should say unlist it after two failures', () => {
    const result = makeResult();
    result.evaluation.systems[1] = {
      designSystemId: 'afterglow',
      runs: 3,
      failures: 2,
      verdict: 'UNLIST',
    };

    expect(formatEvalReport(result)).toMatch(
      /afterglow\s+2 of 3 failed\s+unlist it/,
    );
  });

  it('should flag that a failing default blocks the rollout', () => {
    const report = formatEvalReport(makeResult({ failMargin: true }));

    expect(report).toContain(
      'DEFAULT DESIGN SYSTEM (margin) FAILED: ROLLOUT IS BLOCKED',
    );
  });

  it('should not flag the default when it passed', () => {
    expect(formatEvalReport(makeResult())).not.toContain('ROLLOUT IS BLOCKED');
  });

  it('should print the first-candidate pass rate as recorded, not gated', () => {
    const result = makeResult();
    result.metrics.overall.firstCandidate = {
      runs: 4,
      passed: 3,
      passRate: 0.75,
    };

    expect(formatEvalReport(result)).toContain(
      'First-candidate pass rate: 75.0% (3 of 4) — recorded, not gated',
    );
  });

  it('should print a dash when no first candidate reached a verdict', () => {
    expect(formatEvalReport(makeResult())).toContain(
      'First-candidate pass rate: n/a (0 of 0)',
    );
  });

  it('should print the aggregates overall and per system', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toContain('Aggregates (spec §11.5)');
    expect(report).toMatch(/overall\s+4\s+4/);
    expect(report).toMatch(/margin\s+2\s+2/);
    expect(report).toMatch(/afterglow\s+2\s+2/);
  });

  it('should print the failure code breakdown', () => {
    const report = formatEvalReport(makeResult({ failMargin: true }));

    expect(report).toContain('document.repair_exhausted: 1');
  });

  it("should print each system's failure codes, repair rounds, violations and first-candidate rate", () => {
    const report = formatEvalReport(makeResult({ failMargin: true }));

    expect(report).toContain(
      '[margin] Failure codes: document.repair_exhausted: 1',
    );
    expect(report).toContain('[afterglow] Failure codes: none');
    expect(report).toContain('[margin] Render timeouts by phase: none');
    expect(report).toContain('[margin] Repair rounds');
    expect(report).toContain('[margin] Top static violations: none');
    expect(report).toContain('[margin] Top render violations: none');
    expect(report).toContain(
      '[margin] First-candidate pass rate: n/a (0 of 0)',
    );
  });

  it('should list every READY run in the cover review table with its URL', () => {
    const report = formatEvalReport(makeResult({ failMargin: true }));

    expect(report).toContain('Cover review');
    expect(report).toContain('afterglow-4');
    expect(report).toContain('https://r2.example/afterglow-4.png');
    expect(report).not.toContain('https://r2.example/margin-4.png');
    expect(report).toMatch(/afterglow\s+4\s+https:/);
  });

  it('should show a note where a cover has no URL', () => {
    const result = makeResult();
    result.covers[0] = {
      ...result.covers[0],
      coverUrl: undefined,
      note: 'no cover was captured',
    };

    expect(formatEvalReport(result)).toContain('no cover was captured');
  });

  it('should list runs that did not run with the reason', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toContain('refine/switch-system');
    expect(report).toContain('NOT_RUN');
    expect(report).toContain('no READY run left to refine');
  });

  it('should print the requested page count in the runs table', () => {
    const report = formatEvalReport(makeResult());

    expect(report).toMatch(/run\s+pages\s+state\s+run id\s+note/);
    expect(report).toMatch(/margin\/4p\s+4\s+COMPLETED/);
    expect(report).toMatch(/margin\/8p\s+8\s+COMPLETED/);
  });
});
