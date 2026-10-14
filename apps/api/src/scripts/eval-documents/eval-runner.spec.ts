/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await -- asymmetric matchers, and fakes that implement async interfaces */
import type { DocumentRunRow } from '../../diagnostics/document-metrics';
import { computeDocumentMetrics } from '../../diagnostics/document-metrics';
import { runDocumentEval, type EvalOptions } from './eval-runner';

const SYSTEMS = [
  'margin',
  'afterglow',
  'broadside',
  'colophon',
  'overprint',
  'schematic',
];

const OPTIONS: EvalOptions = {
  concurrency: 2,
  timeoutMs: 60 * 60 * 1000,
  pollMs: 1000,
};

const makeRow = (runId: string, designSystemId: string, pageCount: number) =>
  ({
    runId,
    designSystemId,
    outcome: 'READY',
    jobAttemptFailureCodes: [],
    candidates: [],
    repairRounds: 0,
    wallTimeMs: 60_000,
    credits: 100,
    pageCount,
    renderAttempts: [],
  }) satisfies DocumentRunRow;

interface Launched {
  runId: string;
  artifactId: string;
  designSystemId?: string;
  kind: 'INITIAL' | 'REFINE';
  pages?: number;
}

const makeEval = (
  config: {
    systems?: string[];
    /** Run ids, by launch order, that FAIL; every other run COMPLETES. */
    failing?: (launch: Launched) => boolean;
    /** Polls before a run ends; `Infinity` never ends. */
    pollsToEnd?: number;
    /** `listRuns` calls that return nothing before the diagnostics are saved; `Infinity` never. */
    diagnosticsLag?: number;
    launchError?: (launch: {
      kind: string;
      index: number;
    }) => Error | undefined;
  } = {},
) => {
  let clock = Date.parse('2026-10-14T10:00:00Z');
  let launchCount = 0;
  let active = 0;
  let maxActive = 0;
  const launched: Launched[] = [];
  let listRunsCalls = 0;
  const polls = new Map<string, number>();
  const ended = new Set<string>();
  const log: string[] = [];

  const track = (launch: Omit<Launched, 'runId' | 'artifactId'>) => {
    const index = launchCount++;
    const error = config.launchError?.({ kind: launch.kind, index });
    if (error) throw error;
    const entry: Launched = {
      ...launch,
      runId: `run-${index}`,
      artifactId: `artifact-${index}`,
    };
    launched.push(entry);
    active += 1;
    maxActive = Math.max(maxActive, active);
    return entry;
  };

  const mocks = {
    designSystems: {
      listActive: jest.fn(() =>
        (config.systems ?? SYSTEMS).map((id) => ({ id })),
      ),
      getActive: jest.fn((id: string) => ({
        id,
        definition: {
          page: {
            pages:
              id === 'margin' || id === 'schematic'
                ? { min: 2, max: 15 }
                : { min: 3, max: 12 },
          },
        },
      })),
    },
    account: {
      userId: 'eval-user',
      resetCredits: jest.fn().mockResolvedValue(undefined),
    },
    generation: {
      launchInitialRun: jest.fn(
        async (
          _userId: string,
          input: { designSystemId?: string; prompt: string },
        ) => {
          const pages = Number(/exactly (\d+) pages/.exec(input.prompt)?.[1]);
          const { runId, artifactId } = track({
            kind: 'INITIAL',
            designSystemId: input.designSystemId,
            pages,
          });
          return { runId, artifactId };
        },
      ),
      launchRefineRun: jest.fn(
        async (
          _userId: string,
          sourceArtifactId: string,
          _feedback: string,
          designSystemId?: string,
        ) => {
          const { runId } = track({ kind: 'REFINE', designSystemId });
          return { runId, artifactId: sourceArtifactId, version: 2 };
        },
      ),
    },
    runs: {
      getRun: jest.fn(async (runId: string) => {
        const count = (polls.get(runId) ?? 0) + 1;
        polls.set(runId, count);
        if (count <= (config.pollsToEnd ?? 2)) {
          return { status: 'RUNNING' };
        }
        if (!ended.has(runId)) {
          ended.add(runId);
          active -= 1;
        }
        const run = launched.find((entry) => entry.runId === runId)!;
        return {
          status: config.failing?.(run) ? 'FAILED' : 'COMPLETED',
        };
      }),
    },
    metrics: {
      listRuns: jest.fn(async ({ runIds }: { runIds?: string[] }) => {
        if (listRunsCalls++ < (config.diagnosticsLag ?? 0)) return [];
        return (runIds ?? []).flatMap((runId) => {
          const run = launched.find((entry) => entry.runId === runId);
          if (!run) return [];
          const row = makeRow(
            runId,
            run.designSystemId ?? 'margin',
            run.pages ?? 4,
          );
          return [
            config.failing?.(run)
              ? { ...row, outcome: 'FAILED' as const }
              : row,
          ];
        });
      }),
      aggregate: jest.fn(async ({ runIds }: { runIds?: string[] }) =>
        computeDocumentMetrics(
          (runIds ?? []).map((runId) => makeRow(runId, 'margin', 4)),
        ),
      ),
    },
    covers: {
      coverUrl: jest.fn(
        async (artifactId: string, version: number) =>
          `https://r2.example/${artifactId}/${version}.png`,
      ),
    },
    clock: {
      now: () => clock,
      sleep: jest.fn(async (ms: number) => {
        clock += ms;
      }),
    },
    log: jest.fn((message: string) => {
      log.push(message);
    }),
  };

  const run = (options: Partial<EvalOptions> = {}) =>
    runDocumentEval(
      { ...mocks, defaultDesignSystemId: 'margin' },
      { ...OPTIONS, ...options },
    );

  return { run, mocks, launched, log, maxActive: () => maxActive };
};

