const request = require('supertest');
const app = require('../../src/app');
const { truncateUserData } = require('../setup');

describe('API v1 Versioning & Standardized Response Envelope Tests (WP-1)', () => {
  beforeEach(async () => {
    await truncateUserData();
  });

  describe('Route Versioning & Health Probes', () => {
    it('serves health probe on both /api/v1/health and /api/health', async () => {
      const v1Res = await request(app).get('/api/v1/health');
      expect(v1Res.status).toBe(200);
      expect(v1Res.body.status).toBe('success');

      const legacyRes = await request(app).get('/api/health');
      expect(legacyRes.status).toBe(200);
      expect(legacyRes.body.status).toBe('success');
    });

    it('returns standardized 404 error envelope on unmapped routes', async () => {
      const res = await request(app)
        .get('/api/v1/unmapped-endpoint')
        .set('x-request-id', 'req_404_test');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('/api/v1/unmapped-endpoint');
      expect(res.body.error.requestId).toBe('req_404_test');
      // Backwards-compatible status
      expect(res.body.status).toBe('error');
    });
  });

  describe('Strict Schema Enforcement & Mass-Assignment Rejection', () => {
    it('rejects unexpected fields with HTTP 422 and UNRECOGNIZED_KEYS on /api/v1/auth/register', async () => {
      const payloadWithInjectedRole = {
        name: 'Sneaky User',
        email: 'sneaky@example.com',
        password: 'Password123!',
        role: 'admin', // Injected extra key!
        is_admin: true, // Injected extra key!
      };

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(payloadWithInjectedRole)
        .set('x-request-id', 'req_blocked_inject');

      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('UNRECOGNIZED_KEYS');
      expect(res.body.error.message).toContain('role');
      expect(res.body.error.requestId).toBe('req_blocked_inject');
      expect(res.body.status).toBe('error');
    });

    it('allows valid registration on /api/v1/auth/register without extra fields', async () => {
      const validPayload = {
        name: 'Priya Patel',
        email: 'priya.patel@example.com',
        password: 'ValidPassword123',
      };

      const res = await request(app).post('/api/v1/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('priya.patel@example.com');
      expect(typeof res.body.data.token).toBe('string');
    });

    it('preserves backwards-compatibility for legacy /api/auth/register endpoint', async () => {
      const validPayload = {
        name: 'Ravi Kumar',
        email: 'ravi.kumar@example.com',
        password: 'ValidPassword123',
      };

      const res = await request(app).post('/api/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('ravi.kumar@example.com');
    });
  });

  describe('Standardized Error Envelopes for Protected Endpoints', () => {
    it('returns standardized UNAUTHORIZED error envelope on /api/v1/cart', async () => {
      const res = await request(app).get('/api/v1/cart').set('x-request-id', 'req_unauth_cart');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.requestId).toBe('req_unauth_cart');
      expect(res.body.status).toBe('error');
    });
  });
});
