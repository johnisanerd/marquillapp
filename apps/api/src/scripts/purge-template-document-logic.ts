import { Types } from 'mongoose';

export interface RawArtifactVersion {
  version: number;
  status?: string;
  content?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawArtifact {
  _id: Types.ObjectId | string;
  type: string;
  versions?: RawArtifactVersion[];
  [key: string]: unknown;
}

export interface RawPostArtifactRef {
  artifact: Types.ObjectId | string;
  version?: number;
  [key: string]: unknown;
}

export interface RawPost {
  _id: Types.ObjectId | string;
  status: string;
  artifacts?: RawPostArtifactRef[];
  [key: string]: unknown;
}

export interface PurgeCollections {
  artifacts: {
    find(
      filter: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): {
      toArray(): Promise<RawArtifact[]>;
    };
    deleteMany(
      filter: Record<string, unknown>,
    ): Promise<{ deletedCount?: number }>;
  };
  posts: {
    find(
      filter: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): {
      toArray(): Promise<RawPost[]>;
    };
    deleteMany(
      filter: Record<string, unknown>,
    ): Promise<{ deletedCount?: number }>;
  };
}

export interface R2Deleter {
  deleteFiles(keys: string[]): Promise<void>;
}

export interface PurgeOptions {
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface PurgeResult {
  dryRun: boolean;
  artifactsCount: number;
  postsDeletedCount: number;
  postsKeptCount: number;
  r2ObjectsCount: number;
  keptPublishedPostIds: string[];
}

const noopLogger = () => undefined;

/** Checks if a content object has a templateId directly or nested under document. */
export function hasTemplateId(content: unknown): boolean {
  if (!content || typeof content !== 'object') {
    return false;
  }
  const obj = content as Record<string, unknown>;
  if (obj.templateId !== undefined && obj.templateId !== null) {
    return true;
  }
  if (
    obj.document &&
    typeof obj.document === 'object' &&
    (obj.document as Record<string, unknown>).templateId !== undefined &&
    (obj.document as Record<string, unknown>).templateId !== null
  ) {
    return true;
  }
  return false;
}

/** Determines whether an artifact is a DOCUMENT with at least one template-era version. */
export function isTemplateDocumentArtifact(artifact: RawArtifact): boolean {
  if (artifact.type !== 'DOCUMENT') {
    return false;
  }
  if (!Array.isArray(artifact.versions) || artifact.versions.length === 0) {
    return false;
  }
  return artifact.versions.some((v) => hasTemplateId(v?.content));
}

const R2_KEY_FIELDS = [
  'pdfKey',
  'sourceKey',
  'candidateKey',
  'coverKey',
] as const;

/** Collects and deduplicates all R2 object keys from an artifact's versions. */
export function extractArtifactR2Keys(artifact: RawArtifact): string[] {
  const keys = new Set<string>();
  if (!Array.isArray(artifact.versions)) {
    return [];
  }
  for (const v of artifact.versions) {
    if (!v?.content || typeof v.content !== 'object') {
      continue;
    }
    const content = v.content;
    for (const field of R2_KEY_FIELDS) {
      const val = content[field];
      if (typeof val === 'string' && val.trim().length > 0) {
        keys.add(val.trim());
      }
    }
    if (content.document && typeof content.document === 'object') {
      const doc = content.document as Record<string, unknown>;
      for (const field of R2_KEY_FIELDS) {
        const val = doc[field];
        if (typeof val === 'string' && val.trim().length > 0) {
          keys.add(val.trim());
        }
      }
    }
  }
  return Array.from(keys);
}

/**
 * Purges template-era DOCUMENT artifacts, non-PUBLISHED posts referencing them,
 * and their R2 objects, preserving and reporting PUBLISHED posts.
 * When dryRun is true, computes all counts and logs everything without deleting.
 */
export async function purgeTemplateDocuments(
  collections: PurgeCollections,
  r2Deleter: R2Deleter,
  options: PurgeOptions = {},
): Promise<PurgeResult> {
  const dryRun = Boolean(options.dryRun);
  const log = options.log ?? noopLogger;

  // Read raw documents via native collection query
  const rawArtifacts = await collections.artifacts
    .find({
      type: 'DOCUMENT',
      $or: [
        { 'versions.content.templateId': { $exists: true } },
        { 'versions.content.document.templateId': { $exists: true } },
      ],
    })
    .toArray();

  const targetArtifacts = rawArtifacts.filter(isTemplateDocumentArtifact);

  if (targetArtifacts.length === 0) {
    log(`[purge:template-documents] Mode: ${dryRun ? 'DRY RUN' : 'REAL RUN'}`);
    log(
      `[purge:template-documents] Artifacts ${dryRun ? 'found to delete' : 'deleted'}: 0`,
    );
    log(
      `[purge:template-documents] Posts ${dryRun ? 'found to delete' : 'deleted'}: 0`,
    );
    log('[purge:template-documents] Posts kept (PUBLISHED): 0');
    log(
      `[purge:template-documents] R2 objects ${dryRun ? 'found to delete' : 'deleted'}: 0`,
    );
    return {
      dryRun,
      artifactsCount: 0,
      postsDeletedCount: 0,
      postsKeptCount: 0,
      r2ObjectsCount: 0,
      keptPublishedPostIds: [],
    };
  }

  const targetArtifactIds = targetArtifacts.map((a) => a._id);
  const targetArtifactIdStrings = new Set(
    targetArtifacts.map((a) => String(a._id)),
  );

  const r2KeysSet = new Set<string>();
  for (const artifact of targetArtifacts) {
    for (const key of extractArtifactR2Keys(artifact)) {
      r2KeysSet.add(key);
    }
  }
  const r2Keys = Array.from(r2KeysSet);

  // Find posts referencing these artifacts
  const referencingPosts = await collections.posts
    .find({
      'artifacts.artifact': { $in: targetArtifactIds },
    })
    .toArray();

  const matchingPosts = referencingPosts.filter(
    (post) =>
      Array.isArray(post.artifacts) &&
      post.artifacts.some((ref) =>
        targetArtifactIdStrings.has(String(ref?.artifact)),
      ),
  );

  const keptPublishedPostIds: string[] = [];
  const postIdsToDelete: Array<Types.ObjectId | string> = [];

  for (const post of matchingPosts) {
    if (post.status === 'PUBLISHED') {
      keptPublishedPostIds.push(String(post._id));
    } else {
      postIdsToDelete.push(post._id);
    }
  }

  const artifactsCount = targetArtifacts.length;
  const postsDeletedCount = postIdsToDelete.length;
  const postsKeptCount = keptPublishedPostIds.length;
  const r2ObjectsCount = r2Keys.length;

  if (!dryRun) {
    await collections.artifacts.deleteMany({ _id: { $in: targetArtifactIds } });
    if (postIdsToDelete.length > 0) {
      await collections.posts.deleteMany({ _id: { $in: postIdsToDelete } });
    }
    if (r2Keys.length > 0) {
      await r2Deleter.deleteFiles(r2Keys);
    }
  }

  log(`[purge:template-documents] Mode: ${dryRun ? 'DRY RUN' : 'REAL RUN'}`);
  log(
    `[purge:template-documents] Artifacts ${dryRun ? 'found to delete' : 'deleted'}: ${artifactsCount}`,
  );
  log(
    `[purge:template-documents] Posts ${dryRun ? 'found to delete' : 'deleted'}: ${postsDeletedCount}`,
  );
  log(`[purge:template-documents] Posts kept (PUBLISHED): ${postsKeptCount}`);
  if (keptPublishedPostIds.length > 0) {
    log(
      `[purge:template-documents] Kept PUBLISHED post IDs: ${keptPublishedPostIds.join(', ')}`,
    );
  }
  log(
    `[purge:template-documents] R2 objects ${dryRun ? 'found to delete' : 'deleted'}: ${r2ObjectsCount}`,
  );

  return {
    dryRun,
    artifactsCount,
    postsDeletedCount,
    postsKeptCount,
    r2ObjectsCount,
    keptPublishedPostIds,
  };
}
