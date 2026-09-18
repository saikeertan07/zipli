/**
 * Zod Edge Validation Middleware (Rule R03, SEC-AZ-04)
 * Enforces strict schema parsing on request body, query, or params.
 * Rejects unexpected keys with HTTP 422 and UNRECOGNIZED_KEYS error code.
 */

/**
 * Creates an Express middleware for Zod schema validation.
 *
 * @param {import('zod').ZodSchema | { body?: import('zod').ZodSchema, query?: import('zod').ZodSchema, params?: import('zod').ZodSchema }} schema
 * @param {'body' | 'query' | 'params'} [defaultSource='body']
 */
function validateZod(schema, defaultSource = 'body') {
  const middleware = (req, res, next) => {
    // Check if schema is a multi-source config object: { body, query, params }
    const isMultiSource =
      schema &&
      typeof schema === 'object' &&
      !schema._def &&
      (schema.body || schema.query || schema.params);

    const sourcesToValidate = isMultiSource ? schema : { [defaultSource]: schema };

    for (const [source, s] of Object.entries(sourcesToValidate)) {
      if (!s) continue;

      const result = s.safeParse(req[source] || {});
      if (!result.success) {
        const issues = result.error.issues;
        const hasUnrecognized = issues.some((i) => i.code === 'unrecognized_keys');

        const firstIssue = issues[0];
        const fieldPath = firstIssue.path.length > 0 ? firstIssue.path.join('.') : source;

        let primaryMessage = `Validation failed: ${fieldPath} - ${firstIssue.message}`;
        if (hasUnrecognized) {
          const unrecognizedKeys = issues
            .filter((i) => i.code === 'unrecognized_keys')
            .flatMap((i) => i.keys || [])
            .join(', ');
          primaryMessage = `Unrecognized field in ${source}: ${unrecognizedKeys}`;
        }

        const requestId = req.id || req.headers['x-request-id'];

        const details = issues.map((i) => ({
          field: i.path.length > 0 ? i.path.join('.') : source,
          message: i.message,
          code: i.code === 'unrecognized_keys' ? 'UNRECOGNIZED_KEYS' : 'INVALID_FIELD',
        }));

        return res.status(422).json({
          error: {
            code: hasUnrecognized ? 'UNRECOGNIZED_KEYS' : 'VALIDATION_FAILED',
            message: primaryMessage,
            ...(requestId ? { requestId } : {}),
            details,
          },
          // Backwards-compatibility envelope for existing client tests:
          status: 'error',
          message: primaryMessage,
          errors: details,
        });
      }

      // Assign parsed sanitized data to req[source]
      req[source] = result.data;
    }

    next();
  };

  middleware._isZodValidator = true;
  middleware._zodSchema = schema;
  middleware._defaultSource = defaultSource;
  Object.defineProperty(middleware, 'name', { value: 'validateZod', configurable: true });

  return middleware;
}

module.exports = { validateZod };
