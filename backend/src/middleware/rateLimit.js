/**
 * @file rateLimit.js
 * @description Rate Limiting Middleware powered by pure GCRA (Generic Cell Rate Algorithm / Leaky Bucket).
 * Sets standard IETF / RFC 6585 headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After).
 */

const { GCRA, POLICIES } = require('../algo/gcra');

/**
 * Safely extracts client IP from headers or connection.
 * @param {Object} req
 * @returns {string}
 */
function extractClientIp(req) {
  if (req && req.headers && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return (req && req.ip) || '127.0.0.1';
}

/**
 * Creates an Express middleware using a GCRA instance.
 *
 * @param {GCRA|Object} gcraOrConfig
 * @param {Function} [keyExtractor]
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(gcraOrConfig, keyExtractor) {
  const gcra =
    gcraOrConfig && typeof gcraOrConfig.consume === 'function'
      ? gcraOrConfig
      : new GCRA(gcraOrConfig);

  const defaultKeyExtractor = (req) => {
    if (req && req.user && req.user.id) {
      return `user:${req.user.id}`;
    }

    // Inspect Authorization Bearer token to partition by user ID before requireAuth
    if (
      req &&
      req.headers &&
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      try {
        const token = req.headers.authorization.slice(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload && payload.sub) {
            return `user:${payload.sub}`;
          }
        }
      } catch {
        // Fall back to IP if token is malformed
      }
    }

    // Inspect httpOnly accessToken cookie to partition by user ID
    if (req && req.cookies && req.cookies.accessToken) {
      try {
        const parts = req.cookies.accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload && payload.sub) {
            return `user:${payload.sub}`;
          }
        }
      } catch {
        // Fall back to IP
      }
    }

    return `ip:${extractClientIp(req)}`;
  };

  const getKey = keyExtractor || defaultKeyExtractor;

  return async (req, res, next) => {
    const key = `${(req && req.baseUrl) || ''}${(req && req.path) || ''}:${getKey(req)}`;
    const isAsync =
      typeof gcra.consumeAsync === 'function' &&
      gcra.store &&
      gcra.store.get &&
      gcra.store.get.constructor.name === 'AsyncFunction';
    const result = isAsync ? await gcra.consumeAsync(key, 1) : gcra.consume(key, 1);

    // Attach standard rate limit headers
    if (res && typeof res.setHeader === 'function') {
      for (const [header, val] of Object.entries(result.headers)) {
        res.setHeader(header, val);
      }
    }

    if (!result.allowed) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many attempts. Please try again later.',
        retryAfter: result.retryAfterSeconds,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many attempts. Please try again later.',
          requestId: (req && req.headers && req.headers['x-request-id']) || null,
          details: { retryAfter: result.retryAfterSeconds },
        },
      });
    }

    next();
  };
}

// Pre-configured rate limiters
// Auth: 50 requests burst for login shields
const authLimiter = createRateLimiter({ limit: 50, periodMs: 60000, burst: 50 }, (req) => {
  return `auth_ip:${extractClientIp(req)}`;
});

const orderLimiter = createRateLimiter(POLICIES.ORDERS);

const searchLimiter = createRateLimiter(POLICIES.SEARCH);

const generalLimiter = createRateLimiter(POLICIES.GENERAL);

// Assistant Rate Limiter: stricter for unauthenticated guests (P0)
const assistantUserGCRA = new GCRA({ limit: 30, periodMs: 60000, burst: 30 });
const assistantGuestGCRA = new GCRA({ limit: 10, periodMs: 60000, burst: 10 });

const assistantLimiter = async (req, res, next) => {
  const isAuth = Boolean(
    (req && req.user && req.user.id) ||
      (req && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) ||
      (req && req.cookies && req.cookies.accessToken)
  );
  const limiter = isAuth ? assistantUserGCRA : assistantGuestGCRA;
  const ip = extractClientIp(req);
  const identifier = isAuth ? (req.user ? `user:${req.user.id}` : `token:${ip}`) : `guest_ip:${ip}`;
  const key = `assistant:${identifier}`;

  const result = limiter.consume(key, 1);

  if (res && typeof res.setHeader === 'function') {
    for (const [header, val] of Object.entries(result.headers)) {
      res.setHeader(header, val);
    }
  }

  if (!result.allowed) {
    return res.status(429).json({
      status: 'error',
      message: 'Assistant query rate limit exceeded. Please wait a moment before asking again.',
      retryAfter: result.retryAfterSeconds,
      error: {
        code: 'ASSISTANT_RATE_LIMIT_EXCEEDED',
        message: 'Assistant query rate limit exceeded.',
        tier: isAuth ? 'authenticated' : 'guest',
        details: { retryAfter: result.retryAfterSeconds },
      },
    });
  }

  next();
};

module.exports = {
  createRateLimiter,
  extractClientIp,
  authLimiter,
  orderLimiter,
  searchLimiter,
  generalLimiter,
  assistantLimiter,
};
