const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { query } = require('../config/db');
const { env } = require('../config/env');

const { csrfValidationMiddleware } = require('./csrf');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  return null;
}

// Requires a valid Bearer token or httpOnly cookie. Attaches the authenticated user to req.user.
const requireAuth = asyncHandler(async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const token = extractToken(req);

  if (!token) {
    throw new AppError('Not authenticated. Please log in.', 401, 'UNAUTHORIZED');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (_err) {
    throw new AppError('Invalid or expired session. Please log in again.', 401, 'UNAUTHORIZED');
  }

  // Absolute session lifetime limit (SEC-AUTH-06: 12 hours max)
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.iat && nowSec - payload.iat > 12 * 3600) {
    throw new AppError(
      'Session expired. Absolute session lifetime exceeded (12 hours).',
      401,
      'SESSION_EXPIRED'
    );
  }

  const { rows } = await query(
    'SELECT id, name, email, role, phone, address, mfa_enabled FROM users WHERE id = $1',
    [payload.sub]
  );
  if (!rows.length) {
    throw new AppError('User for this session no longer exists.', 401, 'USER_NOT_FOUND');
  }

  req.user = rows[0];
  req.authPayload = payload;

  // Staff MFA verification requirement (F-015, SEC-AUTH-02)
  const staffRoles = ['admin', 'store_manager', 'support', 'finance'];
  if (staffRoles.includes(req.user.role) && req.user.mfa_enabled && !payload.mfa_verified) {
    throw new AppError('MFA verification required for staff access.', 403, 'MFA_REQUIRED');
  }

  // If request was authenticated via cookie (not Bearer header), enforce CSRF validation
  const isBearer = Boolean(
    req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
  );
  if (!isBearer && req.cookies && req.cookies.accessToken) {
    return csrfValidationMiddleware(req, res, next);
  }

  next();
});

// Optionally attaches user to req.user if valid token provided; does not reject unauthenticated requests.
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    const { rows } = await query(
      'SELECT id, name, email, role, phone, address FROM users WHERE id = $1',
      [payload.sub]
    );
    req.user = rows.length > 0 ? rows[0] : null;
  } catch (_err) {
    req.user = null;
  }

  next();
});

requireAuth._isAuth = true;
requireAuth._name = 'requireAuth';
Object.defineProperty(requireAuth, 'name', { value: 'requireAuth', configurable: true });

optionalAuth._isAuth = true;
optionalAuth._isOptionalAuth = true;
optionalAuth._name = 'optionalAuth';
Object.defineProperty(optionalAuth, 'name', { value: 'optionalAuth', configurable: true });

module.exports = { requireAuth, optionalAuth };
