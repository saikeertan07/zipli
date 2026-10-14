/**
 * @file auth-security.test.js
 * @description Unit tests for SEC-AUTH-04 & SEC-AUTH-12: token tampering, alg:none rejection,
 * expired tokens, and dual-mode cookie/bearer authentication.
 */

const jwt = require('jsonwebtoken');
const { requireAuth, optionalAuth } = require('../../src/middleware/auth');
const { env } = require('../../src/config/env');
const { query } = require('../../src/config/db');

jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
}));

describe('Auth Security Unit Tests (SEC-AUTH-04 & SEC-AUTH-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = {
    id: 42,
    name: 'Security Tester',
    email: 'sec@example.com',
    role: 'customer',
    phone: '+919999999999',
    address: 'Bangalore, India',
  };

  it('rejects tokens signed with alg: "none" (SEC-AUTH-12)', async () => {
    // Construct an unsigned token with alg: "none"
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 42, exp: Math.floor(Date.now() / 1000) + 900 })
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const req = {
      headers: { authorization: `Bearer ${noneToken}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid or expired session/),
      })
    );
  });

  it('rejects tampered tokens where signature does not match (SEC-AUTH-12)', async () => {
    const validToken = jwt.sign({ sub: 42 }, env.JWT_SECRET, { expiresIn: '15m' });
    const tamperedToken = `${validToken.slice(0, -6)}XXXXXX`;

    const req = {
      headers: { authorization: `Bearer ${tamperedToken}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid or expired session/),
      })
    );
  });

  it('rejects expired tokens (SEC-AUTH-12)', async () => {
    const expiredToken = jwt.sign(
      { sub: 42, exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_SECRET
    );

    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid or expired session/),
      })
    );
  });

  it('successfully authenticates via httpOnly accessToken cookie without Authorization header', async () => {
    const validToken = jwt.sign({ sub: 42 }, env.JWT_SECRET, { expiresIn: '15m' });
    query.mockResolvedValueOnce({ rows: [mockUser] });

    const req = {
      headers: {},
      cookies: { accessToken: validToken },
    };
    const res = {};
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(mockUser);
  });

  it('prioritizes Authorization Bearer header over accessToken cookie if both present', async () => {
    const user1Token = jwt.sign({ sub: 42 }, env.JWT_SECRET, { expiresIn: '15m' });
    const user2Token = jwt.sign({ sub: 99 }, env.JWT_SECRET, { expiresIn: '15m' });

    query.mockResolvedValueOnce({ rows: [mockUser] });

    const req = {
      headers: { authorization: `Bearer ${user1Token}` },
      cookies: { accessToken: user2Token },
    };
    const res = {};
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(query).toHaveBeenCalledWith(expect.any(String), [42]);
    expect(req.user.id).toBe(42);
  });

  it('optionalAuth attaches user when valid cookie provided', async () => {
    const validToken = jwt.sign({ sub: 42 }, env.JWT_SECRET, { expiresIn: '15m' });
    query.mockResolvedValueOnce({ rows: [mockUser] });

    const req = {
      headers: {},
      cookies: { accessToken: validToken },
    };
    const res = {};
    const next = jest.fn();

    await optionalAuth(req, res, next);

    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('optionalAuth sets user to null when no credentials provided', async () => {
    const req = {
      headers: {},
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await optionalAuth(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
