import 'dotenv/config';
import mongoose from 'mongoose';
import { deleteFiles, listFiles } from '../s3';
import {
  parsePurgeArgs,
  purgeTemplateDocuments,
  type PurgeCollections,
} from './template-document-purge';

// Mongoose's default collections for the `Artifact` and `Post` models. The
// purge reads them raw: the Artifact schema no longer accepts template versions.
const ARTIFACTS = 'artifacts';
const POSTS = 'posts';

async function run(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Please set it in your environment.');
  }

  const { dryRun } = parsePurgeArgs(process.argv.slice(2));
  await mongoose.connect(mongoUri, { autoIndex: false });
  console.log('[purge-template-documents] Connected using MONGO_URI.');

  try {
    const collections: PurgeCollections = {
      artifacts: mongoose.connection.collection(ARTIFACTS),
      posts: mongoose.connection.collection(POSTS),
    };
    await purgeTemplateDocuments(
      collections,
      { listFiles, deleteFiles },
      {
        dryRun,
        log: (message) => console.log(`[purge-template-documents] ${message}`),
      },
    );
    if (dryRun) {
      console.log(
        '[purge-template-documents] Dry run: nothing was deleted. Re-run without --dry-run to apply.',
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log('[purge-template-documents] Disconnected.');
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[purge-template-documents] Failed: ${message}`);
  process.exit(1);
});
