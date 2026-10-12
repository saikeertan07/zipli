/**
 * @file auth-cookies.test.js
 * @description Integration tests for httpOnly cookies, CSRF protection, and device binding (SEC-AUTH-04).
 */

const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser } = require('../helpers/factories');

describe('httpOnly Cookie Auth, CSRF & Device Binding (SEC-AUTH-04 & SEC-AUTH-12)', () => {
  it('sets httpOnly accessToken and refreshToken cookies with SameSite=Lax on login', async () => {
    const { user, rawPassword } = await makeUser({ password: 'CookiePassword123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-device-id', 'test-device-uuid-123')
      .send({
        email: user.email,
        password: rawPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Verify accessToken cookie
    const accessCookie = cookies.find((c) => c.startsWith('accessToken='));
    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toMatch(/SameSite=Lax/i);

    // Verify refreshToken cookie
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toMatch(/SameSite=Lax/i);

    // Verify device_id was persisted in database
    const { rows } = await query(
      'SELECT device_id FROM refresh_tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [user.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].device_id).toBe('test-device-uuid-123');
  });

  it('authenticates user via accessToken cookie without Authorization header on GET /api/v1/auth/me', async () => {
    const { user, rawPassword } = await makeUser({ password: 'CookiePassword123' });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: user.email,
      password: rawPassword,
    });

    const accessCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('accessToken='));
    const cookieHeader = accessCookie.split(';')[0];

    // Request profile using only cookie
    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.status).toBe('success');
    expect(meRes.body.data.user.id).toBe(user.id);
  });

  it('enforces CSRF on state-changing requests when authenticated via cookies', async () => {
    const { user, rawPassword } = await makeUser({ password: 'CookiePassword123' });

    // 1. Log in to get accessToken cookie
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: user.email,
      password: rawPassword,
    });
    const accessCookie = loginRes.headers['set-cookie']
      .find((c) => c.startsWith('accessToken='))
      .split(';')[0];

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf-token');
    const csrfToken = csrfRes.body.data.csrfToken;
    const csrfCookie = `csrfToken=${csrfToken}`;

    // 3. Attempt state-changing POST /api/v1/cart WITHOUT CSRF token -> Rejected with 403
    const rejectedRes = await request(app)
      .post('/api/v1/cart')
      .set('Cookie', accessCookie)
      .send({ productId: 1, quantity: 1 });

    expect(rejectedRes.status).toBe(403);
    expect(rejectedRes.body.error.code).toBe('CSRF_INVALID');

    // 4. Attempt state-changing POST /api/v1/cart WITH double-submit CSRF token -> Passes CSRF
    const allowedRes = await request(app)
      .post('/api/v1/cart')
      .set('Cookie', `${accessCookie}; ${csrfCookie}`)
      .set('x-csrf-token', csrfToken)
      .send({ productId: 1, quantity: 1 });

    expect(allowedRes.status).not.toBe(403);
  });

  it('clears both accessToken and refreshToken cookies on logout', async () => {
    const { user, rawPassword } = await makeUser({ password: 'CookiePassword123' });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: user.email,
      password: rawPassword,
    });

    const refreshCookie = loginRes.headers['set-cookie']
      .find((c) => c.startsWith('refreshToken='))
      .split(';')[0];

    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', refreshCookie);

    expect(logoutRes.status).toBe(200);
    const cookies = logoutRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Verify both cookies are expired / cleared
    const clearedAccess = cookies.find((c) => c.startsWith('accessToken='));
    const clearedRefresh = cookies.find((c) => c.startsWith('refreshToken='));

    expect(clearedAccess).toBeDefined();
    expect(clearedAccess).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(clearedRefresh).toBeDefined();
    expect(clearedRefresh).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
