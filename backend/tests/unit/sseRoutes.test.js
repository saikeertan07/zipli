const request = require('supertest');
const app = require('../../src/app');
const { makeUser } = require('../helpers/factories');
const { truncateUserData } = require('../setup');
const { sseHub } = require('../../src/services/sse.service');

describe('SSE Routes (/api/events)', () => {
  let adminToken;
  let customerToken;

  beforeEach(async () => {
    await truncateUserData();
    const admin = await makeUser({ role: 'admin' });
    adminToken = admin.token;
    const customer = await makeUser({ role: 'customer' });
    customerToken = customer.token;
  });

  it('GET /api/events/stats returns active connection stats to admin', async () => {
    const res = await request(app)
      .get('/api/events/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.totalConnections).toBeDefined();
  });

  it('GET /api/events/stats rejects non-admin with 403', async () => {
    const res = await request(app)
      .get('/api/events/stats')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  it('GET /api/events delegates to sseHub.handleConnection', async () => {
    const spy = jest.spyOn(sseHub, 'handleConnection').mockImplementationOnce((req, res) => {
      res.status(200).json({ streamStarted: true });
    });

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.streamStarted).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
