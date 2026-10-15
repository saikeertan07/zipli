const { ConversationStore } = require('../../src/ai/conversationStore');

describe('Server-Side Conversation Store (P0)', () => {
  let store;

  beforeEach(() => {
    store = new ConversationStore();
    store.clear();
  });

  test('generates valid prefixed UUIDv4 conversation IDs', () => {
    const id = store.generateId();
    expect(id).toMatch(/^conv_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('appends and retrieves conversation turns', async () => {
    const convId = store.generateId();
    await store.appendTurns(convId, [
      { role: 'user', content: 'Need milk and eggs' },
      { role: 'assistant', content: 'Found Amul milk and farm eggs.' },
    ]);

    const history = await store.getHistory(convId);
    expect(history.length).toBe(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('Need milk and eggs');
    expect(history[1].role).toBe('assistant');
  });

  test('enforces max turns limit (10 turns)', async () => {
    const convId = store.generateId();
    const turns = [];
    for (let i = 1; i <= 15; i++) {
      turns.push({ role: i % 2 === 1 ? 'user' : 'assistant', content: `Turn ${i}` });
    }

    await store.appendTurns(convId, turns);
    const history = await store.getHistory(convId);
    expect(history.length).toBe(10);
    expect(history[0].content).toBe('Turn 6');
    expect(history[9].content).toBe('Turn 15');
  });

  test('returns empty array for non-existent conversation', async () => {
    const history = await store.getHistory('non_existent_conv');
    expect(history).toEqual([]);
  });
});
