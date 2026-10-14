import type { Types } from 'mongoose';

/** A version as the collection stores it, read without the Mongoose schema. */
export interface RawArtifactVersion {
  version: number;
  content?: Record<string, unknown>;
}

export interface RawArtifact {
  _id: Types.ObjectId;
  type: string;
  versions?: RawArtifactVersion[];
}

export interface RawPost {
  _id: Types.ObjectId;
  status: string;
}

/** The two collections the purge touches, narrowed to what it does. */
export interface PurgeCollections {
  artifacts: {
    find(filter: Record<string, unknown>): {
      toArray(): Promise<RawArtifact[]>;
    };
    deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  };
  posts: {
    find(filter: Record<string, unknown>): {
      toArray(): Promise<RawPost[]>;
    };
    deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  };
}

export interface ArtifactStorage {
  listFiles(prefix: string): Promise<string[]>;
  deleteFiles(keys: string[]): Promise<void>;
}

export interface PurgeOptions {
  dryRun: boolean;
  log?: (message: string) => void;
}

export interface PurgeResult {
  dryRun: boolean;
  artifacts: number;
  posts: number;
  keptPublishedPostIds: string[];
  r2Objects: number;
}

const noopLogger = () => undefined;

// Plain strings, not the schema enums: the purge reads raw documents, and the
// schema modules do not load outside the Nest app.
const PUBLISHED = 'PUBLISHED';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Parses the script's arguments. The only flag is `--dry-run`; anything else
 * throws, because a mistyped `--dryrun` must not turn into a real purge.
 */
export function parsePurgeArgs(args: string[]): { dryRun: boolean } {
  const unknown = args.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument(s): ${unknown.join(' ')}. The only option is --dry-run.`,
    );
  }
  return { dryRun: args.length > 0 };
}

/**
 * Every R2 object of an artifact lives under this prefix: a version's
 * `artifacts/{id}/{v}/document.pdf` (the only object a template-era version
 * wrote) and the Design System objects that sit beside it. The trailing slash
 * keeps one artifact's prefix from matching another's.
 */
export function artifactObjectPrefix(artifactId: Types.ObjectId): string {
  const id = String(artifactId);
  if (!OBJECT_ID.test(id)) {
    throw new Error(`Refusing to build an R2 prefix from artifact id "${id}"`);
  }
  return `artifacts/${id}/`;
}

/**
 * A template-era version keeps `templateId` inside `content.document`. The
 * collection query is a wide net; this is the exact test.
 */
function isTemplateVersion(version: RawArtifactVersion): boolean {
  const document = version?.content?.document;
  return (
    typeof document === 'object' &&
    document !== null &&
    (document as Record<string, unknown>).templateId != null
  );
}

/** A DOCUMENT with any template-era version (spec §12.2). */
export function isTemplateDocumentArtifact(artifact: RawArtifact): boolean {
  return (
    artifact.type === 'DOCUMENT' &&
    Array.isArray(artifact.versions) &&
    artifact.versions.some(isTemplateVersion)
  );
}

/**
 * Removes template-era DOCUMENT data (spec §12.2) from raw collections, which
 * is the only way to read versions the new schema rejects.
 *
 * Everything is read first; a dry run stops there. A real run deletes the R2
 * objects, then the Posts, then the artifacts. Posts and objects are found
 * through the artifacts, so the artifacts go last: a run that fails part way
 * is finished by running it again.
 */
export async function purgeTemplateDocuments(
  collections: PurgeCollections,
  storage: ArtifactStorage,
  { dryRun, log = noopLogger }: PurgeOptions,
): Promise<PurgeResult> {
  const candidates = await collections.artifacts
    .find({
      type: 'DOCUMENT',
      'versions.content.document.templateId': { $exists: true },
    })
    .toArray();
  const artifacts = candidates.filter(isTemplateDocumentArtifact);
  const artifactIds = artifacts.map((artifact) => artifact._id);

  const r2Keys: string[] = [];
  for (const artifactId of artifactIds) {
    r2Keys.push(...(await storage.listFiles(artifactObjectPrefix(artifactId))));
  }

  const posts =
    artifactIds.length === 0
      ? []
      : await collections.posts
          .find({ 'artifacts.artifact': { $in: artifactIds } })
          .toArray();
  const keptPosts = posts.filter((post) => post.status === PUBLISHED);
  const postIdsToDelete = posts
    .filter((post) => post.status !== PUBLISHED)
    .map((post) => post._id);

  if (!dryRun) {
    if (r2Keys.length > 0) {
      await storage.deleteFiles(r2Keys);
    }
    if (postIdsToDelete.length > 0) {
      await collections.posts.deleteMany({ _id: { $in: postIdsToDelete } });
    }
    if (artifactIds.length > 0) {
      await collections.artifacts.deleteMany({ _id: { $in: artifactIds } });
    }
  }

  const result: PurgeResult = {
    dryRun,
    artifacts: artifactIds.length,
    posts: postIdsToDelete.length,
    keptPublishedPostIds: keptPosts.map((post) => String(post._id)),
    r2Objects: r2Keys.length,
  };
  const verb = dryRun ? 'to delete' : 'deleted';
  log(`Mode: ${dryRun ? 'DRY RUN' : 'REAL RUN'}`);
  log(`DOCUMENT artifacts ${verb}: ${result.artifacts}`);
  log(`Posts ${verb}: ${result.posts}`);
  log(`PUBLISHED posts kept: ${result.keptPublishedPostIds.length}`);
  if (result.keptPublishedPostIds.length > 0) {
    log(`Kept PUBLISHED post ids: ${result.keptPublishedPostIds.join(', ')}`);
  }
  log(`R2 objects ${verb}: ${result.r2Objects}`);
  return result;
}
