import { Types } from 'mongoose';
import {
  artifactObjectPrefix,
  isTemplateDocumentArtifact,
  parsePurgeArgs,
  purgeTemplateDocuments,
  type PurgeCollections,
  type RawArtifact,
  type RawPost,
} from './template-document-purge';

const templateVersion = (version: number) => ({
  version,
  content: { document: { templateId: 'bold', slides: [] } },
});

const designSystemVersion = (version: number) => ({
  version,
  content: { document: { designSystemId: 'margin', designSystemVersion: 1 } },
});

const artifactOf = (
  versions: RawArtifact['versions'],
  type = 'DOCUMENT',
): RawArtifact => ({ _id: new Types.ObjectId(), type, versions });

type StoredPost = RawPost & { artifacts: { artifact: Types.ObjectId }[] };

const postOf = (artifacts: RawArtifact[], status: string): StoredPost => ({
  _id: new Types.ObjectId(),
  status,
  artifacts: artifacts.map((artifact) => ({ artifact: artifact._id })),
});

describe('template document purge', () => {
  describe('parsePurgeArgs', () => {
    it('should return dryRun false when no argument is given', () => {
      expect(parsePurgeArgs([])).toEqual({ dryRun: false });
    });

    it('should return dryRun true when --dry-run is given', () => {
      expect(parsePurgeArgs(['--dry-run'])).toEqual({ dryRun: true });
    });

    it('should throw when the flag is mistyped, so a typo cannot run the purge for real', () => {
      expect(() => parsePurgeArgs(['--dryrun'])).toThrow(
        'Unknown argument(s): --dryrun',
      );
    });

    it('should throw when --dry-run is mixed with another argument', () => {
      expect(() => parsePurgeArgs(['--dry-run', '--apply'])).toThrow(
        'Unknown argument(s): --apply',
      );
    });
  });

  describe('artifactObjectPrefix', () => {
    it('should end with a slash so one artifact prefix cannot match another', () => {
      const id = new Types.ObjectId();
      expect(artifactObjectPrefix(id)).toBe(`artifacts/${id.toString()}/`);
    });

    it('should be the prefix of a version object key, artifacts/{id}/{v}/document.pdf', () => {
      const id = new Types.ObjectId();
      expect(`artifacts/${id.toString()}/3/document.pdf`).toMatch(
        new RegExp(`^${artifactObjectPrefix(id)}`),
      );
    });

    it('should throw when the id is not an ObjectId, rather than build a broad prefix', () => {
      expect(() =>
        artifactObjectPrefix('' as unknown as Types.ObjectId),
      ).toThrow('Refusing to build an R2 prefix');
    });
  });

  describe('isTemplateDocumentArtifact', () => {
    it('should return true when a version has content.document.templateId', () => {
      expect(isTemplateDocumentArtifact(artifactOf([templateVersion(1)]))).toBe(
        true,
      );
    });

    it('should return true when only one of several versions is template-era', () => {
      const artifact = artifactOf([
        { version: 1 },
        designSystemVersion(2),
        templateVersion(3),
      ]);
      expect(isTemplateDocumentArtifact(artifact)).toBe(true);
    });

    it('should return false when every version is a Design System version', () => {
      const artifact = artifactOf([designSystemVersion(1)]);
      expect(isTemplateDocumentArtifact(artifact)).toBe(false);
    });

    it('should return false when versions have no content', () => {
      expect(isTemplateDocumentArtifact(artifactOf([{ version: 1 }]))).toBe(
        false,
      );
    });

    it('should return false when templateId is null', () => {
      const artifact = artifactOf([
        { version: 1, content: { document: { templateId: null } } },
      ]);
      expect(isTemplateDocumentArtifact(artifact)).toBe(false);
    });

    it('should return false for a POST even if it carries a templateId', () => {
      expect(
        isTemplateDocumentArtifact(artifactOf([templateVersion(1)], 'POST')),
      ).toBe(false);
    });

    it('should return false when versions are missing', () => {
      expect(isTemplateDocumentArtifact(artifactOf(undefined))).toBe(false);
    });
  });

  describe('purgeTemplateDocuments', () => {
    /** In-memory collections and R2, with every call a spy so tests can fail any step. */
    const makeHarness = () => {
      const fixtures = {
        templateA: artifactOf([templateVersion(1), templateVersion(2)]),
        templateB: artifactOf([templateVersion(1)]),
        current: artifactOf([designSystemVersion(1)]),
        poll: artifactOf([{ version: 1, content: {} }], 'POLL'),
      };
      const posts = {
        draftOnA: postOf([fixtures.templateA], 'DRAFT'),
        scheduledOnA: postOf([fixtures.templateA], 'SCHEDULED'),
        failedOnB: postOf([fixtures.templateB], 'FAILED'),
        publishedOnB: postOf([fixtures.templateB], 'PUBLISHED'),
        onCurrent: postOf([fixtures.current], 'DRAFT'),
      };
      const artifactRows = new Map<string, RawArtifact>(
        Object.values(fixtures).map((a) => [String(a._id), a]),
      );
      const postRows = new Map<string, StoredPost>(
        Object.values(posts).map((p) => [String(p._id), p]),
      );
      const objects = new Set<string>(
        [fixtures.templateA, fixtures.templateB, fixtures.current].flatMap(
          (a) => [
            `artifacts/${a._id.toString()}/1/document.pdf`,
            `artifacts/${a._id.toString()}/2/document.pdf`,
          ],
        ),
      );

      const idsOf = (filter: { _id?: { $in?: Types.ObjectId[] } }) =>
        (filter._id?.$in ?? []).map(String);

      const mocks = {
        artifactsFind: jest.fn((filter: Record<string, unknown>) => ({
          toArray: () =>
            Promise.resolve(
              [...artifactRows.values()].filter((a) => a.type === filter.type),
            ),
        })),
        artifactsDeleteMany: jest.fn(
          (filter: { _id?: { $in?: Types.ObjectId[] } }) => {
            idsOf(filter).forEach((id) => artifactRows.delete(id));
            return Promise.resolve({});
          },
        ),
        postsFind: jest.fn(
          (filter: { 'artifacts.artifact': { $in: Types.ObjectId[] } }) => ({
            toArray: () => {
              const wanted = filter['artifacts.artifact'].$in.map(String);
              return Promise.resolve(
                [...postRows.values()].filter((post) =>
                  post.artifacts.some((ref) =>
                    wanted.includes(String(ref.artifact)),
                  ),
                ),
              );
            },
          }),
        ),
        postsDeleteMany: jest.fn(
          (filter: { _id?: { $in?: Types.ObjectId[] } }) => {
            idsOf(filter).forEach((id) => postRows.delete(id));
            return Promise.resolve({});
          },
        ),
        listFiles: jest.fn((prefix: string) =>
          Promise.resolve([...objects].filter((key) => key.startsWith(prefix))),
        ),
        deleteFiles: jest.fn((keys: string[]) => {
          keys.forEach((key) => objects.delete(key));
          return Promise.resolve();
        }),
      };
      const collections: PurgeCollections = {
        artifacts: {
          find: mocks.artifactsFind as PurgeCollections['artifacts']['find'],
          deleteMany: mocks.artifactsDeleteMany,
        },
        posts: {
          find: mocks.postsFind as PurgeCollections['posts']['find'],
          deleteMany: mocks.postsDeleteMany,
        },
      };
      const storage = {
        listFiles: mocks.listFiles,
        deleteFiles: mocks.deleteFiles,
      };
      const state = { artifactRows, postRows, objects };
      return { collections, storage, mocks, fixtures, posts, state };
    };

    let h: ReturnType<typeof makeHarness>;
    const log = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      h = makeHarness();
    });

    const run = (dryRun: boolean) =>
      purgeTemplateDocuments(h.collections, h.storage, { dryRun, log });

    it('should read the raw artifacts collection for DOCUMENTs with a nested templateId', async () => {
      await run(true);

      expect(h.mocks.artifactsFind).toHaveBeenCalledWith({
        type: 'DOCUMENT',
        'versions.content.document.templateId': { $exists: true },
      });
    });

    it('should list R2 objects under each purged artifact prefix, with a trailing slash', async () => {
      await run(true);

      expect(h.mocks.listFiles).toHaveBeenCalledTimes(2);
      expect(h.mocks.listFiles).toHaveBeenCalledWith(
        `artifacts/${h.fixtures.templateA._id.toString()}/`,
      );
      expect(h.mocks.listFiles).toHaveBeenCalledWith(
        `artifacts/${h.fixtures.templateB._id.toString()}/`,
      );
    });

    describe('when dryRun is true', () => {
      it('should report the counts it would purge', async () => {
        const result = await run(true);

        expect(result).toEqual({
          dryRun: true,
          artifacts: 2,
          posts: 3,
          keptPublishedPostIds: [String(h.posts.publishedOnB._id)],
          r2Objects: 4,
        });
        expect(log).toHaveBeenCalledWith('DOCUMENT artifacts to delete: 2');
        expect(log).toHaveBeenCalledWith('Posts to delete: 3');
        expect(log).toHaveBeenCalledWith('PUBLISHED posts kept: 1');
        expect(log).toHaveBeenCalledWith('R2 objects to delete: 4');
      });

      it('should not delete from Mongo or R2', async () => {
        await run(true);

        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.postsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.deleteFiles).not.toHaveBeenCalled();
        expect(h.state.artifactRows.size).toBe(4);
        expect(h.state.postRows.size).toBe(5);
        expect(h.state.objects.size).toBe(6);
      });
    });

    describe('when dryRun is false', () => {
      it('should delete the template artifacts, their non-PUBLISHED posts and their R2 objects', async () => {
        const result = await run(false);

        expect(result).toMatchObject({
          dryRun: false,
          artifacts: 2,
          posts: 3,
          r2Objects: 4,
        });
        expect([...h.state.artifactRows.keys()].sort()).toEqual(
          [h.fixtures.current._id, h.fixtures.poll._id].map(String).sort(),
        );
        expect([...h.state.postRows.keys()].sort()).toEqual(
          [h.posts.publishedOnB._id, h.posts.onCurrent._id].map(String).sort(),
        );
        expect([...h.state.objects].sort()).toEqual(
          [
            `artifacts/${h.fixtures.current._id.toString()}/1/document.pdf`,
            `artifacts/${h.fixtures.current._id.toString()}/2/document.pdf`,
          ].sort(),
        );
        expect(log).toHaveBeenCalledWith('DOCUMENT artifacts deleted: 2');
      });

      it('should keep PUBLISHED posts and report their ids', async () => {
        const result = await run(false);

        expect(result.keptPublishedPostIds).toEqual([
          String(h.posts.publishedOnB._id),
        ]);
        expect(log).toHaveBeenCalledWith(
          `Kept PUBLISHED post ids: ${h.posts.publishedOnB._id.toString()}`,
        );
        const deleted = h.mocks.postsDeleteMany.mock.calls[0][0] as {
          _id: { $in: Types.ObjectId[] };
        };
        expect(deleted._id.$in.map(String)).not.toContain(
          String(h.posts.publishedOnB._id),
        );
      });

      it('should delete R2 objects, then posts, then artifacts', async () => {
        await run(false);

        const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
        expect(order(h.mocks.deleteFiles)).toBeLessThan(
          order(h.mocks.postsDeleteMany),
        );
        expect(order(h.mocks.postsDeleteMany)).toBeLessThan(
          order(h.mocks.artifactsDeleteMany),
        );
      });

      it('should read every artifact, key and post before the first delete', async () => {
        await run(false);

        const firstDelete = Math.min(
          ...[
            h.mocks.deleteFiles,
            h.mocks.postsDeleteMany,
            h.mocks.artifactsDeleteMany,
          ].map((fn) => fn.mock.invocationCallOrder[0]),
        );
        for (const read of [
          h.mocks.artifactsFind,
          h.mocks.listFiles,
          h.mocks.postsFind,
        ]) {
          for (const call of read.mock.invocationCallOrder) {
            expect(call).toBeLessThan(firstDelete);
          }
        }
      });

      it('should delete exactly the keys it listed, from template artifacts only', async () => {
        await run(false);

        const keys = h.mocks.deleteFiles.mock.calls[0][0];
        expect([...keys].sort()).toEqual(
          [h.fixtures.templateA, h.fixtures.templateB]
            .flatMap((a) => [
              `artifacts/${a._id.toString()}/1/document.pdf`,
              `artifacts/${a._id.toString()}/2/document.pdf`,
            ])
            .sort(),
        );
      });

      it('should do nothing, not even read posts, when no template artifacts exist', async () => {
        h.state.artifactRows.delete(String(h.fixtures.templateA._id));
        h.state.artifactRows.delete(String(h.fixtures.templateB._id));

        const result = await run(false);

        expect(result).toEqual({
          dryRun: false,
          artifacts: 0,
          posts: 0,
          keptPublishedPostIds: [],
          r2Objects: 0,
        });
        expect(h.mocks.postsFind).not.toHaveBeenCalled();
        expect(h.mocks.deleteFiles).not.toHaveBeenCalled();
        expect(h.mocks.postsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();
      });

      it('should be idempotent when run twice', async () => {
        await run(false);
        jest.clearAllMocks();

        const second = await run(false);

        expect(second.artifacts).toBe(0);
        expect(h.mocks.deleteFiles).not.toHaveBeenCalled();
        expect(h.mocks.postsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();
      });
    });

    describe('when a step fails part way', () => {
      it('should leave Mongo untouched when the R2 delete fails, and finish on re-run', async () => {
        h.mocks.deleteFiles.mockRejectedValueOnce(new Error('r2 down'));

        await expect(run(false)).rejects.toThrow('r2 down');

        expect(h.mocks.postsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();

        const rerun = await run(false);

        expect(rerun).toMatchObject({ artifacts: 2, posts: 3, r2Objects: 4 });
        expect(h.state.artifactRows.size).toBe(2);
        expect(h.state.objects.size).toBe(2);
      });

      it('should keep the artifacts when the post delete fails, and finish on re-run', async () => {
        h.mocks.postsDeleteMany.mockRejectedValueOnce(new Error('mongo down'));

        await expect(run(false)).rejects.toThrow('mongo down');

        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();
        expect(h.state.objects.size).toBe(2);

        const rerun = await run(false);

        expect(rerun).toMatchObject({ artifacts: 2, posts: 3, r2Objects: 0 });
        expect(h.state.artifactRows.size).toBe(2);
        expect([...h.state.postRows.keys()].sort()).toEqual(
          [h.posts.publishedOnB._id, h.posts.onCurrent._id].map(String).sort(),
        );
      });

      it('should still find the posts when the artifact delete fails, and finish on re-run', async () => {
        h.mocks.artifactsDeleteMany.mockRejectedValueOnce(
          new Error('mongo down'),
        );

        await expect(run(false)).rejects.toThrow('mongo down');

        const rerun = await run(false);

        expect(rerun).toMatchObject({ artifacts: 2, posts: 0, r2Objects: 0 });
        expect(h.state.artifactRows.size).toBe(2);
      });

      it('should delete nothing when listing R2 fails', async () => {
        h.mocks.listFiles.mockRejectedValueOnce(new Error('list failed'));

        await expect(run(false)).rejects.toThrow('list failed');

        expect(h.mocks.deleteFiles).not.toHaveBeenCalled();
        expect(h.mocks.postsDeleteMany).not.toHaveBeenCalled();
        expect(h.mocks.artifactsDeleteMany).not.toHaveBeenCalled();
      });
    });
  });
});
