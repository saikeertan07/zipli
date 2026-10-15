const { errorHandler, notFound } = require('../../src/middleware/errorHandler');

describe('Error Handler Middleware Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/api/unknown-endpoint' };
    res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  });

  it('handles 404 not found route', () => {
    notFound(req, res, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/Route not found/);
  });

  it('translates Postgres unique violation (23505) to 409', () => {
    const pgError = new Error('duplicate key');
    pgError.code = '23505';

    errorHandler(pgError, req, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already exists/);
  });

  it('translates Postgres foreign key violation (23503) to 400', () => {
    const pgError = new Error('foreign key constraint');
    pgError.code = '23503';

    errorHandler(pgError, req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/does not exist/);
  });

  it('translates Postgres invalid text representation (22P02) to 400', () => {
    const pgError = new Error('invalid input syntax for type integer');
    pgError.code = '22P02';

    errorHandler(pgError, req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Invalid request parameters/);
  });

  it('handles unexpected 500 error and hides stack in production', () => {
    const unhandledError = new Error('Unexpected crash');
    unhandledError.isOperational = false;

    errorHandler(unhandledError, req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.status).toBe('error');
  });
});
