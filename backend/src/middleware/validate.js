const { validationResult } = require('express-validator');

/**
 * Runs after an array of express-validator checks.
 * Formats validation failures into the standardized error envelope.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const issues = errors.array().map((e) => ({
    field: e.path,
    message: e.msg,
    code: 'INVALID_FIELD',
  }));

  const requestId = req.id || req.headers['x-request-id'];
  const firstMsg = issues[0] ? issues[0].message : 'Validation failed';

  return res.status(422).json({
    // Standardized v1 Error Envelope (01_MASTER_CONTEXT_AND_RULES.md)
    error: {
      code: 'VALIDATION_FAILED',
      message: firstMsg,
      ...(requestId ? { requestId } : {}),
      details: issues,
    },
    // Backwards-compatible fields for legacy clients and test suites:
    status: 'error',
    message: 'Validation failed',
    errors: issues.map((i) => ({ field: i.field, message: i.message })),
  });
};

module.exports = validate;
