export const EVAL_USER_EMAIL = 'eval@marquill.internal';
export const EVAL_USER_NAME = 'Document Eval';

/** The collections the eval account touches, narrowed to what it does. */
export interface EvalAccountStore {
  findUserIdByEmail(email: string): Promise<string | undefined>;
  /** The active Tier with the most credits (unlimited counts as the most). */
  findTopCreditTierId(): Promise<string | undefined>;
  createUser(user: {
    email: string;
    name: string;
    tierId: string;
  }): Promise<string>;
  /** Creates or renews the user's one Subscription, active over the given period. */
  upsertSubscription(subscription: {
    userId: string;
    tierId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<void>;
  /** Removes the user's `credits` Usage rows, every period. */
  deleteCreditUsage(userId: string): Promise<void>;
}

/** What `--cleanup` needs, narrowed to the eval user's own rows. */
export interface EvalCleanupStore {
  findUserIdByEmail(email: string): Promise<string | undefined>;
  /** Deletes the user's Subscription rows and returns how many. */
  deleteSubscriptions(userId: string): Promise<number>;
  /** Deletes the user's `credits` Usage rows, every period, and returns how many. */
  deleteCreditUsage(userId: string): Promise<number>;
}

export interface EvalCleanupResult {
  /** Whether the eval user exists; when false nothing was deleted. */
  found: boolean;
  subscriptionsDeleted: number;
  creditUsageDeleted: number;
}

export interface EvalAccount {
  userId: string;
  /** Zeroes the eval user's credit usage, so the next launch passes the balance check. */
  resetCredits(): Promise<void>;
}

/**
 * The user the eval runs as. A dedicated, Mongo-only `User`: it has no
 * `clerkId`, so it cannot sign in, and nothing is created in Clerk.
 *
 * Credit gating (`FeatureGatingService.assertBalance`) compares the user's
 * `credits` Usage for the period against its entitlement Tier's limit, and it
 * runs twice per run: at launch, and again when the worker starts the run. The
 * worker starts the next queued run the moment the last one settles, so a
 * reset before launch alone can race it. The user therefore also gets an
 * active Subscription row on the Tier with the most credits (a Mongo document
 * with no Paddle or Polar id, which no billing webhook can match), and the
 * eval still zeroes this one user's `credits` Usage before each launch. The
 * run's own credits come from its diagnostics, which the reset does not touch.
 */
export async function ensureEvalAccount(
  store: EvalAccountStore,
  now: () => Date = () => new Date(),
): Promise<EvalAccount> {
  const tierId = await store.findTopCreditTierId();
  if (!tierId) {
    throw new Error('No active Tier: seed the tiers before running the eval.');
  }
  const userId =
    (await store.findUserIdByEmail(EVAL_USER_EMAIL)) ??
    (await store.createUser({
      email: EVAL_USER_EMAIL,
      name: EVAL_USER_NAME,
      tierId,
    }));

  const periodStart = now();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  await store.upsertSubscription({ userId, tierId, periodStart, periodEnd });

  return {
    userId,
    resetCredits: () => store.deleteCreditUsage(userId),
  };
}

/** The id of the Tier with the most credits, where `-1` means unlimited. */
export function topCreditTierId(
  tiers: readonly { id: string; credits: number }[],
): string | undefined {
  const rank = (credits: number) => (credits === -1 ? Infinity : credits);
  return tiers.reduce<{ id: string; credits: number } | undefined>(
    (top, tier) =>
      !top || rank(tier.credits) > rank(top.credits) ? tier : top,
    undefined,
  )?.id;
}

/**
 * Undoes what `ensureEvalAccount` grants: removes the eval user's
 * Subscription and `credits` Usage rows, so the account is back to its own
 * Tier's limits. The User, its artifacts, runs and diagnostics stay, because
 * they are the record of the eval. Only `EVAL_USER_EMAIL` is looked up, so no
 * other user's rows can be touched.
 */
export async function cleanupEvalAccount(
  store: EvalCleanupStore,
): Promise<EvalCleanupResult> {
  const userId = await store.findUserIdByEmail(EVAL_USER_EMAIL);
  if (!userId) {
    return { found: false, subscriptionsDeleted: 0, creditUsageDeleted: 0 };
  }
  const subscriptionsDeleted = await store.deleteSubscriptions(userId);
  const creditUsageDeleted = await store.deleteCreditUsage(userId);
  return { found: true, subscriptionsDeleted, creditUsageDeleted };
}
