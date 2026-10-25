/**
 * @file staff-mfa.test.js
 * @description Integration Tests for Staff MFA & Session Lifetimes (F-015, SEC-AUTH-02, SEC-AUTH-06).
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { env } = require('../../src/config/env');
const { makeUser } = require('../helpers/factories');
const { generateTOTP } = require('../../src/algo/totp');

describe('Staff MFA & Session Lifetimes (F-015, SEC-AUTH-02, SEC-AUTH-06)', () => {
  let staffUser, staffToken, staffPassword;

  beforeEach(async () => {
    staffPassword = 'StaffSecurePass123';
    const res = await makeUser({
      name: 'Admin Staff',
      role: 'admin',
      password: staffPassword,
    });
    staffUser = res.user;
    staffToken = res.token;
  });

  describe('TOTP MFA Setup & Activation (/api/auth/mfa)', () => {
    it('initiates TOTP MFA setup and generates secret + otpauth URI', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(typeof res.body.data.secret).toBe('string');
      expect(res.body.data.secret.length).toBe(32);
      expect(res.body.data.otpauthUri).toContain('otpauth://totp/');
    });

    it('rejects MFA verification with invalid 6-digit code', async () => {
      // 1. Setup MFA
      await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${staffToken}`);

      // 2. Submit invalid code
      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('successfully activates MFA with valid TOTP code', async () => {
      // 1. Setup MFA
      const setupRes = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${staffToken}`);

      const secret = setupRes.body.data.secret;
      const validCode = generateTOTP(secret);

      // 2. Verify with valid code
      const verifyRes = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: validCode });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.mfaEnabled).toBe(true);

      // 3. Verify database reflects mfa_enabled = true
      const { rows } = await query('SELECT mfa_enabled FROM users WHERE id = $1', [staffUser.id]);
      expect(rows[0].mfa_enabled).toBe(true);
    });
  });

  describe('Login Flow with MFA (SEC-AUTH-02)', () => {
    let mfaSecret;

    beforeEach(async () => {
      const setupRes = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${staffToken}`);

      mfaSecret = setupRes.body.data.secret;
      const validCode = generateTOTP(mfaSecret);

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: validCode });
    });

    it('returns mfaRequired when staff with MFA logs in without code', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: staffUser.email,
        password: staffPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(res.body.data.email).toBe(staffUser.email);
    });

    it('rejects login when staff submits invalid MFA code', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: staffUser.email,
        password: staffPassword,
        mfaCode: '999999',
      });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    it('successfully authenticates staff when valid MFA code is provided', async () => {
      const validCode = generateTOTP(mfaSecret);

      const res = await request(app).post('/api/auth/login').send({
        email: staffUser.email,
        password: staffPassword,
        mfaCode: validCode,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();

      // Verify token contains mfa_verified: true
      const decoded = jwt.verify(res.body.data.token, env.JWT_SECRET);
      expect(decoded.mfa_verified).toBe(true);
    });
  });

  describe('Session Lifetime & Enforcement (SEC-AUTH-06)', () => {
    it('rejects requests with session exceeding absolute lifetime (12 hours)', async () => {
      // Create token issued 13 hours ago
      const expiredIat = Math.floor(Date.now() / 1000) - 13 * 3600;
      const expiredToken = jwt.sign(
        {
          sub: staffUser.id,
          role: 'admin',
          iat: expiredIat,
        },
        env.JWT_SECRET,
        {
          expiresIn: '24h',
          algorithm: 'HS256',
        }
      );

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Absolute session lifetime exceeded');
    });

    it('blocks staff access if staff account has MFA enabled but token lacks mfa_verified', async () => {
      // 1. Enable MFA on user in DB
      await query('UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE id = $2', [
        'JBSWY3DPEHPK3PXP',
        staffUser.id,
      ]);

      // 2. Generate token without mfa_verified
      const unverifiedToken = jwt.sign(
        {
          sub: staffUser.id,
          role: 'admin',
          mfa_verified: false,
        },
        env.JWT_SECRET,
        {
          expiresIn: '15m',
          algorithm: 'HS256',
        }
      );

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${unverifiedToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('MFA verification required for staff access');
    });
  });
});
