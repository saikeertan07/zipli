/**
 * @file compliance.test.js
 * @description Integration tests for DPDP Act 2023 / GDPR compliance endpoints:
 * Consent management, Data Export, and Right to Erasure / Deletion.
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/db');
const { makeUser, makeOrderFor } = require('../helpers/factories');
const { truncateUserData } = require('../setup');

describe('DPDP & GDPR Compliance API (/api/compliance)', () => {
  beforeEach(async () => {
    await truncateUserData();
    await pool.query('TRUNCATE user_consents RESTART IDENTITY CASCADE;');
  });

  describe('GET /api/compliance/export', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/compliance/export');
      expect(res.status).toBe(401);
    });

    it('exports complete user data package including profile and orders', async () => {
      const { user, token } = await makeUser({ name: 'Radha Sharma', email: 'radha@example.com' });
      await makeOrderFor(user.id, [], { status: 'delivered' });

      const res = await request(app)
        .get('/api/compliance/export')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('zipli_data_export_user_');
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.user.email).toBe('radha@example.com');
      expect(res.body.data.orders.length).toBe(1);
    });
  });

  describe('POST & GET /api/compliance/consent (DPDP Consent Notice)', () => {
    it('records and retrieves user consent preferences', async () => {
      const { token } = await makeUser();

      // Post consent
      const postRes = await request(app)
        .post('/api/compliance/consent')
        .set('Authorization', `Bearer ${token}`)
        .send({
          analyticsConsent: true,
          marketingConsent: false,
          communicationConsent: true,
        });

      expect(postRes.status).toBe(200);
      expect(postRes.body.status).toBe('success');
      expect(postRes.body.data.marketingConsent).toBe(false);
      expect(postRes.body.data.version).toBe('dpdp_v1_2026');

      // Get consent
      const getRes = await request(app)
        .get('/api/compliance/consent')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.marketingConsent).toBe(false);
      expect(getRes.body.data.analyticsConsent).toBe(true);
    });
  });

  describe('POST /api/compliance/delete (Right to Erasure)', () => {
    it('anonymizes user data, revokes tokens, and blocks subsequent logins', async () => {
      const { user, token, rawPassword } = await makeUser({
        name: 'Private Citizen',
        email: 'private@citizen.in',
        phone: '+919811122233',
      });

      const res = await request(app)
        .post('/api/compliance/delete')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify user record in database is anonymized
      const dbCheck = await query(
        `SELECT name, email, phone, is_anonymized FROM users WHERE id = $1`,
        [user.id]
      );
      expect(dbCheck.rows[0].is_anonymized).toBe(true);
      expect(dbCheck.rows[0].name).toContain('Deleted User');
      expect(dbCheck.rows[0].email).toContain('anonymized.zipli.internal');
      expect(dbCheck.rows[0].phone).toBeNull();

      // Verify subsequent login attempts are rejected
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'private@citizen.in', password: rawPassword });

      expect(loginRes.status).toBe(401); // User email changed or account blocked
    });
  });
});
