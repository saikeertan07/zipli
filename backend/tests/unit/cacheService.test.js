const { CacheService } = require('../../src/services/cache.service');

describe('CacheService with Single-Flight Stampede Protection & Jitter', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({
      lruCapacity: 100,
      lfuCapacity: 100,
      defaultTtlSeconds: 60,
      jitterFraction: 0.1,
    });
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('Single-Flight / Stampede Protection', () => {
    it('coalesces 50 concurrent requests for the same uncached key into a single loader invocation', async () => {
      let loaderInvocations = 0;

      const loader = async () => {
        loaderInvocations++;
        // Simulate async DB latency
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { message: 'db_payload', time: Date.now() };
      };

      // Launch 50 concurrent requests for the exact same key
      const requests = Array.from({ length: 50 }, () =>
        cache.wrap('hot_key_item', loader, { ttlSeconds: 30 })
      );

      const results = await Promise.all(requests);

      // Verify all 50 callers received the identical data
      expect(results).toHaveLength(50);
      expect(results[0]).toEqual(expect.objectContaining({ message: 'db_payload' }));
      for (const res of results) {
        expect(res).toEqual(results[0]);
      }

      // Proves stampede protection: only 1 loader call took place!
      expect(loaderInvocations).toBe(1);

      // Next subsequent call is immediately served from cache without invoking loader
      const cached = await cache.wrap('hot_key_item', loader);
      expect(cached).toEqual(results[0]);
      expect(loaderInvocations).toBe(1);
    });

    it('cleans up inFlight map even if loader throws an error', async () => {
      const failingLoader = async () => {
        throw new Error('Database connection failed');
      };

      await expect(cache.wrap('error_key', failingLoader)).rejects.toThrow(
        'Database connection failed'
      );
      expect(cache.inFlight.has('error_key')).toBe(false);
    });
  });

  describe('TTL Jitter', () => {
    it('applies bounded jitter to base TTL', () => {
      const base = 100;
      for (let i = 0; i < 20; i++) {
        const jittered = cache.addJitter(base, 0.1);
        expect(jittered).toBeGreaterThanOrEqual(90);
        expect(jittered).toBeLessThanOrEqual(110);
      }
    });

    it('returns 0 for zero or negative TTL', () => {
      expect(cache.addJitter(0)).toBe(0);
      expect(cache.addJitter(-5)).toBe(0);
    });
  });

  describe('LRU and LFU cache operations & invalidation', () => {
    it('supports LFU tier caching when useLfu option is true', async () => {
      const loader = jest.fn().mockResolvedValue('lfu_val');
      const val1 = await cache.wrap('lfu_key', loader, { useLfu: true });
      expect(val1).toBe('lfu_val');
      expect(loader).toHaveBeenCalledTimes(1);

      const val2 = await cache.wrap('lfu_key', loader, { useLfu: true });
      expect(val2).toBe('lfu_val');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('supports direct get, set, and del operations', async () => {
      await cache.set('manual_k', { name: 'apple' }, { ttlSeconds: 10 });
      const val = await cache.get('manual_k');
      expect(val).toEqual({ name: 'apple' });

      await cache.del('manual_k');
      const missing = await cache.get('manual_k');
      expect(missing).toBeUndefined();
    });

    it('invalidates entries by prefix', async () => {
      await cache.set('product:1', 'p1');
      await cache.set('product:2', 'p2');
      await cache.set('category:fruits', 'cat');

      await cache.invalidatePrefix('product:');

      expect(await cache.get('product:1')).toBeUndefined();
      expect(await cache.get('product:2')).toBeUndefined();
      expect(await cache.get('category:fruits')).toBe('cat');
    });

    it('reports cache hit and miss statistics', async () => {
      await cache.set('k1', 'v1');
      await cache.get('k1'); // hit
      await cache.get('k_missing'); // miss

      const stats = cache.getStats();
      expect(stats.l1.lru.hits).toBeGreaterThanOrEqual(1);
      expect(stats.l1.lru.misses).toBeGreaterThanOrEqual(1);
    });

    it('handles L2 redis errors gracefully on set, del, and invalidatePrefix', async () => {
      const redisModule = require('../../src/config/redis');
      const spy = jest.spyOn(redisModule, 'getRedisClient').mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error('Redis get error')),
        set: jest.fn().mockRejectedValue(new Error('Redis set error')),
        del: jest.fn().mockRejectedValue(new Error('Redis del error')),
        store: null,
      });

      await cache.set('err_k', 'val');
      await cache.del('err_k');
      await cache.invalidatePrefix('err_');

      spy.mockRestore();
    });

    it('retrieves from L2 when L1 misses and populates back into L1', async () => {
      const { getRedisClient } = require('../../src/config/redis');
      const redis = getRedisClient();
      await redis.set('l2_hit_key', JSON.stringify({ cachedInL2: true }));

      // L1 does not have key yet
      expect(cache.lru.get('l2_hit_key')).toBeUndefined();

      const res = await cache.get('l2_hit_key');
      expect(res).toEqual({ cachedInL2: true });

      // Second get hits L1 directly
      const l1Res = cache.lru.get('l2_hit_key');
      expect(l1Res).toEqual({ cachedInL2: true });
    });

    it('does not cache in L1 or L2 when loaderFn returns null or undefined', async () => {
      const nullLoader = jest.fn().mockResolvedValue(null);
      const res = await cache.wrap('null_key', nullLoader);
      expect(res).toBeNull();
      expect(await cache.get('null_key')).toBeUndefined();
    });
  });
});
