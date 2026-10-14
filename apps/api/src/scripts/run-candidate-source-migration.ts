import { sha256Hex } from '../document-source/sha256';
import { CANDIDATE_SOURCE_RETENTION_MS } from '../workflow/workflow.constants';

/** A run whose `acceptedCandidate` still keeps its Candidate Source inline. */
export interface LegacyCheckpoint {
  runId: string;
  createdAt: Date;
  candidate: string;
}

/** The two collections the migration touches, narrowed to what it does. */
export interface RunCandidateSourceStore {
  findLegacyCheckpoints(): Promise<LegacyCheckpoint[]>;
  /** Upserts the run's `ACCEPTED` text in `run_candidate_sources`. */
  saveAcceptedText(text: {
    runId: string;
    candidateSha256: string;
    candidate: string;
    expiresAt: Date;
  }): Promise<void>;
  /** Sets the checkpoint's hash on the run and unsets its inline text. */
  replaceInlineText(runId: string, candidateSha256: string): Promise<void>;
}

export interface RunCandidateSourceMigrationResult {
  applied: boolean;
  found: number;
  migrated: number;
}

const noopLogger = () => undefined;

/**
 * Moves checkpoint text written before `run_candidate_sources` existed out of
 * the run, so it expires like any other (document generation spec §11.5). A
 * run's text expires 90 days after the run began, so text already past that
 * is removed on the TTL monitor's next pass.
 */
export async function migrateRunCandidateSources(
  store: RunCandidateSourceStore,
  options: { apply: boolean; log?: (message: string) => void },
): Promise<RunCandidateSourceMigrationResult> {
  const log = options.log ?? noopLogger;
  const legacy = await store.findLegacyCheckpoints();
  log(`${legacy.length} run(s) keep their checkpoint text inline`);

  if (!options.apply) {
    return { applied: false, found: legacy.length, migrated: 0 };
  }

  let migrated = 0;
  for (const { runId, createdAt, candidate } of legacy) {
    const candidateSha256 = sha256Hex(candidate);
    // The text first, so a run never points at text that is not there.
    await store.saveAcceptedText({
      runId,
      candidateSha256,
      candidate,
      expiresAt: new Date(createdAt.getTime() + CANDIDATE_SOURCE_RETENTION_MS),
    });
    await store.replaceInlineText(runId, candidateSha256);
    migrated += 1;
  }
  log(`Moved ${migrated} checkpoint text(s) to run_candidate_sources`);
  return { applied: true, found: legacy.length, migrated };
}
