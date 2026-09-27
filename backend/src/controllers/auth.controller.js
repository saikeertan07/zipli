const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

// Precomputed dummy bcrypt hash (cost 12) for constant-time comparison on user not found
const DUMMY_HASH = '$2a$12$4v0Pj3N62lFwS64eA20oZe4Q18R4z12D1gB9O6cT3bI4E1zK4n8tq';

function signAccessToken(userId, extraClaims = {}) {
  return jwt.sign({ sub: userId, ...extraClaims }, env.JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'zipli.pro',
    audience: 'zipli-client',
    algorithm: 'HS256',
  });
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createRefreshToken(userId, familyId = null, deviceId = null) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const fid = familyId || crypto.randomUUID();

  await query(
    `INSERT INTO refresh_tokens (token_hash, user_id, family_id, device_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
    [tokenHash, userId, fid, deviceId]
  );

  return { rawToken, familyId: fid };
}

function setAccessTokenCookie(res, token) {
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
}

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookies(res) {
  const cookieOpts = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
}

function sanitizeUser(user) {
  const { password_hash: _password_hash, ...safe } = user;
  return safe;
}

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  const normalizedEmail = email.toLowerCase();

  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length) {
    // Run dummy bcrypt hash to ensure constant-time response and mitigate timing-based enumeration attacks (F-014)
    await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    return res.status(200).json({
      status: 'success',
      message: 'Registration request processed. If the email is eligible, you can now log in.',
      data: {
        registered: false,
        requiresLogin: true,
      },
    });
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, phone, address, created_at`,
    [name, normalizedEmail, passwordHash, phone || null, address || null]
  );

  const user = rows[0];
  const deviceId = req.headers['x-device-id'] || (req.body && req.body.deviceId) || null;
  const token = signAccessToken(user.id);
  const { rawToken } = await createRefreshToken(user.id, null, deviceId);
  setAccessTokenCookie(res, token);
  setRefreshTokenCookie(res, rawToken);

  return res.status(201).json({
    status: 'success',
    data: { user, token, refreshToken: rawToken },
  });
});

function getLockoutDurationMs(attempts) {
  if (attempts === 5) return 60 * 1000; // 1 min
  if (attempts === 6) return 5 * 60 * 1000; // 5 min
  if (attempts === 7) return 15 * 60 * 1000; // 15 min
  return 60 * 60 * 1000; // 1 hour for >= 8
}

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase();

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = rows[0];

  if (!user) {
    // Run dummy compare to mitigate timing side-channel attacks for email enumeration
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('Invalid email or password.', 401);
  }

  if (user.is_anonymized) {
    throw new AppError('This account has been deleted / anonymized.', 403);
  }

  // Check if account is currently locked out
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingSeconds = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
    throw new AppError(
      `Account is temporarily locked due to consecutive failed logins. Try again in ${remainingSeconds} seconds.`,
      429
    );
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    let lockedUntil = null;
    if (attempts >= 5) {
      const lockMs = getLockoutDurationMs(attempts);
      lockedUntil = new Date(Date.now() + lockMs);
    }

    await query('UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [
      attempts,
      lockedUntil,
      user.id,
    ]);

    if (lockedUntil) {
      const remainingSec = Math.ceil(getLockoutDurationMs(attempts) / 1000);
      throw new AppError(
        `Account locked for ${remainingSec} seconds due to too many failed login attempts.`,
        429
      );
    }

    throw new AppError('Invalid email or password.', 401);
  }

  // Reset failed attempts on success
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [
      user.id,
    ]);
  }

  // Mandatory / enabled TOTP MFA check (F-015, SEC-AUTH-02)
  if (user.mfa_enabled) {
    const mfaCode = req.body.mfaCode || req.body.mfa_code;
    if (!mfaCode) {
      return res.status(200).json({
        status: 'success',
        message: 'MFA verification code required.',
        data: {
          mfaRequired: true,
          email: user.email,
        },
      });
    }

    const { verifyTOTP } = require('../algo/totp');
    const isValidMfa = verifyTOTP(String(mfaCode), user.mfa_secret);
    if (!isValidMfa) {
      throw new AppError('Invalid or expired MFA verification code.', 401, 'INVALID_MFA_CODE');
    }
  }

  const deviceId = req.headers['x-device-id'] || (req.body && req.body.deviceId) || null;
  const token = signAccessToken(user.id, {
    mfa_verified: Boolean(user.mfa_enabled),
    role: user.role,
  });
  const { rawToken } = await createRefreshToken(user.id, null, deviceId);
  setAccessTokenCookie(res, token);
  setRefreshTokenCookie(res, rawToken);

  return res.json({
    status: 'success',
    data: { user: sanitizeUser(user), token, refreshToken: rawToken },
  });
});

