/**
 * @file csrf.js
 * @description Double-Submit Cookie CSRF protection middleware for state-changing requests.
 */

const crypto = require('crypto');
const { env } = require('../config/env');

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generates and attaches a CSRF token cookie if absent.
 */
function csrfCookieMiddleware(req, res, next) {
  if (!req.cookies || !req.cookies[CSRF_COOKIE_NAME]) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Accessible by frontend JavaScript for double-submit header
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE_NAME];
  }
  next();
}

/**
 * Validates double-submit cookie on state-changing HTTP methods.
 * Safe methods (GET, HEAD, OPTIONS) and Bearer-token requests are exempt.
 */
function csrfValidationMiddleware(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt stateless API Authorization Bearer requests
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }

  // If cookie-based state-changing request, perform double-submit comparison
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || (req.body && req.body._csrf);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      status: 'error',
      message: 'Invalid or missing CSRF token.',
      error: {
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token.',
        requestId: req?.headers?.['x-request-id'] || null,
        details: null,
      },
    });
  }

  next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfCookieMiddleware,
  csrfValidationMiddleware,
};
