import type { DocumentRunRow } from '../../diagnostics/document-metrics';
import { FailureCode } from '../../workflow/workflow.constants';
import type { EvalRunRecord } from './eval-record';
import {
  evaluateEval,
  SLOWEST_RUN_LIMIT_MS,
  type EvalEvaluation,
} from './eval-gates';

const SYSTEMS = ['margin', 'afterglow', 'broadside'];

const makeRow = (overrides: Partial<DocumentRunRow> = {}): DocumentRunRow => ({
  runId: 'run',
  designSystemId: 'margin',
  outcome: 'READY',
  jobAttemptFailureCodes: [],
  candidates: [],
  repairRounds: 0,
  wallTimeMs: 60_000,
  credits: 100,
  pageCount: 4,
  renderAttempts: [],
  ...overrides,
});

const makeRecord = (overrides: Partial<EvalRunRecord> = {}): EvalRunRecord => ({
  key: 'margin/4p',
  kind: 'INITIAL',
  requestedDesignSystemId: 'margin',
  requestedPages: 4,
  runId: 'run',
  state: 'COMPLETED',
  ...overrides,
});

/** Every system's three initial runs, all `READY`, one run id each. */
const makeCleanEval = () => {
  const records: EvalRunRecord[] = [];
  const rows: DocumentRunRow[] = [];
  for (const designSystemId of SYSTEMS) {
    for (const pages of [4, 8, 15]) {
      const runId = `${designSystemId}-${pages}`;
      records.push(
        makeRecord({
          key: `${designSystemId}/${pages}p`,
          requestedDesignSystemId: designSystemId,
          requestedPages: pages,
          runId,
        }),
      );
      rows.push(makeRow({ runId, designSystemId, pageCount: pages }));
    }
  }
  return { records, rows };
};

const evaluate = (
  records: EvalRunRecord[],
  rows: DocumentRunRow[],
): EvalEvaluation =>
  evaluateEval({
    records,
    rows,
    designSystemIds: SYSTEMS,
    defaultDesignSystemId: 'margin',
  });

const gate = (evaluation: EvalEvaluation, id: string) =>
  evaluation.gates.find((candidate) => candidate.id === id)!;

/** Marks the `margin/<pages>p` run failed, in both the record and the row. */
const fail = (
  clean: ReturnType<typeof makeCleanEval>,
  runId: string,
  failureCode: FailureCode = FailureCode.DOCUMENT_REPAIR_EXHAUSTED,
) => {
  clean.records.find((record) => record.runId === runId)!.state = 'FAILED';
  Object.assign(clean.rows.find((row) => row.runId === runId)!, {
    outcome: 'FAILED',
    failureCode,
  });
};

