import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { changelog } from './changelog';
import { features } from './features';
import { renderFeaturesMarkdown } from './render';

const root = join(import.meta.dir, '../../..');
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const ids = new Set(features.map((f) => f.id));

describe('features', () => {
  test('ids are unique kebab-case', () => {
    expect(ids.size).toBe(features.length);
    for (const f of features) expect(f.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test.each(features.map((f) => [f.id, f] as const))('%s is consistent with its status', (_, f) => {
    if (f.board) expect(f.public, 'board features need public copy').toBeDefined();
    if (f.status === 'idea') {
      expect(f.board, 'ideas never go on the board').toBeFalsy();
      expect(f.discussed, 'ideas record where they came from').toBeDefined();
    }
    if (f.status === 'planned' || f.status === 'building') {
      expect((f.issues?.length ?? 0) + (f.docs?.length ?? 0), 'planned and building need an issue or a doc').toBeGreaterThan(0);
      expect(f.since, 'since is the go-live date').toBeUndefined();
    }
    if (f.status === 'live' || f.status === 'paused' || f.status === 'retired') {
      expect(f.since, 'shipped features need a go-live date').toBeDefined();
    }
    for (const date of [f.since, f.discussed?.date].filter(Boolean) as string[]) {
      expect(date).toMatch(isoDate);
      expect(date <= today).toBe(true);
    }
  });

  test('doc links point at files that exist', () => {
    for (const f of features) {
      for (const path of f.docs ?? []) expect(existsSync(join(root, path)), `${f.id}: ${path}`).toBe(true);
    }
  });

  test('plan names match the api tier seeds', () => {
    const seeds = readFileSync(join(root, 'apps/api/src/scripts/tier-seeds.ts'), 'utf8');
    const seeded = new Set([...seeds.matchAll(/^\s{4}name: '([^']+)'/gm)].map((m) => m[1]));
    expect(seeded.size).toBeGreaterThan(0);
    for (const f of features) for (const plan of f.plans ?? []) expect(seeded.has(plan), `${f.id}: ${plan}`).toBe(true);
  });
});

describe('changelog', () => {
  test('entries point at known features', () => {
    for (const entry of changelog) expect(ids.has(entry.feature), entry.feature).toBe(true);
  });

  test('entries are dated, not in the future, and newest first', () => {
    for (const entry of changelog) {
      expect(entry.date).toMatch(isoDate);
      expect(entry.date <= today).toBe(true);
    }
    const dates = changelog.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('entries never belong to ideas', () => {
    for (const entry of changelog) expect(features.find((f) => f.id === entry.feature)?.status).not.toBe('idea');
  });
});

test('FEATURES.md is up to date (run `bun run render` in packages/product)', () => {
  expect(readFileSync(join(import.meta.dir, '../FEATURES.md'), 'utf8')).toBe(renderFeaturesMarkdown());
});
