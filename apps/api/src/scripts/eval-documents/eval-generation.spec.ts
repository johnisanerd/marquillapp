jest.mock(
  'src/database/schemas',
  () => ({ ArtifactType: { DOCUMENT: 'DOCUMENT' } }),
  { virtual: true },
);

import { createEvalGeneration } from './eval-generation';

const makeGeneration = () => {
  const service = {
    launchInitialRun: jest
      .fn()
      .mockResolvedValue({ artifactId: 'artifact', runId: 'run' }),
    launchRefineRun: jest
      .fn()
      .mockResolvedValue({ artifactId: 'artifact', runId: 'run', version: 2 }),
  };
  return { generation: createEvalGeneration(service), service };
};

describe('createEvalGeneration', () => {
  describe('launchInitialRun', () => {
    it('should create a researchless DOCUMENT with the brief and system', async () => {
      const { generation, service } = makeGeneration();

      await expect(
        generation.launchInitialRun('user', {
          prompt: 'a brief',
          designSystemId: 'margin',
        }),
      ).resolves.toEqual({ artifactId: 'artifact', runId: 'run' });

      expect(service.launchInitialRun).toHaveBeenCalledWith('user', {
        type: 'DOCUMENT',
        prompt: 'a brief',
        withResearch: false,
        designSystemId: 'margin',
      });
    });
  });

  describe('launchRefineRun', () => {
    it('should pass the feedback and the optional system straight through', async () => {
      const { generation, service } = makeGeneration();

      await generation.launchRefineRun('user', 'artifact', 'tighter', 'margin');
      await generation.launchRefineRun('user', 'artifact', 'tighter');

      expect(service.launchRefineRun).toHaveBeenNthCalledWith(
        1,
        'user',
        'artifact',
        'tighter',
        'margin',
      );
      expect(service.launchRefineRun).toHaveBeenNthCalledWith(
        2,
        'user',
        'artifact',
        'tighter',
        undefined,
      );
    });
  });
});
