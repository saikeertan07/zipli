const request = require('supertest');
const app = require('../../src/app');
const { makeUser } = require('../helpers/factories');
const { truncateUserData } = require('../setup');

describe('Auth Integration Tests (API /api/auth)', () => {
  beforeEach(async () => {
    await truncateUserData();
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers a new user with valid details and returns a JWT token', async () => {
      const payload = {
        name: 'Aarav Sharma',
        email: 'aarav.sharma@example.com',
        password: 'ValidPassword123',
        phone: '+919876543210',
        address: 'B-201, Green Acres, Indiranagar',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(payload.email.toLowerCase());
      expect(res.body.data.user.password_hash).toBeUndefined(); // Never leak password hash
      expect(typeof res.body.data.token).toBe('string');
    });

    it('returns validation error (422) when email is invalid', async () => {
      const payload = {
        name: 'Aarav Sharma',
        email: 'not-an-email',
        password: 'ValidPassword123',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('returns validation error (422) when password does not meet complexity (no digits)', async () => {
      const payload = {
        name: 'Aarav Sharma',
        email: 'aarav.simple@example.com',
        password: 'NoDigitsPassword',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });

    it('returns neutral message (200) on duplicate registration without leaking existence', async () => {
      const { user } = await makeUser({ email: 'duplicate@example.com' });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Imposter',
        email: user.email,
        password: 'AnotherPassword123',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.registered).toBe(false);
      expect(res.body.data.requiresLogin).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    it('successfully logs in with correct credentials and returns JWT token', async () => {
      const { user, rawPassword } = await makeUser({ password: 'LoginPass123' });

      const res = await request(app).post('/api/auth/login').send({
        email: user.email,
        password: rawPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.user.email).toBe(user.email);
      expect(typeof res.body.data.token).toBe('string');
    });

    it('returns 401 with generic message on wrong password', async () => {
      const { user } = await makeUser();

      const res = await request(app).post('/api/auth/login').send({
        email: user.email,
        password: 'IncorrectPassword123',
      });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('returns 401 with identical generic message on non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'does_not_exist_at_all@example.com',
        password: 'AnyPassword123',
      });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('returns validation error (422) when password is empty', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: '',
      });

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('error');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user profile when authenticated with valid Bearer token', async () => {
      const { user, token } = await makeUser();

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.user.email).toBe(user.email);
    });

    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Not authenticated/);
    });

    it('returns 401 when Authorization token is malformed', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_signature_token');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Invalid or expired session/);
    });
  });
});
