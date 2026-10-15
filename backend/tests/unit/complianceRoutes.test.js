const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser } = require('../helpers/factories');

describe('Compliance Routes Branch Coverage Suite (F-042, P1)', () => {
  let userToken;
  let userId;

  beforeAll(async () => {
    const created = await makeUser({ role: 'customer' });
    userId = created.user.id;
    userToken = created.token;
  });

  test('POST /api/compliance/consent with custom preferences', async () => {
    const res = await request(app)
      .post('/api/compliance/consent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        analyticsConsent: false,
        marketingConsent: true,
        communicationConsent: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.analyticsConsent).toBe(false);
    expect(res.body.data.marketingConsent).toBe(true);
    expect(res.body.data.communicationConsent).toBe(false);
  });

  test('POST /api/compliance/consent with default payload', async () => {
    const res = await request(app)
      .post('/api/compliance/consent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.analyticsConsent).toBe(true);
    expect(res.body.data.marketingConsent).toBe(false);
  });

  test('GET /api/compliance/consent returns recorded consent', async () => {
    const res = await request(app)
      .get('/api/compliance/consent')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.version).toBe('dpdp_v1_2026');
  });

  test('GET /api/compliance/consent returns default when user has no consent record', async () => {
    const fresh = await makeUser({ role: 'customer' });
    const freshUserToken = fresh.token;
    const res = await request(app)
      .get('/api/compliance/consent')
      .set('Authorization', `Bearer ${freshUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe('default');
    expect(res.body.data.analyticsConsent).toBe(true);
  });
});
