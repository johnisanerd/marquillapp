import { Types } from 'mongoose';
import {
  purgeTemplateDocuments,
  isTemplateDocumentArtifact,
  extractArtifactR2Keys,
  type PurgeCollections,
  type R2Deleter,
  type RawArtifact,
  type RawPost,
} from './purge-template-document-logic';

describe('purgeTemplateDocuments', () => {
  const makeCollaborators = (
    artifactsList: RawArtifact[],
    postsList: RawPost[],
  ) => {
    const artifactsFindToArray = jest.fn().mockImplementation(() => {
      return Promise.resolve(artifactsList);
    });
    const artifactsDeleteMany = jest
      .fn()
      .mockImplementation((filter: { _id?: { $in?: unknown[] } }) =>
        Promise.resolve({ deletedCount: filter._id?.$in?.length ?? 0 }),
      );

    const postsFindToArray = jest.fn().mockImplementation(() => {
      return Promise.resolve(postsList);
    });
    const postsDeleteMany = jest
      .fn()
      .mockImplementation((filter: { _id?: { $in?: unknown[] } }) =>
        Promise.resolve({ deletedCount: filter._id?.$in?.length ?? 0 }),
      );

    const collections: PurgeCollections = {
      artifacts: {
        find: jest.fn().mockReturnValue({ toArray: artifactsFindToArray }),
        deleteMany: artifactsDeleteMany,
      },
      posts: {
        find: jest.fn().mockReturnValue({ toArray: postsFindToArray }),
        deleteMany: postsDeleteMany,
      },
    };

    const r2Deleter: R2Deleter = {
      deleteFiles: jest.fn().mockResolvedValue(undefined),
    };

    return {
      collections,
      r2Deleter,
      spies: {
        artifactsFind: collections.artifacts.find,
        artifactsDeleteMany,
        postsFind: collections.posts.find,
        postsDeleteMany,
        deleteFiles: r2Deleter.deleteFiles,
      },
    };
  };

  describe('isTemplateDocumentArtifact', () => {
    it('should return true when a DOCUMENT has content.document.templateId', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            status: 'READY',
            content: {
              document: { templateId: 'minimal', slides: [] },
            },
          },
        ],
      };
      expect(isTemplateDocumentArtifact(artifact)).toBe(true);
    });

    it('should return true when a DOCUMENT has content.templateId', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            status: 'READY',
            content: {
              templateId: 'bold',
              slides: [],
            },
          },
        ],
      };
      expect(isTemplateDocumentArtifact(artifact)).toBe(true);
    });

    it('should return false when a DOCUMENT has only design system versions', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            status: 'READY',
            content: {
              document: {
                designSystemId: 'margin',
                designSystemVersion: 1,
                sourceKey: 'artifacts/1/1/source.html',
                pdfKey: 'artifacts/1/1/document.pdf',
              },
            },
          },
        ],
      };
      expect(isTemplateDocumentArtifact(artifact)).toBe(false);
    });

    it('should return false for non-DOCUMENT artifacts even if templateId is present', () => {
      const postArtifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'POST',
        versions: [
          {
            version: 1,
            content: { templateId: 'minimal' },
          },
        ],
      };
      const pollArtifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'POLL',
        versions: [
          {
            version: 1,
            content: { document: { templateId: 'minimal' } },
          },
        ],
      };
      expect(isTemplateDocumentArtifact(postArtifact)).toBe(false);
      expect(isTemplateDocumentArtifact(pollArtifact)).toBe(false);
    });

    it('should return true if any version has a templateId', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            status: 'READY',
            content: {
              document: {
                designSystemId: 'margin',
                designSystemVersion: 1,
              },
            },
          },
          {
            version: 2,
            status: 'READY',
            content: {
              document: { templateId: 'editorial' },
            },
          },
        ],
      };
      expect(isTemplateDocumentArtifact(artifact)).toBe(true);
    });
  });

  describe('extractArtifactR2Keys', () => {
    it('should extract pdfKey from template-era versions', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            content: {
              document: {
                templateId: 'minimal',
                pdfKey: 'artifacts/art1/1/document.pdf',
              },
            },
          },
        ],
      };
      expect(extractArtifactR2Keys(artifact)).toEqual([
        'artifacts/art1/1/document.pdf',
      ]);
    });

    it('should extract and deduplicate multiple R2 keys across versions', () => {
      const artifact: RawArtifact = {
        _id: new Types.ObjectId(),
        type: 'DOCUMENT',
        versions: [
          {
            version: 1,
            content: {
              document: {
                pdfKey: 'artifacts/art1/1/document.pdf',
                sourceKey: 'artifacts/art1/1/source.html',
                candidateKey: 'artifacts/art1/1/candidate.html',
                coverKey: 'artifacts/art1/1/cover.png',
              },
            },
          },
          {
            version: 2,
            content: {
              pdfKey: 'artifacts/art1/1/document.pdf', // duplicate
              sourceKey: 'artifacts/art1/2/source.html',
            },
          },
        ],
      };
      const keys = extractArtifactR2Keys(artifact);
      expect(keys).toHaveLength(5);
      expect(keys).toContain('artifacts/art1/1/document.pdf');
      expect(keys).toContain('artifacts/art1/1/source.html');
      expect(keys).toContain('artifacts/art1/1/candidate.html');
      expect(keys).toContain('artifacts/art1/1/cover.png');
      expect(keys).toContain('artifacts/art1/2/source.html');
    });
  });

  describe('purgeTemplateDocuments execution', () => {
    const templateDocId1 = new Types.ObjectId();
    const templateDocId2 = new Types.ObjectId();
    const nonTemplateDocId = new Types.ObjectId();
    const postDocId = new Types.ObjectId();

    const templateArtifact1: RawArtifact = {
      _id: templateDocId1,
      type: 'DOCUMENT',
      versions: [
        {
          version: 1,
          status: 'READY',
          content: {
            document: {
              templateId: 'minimal',
              pdfKey: 'artifacts/template1/1/document.pdf',
            },
          },
        },
      ],
    };

    const templateArtifact2: RawArtifact = {
      _id: templateDocId2,
      type: 'DOCUMENT',
      versions: [
        {
          version: 1,
          status: 'READY',
          content: {
            templateId: 'bold',
            pdfKey: 'artifacts/template2/1/document.pdf',
          },
        },
      ],
    };

    const nonTemplateArtifact: RawArtifact = {
      _id: nonTemplateDocId,
      type: 'DOCUMENT',
      versions: [
        {
          version: 1,
          status: 'READY',
          content: {
            document: {
              designSystemId: 'margin',
              designSystemVersion: 1,
              pdfKey: 'artifacts/ds/1/document.pdf',
            },
          },
        },
      ],
    };

    const nonDocumentArtifact: RawArtifact = {
      _id: postDocId,
      type: 'POST',
      versions: [
        {
          version: 1,
          status: 'READY',
          content: { commentary: 'Hello world' },
        },
      ],
    };

    const draftPost: RawPost = {
      _id: new Types.ObjectId(),
      status: 'DRAFT',
      artifacts: [{ artifact: templateDocId1, version: 1 }],
    };

    const scheduledPost: RawPost = {
      _id: new Types.ObjectId(),
      status: 'SCHEDULED',
      artifacts: [{ artifact: templateDocId2, version: 1 }],
    };

    const failedPost: RawPost = {
      _id: new Types.ObjectId(),
      status: 'FAILED',
      artifacts: [{ artifact: templateDocId1, version: 1 }],
    };

    const publishedPost: RawPost = {
      _id: new Types.ObjectId(),
      status: 'PUBLISHED',
      artifacts: [{ artifact: templateDocId2, version: 1 }],
    };

    const unrelatedPost: RawPost = {
      _id: new Types.ObjectId(),
      status: 'DRAFT',
      artifacts: [{ artifact: nonTemplateDocId, version: 1 }],
    };

    it('should delete nothing when dryRun is true', async () => {
      const { collections, r2Deleter, spies } = makeCollaborators(
        [
          templateArtifact1,
          templateArtifact2,
          nonTemplateArtifact,
          nonDocumentArtifact,
        ],
        [draftPost, scheduledPost, failedPost, publishedPost, unrelatedPost],
      );
      const log = jest.fn();

      const result = await purgeTemplateDocuments(collections, r2Deleter, {
        dryRun: true,
        log,
      });

      expect(result).toEqual({
        dryRun: true,
        artifactsCount: 2,
        postsDeletedCount: 3,
        postsKeptCount: 1,
        r2ObjectsCount: 2,
        keptPublishedPostIds: [String(publishedPost._id)],
      });

      expect(spies.artifactsDeleteMany).not.toHaveBeenCalled();
      expect(spies.postsDeleteMany).not.toHaveBeenCalled();
      expect(spies.deleteFiles).not.toHaveBeenCalled();

      expect(log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Artifacts found to delete: 2'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Posts found to delete: 3'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Posts kept (PUBLISHED): 1'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(String(publishedPost._id)),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('R2 objects found to delete: 2'),
      );
    });

    it('should delete template DOCUMENT artifacts, non-PUBLISHED posts, and R2 files when dryRun is false', async () => {
      const { collections, r2Deleter, spies } = makeCollaborators(
        [
          templateArtifact1,
          templateArtifact2,
          nonTemplateArtifact,
          nonDocumentArtifact,
        ],
        [draftPost, scheduledPost, failedPost, publishedPost, unrelatedPost],
      );
      const log = jest.fn();

      const result = await purgeTemplateDocuments(collections, r2Deleter, {
        dryRun: false,
        log,
      });

      expect(result).toEqual({
        dryRun: false,
        artifactsCount: 2,
        postsDeletedCount: 3,
        postsKeptCount: 1,
        r2ObjectsCount: 2,
        keptPublishedPostIds: [String(publishedPost._id)],
      });

      expect(spies.artifactsDeleteMany).toHaveBeenCalledWith({
        _id: { $in: [templateDocId1, templateDocId2] },
      });

      expect(spies.postsDeleteMany).toHaveBeenCalledWith({
        _id: { $in: [draftPost._id, scheduledPost._id, failedPost._id] },
      });

      expect(spies.deleteFiles).toHaveBeenCalledWith([
        'artifacts/template1/1/document.pdf',
        'artifacts/template2/1/document.pdf',
      ]);

      expect(log).toHaveBeenCalledWith(expect.stringContaining('REAL RUN'));
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Artifacts deleted: 2'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Posts deleted: 3'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Posts kept (PUBLISHED): 1'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(String(publishedPost._id)),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('R2 objects deleted: 2'),
      );
    });

    it('should do nothing and log zero counts when no template artifacts are found', async () => {
      const { collections, r2Deleter, spies } = makeCollaborators(
        [nonTemplateArtifact, nonDocumentArtifact],
        [unrelatedPost],
      );
      const log = jest.fn();

      const result = await purgeTemplateDocuments(collections, r2Deleter, {
        dryRun: false,
        log,
      });

      expect(result).toEqual({
        dryRun: false,
        artifactsCount: 0,
        postsDeletedCount: 0,
        postsKeptCount: 0,
        r2ObjectsCount: 0,
        keptPublishedPostIds: [],
      });

      expect(spies.artifactsDeleteMany).not.toHaveBeenCalled();
      expect(spies.postsDeleteMany).not.toHaveBeenCalled();
      expect(spies.deleteFiles).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Artifacts deleted: 0'),
      );
    });
  });
});
