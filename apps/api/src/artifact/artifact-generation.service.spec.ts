jest.mock(
  'src/database/schemas',
  () => ({
    ArtifactType: { POST: 'POST', POLL: 'POLL', DOCUMENT: 'DOCUMENT' },
    VersionStatus: {
      GENERATING: 'GENERATING',
      READY: 'READY',
      FAILED: 'FAILED',
    },
    RunKind: { INITIAL: 'INITIAL', REFINE: 'REFINE' },
  }),
  { virtual: true },
);

jest.mock('./artifact.service', () => ({ ArtifactService: class {} }), {
  virtual: true,
});
jest.mock(
  'src/feature-gating/feature-gating.service',
  () => ({ FeatureGatingService: class {} }),
  { virtual: true },
);
jest.mock(
  'src/workflow/workflow-run.service',
  () => ({ WorkflowRunService: class {} }),
  { virtual: true },
);
jest.mock(
  '../design-system/design-systems.service',
  () => ({ DesignSystemsService: class {} }),
  { virtual: true },
);
jest.mock('src/workflow/workflow.queue', () => ({ WorkflowQueue: class {} }), {
  virtual: true,
});

// The real gate, for counting its reads: its own relative import of the
// schema barrel, which would otherwise drag in Mongoose.
jest.mock(
  '../database/schemas',
  () => ({
    SubscriptionStatus: { ACTIVE: 'ACTIVE', PAST_DUE: 'PAST_DUE' },
    Subscription: class Subscription {},
    Tier: class Tier {},
    Usage: class Usage {},
    Artifact: class Artifact {},
    ArtifactType: { POST: 'POST', POLL: 'POLL', DOCUMENT: 'DOCUMENT' },
  }),
  { virtual: true },
);

import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FeatureGatingService } from '../feature-gating/feature-gating.service';
import { ArtifactType, RunKind } from 'src/database/schemas';
import { ArtifactGenerationService } from './artifact-generation.service';

