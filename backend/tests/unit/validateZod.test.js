const { z } = require('zod');
const { validateZod } = require('../../src/middleware/validateZod');

describe('validateZod Middleware Unit Tests (Rule R03, SEC-AZ-04)', () => {
  const sampleSchema = z
    .object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    })
    .strict();

  function mockResponse() {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  }

  it('passes validation when payload conforms to strict schema', () => {
    const req = {
      body: { name: 'Priya', age: 28 },
      headers: { 'x-request-id': 'req_valid_001' },
    };
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = validateZod(sampleSchema);
    middleware(req, res, next);

    expect(nextCalled).toBe(true);
    expect(res.body).toBeUndefined();
    expect(req.body).toEqual({ name: 'Priya', age: 28 });
  });

  it('rejects unrecognized/extra keys with HTTP 422 and UNRECOGNIZED_KEYS error code', () => {
    const req = {
      body: { name: 'Priya', age: 28, malicious_role: 'admin' },
      headers: { 'x-request-id': 'req_blocked_002' },
    };
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = validateZod(sampleSchema);
    middleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNRECOGNIZED_KEYS');
    expect(res.body.error.message).toContain('malicious_role');
    expect(res.body.error.requestId).toBe('req_blocked_002');
    expect(res.body.status).toBe('error');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('rejects invalid types with HTTP 422 and VALIDATION_FAILED error code', () => {
    const req = {
      body: { name: 'Priya', age: 'not-a-number' },
      headers: { 'x-request-id': 'req_type_003' },
    };
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = validateZod(sampleSchema);
    middleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].field).toBe('age');
  });

  it('supports multi-source validation (body and query)', () => {
    const querySchema = z
      .object({
        filter: z.string().optional(),
      })
      .strict();

    const req = {
      body: { name: 'Aman', age: 22 },
      query: { filter: 'active', unexpectedQuery: 'hack' },
      headers: {},
    };
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = validateZod({ body: sampleSchema, query: querySchema });
    middleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe('UNRECOGNIZED_KEYS');
    expect(res.body.error.message).toContain('unexpectedQuery');
  });
});
