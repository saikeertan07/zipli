const logger = require('../utils/logger');
const { env } = require('../config/env');

/**
 * Standard 404 Route Not Found Handler.
 * Returns standardized error envelope compliant with 01_MASTER_CONTEXT_AND_RULES.md
 */
function notFound(req, res, _next) {
  const requestId = req?.id || req?.headers?.['x-request-id'];
  const message = `Route not found: ${req?.method || 'GET'} ${req?.originalUrl || ''}`;

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message,
      ...(requestId ? { requestId } : {}),
    },
    status: 'error',
    message,
  });
}

/**
 * Centralized Application Error Handler.
 * Keeps error shape consistent across the entire API with full backwards compatibility.
 */
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Common Postgres error codes translated into friendly, correct-status responses.
  if (err.code === '23505') {
    // unique_violation
    statusCode = 409;
    message = 'A record with these details already exists.';
  } else if (err.code === '23503') {
    // foreign_key_violation
    statusCode = 400;
    message = 'This request refers to a resource that does not exist.';
  } else if (err.code === '22P02') {
    // invalid_text_representation (bad id format etc.)
    statusCode = 400;
    message = 'Invalid request parameters.';
  }

  if (!err.isOperational && statusCode === 500) {
    // Unexpected/programmer error — log full detail server-side, keep client response generic.
    logger.error('Unhandled server error', { error: err });
    message = env.NODE_ENV === 'production' ? 'Something went wrong.' : message;
  }

  const errorCode =
    err.errorCode ||
    (statusCode === 400
      ? 'BAD_REQUEST'
      : statusCode === 401
        ? 'UNAUTHORIZED'
        : statusCode === 403
          ? 'FORBIDDEN'
          : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode === 409
              ? 'CONFLICT'
              : statusCode === 422
                ? 'VALIDATION_FAILED'
                : statusCode === 429
                  ? 'RATE_LIMIT_EXCEEDED'
                  : 'INTERNAL_SERVER_ERROR');

  const requestId = req?.id || req?.headers?.['x-request-id'];

  res.status(statusCode).json({
    // Standardized v1 Error Envelope (01_MASTER_CONTEXT_AND_RULES.md)
    error: {
      code: errorCode,
      message,
      ...(requestId ? { requestId } : {}),
      ...(err.details ? { details: err.details } : {}),
    },
    // Backwards-compatible fields for legacy clients and test suites:
    status: 'error',
    message,
    ...(err.errors ? { errors: err.errors } : {}),
    ...(env.NODE_ENV !== 'production' && statusCode === 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