describe('ArtifactGenerationService', () => {
  const makeService = () => {
    const artifactService = {
      createArtifact: jest.fn().mockResolvedValue({ _id: 'artifact123' }),
      appendRefineVersion: jest.fn().mockResolvedValue({
        version: 2,
        type: 'POST',
        prompt: 'why staff engineers write',
        withResearch: true,
      }),
    };
    const workflowRunService = {
      createRun: jest.fn().mockResolvedValue({ _id: 'run123' }),
    };
    const featureGating = {
      assertLaunch: jest.fn().mockResolvedValue({}),
    };
    const workflowQueue = {
      addArtifactRunJob: jest.fn().mockResolvedValue(undefined),
    };
    const designSystems = {
      getActive: jest.fn((id: string) => {
        if (id === 'retired') {
          throw new BadRequestException(
            `Design System "${id}" is not available`,
          );
        }
        return { id, version: id === 'margin' ? 2 : 1, name: 'Margin' };
      }),
    };

    const service = new ArtifactGenerationService(
      artifactService as any,
      workflowRunService as any,
      featureGating as any,
      workflowQueue as any,
      designSystems as any,
    );

    const dto = {
      type: ArtifactType.POST,
      prompt: 'why staff engineers write',
      withResearch: true,
    };

    return {
      service,
      mocks: {
        artifactService,
        workflowRunService,
        featureGating,
        workflowQueue,
        designSystems,
      },
      fixtures: { userId: 'user123', dto },
    };
  };

  /** The `BuildInput` the first `createRun` stored. */
  const storedInput = (): Record<string, unknown> =>
    (
      mocks.workflowRunService.createRun.mock.calls[0] as [
        { input: Record<string, unknown> },
      ]
    )[0].input;

  let service: ArtifactGenerationService;
  let mocks: ReturnType<typeof makeService>['mocks'];
  let fixtures: ReturnType<typeof makeService>['fixtures'];

  beforeEach(() => {
    jest.clearAllMocks();
    ({ service, mocks, fixtures } = makeService());
  });

  describe('launchInitialRun', () => {
    it('should reject a research run before creating or queueing anything when the tier disables research', async () => {
      mocks.featureGating.assertLaunch.mockRejectedValue(
        new Error('FEATURE_LIMIT_EXCEEDED'),
      );

      await expect(
        service.launchInitialRun(fixtures.userId, fixtures.dto),
      ).rejects.toThrow('FEATURE_LIMIT_EXCEEDED');

      expect(mocks.artifactService.createArtifact).not.toHaveBeenCalled();
      expect(mocks.workflowRunService.createRun).not.toHaveBeenCalled();
      expect(mocks.workflowQueue.addArtifactRunJob).not.toHaveBeenCalled();
    });

    it.each([ArtifactType.POST, ArtifactType.POLL, ArtifactType.DOCUMENT])(
      'should gate a research-enabled %s run on research access and balance in one check',
      async (type) => {
        await service.launchInitialRun(fixtures.userId, {
          ...fixtures.dto,
          type,
        });

        expect(mocks.featureGating.assertLaunch).toHaveBeenCalledTimes(1);
        expect(mocks.featureGating.assertLaunch).toHaveBeenCalledWith(
          fixtures.userId,
          { withResearch: true },
        );
      },
    );

    it('should not require research access for a non-research run', async () => {
      await service.launchInitialRun(fixtures.userId, {
        ...fixtures.dto,
        withResearch: false,
      });

      expect(mocks.featureGating.assertLaunch).toHaveBeenCalledWith(
        fixtures.userId,
        { withResearch: false },
      );
    });

    it('should return the artifactId and runId when the run is launched', async () => {
      await expect(
        service.launchInitialRun(fixtures.userId, fixtures.dto),
      ).resolves.toEqual({ artifactId: 'artifact123', runId: 'run123' });
    });

    it('should pre-check the balance before creating anything', async () => {
      const order: string[] = [];
      mocks.featureGating.assertLaunch.mockImplementation(() => {
        order.push('assertLaunch');
        return Promise.resolve({});
      });
      mocks.artifactService.createArtifact.mockImplementation(() => {
        order.push('createArtifact');
        return Promise.resolve({ _id: 'artifact123' });
      });

      await service.launchInitialRun(fixtures.userId, fixtures.dto);

      expect(order).toEqual(['assertLaunch', 'createArtifact']);
    });

    it('should not create an artifact or enqueue when the balance check fails', async () => {
      mocks.featureGating.assertLaunch.mockRejectedValue(
        new Error('FEATURE_LIMIT_EXCEEDED'),
      );

      await expect(
        service.launchInitialRun(fixtures.userId, fixtures.dto),
      ).rejects.toThrow('FEATURE_LIMIT_EXCEEDED');

      expect(mocks.artifactService.createArtifact).not.toHaveBeenCalled();
      expect(mocks.workflowRunService.createRun).not.toHaveBeenCalled();
      expect(mocks.workflowQueue.addArtifactRunJob).not.toHaveBeenCalled();
    });

    it('should create the artifact from the dto', async () => {
      await service.launchInitialRun(fixtures.userId, {
        type: ArtifactType.DOCUMENT,
        prompt: 'deep modules',
        withResearch: false,
        stylePreset: 'educational' as any,
        designSystemId: 'schematic',
      });

      expect(mocks.artifactService.createArtifact).toHaveBeenCalledWith(
        'user123',
        {
          type: ArtifactType.DOCUMENT,
          prompt: 'deep modules',
          withResearch: false,
          stylePreset: 'educational',
          designSystemId: 'schematic',
        },
      );
    });

    it("should pin a DOCUMENT to the requested Design System's ACTIVE version", async () => {
      await service.launchInitialRun(fixtures.userId, {
        type: ArtifactType.DOCUMENT,
        prompt: 'deep modules',
        withResearch: false,
        designSystemId: 'schematic',
      });

      expect(mocks.designSystems.getActive).toHaveBeenCalledWith('schematic');
      expect(storedInput()).toMatchObject({
        designSystem: { id: 'schematic', version: 1 },
      });
    });

    it('should pin a DOCUMENT that names no Design System to the default', async () => {
      await service.launchInitialRun(fixtures.userId, {
        type: ArtifactType.DOCUMENT,
        prompt: 'deep modules',
        withResearch: false,
      });

      expect(mocks.designSystems.getActive).toHaveBeenCalledWith('margin');
      expect(storedInput()).toMatchObject({
        designSystem: { id: 'margin', version: 2 },
      });
    });

    it('should reject an unavailable Design System before any check, write or enqueue', async () => {
      await expect(
        service.launchInitialRun(fixtures.userId, {
          type: ArtifactType.DOCUMENT,
          prompt: 'deep modules',
          withResearch: true,
          designSystemId: 'retired',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.featureGating.assertLaunch).not.toHaveBeenCalled();
      expect(mocks.artifactService.createArtifact).not.toHaveBeenCalled();
      expect(mocks.workflowQueue.addArtifactRunJob).not.toHaveBeenCalled();
    });

    it('should reject a designSystemId on a type that is not a DOCUMENT', async () => {
      await expect(
        service.launchInitialRun(fixtures.userId, {
          ...fixtures.dto,
          designSystemId: 'margin',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.artifactService.createArtifact).not.toHaveBeenCalled();
    });

    it('should not pin a POST', async () => {
      await service.launchInitialRun(fixtures.userId, fixtures.dto);

      expect(mocks.designSystems.getActive).not.toHaveBeenCalled();
      expect(storedInput()).not.toHaveProperty('designSystem');
    });

    it('should persist an INITIAL run whose input targets version 1 of the new artifact', async () => {
      await service.launchInitialRun(fixtures.userId, fixtures.dto);

      expect(mocks.workflowRunService.createRun).toHaveBeenCalledWith({
        userId: 'user123',
        artifactId: 'artifact123',
        targetVersion: 1,
        kind: RunKind.INITIAL,
        input: {
          type: 'POST',
          prompt: 'why staff engineers write',
          withResearch: true,
          kind: RunKind.INITIAL,
          userId: 'user123',
          artifactId: 'artifact123',
          version: 1,
        },
      });
    });

    it('should enqueue the run keyed by the runId with the same input stored on the run', async () => {
      await service.launchInitialRun(fixtures.userId, fixtures.dto);

      const storedInput =
        mocks.workflowRunService.createRun.mock.calls[0][0].input;
      expect(mocks.workflowQueue.addArtifactRunJob).toHaveBeenCalledWith(
        'run123',
        storedInput,
      );
    });
  });

  describe('launchRefineRun', () => {
    it('should return the artifactId, new version, and runId when the refine run is launched', async () => {
      await expect(
        service.launchRefineRun(
          'user123',
          'artifact123',
          'Make the hook sharper',
        ),
      ).resolves.toEqual({
        artifactId: 'artifact123',
        version: 2,
        runId: 'run123',
      });
    });

    it('should assert balance before appending the new version when launching a refine', async () => {
      const order: string[] = [];
      mocks.featureGating.assertLaunch.mockImplementation(() => {
        order.push('assertLaunch');
        return Promise.resolve({});
      });
      mocks.artifactService.appendRefineVersion.mockImplementation(() => {
        order.push('appendRefineVersion');
        return Promise.resolve({
          version: 2,
          type: ArtifactType.POST,
          prompt: 'why staff engineers write',
          withResearch: true,
        });
      });

      await service.launchRefineRun(
        'user123',
        'artifact123',
        'Make the hook sharper',
      );

      expect(order).toEqual(['assertLaunch', 'appendRefineVersion']);
      // A refine reuses the run's research, so only the balance is gated.
      expect(mocks.featureGating.assertLaunch).toHaveBeenCalledWith('user123', {
        withResearch: false,
      });
      expect(mocks.artifactService.appendRefineVersion).toHaveBeenCalledWith(
        'user123',
        'artifact123',
        'Make the hook sharper',
        undefined,
      );
    });

    it("should carry the Attempt's Design System pin into the run input when refining a DOCUMENT", async () => {
      mocks.artifactService.appendRefineVersion.mockResolvedValue({
        version: 2,
        type: ArtifactType.DOCUMENT,
        prompt: 'three fixes',
        withResearch: false,
        designSystem: { id: 'afterglow', version: 1 },
      });

      await service.launchRefineRun(
        'user123',
        'artifact123',
        'Make it warmer',
        'afterglow',
      );

      expect(mocks.artifactService.appendRefineVersion).toHaveBeenCalledWith(
        'user123',
        'artifact123',
        'Make it warmer',
        'afterglow',
      );
      expect(mocks.workflowRunService.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            kind: RunKind.REFINE,
            designSystem: { id: 'afterglow', version: 1 },
          }),
        }),
      );
    });

    it('should persist and enqueue a REFINE run when the version is appended', async () => {
      mocks.artifactService.appendRefineVersion.mockResolvedValue({
        version: 3,
        type: ArtifactType.POLL,
        prompt: 'deep modules',
        withResearch: true,
        stylePreset: 'educational',
      });

      await service.launchRefineRun(
        'user123',
        'artifact123',
        'Use a more concrete example',
      );

      expect(mocks.workflowRunService.createRun).toHaveBeenCalledWith({
        userId: 'user123',
        artifactId: 'artifact123',
        targetVersion: 3,
        kind: RunKind.REFINE,
        input: {
          type: ArtifactType.POLL,
          prompt: 'deep modules',
          withResearch: true,
          stylePreset: 'educational',
          kind: RunKind.REFINE,
          userId: 'user123',
          artifactId: 'artifact123',
          version: 3,
        },
      });

      const storedInput =
        mocks.workflowRunService.createRun.mock.calls[0][0].input;
      expect(mocks.workflowQueue.addArtifactRunJob).toHaveBeenCalledWith(
        'run123',
        storedInput,
      );
    });

    it('should not append or enqueue when the balance check fails for a refine', async () => {
      mocks.featureGating.assertLaunch.mockRejectedValue(
        new Error('FEATURE_LIMIT_EXCEEDED'),
      );

      await expect(
        service.launchRefineRun('user123', 'artifact123', 'Try again'),
      ).rejects.toThrow('FEATURE_LIMIT_EXCEEDED');

      expect(mocks.artifactService.appendRefineVersion).not.toHaveBeenCalled();
      expect(mocks.workflowRunService.createRun).not.toHaveBeenCalled();
      expect(mocks.workflowQueue.addArtifactRunJob).not.toHaveBeenCalled();
    });
  });

  describe('gating reads', () => {
    const userId = new Types.ObjectId().toString();

    /**
     * The real gate over counting model mocks: one `findOne`/`findById` is one
     * database read. The tier cache starts cold, as on a fresh API process.
     */
    const makeGatedService = () => {
      const paidTier = {
        _id: new Types.ObjectId(),
        name: 'Starter',
        monthlyPrice: 9.99,
        limits: { credits: 1000, research: 1 },
      };
      const subscriptionModel = {
        findOne: jest.fn(() => ({
          sort: () => ({
            lean: () =>
              Promise.resolve({
                status: 'ACTIVE',
                tierId: paidTier._id,
                currentPeriodStart: new Date(Date.now() - 86_400_000),
                currentPeriodEnd: new Date(Date.now() + 86_400_000),
              }),
          }),
        })),
      };
      const tierModel = {
        findById: jest.fn(() => ({ lean: () => Promise.resolve(paidTier) })),
        findOne: jest.fn(),
      };
      const usageModel = {
        findOne: jest.fn(() => ({ lean: () => Promise.resolve({ count: 1 }) })),
      };
      const gate = new FeatureGatingService(
        subscriptionModel as never,
        tierModel as never,
        usageModel as never,
        {} as never,
        {} as never,
        {},
      );
      const gated = makeService();
      const service = new ArtifactGenerationService(
        gated.mocks.artifactService as never,
        gated.mocks.workflowRunService as never,
        gate,
        gated.mocks.workflowQueue as never,
        gated.mocks.designSystems as never,
      );
      const reads = () =>
        subscriptionModel.findOne.mock.calls.length +
        tierModel.findById.mock.calls.length +
        tierModel.findOne.mock.calls.length +
        usageModel.findOne.mock.calls.length;
      return { service, subscriptionModel, tierModel, usageModel, reads };
    };

    it('should make 3 gating reads for a research launch when the tier cache is cold', async () => {
      const gated = makeGatedService();

      await gated.service.launchInitialRun(userId, fixtures.dto);

      expect(gated.subscriptionModel.findOne).toHaveBeenCalledTimes(1);
      expect(gated.tierModel.findById).toHaveBeenCalledTimes(1);
      expect(gated.usageModel.findOne).toHaveBeenCalledTimes(1);
      expect(gated.reads()).toBe(3);
    });

    it('should make 2 gating reads for the next launch when the tier is cached', async () => {
      const gated = makeGatedService();
      await gated.service.launchInitialRun(userId, fixtures.dto);
      const before = gated.reads();

      await gated.service.launchRefineRun(userId, 'artifact123', 'Again');

      expect(gated.reads() - before).toBe(2);
    });
  });
});
