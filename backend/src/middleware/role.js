const AppError = require('../utils/AppError');

/**
 * Middleware enforcing role-based access control (RBAC).
 * Must be used after requireAuth middleware.
 * @param {...string} allowedRoles - e.g. 'admin', 'rider'
 */
function requireRole(...allowedRoles) {
  const middleware = (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated. Please log in.', 401));
    }

    const userRole = req.user.role || 'customer';
    if (!allowedRoles.includes(userRole)) {
      return next(
        new AppError('Forbidden: you do not have permission to access this resource.', 403)
      );
    }

    next();
  };

  middleware._isRole = true;
  middleware._isAuth = true;
  middleware._allowedRoles = allowedRoles;
  Object.defineProperty(middleware, 'name', { value: 'requireRole', configurable: true });

  return middleware;
}

module.exports = {
  requireRole,
};
