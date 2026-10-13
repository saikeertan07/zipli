const { validateToolCall, AI_TOOLS } = require('../../src/ai/tools');
const { conversationStore, ConversationStore } = require('../../src/ai/conversationStore');
const { tokenBudgetManager, TokenBudgetManager } = require('../../src/ai/tokenBudget');

describe('AI Modules Edge Cases & Fallback Branches (P0/P1)', () => {
  describe('tools.js validateToolCall branches', () => {
    test('returns error for unknown tool name', () => {
      const res = validateToolCall('nonExistentTool', {});
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unknown tool');
    });

    test('returns validation error for invalid tool arguments', () => {
      const res = validateToolCall('findSubstitutes', { productId: -99 });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid tool arguments');
    });

    test('validates all declared AI_TOOLS schemas', () => {
      expect(AI_TOOLS.length).toBeGreaterThanOrEqual(4);
      for (const tool of AI_TOOLS) {
        expect(tool.name).toBeDefined();
        expect(tool.schema).toBeDefined();
      }
    });
  });

  describe('conversationStore.js fallback branches', () => {
    test('handles fallback to memory when getRedisClient returns null or fails', async () => {
      const store = new ConversationStore();
      const convId = 'conv_fallback_test';

      await store.appendTurns(convId, [{ role: 'user', content: 'Fallback turn' }]);
      const history = await store.getHistory(convId);
      expect(history.length).toBe(1);
      expect(history[0].content).toBe('Fallback turn');
    });

    test('getHistory returns empty array when conversationId is falsy', async () => {
      const store = new ConversationStore();
      expect(await store.getHistory(null)).toEqual([]);
      expect(await store.getHistory('')).toEqual([]);
    });
  });

  describe('tokenBudget.js branches', () => {
    test('records zero or negative tokens safely (no-op)', async () => {
      const mgr = new TokenBudgetManager();
      await expect(mgr.recordUsage('user_zero', 0)).resolves.not.toThrow();
      await expect(mgr.recordUsage('user_neg', -10)).resolves.not.toThrow();
    });

    test('in-memory budget tracks usage correctly', async () => {
      const mgr = new TokenBudgetManager({ dailyLimit: 500 });
      const check1 = await mgr.checkBudget('test_in_memory_user', 100);
      expect(check1.allowed).toBe(true);

      await mgr.recordUsage('test_in_memory_user', 450);
      const check2 = await mgr.checkBudget('test_in_memory_user', 100);
      expect(check2.allowed).toBe(false);
    });
  });
});
