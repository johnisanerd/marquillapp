import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import {
  migrateRunCandidateSources,
  type LegacyCheckpoint,
  type RunCandidateSourceStore,
} from './run-candidate-source-migration';

// Mongoose's default collection for the `WorkflowRun` model.
const WORKFLOW_RUNS = 'workflowruns';
const RUN_CANDIDATE_SOURCES = 'run_candidate_sources';

async function run(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Please set it in your environment.');
  }

  const apply = process.argv.slice(2).includes('--apply');
  await mongoose.connect(mongoUri, { autoIndex: false });
  console.log('[run-candidate-sources] Connected using MONGO_URI.');

  try {
    const runs = mongoose.connection.collection(WORKFLOW_RUNS);
    const sources = mongoose.connection.collection(RUN_CANDIDATE_SOURCES);
    const store: RunCandidateSourceStore = {
      findLegacyCheckpoints: async () => {
        const found = await runs
          .find(
            { 'acceptedCandidate.candidate': { $type: 'string' } },
            { projection: { createdAt: 1, 'acceptedCandidate.candidate': 1 } },
          )
          .toArray();
        return found.map(
          (doc): LegacyCheckpoint => ({
            runId: String(doc._id),
            createdAt: doc.createdAt as Date,
            candidate: (doc.acceptedCandidate as { candidate: string })
              .candidate,
          }),
        );
      },
      saveAcceptedText: async ({ runId, ...text }) => {
        await sources.updateOne(
          { run: new Types.ObjectId(runId), role: 'ACCEPTED' },
          { $set: text },
          { upsert: true },
        );
      },
      replaceInlineText: async (runId, candidateSha256) => {
        await runs.updateOne(
          { _id: new Types.ObjectId(runId) },
          {
            $set: { 'acceptedCandidate.candidateSha256': candidateSha256 },
            $unset: { 'acceptedCandidate.candidate': '' },
          },
        );
      },
    };
    await migrateRunCandidateSources(store, {
      apply,
      log: (message) => console.log(`[run-candidate-sources] ${message}`),
    });
    if (!apply) {
      console.log(
        '[run-candidate-sources] No changes applied. Re-run with --apply after reviewing the plan.',
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log('[run-candidate-sources] Disconnected.');
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[run-candidate-sources] Failed: ${message}`);
  process.exit(1);
});
