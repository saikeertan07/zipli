/**
 * @file rateLimiters.js
 * @description Pure Token Bucket and Sliding-Window limiters for rider surge throttling
 * and dispatch capacity protection.
 * Zero external dependencies.
 */

class TokenBucketLimiter {
  /**
   * @param {Object} [config]
   * @param {number} [config.capacity=30] - Maximum burst capacity
   * @param {number} [config.refillRatePerSec=2] - Refill rate in tokens/sec
   */
  constructor(config = {}) {
    this.capacity = Math.max(1, Number(config.capacity) || 30);
    this.refillRatePerSec = Math.max(0.1, Number(config.refillRatePerSec) || 2);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refills bucket based on elapsed wall time.
   * @param {number} [now=Date.now()]
   * @private
   */
  _refill(now = Date.now()) {
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
      this.lastRefill = now;
    }
  }

  /**
   * Attempts to consume N tokens from the bucket.
   *
   * @param {number} [tokensToConsume=1]
   * @param {number} [now=Date.now()]
   * @returns {{ allowed: boolean, remainingTokens: number, retryAfterSec: number }}
   */
  consume(tokensToConsume = 1, now = Date.now()) {
    this._refill(now);
    const count = Math.max(1, Math.floor(tokensToConsume));

    if (this.tokens >= count) {
      this.tokens -= count;
      return {
        allowed: true,
        remainingTokens: Math.floor(this.tokens),
        retryAfterSec: 0,
      };
    }

    const deficit = count - this.tokens;
    const retryAfterSec = Math.ceil((deficit / this.refillRatePerSec) * 10) / 10;

    return {
      allowed: false,
      remainingTokens: Math.floor(this.tokens),
      retryAfterSec,
    };
  }

  /**
   * Returns admin-visible capacity status gauge.
   * @param {number} [now=Date.now()]
   * @returns {{ capacity: number, availableTokens: number, fillPercent: number, isThrottling: boolean }}
   */
  getCapacityGauge(now = Date.now()) {
    this._refill(now);
    const available = Math.floor(this.tokens);
    const percent = Math.round((available / this.capacity) * 100);

    return {
      capacity: this.capacity,
      availableTokens: available,
      fillPercent: percent,
      isThrottling: available <= 2,
    };
  }
}

class SlidingWindowLogLimiter {
  /**
   * @param {Object} [config]
   * @param {number} [config.windowSeconds=60] - Sliding window duration in seconds
   * @param {number} [config.maxOrders=50] - Maximum orders permitted within the window
   */
  constructor(config = {}) {
    this.windowMs = Math.max(1, Number(config.windowSeconds) || 60) * 1000;
    this.maxOrders = Math.max(1, Number(config.maxOrders) || 50);
    this.timestamps = [];
  }

  /**
   * Cleans expired timestamps outside current sliding window.
   * @param {number} now
   * @private
   */
  _clean(now) {
    const threshold = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] <= threshold) {
      this.timestamps.shift();
    }
  }

  /**
   * Attempts to register an order event within the sliding window.
   *
   * @param {number} [now=Date.now()]
   * @returns {{ allowed: boolean, currentCount: number, maxOrders: number, remaining: number }}
   */
  tryAcquire(now = Date.now()) {
    this._clean(now);

    if (this.timestamps.length < this.maxOrders) {
      this.timestamps.push(now);
      return {
        allowed: true,
        currentCount: this.timestamps.length,
        maxOrders: this.maxOrders,
        remaining: this.maxOrders - this.timestamps.length,
      };
    }

    return {
      allowed: false,
      currentCount: this.timestamps.length,
      maxOrders: this.maxOrders,
      remaining: 0,
    };
  }

  /**
   * Returns current active load in the sliding window.
   * @param {number} [now=Date.now()]
   * @returns {number}
   */
  getCurrentCount(now = Date.now()) {
    this._clean(now);
    return this.timestamps.length;
  }
}

module.exports = {
  TokenBucketLimiter,
  SlidingWindowLogLimiter,
};
