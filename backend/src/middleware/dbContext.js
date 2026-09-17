const { runWithDbContext } = require('../config/db');

/**
 * Express middleware that initializes AsyncLocalStorage tenant DB context
 * from the authenticated request actor and store scope.
 */
function dbContextMiddleware(req, res, next) {
  const userId = req.user ? String(req.user.id) : '';
  const storeId = req.headers['x-store-id'] || (req.user && req.user.store_id) || '1';
  const isAdmin = Boolean(req.user && req.user.role === 'admin');
  const isSystem = false;

  req.storeId = storeId;

  runWithDbContext({ userId, storeId, isAdmin, isSystem }, () => {
    next();
  });
}

module.exports = {
  dbContextMiddleware,
};
