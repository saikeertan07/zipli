const { createRateLimiter } = require('../../src/middleware/rateLimit');

describe('rateLimit.js middleware unit tests', () => {
  it('extracts key from user object if present', () => {
    let passedKey = null;
    const mockGcra = {
      consume: (k) => {
        passedKey = k;
        return {
          allowed: true,
          headers: { 'RateLimit-Limit': '10' },
        };
      },
    };

    const limiter = createRateLimiter(mockGcra);
    const req = {
      baseUrl: '/api',
      path: '/orders',
      user: { id: 99 },
    };
    const res = { setHeader: jest.fn() };
    let nextCalled = false;

    limiter(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(passedKey).toBe('/api/orders:user:99');
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '10');
  });

  it('extracts key from Bearer token if user object is not yet attached', () => {
    let passedKey = null;
    const mockGcra = {
      consume: (k) => {
        passedKey = k;
        return { allowed: true, headers: {} };
      },
    };

    const limiter = createRateLimiter(mockGcra);
    // JWT with sub: 123 in payload
    const tokenPayload = Buffer.from(JSON.stringify({ sub: 123 })).toString('base64');
    const req = {
      baseUrl: '/api',
      path: '/test',
      headers: { authorization: `Bearer header.${tokenPayload}.sig` },
    };

    limiter(req, { setHeader: jest.fn() }, () => {});
    expect(passedKey).toBe('/api/test:user:123');
  });

  it('extracts key from x-forwarded-for header or fallback IP', () => {
    let passedKey = null;
    const mockGcra = {
      consume: (k) => {
        passedKey = k;
        return { allowed: true, headers: {} };
      },
    };

    const limiter = createRateLimiter(mockGcra);
    const reqXff = {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
    };
    limiter(reqXff, { setHeader: jest.fn() }, () => {});
    expect(passedKey).toBe(':ip:203.0.113.195');

    const reqIp = { ip: '192.168.1.1', headers: {} };
    limiter(reqIp, { setHeader: jest.fn() }, () => {});
    expect(passedKey).toBe(':ip:192.168.1.1');

    const reqBare = {};
    limiter(reqBare, { setHeader: jest.fn() }, () => {});
    expect(passedKey).toBe(':ip:127.0.0.1');
  });

  it('returns 429 when rate limit is exceeded', () => {
    const mockGcra = {
      consume: () => ({
        allowed: false,
        retryAfterSeconds: 30,
        headers: { 'RateLimit-Remaining': '0', 'Retry-After': '30' },
      }),
    };

    const limiter = createRateLimiter(mockGcra);
    const req = { headers: {} };
    let statusSet = null;
    let jsonBody = null;
    const res = {
      setHeader: jest.fn(),
      status: (code) => {
        statusSet = code;
        return {
          json: (body) => {
            jsonBody = body;
          },
        };
      },
    };

    let nextCalled = false;
    limiter(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusSet).toBe(429);
    expect(jsonBody.status).toBe('error');
    expect(jsonBody.retryAfter).toBe(30);
    expect(jsonBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('extracts key from httpOnly accessToken cookie if user object is not yet attached', () => {
    let passedKey = null;
    const mockGcra = {
      consume: (k) => {
        passedKey = k;
        return { allowed: true, headers: {} };
      },
    };

    const limiter = createRateLimiter(mockGcra);
    const tokenPayload = Buffer.from(JSON.stringify({ sub: 789 })).toString('base64');
    const req = {
      baseUrl: '/api',
      path: '/cart',
      cookies: { accessToken: `header.${tokenPayload}.sig` },
    };

    limiter(req, { setHeader: jest.fn() }, () => {});
    expect(passedKey).toBe('/api/cart:user:789');
  });
});
