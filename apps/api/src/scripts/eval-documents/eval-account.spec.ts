import {
  ensureEvalAccount,
  EVAL_USER_EMAIL,
  EVAL_USER_NAME,
  type EvalAccountStore,
} from './eval-account';

const makeStore = (overrides: Partial<EvalAccountStore> = {}) => {
  const store = {
    findUserIdByEmail: jest.fn().mockResolvedValue(undefined),
    findDefaultTierId: jest.fn().mockResolvedValue('free-tier'),
    createUser: jest.fn().mockResolvedValue('new-user'),
    deleteCreditUsage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return store;
};

describe('ensureEvalAccount', () => {
  it('should create the eval user on the default tier when none exists', async () => {
    const store = makeStore();

    const account = await ensureEvalAccount(store);

    expect(account.userId).toBe('new-user');
    expect(store.createUser).toHaveBeenCalledWith({
      email: EVAL_USER_EMAIL,
      name: EVAL_USER_NAME,
      tierId: 'free-tier',
    });
  });

  it('should reuse the eval user when it exists', async () => {
    const store = makeStore({
      findUserIdByEmail: jest.fn().mockResolvedValue('existing-user'),
    });

    const account = await ensureEvalAccount(store);

    expect(account.userId).toBe('existing-user');
    expect(store.createUser).not.toHaveBeenCalled();
    expect(store.findDefaultTierId).not.toHaveBeenCalled();
  });

  it('should fail clearly when no default tier is seeded', async () => {
    const store = makeStore({
      findDefaultTierId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(ensureEvalAccount(store)).rejects.toThrow(
      /No active default Tier/,
    );
    expect(store.createUser).not.toHaveBeenCalled();
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
