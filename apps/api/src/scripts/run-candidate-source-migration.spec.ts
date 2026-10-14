import { createHash } from 'node:crypto';
import {
  migrateRunCandidateSources,
  type LegacyCheckpoint,
  type RunCandidateSourceStore,
} from './run-candidate-source-migration';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const makeStore = (legacy: LegacyCheckpoint[]) => {
  const store = {
    findLegacyCheckpoints: jest.fn().mockResolvedValue(legacy),
    saveAcceptedText: jest.fn().mockResolvedValue(undefined),
    replaceInlineText: jest.fn().mockResolvedValue(undefined),
  };
  return store satisfies RunCandidateSourceStore;
};

describe('migrateRunCandidateSources', () => {
  const recent = {
    runId: 'run-recent',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    candidate: '<section class="page">recent</section>',
  };
  const old = {
    runId: 'run-old',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    candidate: '<section class="page">old</section>',
  };

  it('should only report what it would move when not applying', async () => {
    const store = makeStore([recent, old]);
    const log = jest.fn();

    await expect(
      migrateRunCandidateSources(store, { apply: false, log }),
    ).resolves.toEqual({ applied: false, found: 2, migrated: 0 });
    expect(store.saveAcceptedText).not.toHaveBeenCalled();
    expect(store.replaceInlineText).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '2 run(s) keep their checkpoint text inline',
    );
  });

  it('should move each text apart, expiring 90 days after its run began, then drop it from the run', async () => {
    const store = makeStore([recent, old]);

    await expect(
      migrateRunCandidateSources(store, { apply: true }),
    ).resolves.toEqual({ applied: true, found: 2, migrated: 2 });

    expect(store.saveAcceptedText).toHaveBeenCalledWith({
      runId: 'run-recent',
      candidateSha256: sha(recent.candidate),
      candidate: recent.candidate,
      expiresAt: new Date('2026-12-30T00:00:00.000Z'),
    });
    // Already past its retention: the TTL monitor removes it on its next pass.
    expect(store.saveAcceptedText).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-old',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      }),
    );
    expect(store.replaceInlineText).toHaveBeenCalledWith(
      'run-recent',
      sha(recent.candidate),
    );
    // The text is saved before it is dropped from the run.
    expect(store.saveAcceptedText.mock.invocationCallOrder[0]).toBeLessThan(
      store.replaceInlineText.mock.invocationCallOrder[0],
    );
  });

  it('should do nothing when every checkpoint is already kept apart', async () => {
    const store = makeStore([]);

    await expect(
      migrateRunCandidateSources(store, { apply: true }),
    ).resolves.toEqual({ applied: true, found: 0, migrated: 0 });
    expect(store.saveAcceptedText).not.toHaveBeenCalled();
  });
});
