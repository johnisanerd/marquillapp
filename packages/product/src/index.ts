import { changelog } from './changelog';
import { features } from './features';
import type { Feature, FeatureStatus, PublicCopy, Shipment } from './types';

export * from './types';
export { changelog, features };

export type BoardItem = PublicCopy & { id: string; status: FeatureStatus };

const byId = new Map(features.map((feature) => [feature.id, feature]));

export function getFeature(id: string): Feature | undefined {
  return byId.get(id);
}

function toBoardItem(feature: Feature): BoardItem {
  // The ledger test guarantees every board feature has public copy.
  return { id: feature.id, status: feature.status, ...feature.public! };
}

/** The landing page's "Live now" column. */
export function liveBoard(): BoardItem[] {
  return features.filter((f) => f.board && f.status === 'live').map(toBoardItem);
}

/** The landing page's "Shipping next" column. */
export function nextBoard(): BoardItem[] {
  return features.filter((f) => f.board && (f.status === 'planned' || f.status === 'building')).map(toBoardItem);
}

/** Changelog entries for live features, newest first. */
export function publishedChangelog(limit?: number): Shipment[] {
  const entries = changelog.filter((entry) => byId.get(entry.feature)?.status === 'live');
  return limit === undefined ? entries : entries.slice(0, limit);
}

/** "2026-10-15" → "Oct 2026", in UTC so the build machine's timezone can't shift it. */
export function formatMonth(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
