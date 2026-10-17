/**
 * Lifecycle of a feature. Only `live` means a user can use it today:
 * deployed to production and switched on. Merged-but-dark is `building`.
 *
 * - idea:     discussed, not committed to. Never shown publicly.
 * - planned:  committed to; has an issue or a design doc.
 * - building: work has started; has an issue or a design doc.
 * - live:     deployed and enabled in production.
 * - paused:   was live, switched off for now.
 * - retired:  removed from the product.
 */
export type FeatureStatus = 'idea' | 'planned' | 'building' | 'live' | 'paused' | 'retired';

export type FeatureArea =
  | 'creation'
  | 'documents'
  | 'research'
  | 'publishing'
  | 'scheduling'
  | 'accounts'
  | 'insights'
  | 'billing'
  | 'workspace';

/** Plan names as seeded in apps/api/src/scripts/tier-seeds.ts. */
export type PlanName = 'Free' | 'Starter' | 'Creator' | 'Pro Writer';

/** Copy shown on the landing page. Follows apps/landing/AGENTS.md's copy rules. */
export type PublicCopy = { title: string; body: string };

export type Feature = {
  /** Stable kebab-case id. Changelog entries point at it, so never rename one. */
  id: string;
  /** Internal name, using apps/api/CONTEXT.md vocabulary. */
  name: string;
  area: FeatureArea;
  status: FeatureStatus;
  /** What it does, precisely, for the team. Not marketing copy. */
  summary: string;
  /** Landing copy. Required when `board` is set. */
  public?: PublicCopy;
  /** Show on the landing status board (Live now / Shipping next). Only the user turns this on. */
  board?: boolean;
  /** Plans that include it, when it is gated. Omit when every plan has it. */
  plans?: PlanName[];
  /** Date it went live (YYYY-MM-DD). Required for `live`, `paused`, `retired`. */
  since?: string;
  /** Issue numbers in krispamB/marquillapp. */
  issues?: number[];
  /** Repo-relative paths to specs, designs, or research. */
  docs?: string[];
  /** Caveats, known gaps, places the copy and the code disagree. */
  notes?: string[];
  /** Where an idea came from. Required for `idea`. */
  discussed?: { date: string; summary: string };
};

export type Shipment = {
  /** YYYY-MM-DD the change went live. */
  date: string;
  /** The Feature this shipment belongs to. */
  feature: string;
  title: string;
  body: string;
};
