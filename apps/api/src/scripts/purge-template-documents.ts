import 'dotenv/config';
import mongoose from 'mongoose';
import { deleteFiles } from '../s3';
import {
  purgeTemplateDocuments,
  type PurgeCollections,
  type R2Deleter,
} from './purge-template-document-logic';

const ARTIFACTS = 'artifacts';
const POSTS = 'posts';

async function run(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing. Please set it in your environment.');
  }

  const dryRun = process.argv.slice(2).includes('--dry-run');
  await mongoose.connect(mongoUri, { autoIndex: false });
  console.log(
    `[purge:template-documents] Connected using MONGO_URI. (mode: ${dryRun ? 'DRY RUN' : 'REAL RUN'})`,
  );

  try {
    const collections: PurgeCollections = {
      artifacts: mongoose.connection.collection(ARTIFACTS),
      posts: mongoose.connection.collection(POSTS),
    };
    const r2Deleter: R2Deleter = {
      deleteFiles,
    };

    const result = await purgeTemplateDocuments(collections, r2Deleter, {
      dryRun,
      log: (message) => console.log(message),
    });

    if (result.dryRun) {
      console.log(
        '[purge:template-documents] Dry run completed. No data was deleted. Re-run without --dry-run to apply.',
      );
    } else {
      console.log('[purge:template-documents] Purge completed successfully.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('[purge:template-documents] Disconnected.');
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[purge:template-documents] Failed: ${message}`);
  process.exit(1);
});
