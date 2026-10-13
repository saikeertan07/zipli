const request = require('supertest');
const app = require('../../src/app');

describe('Auth Rate Limiting Integration Test', () => {
  it('triggers HTTP 429 when auth endpoint threshold is exceeded', async () => {
    let triggered429 = false;

    // Send rapid consecutive requests exceeding the max limit (50 requests limit)
    for (let i = 0; i < 55; i++) {
      const res = await request(app).post('/api/auth/login').send({});

      if (res.status === 429) {
        triggered429 = true;
        expect(res.body.message).toMatch(/Too many attempts/);
        break;
      }
    }

    expect(triggered429).toBe(true);
  });
});