describe('evaluateEval', () => {
  describe('a clean eval', () => {
    it('should pass every gate and list every system', () => {
      const { records, rows } = makeCleanEval();

      const evaluation = evaluate(records, rows);

      expect(evaluation.passed).toBe(true);
      expect(evaluation.gates.every((candidate) => candidate.pass)).toBe(true);
      expect(evaluation.systems.map((system) => system.verdict)).toEqual([
        'LIST',
        'LIST',
        'LIST',
      ]);
    });
  });

  describe('runs failing gate', () => {
    it('should pass with one failed run', () => {
      const clean = makeCleanEval();
      fail(clean, 'afterglow-8');

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'failing-runs').pass).toBe(true);
    });

    it('should fail with two failed runs', () => {
      const clean = makeCleanEval();
      fail(clean, 'afterglow-8');
      fail(clean, 'broadside-4');

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'failing-runs').pass).toBe(false);
      expect(evaluation.passed).toBe(false);
    });

    it('should count a run that timed out, never launched or was skipped as failing', () => {
      const clean = makeCleanEval();
      clean.records[0] = makeRecord({
        key: 'margin/4p',
        runId: undefined,
        state: 'LAUNCH_FAILED',
        error: 'boom',
      });
      clean.rows.shift();
      clean.records[1].state = 'TIMED_OUT';
      clean.rows.shift();

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'failing-runs').pass).toBe(false);
      expect(gate(evaluation, 'failing-runs').detail).toContain('2 failing');
    });

    it('should count a completed run that left no diagnostics as failing', () => {
      const clean = makeCleanEval();
      clean.rows.shift();

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'failing-runs').detail).toContain('1 failing');
    });
  });

  describe('truncation gate', () => {
    it('should fail when any job attempt truncated, even one a retry absorbed', () => {
      const clean = makeCleanEval();
      clean.rows[2].jobAttemptFailureCodes = [FailureCode.DOCUMENT_TRUNCATED];

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'truncated').pass).toBe(false);
    });

    it('should pass when nothing truncated', () => {
      const { records, rows } = makeCleanEval();

      expect(gate(evaluate(records, rows), 'truncated').pass).toBe(true);
    });
  });

  describe('egress gate', () => {
    it('should fail when any check found a render.egress violation', () => {
      const clean = makeCleanEval();
      clean.rows[3].candidates = [
        {
          candidateSha256: 'a',
          checks: [
            {
              phase: 'render',
              passed: false,
              violations: [{ code: 'render.egress', count: 1 }],
            },
          ],
        },
      ];

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'egress').pass).toBe(false);
    });

    it('should pass when other render violations occurred', () => {
      const clean = makeCleanEval();
      clean.rows[3].candidates = [
        {
          candidateSha256: 'a',
          checks: [
            {
              phase: 'render',
              passed: false,
              violations: [{ code: 'render.overflow.clipped', count: 2 }],
            },
          ],
        },
      ];

      expect(gate(evaluate(clean.records, clean.rows), 'egress').pass).toBe(
        true,
      );
    });
  });

  describe('slowest run gate', () => {
    it('should pass at exactly four minutes', () => {
      const clean = makeCleanEval();
      clean.rows[0].wallTimeMs = SLOWEST_RUN_LIMIT_MS;

      expect(gate(evaluate(clean.records, clean.rows), 'slowest').pass).toBe(
        true,
      );
    });

    it('should fail above four minutes, counting failed runs too', () => {
      const clean = makeCleanEval();
      fail(clean, 'margin-4');
      clean.rows[0].wallTimeMs = SLOWEST_RUN_LIMIT_MS + 1;

      expect(gate(evaluate(clean.records, clean.rows), 'slowest').pass).toBe(
        false,
      );
    });

    it('should fail when a run never ended, since it exceeded the eval timeout', () => {
      const clean = makeCleanEval();
      clean.records[0].state = 'TIMED_OUT';
      clean.rows.shift();

      expect(gate(evaluate(clean.records, clean.rows), 'slowest').pass).toBe(
        false,
      );
    });
  });

  describe('cost spread gate', () => {
    it('should pass when the costliest is exactly three times the cheapest', () => {
      const clean = makeCleanEval();
      clean.rows[0].credits = 100;
      clean.rows[3].credits = 300;
      clean.rows[6].credits = 200;

      expect(
        gate(evaluate(clean.records, clean.rows), 'cost-spread').pass,
      ).toBe(true);
    });

    it('should fail when the costliest exceeds three times the cheapest at a page count', () => {
      const clean = makeCleanEval();
      clean.rows[0].credits = 100;
      clean.rows[3].credits = 301;

      const result = gate(evaluate(clean.records, clean.rows), 'cost-spread');

      expect(result.pass).toBe(false);
      expect(result.detail).toContain('4 pages');
    });

    it('should compare only runs at the same page count', () => {
      const clean = makeCleanEval();
      for (const row of clean.rows) {
        row.credits = row.pageCount === 4 ? 10 : 1000;
      }

      expect(
        gate(evaluate(clean.records, clean.rows), 'cost-spread').pass,
      ).toBe(true);
    });

    it('should ignore failed runs', () => {
      const clean = makeCleanEval();
      fail(clean, 'margin-4');
      clean.rows[0].credits = 99_999;

      expect(
        gate(evaluate(clean.records, clean.rows), 'cost-spread').pass,
      ).toBe(true);
    });

    it('should group runs by the pages their brief asked for, not the pages the model produced', () => {
      const clean = makeCleanEval();
      clean.rows[0].pageCount = 5;
      clean.rows[0].credits = 1000;

      const result = gate(evaluate(clean.records, clean.rows), 'cost-spread');

      expect(result.pass).toBe(false);
      expect(result.detail).toContain('4 pages');
    });

    it('should leave refinements out, since they carry their source in the prompt', () => {
      const clean = makeCleanEval();
      clean.records.push(
        makeRecord({
          key: 'refine/carry-pin',
          kind: 'REFINE',
          runId: 'refine',
        }),
      );
      clean.rows.push(makeRow({ runId: 'refine', credits: 99_999 }));

      expect(
        gate(evaluate(clean.records, clean.rows), 'cost-spread').pass,
      ).toBe(true);
    });

    it('should fail when the cheapest cost nothing and another did not', () => {
      const clean = makeCleanEval();
      clean.rows[0].credits = 0;

      expect(
        gate(evaluate(clean.records, clean.rows), 'cost-spread').pass,
      ).toBe(false);
    });
  });

  describe('per-system verdicts', () => {
    it('should list a system with no failures', () => {
      const { records, rows } = makeCleanEval();

      const [margin] = evaluate(records, rows).systems;

      expect(margin).toMatchObject({
        designSystemId: 'margin',
        runs: 3,
        failures: 0,
        verdict: 'LIST',
      });
    });

    it('should say re-run or ship unlisted after one failure', () => {
      const clean = makeCleanEval();
      fail(clean, 'afterglow-15');

      const afterglow = evaluate(clean.records, clean.rows).systems.find(
        (system) => system.designSystemId === 'afterglow',
      );

      expect(afterglow).toMatchObject({
        failures: 1,
        verdict: 'RERUN_OR_UNLIST',
      });
    });

    it('should unlist a system after two failures', () => {
      const clean = makeCleanEval();
      fail(clean, 'broadside-4');
      fail(clean, 'broadside-8');

      const broadside = evaluate(clean.records, clean.rows).systems.find(
        (system) => system.designSystemId === 'broadside',
      );

      expect(broadside).toMatchObject({ failures: 2, verdict: 'UNLIST' });
    });

    it('should count a never-launched run against its system', () => {
      const clean = makeCleanEval();
      const record = clean.records.find((r) => r.key === 'broadside/4p')!;
      record.state = 'NOT_RUN';
      record.runId = undefined;

      const broadside = evaluate(clean.records, clean.rows).systems.find(
        (system) => system.designSystemId === 'broadside',
      );

      expect(broadside?.failures).toBe(1);
    });

    it('should not count refine runs against a system', () => {
      const clean = makeCleanEval();
      clean.records.push(
        makeRecord({
          key: 'refine/switch-system',
          kind: 'REFINE',
          requestedDesignSystemId: 'broadside',
          runId: 'refine-1',
          state: 'FAILED',
        }),
      );
      clean.rows.push(
        makeRow({
          runId: 'refine-1',
          designSystemId: 'broadside',
          outcome: 'FAILED',
          failureCode: FailureCode.INTERNAL,
        }),
      );

      const broadside = evaluate(clean.records, clean.rows).systems.find(
        (system) => system.designSystemId === 'broadside',
      );

      expect(broadside).toMatchObject({ runs: 3, failures: 0 });
    });
  });

  describe('default design system gate', () => {
    it('should pass when the default has no failures', () => {
      const { records, rows } = makeCleanEval();

      expect(gate(evaluate(records, rows), 'default-system').pass).toBe(true);
    });

    it('should fail and block rollout when the default has one failure', () => {
      const clean = makeCleanEval();
      fail(clean, 'margin-8');

      const evaluation = evaluate(clean.records, clean.rows);

      expect(gate(evaluation, 'default-system').pass).toBe(false);
      expect(gate(evaluation, 'default-system').detail).toContain('margin');
      expect(evaluation.passed).toBe(false);
    });

    it('should not fail when a non-default system is unlisted', () => {
      const clean = makeCleanEval();
      fail(clean, 'broadside-4');

      expect(
        gate(evaluate(clean.records, clean.rows), 'default-system').pass,
      ).toBe(true);
    });
  });

  it('should fail the eval when any automatic gate fails', () => {
    const clean = makeCleanEval();
    clean.rows[0].jobAttemptFailureCodes = [FailureCode.DOCUMENT_TRUNCATED];

    expect(evaluate(clean.records, clean.rows).passed).toBe(false);
  });
});
