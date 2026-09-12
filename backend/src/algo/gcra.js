/**
 * @file gcra.js
 * @description Pure Generic Cell Rate Algorithm (GCRA / Leaky Bucket) rate limiter.
 *
 * Implements:
 * 1. Theoretical Arrival Time (TAT) tracking
 * 2. Emission interval T and burst tolerance tau (τ)
 * 3. Exact conforming/non-conforming rate decision
 * 4. Pluggable in-memory store with TTL pruning and Redis adapter support
 * 5. IETF / RFC 6585 standard RateLimit headers generation
 *
 * Mathematical formulation:
 * - T = period / limit (emission interval between cells)
 * - tau = (burst - 1) * T (burst tolerance allowing up to burst cells at once)
 * - If (TAT - now) > tau: non-conforming (rejected)
 * - Else: conforming, newTAT = max(now, TAT) + T
 */

class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  /**
   * Retrieves TAT for key, returns undefined if absent or expired.
   * @param {string} key
   * @param {number} [now]
   * @returns {number|undefined}
   */
  get(key, now = Date.now()) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return entry.tat;
  }

  /**
   * Sets TAT for key with expiresAt timestamp.
   * @param {string} key
   * @param {number} tat
   * @param {number} ttlMs
   * @param {number} [now]
   */
  set(key, tat, ttlMs, now = Date.now()) {
    this.store.set(key, {
      tat,
      expiresAt: now + ttlMs,
    });
  }

  /**
   * Deletes a key from the store.
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Prunes all expired entries.
   * @param {number} [now]
   * @returns {number} Count of removed keys
   */
  cleanup(now = Date.now()) {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt <= now) {
        this.store.delete(k);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clears the entire store.
   */
  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

/**
 * Distributed Redis store adapter for GCRA rate limiting across instances.
 */
class RedisGCRAStore {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async get(key, now = Date.now()) {
    try {
      const val = await this.redis.get(`gcra:${key}`);
      if (!val) return undefined;
      const tat = Number(val);
      if (isNaN(tat) || tat <= now) return undefined;
      return tat;
    } catch {
      return undefined;
    }
  }

  async set(key, tat, ttlMs) {
    try {
      const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
      await this.redis.set(`gcra:${key}`, String(tat), 'EX', ttlSec);
    } catch {}
  }

  async delete(key) {
    try {
      await this.redis.del(`gcra:${key}`);
    } catch {}
  }
}

class GCRA {
  /**
   * @param {Object} [options]
   * @param {number} [options.limit=60] - Number of requests allowed per period
   * @param {number} [options.periodMs=60000] - Window duration in milliseconds (default 1 min)
   * @param {number} [options.burst] - Max burst allowance (defaults to limit)
   * @param {number} [options.T] - Direct emission interval in ms (overrides limit/period)
   * @param {number} [options.tau] - Direct burst tolerance in ms
   * @param {Object} [options.store] - Store adapter (defaults to internal MemoryStore)
   */
  constructor(options = {}) {
    this.limit = options.limit || 60;
    this.periodMs = options.periodMs || 60000;
    this.burst = options.burst !== undefined ? options.burst : this.limit;

    // Emission interval T: time between cells at normal rate
    this.T =
      options.T !== undefined ? options.T : Math.max(1, Math.floor(this.periodMs / this.limit));

    // Burst tolerance tau: maximum advance delay permitted
    if (options.tau !== undefined) {
      this.tau = options.tau;
    } else {
      const burstCount = Math.max(1, this.burst);
      this.tau = (burstCount - 1) * this.T;
    }

    this.store = options.store || new MemoryStore();
  }

  /**
   * Evaluates an incoming cell request for the given identifier key.
   *
   * @param {string} key - Identifier (e.g. IP, userId, route:IP)
   * @param {number} [cost=1] - Number of cells consumed (default 1)
   * @param {number} [now] - Current timestamp (defaults to Date.now())
   * @returns {{
   *   allowed: boolean,
   *   limit: number,
   *   remaining: number,
   *   resetMs: number,
   *   resetSeconds: number,
   *   retryAfterMs: number,
   *   retryAfterSeconds: number,
   *   headers: Object
   * }}
   */
  consume(key, cost = 1, now = Date.now()) {
    const costIncrement = cost * this.T;
    const existingTat = this.store.get(key, now);
    const tat = existingTat !== undefined ? existingTat : now;

    // Check if request violates burst tolerance
    if (tat - now > this.tau) {
      const retryAfterMs = Math.max(0, tat - now - this.tau);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      const resetMs = Math.max(0, tat - now);
      const resetSeconds = Math.ceil((now + resetMs) / 1000);

      return {
        allowed: false,
        limit: this.burst,
        remaining: 0,
        resetMs,
        resetSeconds,
        retryAfterMs,
        retryAfterSeconds,
        headers: {
          'RateLimit-Limit': String(this.burst),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': String(resetSeconds),
          'Retry-After': String(retryAfterSeconds),
        },
      };
    }

    // Allowed: advance TAT
    const newTat = Math.max(now, tat) + costIncrement;
    const ttlMs = Math.max(this.periodMs, newTat - now + this.T);
    this.store.set(key, newTat, ttlMs, now);

    const resetMs = Math.max(0, newTat - now);
    const resetSeconds = Math.ceil((now + resetMs) / 1000);

    // Calculate remaining tokens within current burst allowance
    const remainingTime = Math.max(0, this.tau + this.T - (newTat - now));
    const remaining = Math.max(0, Math.floor(remainingTime / this.T));

    return {
      allowed: true,
      limit: this.burst,
      remaining,
      resetMs,
      resetSeconds,
      retryAfterMs: 0,
      retryAfterSeconds: 0,
      headers: {
        'RateLimit-Limit': String(this.burst),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(resetSeconds),
      },
    };
  }

  /**
   * Async variant supporting asynchronous stores (e.g. RedisGCRAStore).
   *
   * @param {string} key
   * @param {number} [cost=1]
   * @param {number} [now]
   * @returns {Promise<Object>}
   */
  async consumeAsync(key, cost = 1, now = Date.now()) {
    const costIncrement = cost * this.T;
    let existingTat;
    if (this.store && typeof this.store.get === 'function') {
      existingTat = await this.store.get(key, now);
    }
    const tat = existingTat !== undefined ? existingTat : now;

    if (tat - now > this.tau) {
      const retryAfterMs = Math.max(0, tat - now - this.tau);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      const resetMs = Math.max(0, tat - now);
      const resetSeconds = Math.ceil((now + resetMs) / 1000);

      return {
        allowed: false,
        limit: this.burst,
        remaining: 0,
        resetMs,
        resetSeconds,
        retryAfterMs,
        retryAfterSeconds,
        headers: {
          'RateLimit-Limit': String(this.burst),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': String(resetSeconds),
          'Retry-After': String(retryAfterSeconds),
        },
      };
    }

    const newTat = Math.max(now, tat) + costIncrement;
    const ttlMs = Math.max(this.periodMs, newTat - now + this.T);
    if (this.store && typeof this.store.set === 'function') {
      await this.store.set(key, newTat, ttlMs, now);
    }

    const resetMs = Math.max(0, newTat - now);
    const resetSeconds = Math.ceil((now + resetMs) / 1000);

    const remainingTime = Math.max(0, this.tau + this.T - (newTat - now));
    const remaining = Math.max(0, Math.floor(remainingTime / this.T));

    return {
      allowed: true,
      limit: this.burst,
      remaining,
      resetMs,
      resetSeconds,
      retryAfterMs: 0,
      retryAfterSeconds: 0,
      headers: {
        'RateLimit-Limit': String(this.burst),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(resetSeconds),
      },
    };
  }

  /**
   * Resets rate limit for key.
   * @param {string} key
   */
  reset(key) {
    if (this.store && typeof this.store.delete === 'function') {
      this.store.delete(key);
    }
  }
}

/**
 * Pre-configured rate limiting policies for Zipli routes
 */
const POLICIES = {
  // Auth: 5 requests per 60s per IP (strict brute-force shield)
  AUTH: {
    limit: 5,
    periodMs: 60000,
    burst: 5,
  },
  // Orders: 10 requests per 60s per user (prevent inventory hogging)
  ORDERS: {
    limit: 10,
    periodMs: 60000,
    burst: 10,
  },
  // Search: 30 requests per 60s per client (FTS autocomplete shield)
  SEARCH: {
    limit: 30,
    periodMs: 60000,
    burst: 30,
  },
  // General: 120 requests per 60s per client (general browsing API)
  GENERAL: {
    limit: 120,
    periodMs: 60000,
    burst: 120,
  },
};

module.exports = {
  MemoryStore,
  RedisGCRAStore,
  GCRA,
  POLICIES,
};
