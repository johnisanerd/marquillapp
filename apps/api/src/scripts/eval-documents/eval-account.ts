export const EVAL_USER_EMAIL = 'eval@marquill.internal';
export const EVAL_USER_NAME = 'Document Eval';

/** The two collections the eval account touches, narrowed to what it does. */
export interface EvalAccountStore {
  findUserIdByEmail(email: string): Promise<string | undefined>;
  /** The active default Tier's id: what any user without a subscription gets. */
  findDefaultTierId(): Promise<string | undefined>;
  createUser(user: {
    email: string;
    name: string;
    tierId: string;
  }): Promise<string>;
  /** Removes the user's `credits` Usage rows, every period. */
  deleteCreditUsage(userId: string): Promise<void>;
}

export interface EvalAccount {
  userId: string;
  /** Zeroes the eval user's credit usage, so the next launch passes the balance check. */
  resetCredits(): Promise<void>;
}

/**
 * The user the eval runs as. A dedicated, Mongo-only `User`: it has no
 * `clerkId`, so it cannot sign in, and nothing is created in Clerk. It has no
 * Subscription either, so it sits on the default Tier.
 *
 * Credit gating (`FeatureGatingService.assertBalance`) compares the user's
 * `credits` Usage for the period against the Tier's limit, and a run may
 * overshoot it. Twenty runs would outspend the Free tier's allowance, so the
 * eval zeroes this one user's `credits` Usage before each launch instead of
 * giving the user a paid Tier or a Subscription. The run's own credits still
 * come from its diagnostics, which the reset does not touch.
 */
export async function ensureEvalAccount(
  store: EvalAccountStore,
): Promise<EvalAccount> {
  let userId = await store.findUserIdByEmail(EVAL_USER_EMAIL);
  if (!userId) {
    const tierId = await store.findDefaultTierId();
    if (!tierId) {
      throw new Error(
        'No active default Tier: seed the tiers before running the eval.',
      );
    }
    userId = await store.createUser({
      email: EVAL_USER_EMAIL,
      name: EVAL_USER_NAME,
      tierId,
    });
  }
  const evalUserId = userId;
  return {
    userId: evalUserId,
    resetCredits: () => store.deleteCreditUsage(evalUserId),
  };
}
