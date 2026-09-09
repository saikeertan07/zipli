/**
 * @file tokenBudget.js
 * @description Per-user/day token budget tracker in Redis (P0).
 * Enforces strict usage caps to prevent billing spikes and DDoS token exhaustion.
 */

const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const IN_MEMORY_BUDGETS = new Map();

class TokenBudgetManager {
  constructor(options = {}) {
    this.defaultDailyLimit = options.dailyLimit || parseInt(process.env.AI_DAILY_TOKEN_BUDGET, 10) || 50000;
  }

  /**
   * Generates key formatted by date (UTC).
   */
  _getKey(identifier) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `ai:budget:${identifier}:${dateStr}`;
  }

  /**
   * Checks if user/IP has remaining token budget.
   * @param {string} identifier - e.g. "user:123" or "ip:192.168.1.1"
   * @param {number} [estimatedTokens=100]
   * @returns {Promise<{ allowed: boolean, currentUsage: number, limit: number, remaining: number }>}
   */
  async checkBudget(identifier, estimatedTokens = 100) {
    const key = this._getKey(identifier);
    const limit = this.defaultDailyLimit;

    try {
      const redis = getRedisClient();
      if (redis) {
        const current = parseInt(await redis.get(key), 10) || 0;
        const allowed = current + estimatedTokens <= limit;
        return {
          allowed,
          currentUsage: current,
          limit,
          remaining: Math.max(0, limit - current),
        };
      }
    } catch (err) {
      logger.warn('Redis token budget lookup failed, checking in-memory fallback', { error: err.message });
    }

    const current = IN_MEMORY_BUDGETS.get(key) || 0;
    const allowed = current + estimatedTokens <= limit;
    return {
      allowed,
      currentUsage: current,
      limit,
      remaining: Math.max(0, limit - current),
    };
  }

  /**
   * Records token usage after completion.
   * @param {string} identifier
   * @param {number} tokensUsed
   */
  async recordUsage(identifier, tokensUsed = 0) {
    if (!tokensUsed || tokensUsed <= 0) return;
    const key = this._getKey(identifier);

    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.incrby(key, tokensUsed);
        await redis.expire(key, 86400); // 24 hours
        return;
      }
    } catch (err) {
      logger.warn('Failed to record token usage in Redis', { error: err.message });
    }

    const current = IN_MEMORY_BUDGETS.get(key) || 0;
    IN_MEMORY_BUDGETS.set(key, current + tokensUsed);
  }

  /**
   * Clears in-memory budgets (for tests).
   */
  clear() {
    IN_MEMORY_BUDGETS.clear();
  }
}

const tokenBudgetManager = new TokenBudgetManager();

module.exports = {
  TokenBudgetManager,
  tokenBudgetManager,
};
