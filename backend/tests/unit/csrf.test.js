const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfCookieMiddleware,
  csrfValidationMiddleware,
} = require('../../src/middleware/csrf');

describe('csrf.js Double-Submit Cookie CSRF Middleware', () => {
  describe('constants', () => {
    it('defines standard cookie and header names', () => {
      expect(CSRF_COOKIE_NAME).toBe('csrfToken');
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
    });
  });

  describe('csrfCookieMiddleware', () => {
    it('generates a new CSRF token and sets cookie when none exists', () => {
      const req = { cookies: {} };
      let cookieName, cookieVal, cookieOpts;
      const res = {
        cookie: (name, val, opts) => {
          cookieName = name;
          cookieVal = val;
          cookieOpts = opts;
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      csrfCookieMiddleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(cookieName).toBe(CSRF_COOKIE_NAME);
      expect(cookieVal).toHaveLength(48);
      expect(cookieOpts.sameSite).toBe('strict');
      expect(cookieOpts.httpOnly).toBe(false);
      expect(req.csrfToken).toBe(cookieVal);
    });

    it('reuses existing CSRF token from cookies if already present', () => {
      const req = { cookies: { csrfToken: 'existing_secret_token_123' } };
      let cookieCalled = false;
      const res = {
        cookie: () => {
          cookieCalled = true;
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      csrfCookieMiddleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(cookieCalled).toBe(false);
      expect(req.csrfToken).toBe('existing_secret_token_123');
    });
  });

  describe('csrfValidationMiddleware', () => {
    it('allows safe methods unconditionally without requiring tokens', () => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      for (const method of safeMethods) {
        const req = { method, headers: {} };
        let nextCalled = false;
        csrfValidationMiddleware(req, {}, () => {
          nextCalled = true;
        });
        expect(nextCalled).toBe(true);
      }
    });

    it('allows state-changing requests with Bearer token authentication', () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer some_jwt_token' },
      };
      let nextCalled = false;
      csrfValidationMiddleware(req, {}, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it('allows cookie-based requests when double-submit tokens match', () => {
      const token = 'valid_token_abc';
      const req = {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        cookies: { csrfToken: token },
      };
      let nextCalled = false;
      csrfValidationMiddleware(req, {}, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it('allows token passed in body._csrf when header is absent', () => {
      const token = 'valid_body_token_xyz';
      const req = {
        method: 'POST',
        headers: {},
        cookies: { csrfToken: token },
        body: { _csrf: token },
      };
      let nextCalled = false;
      csrfValidationMiddleware(req, {}, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it('rejects requests with 403 when CSRF token is missing or mismatched', () => {
      const badRequests = [
        { method: 'POST', headers: {}, cookies: {} },
        { method: 'POST', headers: { 'x-csrf-token': 'tokenA' }, cookies: { csrfToken: 'tokenB' } },
        { method: 'DELETE', headers: {}, cookies: { csrfToken: 'tokenA' } },
      ];

      for (const req of badRequests) {
        let statusSet = null;
        let responseJson = null;
        const res = {
          status: (code) => {
            statusSet = code;
            return {
              json: (data) => {
                responseJson = data;
              },
            };
          },
        };

        let nextCalled = false;
        csrfValidationMiddleware(req, res, () => {
          nextCalled = true;
        });

        expect(nextCalled).toBe(false);
        expect(statusSet).toBe(403);
        expect(responseJson.message).toMatch(/Invalid or missing CSRF token/);
      }
    });
  });
});
