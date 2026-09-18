const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Middleware that assigns X-Request-Id header and binds it to logger AsyncLocalStorage.
 */
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  logger.runWithContext({ requestId }, () => {
    next();
  });
}

module.exports = requestIdMiddleware;
