const { TokenBudgetManager } = require('../../src/ai/tokenBudget');

describe('AI Daily Token Budget Tracker (P0)', () => {
  let budgetManager;

  beforeEach(() => {
    budgetManager = new TokenBudgetManager({ dailyLimit: 1000 });
    budgetManager.clear();
  });

  test('allows requests within token budget', async () => {
    const check1 = await budgetManager.checkBudget('test_user_1', 200);
    expect(check1.allowed).toBe(true);
    expect(check1.remaining).toBe(1000);

    await budgetManager.recordUsage('test_user_1', 200);

    const check2 = await budgetManager.checkBudget('test_user_1', 300);
    expect(check2.allowed).toBe(true);
    expect(check2.currentUsage).toBe(200);
    expect(check2.remaining).toBe(800);
  });

  test('blocks requests when budget is exhausted', async () => {
    await budgetManager.recordUsage('test_user_capped', 950);

    // Remaining is 50, but estimating 100
    const check = await budgetManager.checkBudget('test_user_capped', 100);
    expect(check.allowed).toBe(false);
    expect(check.currentUsage).toBe(950);
    expect(check.remaining).toBe(50);
  });

  test('differentiates between distinct users', async () => {
    await budgetManager.recordUsage('user_A', 990);
    await budgetManager.recordUsage('user_B', 100);

    const checkA = await budgetManager.checkBudget('user_A', 50);
    const checkB = await budgetManager.checkBudget('user_B', 50);

    expect(checkA.allowed).toBe(false);
    expect(checkB.allowed).toBe(true);
  });
});
