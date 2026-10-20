const {
  InMemoryRedisAdapter,
  getRedisClient,
  getPubSubClients,
  isRedisReady,
  closeRedis,
} = require('../../src/config/redis');

describe('InMemoryRedisAdapter and redis config', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryRedisAdapter();
  });

  it('sets and gets keys with and without EX / PX ttl', async () => {
    await adapter.set('k1', 'val1');
    expect(await adapter.get('k1')).toBe('val1');

    await adapter.set('k_ex', 'val_ex', 'EX', 10);
    expect(await adapter.get('k_ex')).toBe('val_ex');

    await adapter.set('k_px', 'val_px', 'PX', 5000);
    expect(await adapter.get('k_px')).toBe('val_px');

    expect(await adapter.get('non_existent')).toBeNull();
  });

  it('expires items automatically upon get()', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    await adapter.set('temp', 'secret', 'EX', 1);
    expect(await adapter.get('temp')).toBe('secret');

    // Fast-forward past expiry
    Date.now.mockReturnValue(now + 2000);
    expect(await adapter.get('temp')).toBeNull();

    Date.now.mockRestore();
  });

  it('deletes keys and clears all via flushall', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    expect(await adapter.del('a')).toBe(1);
    expect(await adapter.get('a')).toBeNull();

    expect(await adapter.flushall()).toBe('OK');
    expect(await adapter.get('b')).toBeNull();
  });

  it('supports pub/sub pattern and handles unsubscriptions and subscriber errors', async () => {
    const messages = [];
    const handler1 = (msg) => messages.push(`h1:${msg}`);
    const handler2 = (msg) => messages.push(`h2:${msg}`);
    const failingHandler = () => {
      throw new Error('Subscriber failed');
    };

    await adapter.subscribe('test_chan', handler1);
    await adapter.subscribe('test_chan', handler2);
    await adapter.subscribe('test_chan', failingHandler);

    const receivedCount = await adapter.publish('test_chan', 'hello');
    expect(receivedCount).toBe(3);
    expect(messages).toEqual(['h1:hello', 'h2:hello']);

    // Unsubscribe single handler
    await adapter.unsubscribe('test_chan', handler1);
    messages.length = 0;
    await adapter.publish('test_chan', 'second');
    expect(messages).toEqual(['h2:second']);

    // Unsubscribe all
    await adapter.unsubscribe('test_chan');
    messages.length = 0;
    await adapter.publish('test_chan', 'third');
    expect(messages).toHaveLength(0);

    // Unsubscribe non-existent channel
    expect(await adapter.unsubscribe('unknown_chan')).toBe(0);
  });

  it('supports ping, quit, and disconnect', async () => {
    expect(await adapter.ping()).toBe('PONG');
    expect(await adapter.quit()).toBe('OK');
    expect(adapter.status).toBe('end');
    adapter.disconnect();
  });

  it('getRedisClient, getPubSubClients, isRedisReady, closeRedis integration', async () => {
    const client = getRedisClient();
    expect(client).toBeDefined();

    const { pubClient, subClient } = getPubSubClients();
    expect(pubClient).toBeDefined();
    expect(subClient).toBeDefined();

    expect(isRedisReady()).toBe(true);

    await closeRedis();
  });
});
