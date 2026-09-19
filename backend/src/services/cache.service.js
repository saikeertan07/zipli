const { LRUCache } = require('../algo/lru');
const { LFUCache } = require('../algo/lfu');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

class CacheService {
  constructor(options = {}) {
    const {
      lruCapacity = 5000,
      lfuCapacity = 5000,
      defaultTtlSeconds = 300,
      jitterFraction = 0.1,
    } = options;

    this.defaultTtlSeconds = defaultTtlSeconds;
    this.jitterFraction = jitterFraction;

    // L1 in-memory caches
    this.lru = new LRUCache({ capacity: lruCapacity, defaultTtlMs: defaultTtlSeconds * 1000 });
    this.lfu = new LFUCache({ capacity: lfuCapacity, defaultTtlMs: defaultTtlSeconds * 1000 });

    // Single-Flight / Stampede coalescing map
    this.inFlight = new Map();

    // L2 metrics
    this.l2Hits = 0;
    this.l2Misses = 0;
  }

  /**
   * Applies jitter to a base TTL (in seconds) to prevent synchronized expiration stampedes.
   * @param {number} baseTtlSeconds
   * @param {number} [fraction]
   * @returns {number}
   */
  addJitter(baseTtlSeconds, fraction = this.jitterFraction) {
    if (!baseTtlSeconds || baseTtlSeconds <= 0) return 0;
    const delta = (Math.random() * 2 - 1) * fraction;
    return Math.max(1, Math.round(baseTtlSeconds * (1 + delta)));
  }

  /**
   * Cache-Aside with Single-Flight Stampede Protection.
   * If multiple concurrent calls request the same missing key, only one loader runs.
   *
   * @param {string} key - Cache key.
   * @param {Function} loaderFn - Async function to compute/fetch data if missing.
   * @param {Object} [options]
   * @param {number} [options.ttlSeconds] - Base TTL in seconds.
   * @param {boolean} [options.useLfu=false] - Whether to use LFU instead of LRU for L1.
   * @param {number} [options.jitter] - Custom jitter fraction.
   * @returns {Promise<*>}
   */
  async wrap(key, loaderFn, options = {}) {
    const {
      ttlSeconds = this.defaultTtlSeconds,
      useLfu = false,
      jitter = this.jitterFraction,
    } = options;

    const l1Cache = useLfu ? this.lfu : this.lru;

    // 1. Check L1 in-process cache (fastest)
    const l1Val = l1Cache.get(key);
    if (l1Val !== undefined) {
      return l1Val;
    }

    // 2. Check L2 Redis cache
    try {
      const redis = getRedisClient();
      const raw = await redis.get(key);
      if (raw !== null && raw !== undefined) {
        this.l2Hits++;
        const parsed = JSON.parse(raw);
        l1Cache.set(key, parsed, ttlSeconds * 1000);
        return parsed;
      }
      this.l2Misses++;
    } catch (err) {
      this.l2Misses++;
      logger.warn('L2 cache read error', { key, error: err.message });
    }

    // 3. Stampede Protection: Single-Flight promise coalescing
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const flightPromise = (async () => {
      try {
        const computed = await loaderFn();
        if (computed !== undefined && computed !== null) {
          const jitteredTtl = this.addJitter(ttlSeconds, jitter);
          const ttlMs = jitteredTtl * 1000;

          // Write to L1
          l1Cache.set(key, computed, ttlMs);

          // Write to L2
          try {
            const redis = getRedisClient();
            await redis.set(key, JSON.stringify(computed), 'EX', jitteredTtl);
          } catch (err) {
            logger.warn('L2 cache write error', { key, error: err.message });
          }
        }
        return computed;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, flightPromise);
    return flightPromise;
  }

  /**
   * Retrieves an item from L1 or L2.
   * @param {string} key
   * @param {boolean} [useLfu=false]
   * @returns {Promise<*>}
   */
  async get(key, useLfu = false) {
    const l1Cache = useLfu ? this.lfu : this.lru;
    const l1Val = l1Cache.get(key);
    if (l1Val !== undefined) return l1Val;

    try {
      const redis = getRedisClient();
      const raw = await redis.get(key);
      if (raw !== null && raw !== undefined) {
        this.l2Hits++;
        const parsed = JSON.parse(raw);
        l1Cache.set(key, parsed);
        return parsed;
      }
      this.l2Misses++;
    } catch {
      this.l2Misses++;
    }
    return undefined;
  }

  /**
   * Stores an item into L1 and L2.
   * @param {string} key
   * @param {*} value
   * @param {Object} [options]
   */
  async set(key, value, options = {}) {
    const {
      ttlSeconds = this.defaultTtlSeconds,
      useLfu = false,
      jitter = this.jitterFraction,
    } = options;
    const l1Cache = useLfu ? this.lfu : this.lru;
    const jitteredTtl = this.addJitter(ttlSeconds, jitter);

    l1Cache.set(key, value, jitteredTtl * 1000);

    try {
      const redis = getRedisClient();
      await redis.set(key, JSON.stringify(value), 'EX', jitteredTtl);
    } catch (err) {
      logger.warn('L2 cache set error', { key, error: err.message });
    }
  }

  /**
   * Deletes a key from L1 and L2.
   * @param {string} key
   */
  async del(key) {
    this.lru.delete(key);
    this.lfu.delete(key);
    try {
      const redis = getRedisClient();
      await redis.del(key);
    } catch (err) {
      logger.warn('L2 cache del error', { key, error: err.message });
    }
  }

  /**
   * Invalidates all keys matching a prefix.
   * @param {string} prefix
   */
  async invalidatePrefix(prefix) {
    // Purge L1 LRU & LFU
    for (const k of this.lru.keys()) {
      if (k.startsWith(prefix)) this.lru.delete(k);
    }
    for (const k of this.lfu.keys()) {
      if (k.startsWith(prefix)) this.lfu.delete(k);
    }
    // Purge L2
    try {
      const redis = getRedisClient();
      if (redis.store instanceof Map) {
        for (const k of redis.store.keys()) {
          if (k.startsWith(prefix)) await redis.del(k);
        }
      }
    } catch (err) {
      logger.warn('L2 prefix invalidation error', { prefix, error: err.message });
    }
  }

  /**
   * Returns cache metrics.
   * @returns {Object}
   */
  getStats() {
    const l1Lru = this.lru.stats();
    const l1Lfu = this.lfu.stats();
    const l2Total = this.l2Hits + this.l2Misses;
    const l2HitRatio = l2Total > 0 ? this.l2Hits / l2Total : 0;

    return {
      l1: {
        lru: l1Lru,
        lfu: l1Lfu,
      },
      l2: {
        hits: this.l2Hits,
        misses: this.l2Misses,
        hitRatio: Number(l2HitRatio.toFixed(4)),
      },
      inFlightCount: this.inFlight.size,
    };
  }

  /**
   * Clears all caches.
   */
  async clear() {
    this.lru.clear();
    this.lfu.clear();
    this.inFlight.clear();
    this.l2Hits = 0;
    this.l2Misses = 0;
    try {
      const redis = getRedisClient();
      await redis.flushall();
    } catch {}
  }
}

// Export singleton instance and class
const cacheService = new CacheService();

module.exports = {
  CacheService,
  cacheService,
};