// POST /api/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const rawToken = (req.cookies && req.cookies.refreshToken) || (req.body && req.body.refreshToken);
  if (!rawToken) {
    throw new AppError('Refresh token required.', 401);
  }

  const tokenHash = hashRefreshToken(rawToken);
  const { rows } = await query(
    `SELECT id, user_id, family_id, is_revoked, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!rows.length) {
    clearAuthCookies(res);
    throw new AppError('Invalid refresh token.', 401);
  }

  const tokenRecord = rows[0];

  // Token reuse detection: if already revoked or expired, revoke entire family!
  const isExpired = new Date(tokenRecord.expires_at) < new Date();
  if (tokenRecord.is_revoked || isExpired) {
    await query(`UPDATE refresh_tokens SET is_revoked = true WHERE family_id = $1`, [
      tokenRecord.family_id,
    ]);
    clearAuthCookies(res);
    throw new AppError('Invalid or reused refresh token. Please log in again.', 401);
  }

  // Revoke the consumed refresh token
  await query(`UPDATE refresh_tokens SET is_revoked = true WHERE id = $1`, [tokenRecord.id]);

  // Issue new pair in the same family
  const deviceId = req.headers['x-device-id'] || (req.body && req.body.deviceId) || null;
  const newAccessToken = signAccessToken(tokenRecord.user_id);
  const { rawToken: newRefreshToken } = await createRefreshToken(
    tokenRecord.user_id,
    tokenRecord.family_id,
    deviceId
  );

  setAccessTokenCookie(res, newAccessToken);
  setRefreshTokenCookie(res, newRefreshToken);
  return res.json({
    status: 'success',
    data: {
      token: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const rawToken = (req.cookies && req.cookies.refreshToken) || (req.body && req.body.refreshToken);
  if (rawToken) {
    const tokenHash = hashRefreshToken(rawToken);
    const { rows } = await query(`SELECT family_id FROM refresh_tokens WHERE token_hash = $1`, [
      tokenHash,
    ]);
    if (rows.length) {
      await query(`UPDATE refresh_tokens SET is_revoked = true WHERE family_id = $1`, [
        rows[0].family_id,
      ]);
    }
  }

  clearAuthCookies(res);
  return res.json({
    status: 'success',
    message: 'Logged out successfully.',
  });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  return res.json({ status: 'success', data: { user: req.user } });
});

// GET /api/auth/csrf-token
const getCsrfToken = asyncHandler(async (req, res) => {
  return res.json({
    status: 'success',
    data: { csrfToken: req.csrfToken || (req.cookies && req.cookies.csrfToken) || null },
  });
});

// POST /api/auth/mfa/setup
const setupMfa = asyncHandler(async (req, res) => {
  const { generateTOTPSecret, getOTPAuthURI } = require('../algo/totp');
  const secret = generateTOTPSecret();
  const otpauthUri = getOTPAuthURI({ label: req.user.email, secret });

  await query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.id]);

  res.status(200).json({
    status: 'success',
    data: {
      secret,
      otpauthUri,
      message: 'TOTP secret generated. Verify with 6-digit code to activate.',
    },
  });
});

// POST /api/auth/mfa/verify
const verifyMfa = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const { verifyTOTP } = require('../algo/totp');

  const { rows } = await query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
  const secret = rows[0]?.mfa_secret;

  if (!secret) {
    throw new AppError('No MFA setup initiated. Call /api/auth/mfa/setup first.', 400);
  }

  const valid = verifyTOTP(String(code), secret);
  if (!valid) {
    throw new AppError('Invalid MFA verification code.', 400);
  }

  await query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.id]);

  res.status(200).json({
    status: 'success',
    message: 'MFA enabled successfully.',
    data: { mfaEnabled: true },
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  getCsrfToken,
  setupMfa,
  verifyMfa,
};
