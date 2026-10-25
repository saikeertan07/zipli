const { MemoryStore, RedisGCRAStore, GCRA, POLICIES } = require('../../src/algo/gcra');

describe('gcra.js Generic Cell Rate Algorithm rate limiter', () => {
  describe('MemoryStore', () => {
    it('stores, retrieves, deletes, and expires items based on timestamp', () => {
      const store = new MemoryStore();
      const t0 = 1000000;

      // Default now argument exercise
      store.set('k_default', Date.now() + 5000, 5000);
      expect(store.get('k_default')).toBeGreaterThan(0);

      store.set('key1', t0 + 500, 1000, t0);
      expect(store.size).toBe(2);
      expect(store.get('key1', t0)).toBe(t0 + 500);

      // Still valid before TTL
      expect(store.get('key1', t0 + 999)).toBe(t0 + 500);

      // Expired at or after TTL
      expect(store.get('key1', t0 + 1000)).toBeUndefined();
      expect(store.get('nonexistent', t0)).toBeUndefined();

      // Explicit delete
      store.set('delKey', 123, 1000, t0);
      expect(store.delete('delKey')).toBe(true);
      expect(store.get('delKey', t0)).toBeUndefined();

      // Cleanup test
      store.set('k2', 123, 500, t0);
      store.set('k3', 456, 2000, t0);

      const removed = store.cleanup(t0 + 1000);
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(store.get('k2', t0 + 1000)).toBeUndefined();
      expect(store.get('k3', t0 + 1000)).toBe(456);

      // Default timestamp cleanup
      store.cleanup();

      store.clear();
      expect(store.size).toBe(0);
    });
  });

  describe('GCRA instance rate evaluation', () => {
    it('initializes with default options cleanly', () => {
      const defaultLimiter = new GCRA();
      expect(defaultLimiter.limit).toBe(60);
      expect(defaultLimiter.periodMs).toBe(60000);
      expect(defaultLimiter.burst).toBe(60);
      expect(defaultLimiter.T).toBe(1000);
      expect(defaultLimiter.tau).toBe(59 * 1000);

      const r = defaultLimiter.consume('client_default');
      expect(r.allowed).toBe(true);
    });

    it('allows initial burst up to configured limit', () => {
      // 5 requests per 1000ms -> T = 200ms, burst = 5, tau = 4 * 200 = 800ms
      const limiter = new GCRA({ limit: 5, periodMs: 1000, burst: 5 });
      const t0 = 1000000;

      // 5 instant requests should all pass
      for (let i = 0; i < 5; i++) {
        const res = limiter.consume('ip_127.0.0.1', 1, t0);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(4 - i);
        expect(res.headers['RateLimit-Limit']).toBe('5');
        expect(res.headers['RateLimit-Remaining']).toBe(String(4 - i));
      }

      // 6th instant request exceeds burst tolerance tau -> rejected
      const sixth = limiter.consume('ip_127.0.0.1', 1, t0);
      expect(sixth.allowed).toBe(false);
      expect(sixth.remaining).toBe(0);
      expect(sixth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(sixth.headers['Retry-After']).toBeDefined();
    });

    it('recovers capacity as time advances (cell emission)', () => {
      const limiter = new GCRA({ limit: 5, periodMs: 1000, burst: 5 });
      const t0 = 1000000;

      // Drain all 5 slots at t0
      for (let i = 0; i < 5; i++) {
        limiter.consume('user_42', 1, t0);
      }
      expect(limiter.consume('user_42', 1, t0).allowed).toBe(false);

      // Advance time by 2 emission intervals (2 * 200ms = 400ms)
      const t1 = t0 + 400;
      const resAfter400 = limiter.consume('user_42', 1, t1);
      expect(resAfter400.allowed).toBe(true);

      // Advance by full period (1000ms), bucket should be completely replenished
      const t2 = t0 + 2000;
      const resReplenished = limiter.consume('user_42', 1, t2);
      expect(resReplenished.allowed).toBe(true);
      expect(resReplenished.remaining).toBe(4);
    });

    it('supports direct T and tau options', () => {
      const customLimiter = new GCRA({ T: 100, tau: 300 });
      const t0 = 5000;

      const r1 = customLimiter.consume('client_a', 1, t0);
      expect(r1.allowed).toBe(true);
    });

    it('supports multi-unit cost consumption', () => {
      const limiter = new GCRA({ limit: 10, periodMs: 1000 });
      const t0 = 1000;

      // Consume 5 units in a single request
      const r = limiter.consume('batch_client', 5, t0);
      expect(r.allowed).toBe(true);
    });

    it('resets rate limit for key when requested', () => {
      const limiter = new GCRA({ limit: 2, periodMs: 1000 });
      const t0 = 1000;

      limiter.consume('victim', 1, t0);
      limiter.consume('victim', 1, t0);
      expect(limiter.consume('victim', 1, t0).allowed).toBe(false);

      limiter.reset('victim');
      expect(limiter.consume('victim', 1, t0).allowed).toBe(true);

      // No-op reset branch when store has no delete
      const bareLimiter = new GCRA({ store: {} });
      expect(() => bareLimiter.reset('x')).not.toThrow();
    });

    it('exposes POLICIES with standard route configurations', () => {
      expect(POLICIES.AUTH.limit).toBe(5);
      expect(POLICIES.ORDERS.limit).toBe(10);
      expect(POLICIES.SEARCH.limit).toBe(30);
      expect(POLICIES.GENERAL.limit).toBe(120);
    });
  });

  describe('RedisGCRAStore and consumeAsync', () => {
    it('stores, retrieves, and deletes TAT in redis adapter', async () => {
      const mockRedis = {
        store: new Map(),
        async get(k) {
          return this.store.get(k) || null;
        },
        async set(k, v) {
          this.store.set(k, String(v));
          return 'OK';
        },
        async del(k) {
          return this.store.delete(k) ? 1 : 0;
        },
      };

      const redisStore = new RedisGCRAStore(mockRedis);
      const t0 = 100000;

      await redisStore.set('client_1', t0 + 2000, 2000);
      const tat = await redisStore.get('client_1', t0);
      expect(tat).toBe(t0 + 2000);

      // Expired in past
      const expired = await redisStore.get('client_1', t0 + 3000);
      expect(expired).toBeUndefined();

      // Absent key
      expect(await redisStore.get('unseen', t0)).toBeUndefined();

      // Del
      await redisStore.delete('client_1');
      expect(await redisStore.get('client_1', t0)).toBeUndefined();

      // Error resilience
      const brokenRedis = {
        async get() {
          throw new Error('conn error');
        },
        async set() {
          throw new Error('conn error');
        },
        async del() {
          throw new Error('conn error');
        },
      };
      const resilientStore = new RedisGCRAStore(brokenRedis);
      expect(await resilientStore.get('err')).toBeUndefined();
      await expect(resilientStore.set('err', 1, 1)).resolves.not.toThrow();
      await expect(resilientStore.delete('err')).resolves.not.toThrow();
    });

    it('evaluates rate limits asynchronously with consumeAsync', async () => {
      const mockRedis = {
        store: new Map(),
        async get(k) {
          return this.store.get(k) || null;
        },
        async set(k, v) {
          this.store.set(k, String(v));
          return 'OK';
        },
        async del(k) {
          return this.store.delete(k) ? 1 : 0;
        },
      };

      const redisStore = new RedisGCRAStore(mockRedis);
      const limiter = new GCRA({ limit: 3, periodMs: 1000, burst: 3, store: redisStore });
      const t0 = 200000;

      const r1 = await limiter.consumeAsync('async_user', 1, t0);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.consumeAsync('async_user', 1, t0);
      expect(r2.allowed).toBe(true);

      const r3 = await limiter.consumeAsync('async_user', 1, t0);
      expect(r3.allowed).toBe(true);

      const r4 = await limiter.consumeAsync('async_user', 1, t0);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('handles consumeAsync with default arguments and bare stores', async () => {
      const bareLimiter = new GCRA({ store: null });
      const res = await bareLimiter.consumeAsync('bare_key');
      expect(res.allowed).toBe(true);

      const noSetStore = {
        async get() {
          return undefined;
        },
      };
      const limiterNoSet = new GCRA({ store: noSetStore });
      const res2 = await limiterNoSet.consumeAsync('no_set');
      expect(res2.allowed).toBe(true);
    });
  });
});