describe('runDocumentEval', () => {
  it('should launch 18 initial runs and 2 refinements through the generation service', async () => {
    const { run, mocks, launched } = makeEval();

    const result = await run();

    expect(mocks.generation.launchInitialRun).toHaveBeenCalledTimes(18);
    expect(mocks.generation.launchRefineRun).toHaveBeenCalledTimes(2);
    expect(launched).toHaveLength(20);
    expect(result.records).toHaveLength(20);
    expect(result.records.every(({ state }) => state === 'COMPLETED')).toBe(
      true,
    );
  });

  it('should launch every initial run for the eval user with its brief and system', async () => {
    const { run, mocks } = makeEval();

    await run();

    const [userId, input] = mocks.generation.launchInitialRun.mock.calls[0];
    expect(userId).toBe('eval-user');
    expect(input).toMatchObject({
      designSystemId: 'margin',
      prompt: expect.stringContaining('exactly 4 pages'),
    });
  });

  it("should reset the eval user's credits before every launch", async () => {
    const { run, mocks } = makeEval();

    await run();

    expect(mocks.account.resetCredits).toHaveBeenCalledTimes(20);
  });

  it('should carry the pin on one refine and switch system on the other', async () => {
    const { run, mocks } = makeEval();

    const result = await run();

    const [carry, switching] = mocks.generation.launchRefineRun.mock.calls;
    expect(carry[3]).toBeUndefined();
    expect(switching[3]).toBe('afterglow');
    expect(result.records.slice(18).map((record) => record.sourceKey)).toEqual([
      'margin/4p',
      'margin/8p',
    ]);
  });

  it('should refine two different artifacts', async () => {
    const { run, mocks } = makeEval();

    await run();

    const [carry, switching] = mocks.generation.launchRefineRun.mock.calls;
    expect(carry[1]).not.toBe(switching[1]);
  });

  it('should keep at most `concurrency` runs in flight', async () => {
    const { run, maxActive } = makeEval({ pollsToEnd: 3 });

    await run({ concurrency: 3 });

    expect(maxActive()).toBe(3);
  });

  it('should default to polling until a run ends, sleeping between polls', async () => {
    const { run, mocks } = makeEval({ pollsToEnd: 2 });

    await run({ pollMs: 5000 });

    expect(mocks.clock.sleep).toHaveBeenCalledWith(5000);
  });

  it("should read the metrics for exactly the eval's run ids", async () => {
    const { run, mocks, launched } = makeEval();

    const result = await run();

    const runIds = launched.map((entry) => entry.runId);
    expect(mocks.metrics.listRuns).toHaveBeenCalledWith({ runIds });
    expect(mocks.metrics.aggregate).toHaveBeenCalledWith({ runIds });
    expect(result.rows).toHaveLength(20);
    expect(result.metrics.overall.runs).toBe(20);
  });

  it('should wait for the diagnostics of runs whose status has already ended', async () => {
    const { run, mocks } = makeEval({ diagnosticsLag: 3 });

    const result = await run();

    expect(mocks.metrics.listRuns).toHaveBeenCalledTimes(4);
    expect(result.rows).toHaveLength(20);
    expect(result.evaluation.passed).toBe(true);
  });

  it('should stop waiting for diagnostics that never arrive and count those runs as failing', async () => {
    const { run, mocks } = makeEval({ diagnosticsLag: Infinity });

    const result = await run();

    expect(mocks.metrics.listRuns.mock.calls.length).toBeLessThan(200);
    expect(result.rows).toEqual([]);
    expect(result.evaluation.passed).toBe(false);
  });

  it('should pass every gate when all 20 runs are ready', async () => {
    const { run } = makeEval();

    const result = await run();

    expect(result.evaluation.passed).toBe(true);
  });

  it('should fail the gates when two runs fail', async () => {
    const { run } = makeEval({
      failing: (launch) =>
        launch.kind === 'INITIAL' &&
        (launch.pages === 15 || launch.pages === 12),
    });

    const result = await run();

    expect(result.evaluation.passed).toBe(false);
    expect(
      result.records.filter(({ state }) => state === 'FAILED'),
    ).toHaveLength(6);
  });

  it('should report a refine as failed when no run is READY to refine', async () => {
    const { run, mocks } = makeEval({
      failing: (launch) => launch.kind === 'INITIAL',
    });

    const result = await run();

    expect(mocks.generation.launchRefineRun).not.toHaveBeenCalled();
    expect(result.records.slice(18)).toMatchObject([
      {
        key: 'refine/carry-pin',
        state: 'NOT_RUN',
        error: expect.stringContaining('no READY run'),
      },
      {
        key: 'refine/switch-system',
        state: 'NOT_RUN',
        error: expect.stringContaining('no READY run'),
      },
    ]);
    expect(result.evaluation.passed).toBe(false);
  });

  it('should refine from the first READY runs when other systems fail', async () => {
    const { run, mocks } = makeEval({
      failing: (launch) =>
        launch.kind === 'INITIAL' && launch.designSystemId !== 'margin',
    });

    const result = await run();

    expect(mocks.generation.launchRefineRun).toHaveBeenCalledTimes(2);
    expect(result.records.slice(18).map(({ sourceKey }) => sourceKey)).toEqual([
      'margin/4p',
      'margin/8p',
    ]);
  });

  it('should refine only the carry run and report the switch as failed when one run is READY', async () => {
    const { run, mocks } = makeEval({
      failing: (launch) =>
        launch.kind === 'INITIAL' && launch.runId !== 'run-0',
    });

    const result = await run();

    expect(mocks.generation.launchRefineRun).toHaveBeenCalledTimes(1);
    expect(result.records.slice(18)).toMatchObject([
      { key: 'refine/carry-pin', state: 'COMPLETED' },
      { key: 'refine/switch-system', state: 'NOT_RUN' },
    ]);
  });

  it("should clamp a refine's requestedPages to the target system's pages.max", async () => {
    // Keep margin/4p and margin/15p READY so refine/switch-system starts from margin/15p
    const { run } = makeEval({
      failing: (launch) =>
        launch.kind === 'INITIAL' &&
        !(
          launch.designSystemId === 'margin' &&
          (launch.pages === 4 || launch.pages === 15)
        ),
    });

    const result = await run();

    const switchRefine = result.records.find(
      (r) => r.key === 'refine/switch-system',
    );
    expect(switchRefine?.sourceKey).toBe('margin/15p');
    expect(switchRefine?.requestedDesignSystemId).toBe('afterglow');
    expect(switchRefine?.requestedPages).toBe(12);
  });

  it('should record a launch failure and carry on', async () => {
    const { run, mocks } = makeEval({
      launchError: ({ index }) =>
        index === 4
          ? new Error('design system "x" is not selectable')
          : undefined,
    });

    const result = await run();

    expect(result.records[4]).toMatchObject({
      state: 'LAUNCH_FAILED',
      error: 'design system "x" is not selectable',
    });
    expect(result.records[4].runId).toBeUndefined();
    expect(mocks.generation.launchInitialRun).toHaveBeenCalledTimes(18);
  });

  it('should mark a run that outlives the timeout and skip the runs it never reached', async () => {
    const { run, mocks } = makeEval({ pollsToEnd: Infinity });

    const result = await run({
      concurrency: 2,
      timeoutMs: 10_000,
      pollMs: 4000,
    });

    const states = result.records.map(({ state }) => state);
    expect(states.slice(0, 2)).toEqual(['TIMED_OUT', 'TIMED_OUT']);
    expect(states.slice(2).every((state) => state === 'NOT_RUN')).toBe(true);
    expect(mocks.generation.launchInitialRun).toHaveBeenCalledTimes(2);
    expect(result.evaluation.passed).toBe(false);
  });

  it('should list a cover for every READY run and none for a failed one', async () => {
    const { run, mocks } = makeEval({
      failing: (launch) =>
        launch.kind === 'INITIAL' &&
        launch.pages === 8 &&
        launch.designSystemId === 'margin',
    });

    const result = await run();

    expect(result.covers).toHaveLength(19);
    expect(result.covers.some(({ key }) => key === 'margin/8p')).toBe(false);
    expect(result.covers[0]).toMatchObject({
      key: 'margin/4p',
      designSystemId: 'margin',
      pageCount: 4,
      coverUrl: expect.stringMatching(/^https:\/\/r2\.example\//),
    });
    expect(mocks.covers.coverUrl).toHaveBeenCalledWith('artifact-0', 1);
  });

  it("should look up a refinement's cover at the version it produced", async () => {
    const { run, mocks } = makeEval();

    await run();

    expect(mocks.covers.coverUrl).toHaveBeenCalledWith('artifact-0', 2);
  });

  it('should note when a cover has no URL or the lookup throws', async () => {
    const { run, mocks } = makeEval();
    mocks.covers.coverUrl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('R2 down'));

    const result = await run();

    expect(result.covers[0].note).toBe('no cover was captured');
    expect(result.covers[1].note).toContain('R2 down');
    expect(result.covers[1].coverUrl).toBeUndefined();
  });

  it('should refuse to run unless exactly six systems are listed', async () => {
    const { run, mocks } = makeEval({ systems: SYSTEMS.slice(1) });

    await expect(run()).rejects.toThrow(/expects the 6 launch Design Systems/);
    expect(mocks.generation.launchInitialRun).not.toHaveBeenCalled();
  });

  it('should refuse to run when the default system is not listed', async () => {
    const { run } = makeEval({
      systems: [...SYSTEMS.slice(1), 'other'],
    });

    await expect(run()).rejects.toThrow(/default Design System/);
  });

  it('should stamp the start and finish of the eval', async () => {
    const { run } = makeEval();

    const result = await run();

    expect(result.startedAt).toBe('2026-10-14T10:00:00.000Z');
    expect(Date.parse(result.finishedAt)).toBeGreaterThan(
      Date.parse(result.startedAt),
    );
  });
});
