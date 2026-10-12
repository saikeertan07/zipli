const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');

describe('Auth Refresh Token Rotation & Reuse Detection (Phase 3.10)', () => {
  it('rotates refresh tokens and detects reuse attempts by revoking the entire token family', async () => {
    // 1. Register a new user
    const email = `rotator_${Date.now()}@example.com`;
    const password = 'StrongPassword123';

    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Token Rotator',
      email,
      password,
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.token).toBeDefined();

    // Check Set-Cookie header contains refreshToken
    const cookies = registerRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');

    const firstRawRefreshToken = registerRes.body.data.refreshToken;
    expect(firstRawRefreshToken).toBeDefined();

    // 2. Perform first refresh rotation using the valid refreshToken
    const firstRefreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${firstRawRefreshToken}`);

    expect(firstRefreshRes.status).toBe(200);
    expect(firstRefreshRes.body.status).toBe('success');
    expect(firstRefreshRes.body.data.token).toBeDefined();
    const secondRawRefreshToken = firstRefreshRes.body.data.refreshToken;
    expect(secondRawRefreshToken).toBeDefined();
    expect(secondRawRefreshToken).not.toBe(firstRawRefreshToken);

    // 3. ATTEMPT REUSE: Present the first (already consumed) refresh token again
    const reuseAttemptRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${firstRawRefreshToken}`);

    expect(reuseAttemptRes.status).toBe(401);
    expect(reuseAttemptRes.body.status).toBe('error');
    expect(reuseAttemptRes.body.message).toContain('reused refresh token');

    // 4. Verify family revocation: even the second (formerly valid) token is now invalid!
    const familyCheckRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${secondRawRefreshToken}`);

    expect(familyCheckRes.status).toBe(401);
    expect(familyCheckRes.body.status).toBe('error');
  });

  it('logs out and revokes active token family', async () => {
    // 1. Register user
    const email = `logout_${Date.now()}@example.com`;
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Logout User',
      email,
      password: 'StrongPassword123',
    });

    const rawToken = regRes.body.data.refreshToken;

    // 2. Call logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refreshToken=${rawToken}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.status).toBe('success');

    // 3. Calling refresh with logged-out token must fail with 401
    const refreshAfterLogout = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${rawToken}`);

    expect(refreshAfterLogout.status).toBe(401);
  });
});
