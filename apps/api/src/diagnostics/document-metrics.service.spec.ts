jest.mock(
  'src/database/schemas',
  () => ({ WorkflowRun: { name: 'WorkflowRun' } }),
  { virtual: true },
);

import { Types } from 'mongoose';
import type { DocumentRunRow } from './document-metrics';
import { DocumentMetricsService } from './document-metrics.service';

describe('DocumentMetricsService', () => {
  const makeService = () => {
    const exec = jest.fn().mockResolvedValue([]);
    const workflowRunModel = { aggregate: jest.fn().mockReturnValue({ exec }) };
    const service = new DocumentMetricsService(workflowRunModel as any);
    const row: DocumentRunRow = {
      designSystemId: 'aurora',
      outcome: 'READY',
      jobAttemptFailureCodes: [],
      candidates: [],
      repairRounds: 1,
      wallTimeMs: 90_000,
      credits: 12,
      renderAttempts: [],
    };
    return {
      service,
      mocks: { workflowRunModel, exec },
      fixtures: { row, since: new Date('2026-10-07T00:00:00Z') },
    };
  };

  let service: DocumentMetricsService;
  let mocks: ReturnType<typeof makeService>['mocks'];
  let fixtures: ReturnType<typeof makeService>['fixtures'];

  beforeEach(() => {
    jest.clearAllMocks();
    ({ service, mocks, fixtures } = makeService());
  });

  const matchStage = (): Record<string, unknown> => {
    const [pipeline] = mocks.workflowRunModel.aggregate.mock.calls[0] as [
      { $match: Record<string, unknown> }[],
    ];
    return pipeline[0].$match;
  };

  describe('aggregate', () => {
    it('should compute metrics over the rows the aggregation returns', async () => {
      mocks.exec.mockResolvedValue([fixtures.row]);

      const metrics = await service.aggregate({ since: fixtures.since });

      expect(metrics.since).toEqual(fixtures.since);
      expect(metrics.overall).toMatchObject({
        runs: 1,
        readyRate: 1,
        repairRounds: { '1': 1 },
      });
      expect(metrics.byDesignSystem.aurora.runs).toBe(1);
    });

    it('should return empty metrics when no run matches', async () => {
      const metrics = await service.aggregate({ since: fixtures.since });

      expect(metrics.overall.runs).toBe(0);
      expect(metrics.byDesignSystem).toEqual({});
    });

    it('should match only DOCUMENT runs that ended, created since the given date', async () => {
      await service.aggregate({ since: fixtures.since });

      expect(matchStage()).toEqual({
        'documentDiagnostics.outcome': { $in: ['READY', 'FAILED'] },
        createdAt: { $gte: fixtures.since },
      });
    });

    it('should leave the window unbounded when no since is given', async () => {
      const metrics = await service.aggregate({});

      expect(metrics.since).toBeNull();
      expect(matchStage()).toEqual({
        'documentDiagnostics.outcome': { $in: ['READY', 'FAILED'] },
      });
    });

    it('should narrow to the given run ids when runIds is set', async () => {
      const ids = [new Types.ObjectId(), new Types.ObjectId()];

      await service.aggregate({ runIds: ids.map(String) });

      expect(matchStage()._id).toEqual({ $in: ids });
    });

    it('should match nothing when runIds is empty', async () => {
      await service.aggregate({ runIds: [] });

      expect(matchStage()._id).toEqual({ $in: [] });
    });
  });
});
