/**
 * @file security-headers.test.js
 * @description Integration tests for HTTP security headers and CORS hardening (SEC-IO-04, SEC-IO-05, SEC-IO-06).
 */

const request = require('supertest');
const app = require('../../src/app');

describe('HTTP Security Headers & CORS Suite (SEC-IO-04, SEC-IO-05, SEC-IO-06)', () => {
  it('enforces strict Content Security Policy, HSTS, and frame protections', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);

    // HSTS (SEC-IO-05)
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['strict-transport-security']).toContain('preload');

    // Content Security Policy (SEC-IO-04)
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");

    // X-Content-Type-Options & Referrer-Policy
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // COOP & CORP (SEC-IO-05)
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');

    // Permissions-Policy (SEC-IO-05)
    expect(res.headers['permissions-policy']).toBeDefined();
    expect(res.headers['permissions-policy']).toContain('geolocation=(self)');
  });

  it('configures safe CORS with modest preflight cache and rejects wildcard credentials (SEC-IO-06)', async () => {
    const res = await request(app)
      .options('/api/v1/cart')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');

    // Preflight returns 204 or 200
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    // Origin must never be '*' when credentials are true
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-max-age']).toBe('600');
  });
});
