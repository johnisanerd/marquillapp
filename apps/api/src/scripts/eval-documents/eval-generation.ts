import type { ArtifactGenerationService } from '../../artifact/artifact-generation.service';
import { ArtifactType } from 'src/database/schemas';
import type { EvalGeneration } from './eval-runner';

/**
 * Adapts the HTTP create and refine path to the eval's launches. Every
 * initial run is a DOCUMENT without research: the eval measures the document
 * pipeline, and research would need a paid tier and add a provider's cost and
 * variance to every figure.
 */
export function createEvalGeneration(
  service: Pick<
    ArtifactGenerationService,
    'launchInitialRun' | 'launchRefineRun'
  >,
): EvalGeneration {
  return {
    launchInitialRun: (userId, { prompt, designSystemId }) =>
      service.launchInitialRun(userId, {
        type: ArtifactType.DOCUMENT,
        prompt,
        withResearch: false,
        designSystemId,
      }),
    launchRefineRun: (userId, artifactId, feedback, designSystemId) =>
      service.launchRefineRun(userId, artifactId, feedback, designSystemId),
  };
}
