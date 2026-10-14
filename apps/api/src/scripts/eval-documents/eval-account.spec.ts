import {
  ensureEvalAccount,
  topCreditTierId,
  EVAL_USER_EMAIL,
  EVAL_USER_NAME,
  type EvalAccountStore,
} from './eval-account';

const makeStore = (overrides: Partial<EvalAccountStore> = {}) => {
  const store = {
    findUserIdByEmail: jest.fn().mockResolvedValue(undefined),
    findTopCreditTierId: jest.fn().mockResolvedValue('top-tier'),
    createUser: jest.fn().mockResolvedValue('new-user'),
    upsertSubscription: jest.fn().mockResolvedValue(undefined),
    deleteCreditUsage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return store;
};

describe('ensureEvalAccount', () => {
  const now = new Date('2026-03-01T00:00:00Z');

  it('should create the eval user on the top credit tier when none exists', async () => {
    const store = makeStore();

    const account = await ensureEvalAccount(store, () => now);

    expect(account.userId).toBe('new-user');
    expect(store.createUser).toHaveBeenCalledWith({
      email: EVAL_USER_EMAIL,
      name: EVAL_USER_NAME,
      tierId: 'top-tier',
    });
  });

  it('should give the eval user an active subscription on the top tier for a year', async () => {
    const store = makeStore();

    await ensureEvalAccount(store, () => now);

    expect(store.upsertSubscription).toHaveBeenCalledWith({
      userId: 'new-user',
      tierId: 'top-tier',
      periodStart: now,
      periodEnd: new Date('2027-03-01T00:00:00Z'),
    });
  });

  it('should renew the subscription of an existing eval user', async () => {
    const store = makeStore({
      findUserIdByEmail: jest.fn().mockResolvedValue('existing-user'),
    });

    await ensureEvalAccount(store, () => now);

    expect(store.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'existing-user', tierId: 'top-tier' }),
    );
  });

  it('should reuse the eval user when it exists', async () => {
    const store = makeStore({
      findUserIdByEmail: jest.fn().mockResolvedValue('existing-user'),
    });

    const account = await ensureEvalAccount(store);

    expect(account.userId).toBe('existing-user');
    expect(store.createUser).not.toHaveBeenCalled();
  });

  it('should fail clearly when no tier is seeded', async () => {
    const store = makeStore({
      findTopCreditTierId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(ensureEvalAccount(store)).rejects.toThrow(/No active Tier/);
    expect(store.createUser).not.toHaveBeenCalled();
    expect(store.upsertSubscription).not.toHaveBeenCalled();
  });

  it("should use an address that cannot be a real user's", () => {
    expect(EVAL_USER_EMAIL).toMatch(/@marquill\.internal$/);
  });

  describe('resetCredits', () => {
    it('should clear the credit usage of the eval user only', async () => {
      const store = makeStore();
      const account = await ensureEvalAccount(store);

      await account.resetCredits();
      await account.resetCredits();

      expect(store.deleteCreditUsage).toHaveBeenCalledTimes(2);
      expect(store.deleteCreditUsage).toHaveBeenCalledWith('new-user');
    });
  });
});

describe('topCreditTierId', () => {
  it('should pick the tier with the most credits', () => {
    const tiers = [
      { id: 'free', credits: 120 },
      { id: 'pro', credits: 30000 },
      { id: 'creator', credits: 10000 },
    ];

    expect(topCreditTierId(tiers)).toBe('pro');
  });

  it('should treat an unlimited tier (-1) as the most', () => {
    const tiers = [
      { id: 'pro', credits: 30000 },
      { id: 'unlimited', credits: -1 },
    ];

    expect(topCreditTierId(tiers)).toBe('unlimited');
  });

  it('should return nothing when there are no tiers', () => {
    expect(topCreditTierId([])).toBeUndefined();
  });
});
