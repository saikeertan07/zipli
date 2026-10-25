const {
  isRequestCacheable,
  isResponseCacheable,
  getStaleCacheKeys,
} = require('../../../frontend/js/utils/swCachePolicy.js');

describe('Service Worker Cache Hygiene & Privacy Policy (F-023, SEC-AUTH-04)', () => {
  describe('HTTP Method Isolation', () => {
    it('allows GET requests', () => {
      expect(isRequestCacheable({ method: 'GET', url: 'https://example.com/index.html' })).toBe(
        true
      );
    });

    it('rejects state-changing methods (POST, PUT, DELETE, PATCH)', () => {
      ['POST', 'PUT', 'DELETE', 'PATCH'].forEach((method) => {
        expect(isRequestCacheable({ method, url: 'https://example.com/api/products' })).toBe(false);
      });
    });
  });

  describe('Authentication & Personal Data (PII) Protection', () => {
    it('strictly forbids caching requests with an Authorization header', () => {
      const request = {
        method: 'GET',
        url: 'https://example.com/api/products',
        headers: {
          get: (name) => (name.toLowerCase() === 'authorization' ? 'Bearer secret_token' : null),
        },
      };
      expect(isRequestCacheable(request)).toBe(false);
    });

    it('strictly forbids caching plain object request with authorization header', () => {
      const request = {
        method: 'GET',
        url: 'https://example.com/api/products',
        headers: {
          Authorization: 'Bearer secret_token_xyz',
        },
      };
      expect(isRequestCacheable(request)).toBe(false);
    });
  });

  describe('Sensitive Endpoint Blocklist', () => {
    const SENSITIVE_ENDPOINTS = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/mfa/verify',
      '/api/cart',
      '/api/cart/items',
      '/api/cart/checkout/reserve',
      '/api/orders',
      '/api/orders/123',
      '/api/orders/track/123',
      '/api/users/me',
      '/api/users/profile',
      '/api/users/gdpr-export',
      '/api/admin/metrics',
      '/api/admin/orders',
      '/api/admin/audit-logs',
      '/api/security/audit-chain',
      '/api/payments/verify',
      '/api/payments/webhook',
      '/api/notifications',
      '/api/sse/order-stream',
    ];

    SENSITIVE_ENDPOINTS.forEach((endpoint) => {
      it(`never caches sensitive route: ${endpoint}`, () => {
        expect(
          isRequestCacheable({
            method: 'GET',
            url: `https://zipli.in${endpoint}`,
          })
        ).toBe(false);
      });
    });
  });

  describe('Allowlisted Public Catalog & Static Assets', () => {
    it('permits caching public anonymous product catalog routes', () => {
      expect(isRequestCacheable({ method: 'GET', url: 'https://zipli.in/api/products' })).toBe(
        true
      );
      expect(isRequestCacheable({ method: 'GET', url: 'https://zipli.in/api/products/42' })).toBe(
        true
      );
      expect(isRequestCacheable({ method: 'GET', url: 'https://zipli.in/api/v1/products' })).toBe(
        true
      );
    });

    it('permits caching public category routes', () => {
      expect(isRequestCacheable({ method: 'GET', url: 'https://zipli.in/api/categories' })).toBe(
        true
      );
    });

    it('permits caching static frontend shell assets', () => {
      const STATIC_FILES = [
        '/',
        '/index.html',
        '/css/style.css',
        '/js/app.js',
        '/js/utils/dom.js',
        '/images/banana.jpg',
      ];
      STATIC_FILES.forEach((file) => {
        expect(isRequestCacheable({ method: 'GET', url: `https://zipli.in${file}` })).toBe(true);
      });
    });
  });

  describe('Response Header Cache Hygiene', () => {
    it('accepts clean 200 OK responses with public cache headers', () => {
      const response = {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
        },
      };
      expect(isResponseCacheable(response)).toBe(true);
    });

    it('rejects responses with non-200 status codes', () => {
      expect(isResponseCacheable({ status: 500, headers: {} })).toBe(false);
      expect(isResponseCacheable({ status: 404, headers: {} })).toBe(false);
      expect(isResponseCacheable({ status: 304, headers: {} })).toBe(false);
    });

    it('rejects responses containing Cache-Control: no-store', () => {
      const response = {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      };
      expect(isResponseCacheable(response)).toBe(false);
    });

    it('rejects responses containing Cache-Control: private', () => {
      const response = {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=0',
        },
      };
      expect(isResponseCacheable(response)).toBe(false);
    });

    it('rejects responses containing Set-Cookie headers', () => {
      const response = {
        status: 200,
        headers: {
          'Set-Cookie': 'session=abc; HttpOnly',
        },
      };
      expect(isResponseCacheable(response)).toBe(false);
    });
  });

  describe('Cache Versioning & Activation Pruning', () => {
    it('identifies and purges all obsolete cache versions on activation', () => {
      const existingKeys = ['zipli-pro-v1', 'zipli-pro-v2', 'zipli-pro-v3', 'unrelated-cache'];
      const stale = getStaleCacheKeys(existingKeys, 'zipli-pro-v3');

      expect(stale).toEqual(['zipli-pro-v1', 'zipli-pro-v2', 'unrelated-cache']);
      expect(stale).not.toContain('zipli-pro-v3');
    });

    it('handles empty or single-version cache arrays safely', () => {
      expect(getStaleCacheKeys([], 'zipli-pro-v3')).toEqual([]);
      expect(getStaleCacheKeys(['zipli-pro-v3'], 'zipli-pro-v3')).toEqual([]);
    });
  });
});
