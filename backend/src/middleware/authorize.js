/**
 * @file authorize.js
 * @description Authorization middleware integrating the central policy engine (SEC-AZ-01, SEC-AZ-03).
 */

const AppError = require('../utils/AppError');
const { can } = require('../security/policy');

/**
 * Returns Express middleware enforcing a policy check.
 *
 * @param {string} action - Permission string or action name (from PERMISSIONS)
 * @param {Function} [getResource] - Optional function (req) => resource object
 * @returns {import('express').RequestHandler}
 */
function authorize(action, getResource = null) {
  const middleware = (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated. Please log in.', 401, 'UNAUTHORIZED'));
    }

    const resource = typeof getResource === 'function' ? getResource(req) : null;
    const allowed = can(req.user, action, resource, { req });

    if (!allowed) {
      return next(
        new AppError(
          'Forbidden: you do not have permission to perform this action.',
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };

  middleware._isAuthorize = true;
  middleware._action = action;
  Object.defineProperty(middleware, 'name', { value: 'authorize', configurable: true });

  return middleware;
}

module.exports = {
  authorize,
};
