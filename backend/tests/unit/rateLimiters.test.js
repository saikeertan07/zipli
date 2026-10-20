const { TokenBucketLimiter, SlidingWindowLogLimiter } = require('../../src/algo/rateLimiters');

describe('rateLimiters.js pure limiters', () => {
  describe('TokenBucketLimiter', () => {
    it('initializes with default capacity 30 and refill rate 2 tokens/sec', () => {
      const limiter = new TokenBucketLimiter();
      expect(limiter.capacity).toBe(30);
      expect(limiter.refillRatePerSec).toBe(2);

      const gauge = limiter.getCapacityGauge();
      expect(gauge.capacity).toBe(30);
      expect(gauge.availableTokens).toBe(30);
      expect(gauge.fillPercent).toBe(100);
      expect(gauge.isThrottling).toBe(false);
    });

    it('initializes with custom parameters and sanitizes values', () => {
      const limiter = new TokenBucketLimiter({ capacity: 10, refillRatePerSec: 1 });
      expect(limiter.capacity).toBe(10);
      expect(limiter.refillRatePerSec).toBe(1);

      const badLimiter = new TokenBucketLimiter({ capacity: -5, refillRatePerSec: -1 });
      expect(badLimiter.capacity).toBe(1);
      expect(badLimiter.refillRatePerSec).toBe(0.1);
    });

    it('consumes tokens and throttles when depleted', () => {
      const t0 = 1000000;
      const limiter = new TokenBucketLimiter({ capacity: 5, refillRatePerSec: 1 });
      limiter.lastRefill = t0;

      // Consume 3 tokens
      const res1 = limiter.consume(3, t0);
      expect(res1.allowed).toBe(true);
      expect(res1.remainingTokens).toBe(2);
      expect(res1.retryAfterSec).toBe(0);

      // Consume with default 1 token
      const res2 = limiter.consume(1, t0);
      expect(res2.allowed).toBe(true);
      expect(res2.remainingTokens).toBe(1);

      // Consume 1 more token
      const res3 = limiter.consume(1, t0);
      expect(res3.allowed).toBe(true);
      expect(res3.remainingTokens).toBe(0);

      // Gauge should now report throttling because remaining is 0 <= 2
      const gauge = limiter.getCapacityGauge(t0);
      expect(gauge.isThrottling).toBe(true);

      // Next consume should be rejected
      const res4 = limiter.consume(2, t0);
      expect(res4.allowed).toBe(false);
      expect(res4.retryAfterSec).toBeGreaterThan(0);
    });

    it('refills tokens over time up to capacity', () => {
      const t0 = 1000000;
      const limiter = new TokenBucketLimiter({ capacity: 10, refillRatePerSec: 2 });
      limiter.lastRefill = t0;

      // Drain all tokens
      limiter.consume(10, t0);
      expect(limiter.tokens).toBe(0);

      // Advance by 3 seconds (refills 6 tokens)
      const t1 = t0 + 3000;
      const res = limiter.consume(4, t1);
      expect(res.allowed).toBe(true);

      // Advance by 20 seconds (caps at capacity 10)
      const t2 = t1 + 20000;
      const gauge = limiter.getCapacityGauge(t2);
      expect(gauge.availableTokens).toBe(10);
      expect(gauge.fillPercent).toBe(100);

      // Backwards time does not refill (elapsedSec <= 0)
      limiter.consume(5, t2);
      const resPast = limiter.consume(1, t2 - 5000);
      expect(resPast.allowed).toBe(true); // Still has remaining from t2
    });

    it('supports calling consume and getCapacityGauge with default arguments', () => {
      const limiter = new TokenBucketLimiter({ capacity: 5 });
      limiter._refill(); // tests line 26 default parameter now = Date.now()
      const res = limiter.consume();
      expect(res.allowed).toBe(true);
      const gauge = limiter.getCapacityGauge();
      expect(gauge.availableTokens).toBe(4);
    });
  });

  describe('SlidingWindowLogLimiter', () => {
    it('initializes with default 60s window and 50 max orders', () => {
      const limiter = new SlidingWindowLogLimiter();
      expect(limiter.windowMs).toBe(60000);
      expect(limiter.maxOrders).toBe(50);
      expect(limiter.getCurrentCount()).toBe(0);
    });

    it('initializes with custom parameters and sanitizes values', () => {
      const limiter = new SlidingWindowLogLimiter({ windowSeconds: 10, maxOrders: 3 });
      expect(limiter.windowMs).toBe(10000);
      expect(limiter.maxOrders).toBe(3);

      const badLimiter = new SlidingWindowLogLimiter({ windowSeconds: -1, maxOrders: -5 });
      expect(badLimiter.windowMs).toBe(1000);
      expect(badLimiter.maxOrders).toBe(1);
    });

    it('allows acquisitions up to maxOrders and rejects excess within the window', () => {
      const t0 = 1000000;
      const limiter = new SlidingWindowLogLimiter({ windowSeconds: 10, maxOrders: 3 });

      expect(limiter.tryAcquire(t0).allowed).toBe(true);
      expect(limiter.tryAcquire(t0 + 1000).allowed).toBe(true);
      expect(limiter.tryAcquire(t0 + 2000).allowed).toBe(true);

      expect(limiter.getCurrentCount(t0 + 2000)).toBe(3);

      // 4th acquire should fail
      const rejected = limiter.tryAcquire(t0 + 3000);
      expect(rejected.allowed).toBe(false);
      expect(rejected.remaining).toBe(0);
      expect(rejected.currentCount).toBe(3);

      // Default tryAcquire() without arg
      const defRes = limiter.tryAcquire();
      expect(defRes.allowed).toBe(true); // Date.now() is far ahead of t0
    });

    it('slides window and expires old timestamps', () => {
      const t0 = 1000000;
      const limiter = new SlidingWindowLogLimiter({ windowSeconds: 5, maxOrders: 2 });

      limiter.tryAcquire(t0);
      limiter.tryAcquire(t0 + 1000);
      expect(limiter.getCurrentCount(t0 + 2000)).toBe(2);

      // After 6 seconds from t0, first timestamp (t0) expires
      const tAfter = t0 + 5500;
      expect(limiter.getCurrentCount(tAfter)).toBe(1);

      // Can acquire again
      const res = limiter.tryAcquire(tAfter);
      expect(res.allowed).toBe(true);
      expect(res.currentCount).toBe(2);
    });
  });
});
