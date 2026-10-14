jest.mock(
  '../database/schemas',
  () => ({
    WorkflowRun: { name: 'WorkflowRun' },
    RunCandidateSource: { name: 'RunCandidateSource' },
    RunCandidateSourceRole: { ACCEPTED: 'ACCEPTED', FAILED: 'FAILED' },
    RunKind: { INITIAL: 'INITIAL', REFINE: 'REFINE' },
    RunStatus: {
      RUNNING: 'RUNNING',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
    },
  }),
  { virtual: true },
);

import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { RunKind, RunStatus } from '../database/schemas';
import type { DocumentDiagnostics } from './engine/workflow.types';
import { FailureCode, WorkflowStep } from './workflow.constants';
import { WorkflowRunService } from './workflow-run.service';

describe('WorkflowRunService', () => {
  const makeService = () => {
    const workflowRunModel = {
      create: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const candidateSourceModel = {
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findOne: jest.fn(),
    };
    const service = new WorkflowRunService(
      workflowRunModel as any,
      candidateSourceModel as any,
    );

    const userId = new Types.ObjectId().toString();
    const artifactId = new Types.ObjectId().toString();
    const runId = new Types.ObjectId().toString();

    const fixtures = {
      userId,
      artifactId,
      runId,
      input: {
        type: 'POST',
        withResearch: false,
        kind: RunKind.INITIAL,
        prompt: 'why staff engineers write',
        userId,
        artifactId,
        version: 1,
      },
    };

    return {
      service,
      mocks: { workflowRunModel, candidateSourceModel },
      fixtures,
    };
  };

  let service: WorkflowRunService;
  let mocks: ReturnType<typeof makeService>['mocks'];
  let fixtures: ReturnType<typeof makeService>['fixtures'];

  beforeEach(() => {
    jest.clearAllMocks();
    ({ service, mocks, fixtures } = makeService());
  });

  describe('createRun', () => {
    it('should create a RUNNING run with a zeroed credit accumulator', async () => {
      await service.createRun({
        userId: fixtures.userId,
        artifactId: fixtures.artifactId,
        targetVersion: 1,
        kind: RunKind.INITIAL,
        input: fixtures.input as any,
      });

      expect(mocks.workflowRunModel.create).toHaveBeenCalledWith({
        user: expect.any(Types.ObjectId),
        artifact: expect.any(Types.ObjectId),
        targetVersion: 1,
        kind: RunKind.INITIAL,
        status: RunStatus.RUNNING,
        input: fixtures.input,
        creditsUsed: 0,
      });
    });
  });

  describe('getRun', () => {
    it('should load the run by id when the id is a valid ObjectId', async () => {
      const run = { _id: fixtures.runId };
      mocks.workflowRunModel.findById.mockResolvedValue(run);

      await expect(service.getRun(fixtures.runId)).resolves.toBe(run);
      expect(mocks.workflowRunModel.findById).toHaveBeenCalledWith(
        fixtures.runId,
      );
    });

    it('should return null without touching the model for a malformed id', async () => {
      await expect(service.getRun('not-an-object-id')).resolves.toBeNull();
      expect(mocks.workflowRunModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('getLatestCompletedResearch', () => {
    it('should return cached research from the latest completed run when one exists', async () => {
      const research = {
        findings: 'cached findings',
        sources: [{ title: 'Source', url: 'https://example.com' }],
      };
      const sort = jest.fn().mockResolvedValue({ researchContext: research });
      mocks.workflowRunModel.findOne.mockReturnValue({ sort });

      await expect(
        service.getLatestCompletedResearch(fixtures.artifactId),
      ).resolves.toEqual(research);

      expect(mocks.workflowRunModel.findOne).toHaveBeenCalledWith({
        artifact: expect.any(Types.ObjectId),
        status: RunStatus.COMPLETED,
        researchContext: { $exists: true },
      });
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should return undefined when the artifact has no cached research', async () => {
      const sort = jest.fn().mockResolvedValue(null);
      mocks.workflowRunModel.findOne.mockReturnValue({ sort });

      await expect(
        service.getLatestCompletedResearch(fixtures.artifactId),
      ).resolves.toBeUndefined();
    });

    it('should not query when the artifact id is malformed', async () => {
      await expect(
        service.getLatestCompletedResearch('not-an-object-id'),
      ).resolves.toBeUndefined();
      expect(mocks.workflowRunModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findRunsForVersions', () => {
    const chain = (runs: unknown[]) => {
      const exec = jest.fn().mockResolvedValue(runs);
      const lean = jest.fn().mockReturnValue({ exec });
      const sort = jest.fn().mockReturnValue({ lean });
      const select = jest.fn().mockReturnValue({ sort });
      mocks.workflowRunModel.find.mockReturnValue({ select });
      return { select, sort };
    };

    it('should return each run by its target in one oldest-first query when given several Attempts', async () => {
      const otherArtifactId = new Types.ObjectId().toString();
      const otherRunId = new Types.ObjectId();
      const { select, sort } = chain([
        {
          _id: new Types.ObjectId(fixtures.runId),
          artifact: new Types.ObjectId(fixtures.artifactId),
          targetVersion: 2,
        },
        {
          _id: otherRunId,
          artifact: new Types.ObjectId(otherArtifactId),
          targetVersion: 1,
        },
      ]);

      await expect(
        service.findRunsForVersions([
          { artifactId: fixtures.artifactId, version: 2 },
          { artifactId: otherArtifactId, version: 1 },
        ]),
      ).resolves.toEqual([
        { artifactId: fixtures.artifactId, version: 2, runId: fixtures.runId },
        {
          artifactId: otherArtifactId,
          version: 1,
          runId: otherRunId.toString(),
        },
      ]);
      expect(mocks.workflowRunModel.find).toHaveBeenCalledTimes(1);
      expect(mocks.workflowRunModel.find).toHaveBeenCalledWith({
        $or: [
          {
            artifact: new Types.ObjectId(fixtures.artifactId),
            targetVersion: 2,
          },
          { artifact: new Types.ObjectId(otherArtifactId), targetVersion: 1 },
        ],
      });
      expect(select).toHaveBeenCalledWith({
        _id: 1,
        artifact: 1,
        targetVersion: 1,
      });
      expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
    });

    it('should not query when no target has a valid artifact id', async () => {
      await expect(
        service.findRunsForVersions([{ artifactId: 'nope', version: 1 }]),
      ).resolves.toEqual([]);
      expect(mocks.workflowRunModel.find).not.toHaveBeenCalled();
    });
  });

  describe('handleFor', () => {
    it('should bind the runId onto the handle', () => {
      expect(service.handleFor(fixtures.runId).runId).toBe(fixtures.runId);
    });

    it('should persist the current step at a boundary', async () => {
      await service
        .handleFor(fixtures.runId)
        .setCurrentStep(WorkflowStep.GENERATE);

      expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        { $set: { currentStep: WorkflowStep.GENERATE } },
      );
    });

    it('should persist the research context so a later refine reuses it', async () => {
      const research = { findings: 'f', sources: [] };

      await service.handleFor(fixtures.runId).saveResearchContext(research);

      expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        { $set: { researchContext: research } },
      );
    });

    it('should append auditable Browserless attempts without overwriting retries', async () => {
      await service.handleFor(fixtures.runId).recordRenderAttempt({
        durationMs: 60_001,
        units: 3,
        outcome: 'ERROR',
        billed: false,
      });

      expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        {
          $push: {
            renderAttempts: {
              durationMs: 60_001,
              units: 3,
              outcome: 'ERROR',
              billed: false,
            },
          },
        },
      );
    });

    it('should append a document check, with its full violation list, to the run', async () => {
      const check = {
        phase: 'static' as const,
        candidateSha256: 'a'.repeat(64),
        violations: [{ code: 'typography.scale', detail: '13px', line: 4 }],
        checkedAt: new Date('2026-10-02T00:00:00.000Z'),
      };

      await service.handleFor(fixtures.runId).recordDocumentCheck(check);

      const [filter, update] = mocks.workflowRunModel.updateOne.mock
        .calls[0] as [{ _id: unknown }, unknown];
      expect(filter._id).toBeInstanceOf(Types.ObjectId);
      expect(update).toEqual({ $push: { documentChecks: check } });
    });

    const checkpointNow = new Date('2026-10-02T00:00:00.000Z');
    const ninetyDaysLater = new Date('2026-12-31T00:00:00.000Z');
    const sha = (text: string) =>
      createHash('sha256').update(text).digest('hex');
    const accepted = {
      commentary: 'Swipe through.',
      candidate: '<html></html>',
      repairsSpent: 1,
      title: 'Three fixes',
      savedAt: checkpointNow,
    };

    const mockStoredRun = (stored: unknown) => {
      const exec = jest.fn().mockResolvedValue(stored);
      const lean = jest.fn().mockReturnValue({ exec });
      const select = jest.fn().mockReturnValue({ lean });
      mocks.workflowRunModel.findById.mockReturnValue({ select });
      return { select };
    };
    const mockStoredText = (stored: unknown) => {
      const exec = jest.fn().mockResolvedValue(stored);
      const lean = jest.fn().mockReturnValue({ exec });
      mocks.candidateSourceModel.findOne.mockReturnValue({ lean });
    };

    describe('saveAcceptedCandidate', () => {
      beforeEach(() => jest.useFakeTimers().setSystemTime(checkpointNow));
      afterEach(() => jest.useRealTimers());

      it('should keep the text apart, expiring in 90 days, when it saves the checkpoint', async () => {
        await service.handleFor(fixtures.runId).saveAcceptedCandidate(accepted);

        const [filter, update, options] = mocks.candidateSourceModel.updateOne
          .mock.calls[0] as [{ run: unknown; role: string }, unknown, unknown];
        expect(filter.run).toBeInstanceOf(Types.ObjectId);
        expect(filter.role).toBe('ACCEPTED');
        expect(update).toEqual({
          $set: {
            candidateSha256: sha('<html></html>'),
            candidate: '<html></html>',
            expiresAt: ninetyDaysLater,
          },
        });
        expect(options).toEqual({ upsert: true });
      });

      it('should keep the checkpoint on the run by hash, without its text', async () => {
        await service.handleFor(fixtures.runId).saveAcceptedCandidate(accepted);

        const [filter, update] = mocks.workflowRunModel.updateOne.mock
          .calls[0] as [{ _id: unknown }, unknown];
        expect(filter._id).toBeInstanceOf(Types.ObjectId);
        expect(update).toEqual({
          $set: {
            acceptedCandidate: {
              commentary: 'Swipe through.',
              candidateSha256: sha('<html></html>'),
              repairsSpent: 1,
              title: 'Three fixes',
              savedAt: checkpointNow,
            },
          },
        });
        // The text first, so a stored checkpoint always has it.
        expect(
          mocks.candidateSourceModel.updateOne.mock.invocationCallOrder[0],
        ).toBeLessThan(
          mocks.workflowRunModel.updateOne.mock.invocationCallOrder[0],
        );
      });
    });

    describe('readAcceptedCandidate', () => {
      it('should read back the checkpoint an earlier attempt saved, with its text', async () => {
        const { candidate, ...rest } = accepted;
        const { select } = mockStoredRun({
          acceptedCandidate: { ...rest, candidateSha256: sha(candidate) },
        });
        mockStoredText({ candidate });

        await expect(
          service.handleFor(fixtures.runId).readAcceptedCandidate(),
        ).resolves.toEqual(accepted);
        expect(select).toHaveBeenCalledWith({ acceptedCandidate: 1 });
        expect(mocks.candidateSourceModel.findOne).toHaveBeenCalledWith(
          {
            run: expect.any(Types.ObjectId),
            role: 'ACCEPTED',
            candidateSha256: sha(candidate),
          },
          { candidate: 1 },
        );
      });

      it('should read no checkpoint when no attempt saved one', async () => {
        mockStoredRun({});

        await expect(
          service.handleFor(fixtures.runId).readAcceptedCandidate(),
        ).resolves.toBeUndefined();
        expect(mocks.candidateSourceModel.findOne).not.toHaveBeenCalled();
      });

      it('should read no checkpoint when its text has expired', async () => {
        const { candidate, ...rest } = accepted;
        mockStoredRun({
          acceptedCandidate: { ...rest, candidateSha256: sha(candidate) },
        });
        mockStoredText(null);

        await expect(
          service.handleFor(fixtures.runId).readAcceptedCandidate(),
        ).resolves.toBeUndefined();
      });

      it('should read no checkpoint when it predates run_candidate_sources and has no hash', async () => {
        mockStoredRun({ acceptedCandidate: accepted });

        await expect(
          service.handleFor(fixtures.runId).readAcceptedCandidate(),
        ).resolves.toBeUndefined();
        expect(mocks.candidateSourceModel.findOne).not.toHaveBeenCalled();
      });
    });

    describe('readDocumentDiagnostics', () => {
      it('should read what earlier job attempts recorded', async () => {
        const recorded = { jobAttempt: 1, outcome: 'RETRYING' };
        const { select } = mockStoredRun({ documentDiagnostics: recorded });

        await expect(
          service.handleFor(fixtures.runId).readDocumentDiagnostics(),
        ).resolves.toEqual(recorded);
        expect(select).toHaveBeenCalledWith({ documentDiagnostics: 1 });
      });

      it('should read nothing when no job attempt recorded any', async () => {
        mockStoredRun({});

        await expect(
          service.handleFor(fixtures.runId).readDocumentDiagnostics(),
        ).resolves.toBeUndefined();
      });
    });

    describe('saveDocumentDiagnostics', () => {
      const now = new Date('2026-10-02T00:00:00.000Z');
      const diagnostics: DocumentDiagnostics = {
        jobAttempt: 1,
        outcome: 'FAILED',
        failureCode: FailureCode.DOCUMENT_REPAIR_EXHAUSTED,
        jobAttemptFailures: [],
        candidates: [],
        repairRounds: 2,
        outputTokens: 0,
        stepWallTimeMs: {},
        wallTimeMs: 0,
        renderAttempts: { sessions: 0 },
        credits: 0,
        recordedAt: now,
      };

      beforeEach(() => jest.useFakeTimers().setSystemTime(now));
      afterEach(() => jest.useRealTimers());

      it('should set the diagnostics block on the run', async () => {
        await service
          .handleFor(fixtures.runId)
          .saveDocumentDiagnostics(diagnostics);

        expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Types.ObjectId) },
          { $set: { documentDiagnostics: diagnostics } },
        );
        expect(mocks.candidateSourceModel.updateOne).not.toHaveBeenCalled();
      });

      it('should keep the failed candidate apart, expiring in 90 days, when there is one', async () => {
        await service
          .handleFor(fixtures.runId)
          .saveDocumentDiagnostics(diagnostics, '<section>failed</section>');

        expect(mocks.candidateSourceModel.updateOne).toHaveBeenCalledWith(
          { run: expect.any(Types.ObjectId), role: 'FAILED' },
          {
            $set: {
              candidateSha256: createHash('sha256')
                .update('<section>failed</section>')
                .digest('hex'),
              candidate: '<section>failed</section>',
              expiresAt: new Date('2026-12-31T00:00:00.000Z'),
            },
          },
          { upsert: true },
        );
      });
    });

    it('should mark the run COMPLETED with the winning attempt total', async () => {
      await service.handleFor(fixtures.runId).complete(38);

      expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        { $set: { status: RunStatus.COMPLETED, creditsUsed: 38 } },
      );
    });

    it('should mark the run FAILED with the code and reason', async () => {
      await service
        .handleFor(fixtures.runId)
        .fail(FailureCode.INTERNAL, 'insufficient credits');

      expect(mocks.workflowRunModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        {
          $set: {
            status: RunStatus.FAILED,
            failureCode: 'internal',
            failureReason: 'insufficient credits',
          },
        },
      );
    });
  });
});
