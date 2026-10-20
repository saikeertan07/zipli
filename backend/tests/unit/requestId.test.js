const assert = require('node:assert/strict');
const requestIdMiddleware = require('../../src/middleware/requestId');
const logger = require('../../src/utils/logger');

describe('Request ID Middleware', () => {
  it('assigns a generated UUID when X-Request-Id header is missing', () => {
    const req = { headers: {} };
    const headersSent = {};
    const res = {
      setHeader(name, value) {
        headersSent[name] = value;
      },
    };

    let nextCalled = false;
    let storedContextId = null;

    requestIdMiddleware(req, res, () => {
      nextCalled = true;
      storedContextId = logger.getStore()?.requestId;
    });

    assert.ok(nextCalled, 'next() should be called');
    assert.ok(req.id, 'req.id should be set');
    assert.match(
      req.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'req.id should be a valid UUID'
    );
    assert.equal(headersSent['X-Request-Id'], req.id);
    assert.equal(storedContextId, req.id, 'Context should hold the request ID');
  });

  it('preserves existing client-provided X-Request-Id header', () => {
    const customId = 'client-trace-id-999';
    const req = { headers: { 'x-request-id': customId } };
    const headersSent = {};
    const res = {
      setHeader(name, value) {
        headersSent[name] = value;
      },
    };

    let nextCalled = false;
    requestIdMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.ok(nextCalled);
    assert.equal(req.id, customId);
    assert.equal(headersSent['X-Request-Id'], customId);
  });
});
