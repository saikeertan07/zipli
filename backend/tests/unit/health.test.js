const assert = require('node:assert/strict');
const { getHealth } = require('../../src/controllers/health.controller');
const db = require('../../src/config/db');

describe('Health Check Controller (GET /api/v1/health)', () => {
  it('returns healthy status with db, redis, uptime, and version when DB is reachable', async () => {
    const originalQuery = db.query;
    db.query = async () => ({ rows: [{ '?column?': 1 }] });

    let statusCode = null;
    let jsonResponse = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
        return this;
      },
    };

    try {
      await getHealth(req, res);
    } finally {
      db.query = originalQuery;
    }

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.status, 'success');
    assert.equal(jsonResponse.data.db, 'connected');
    assert.ok(['disabled', 'disconnected', 'connected'].includes(jsonResponse.data.redis));
    assert.equal(typeof jsonResponse.data.uptime, 'number');
    assert.ok(jsonResponse.data.version);
    assert.ok(jsonResponse.data.timestamp);
  });

  it('returns 503 degraded status when DB is unreachable', async () => {
    const originalQuery = db.query;
    db.query = async () => {
      throw new Error('Connection refused');
    };

    let statusCode = null;
    let jsonResponse = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
        return this;
      },
    };

    try {
      await getHealth(req, res);
    } finally {
      db.query = originalQuery;
    }

    assert.equal(statusCode, 503);
    assert.equal(jsonResponse.status, 'error');
    assert.equal(jsonResponse.data.db, 'disconnected');
    assert.equal(jsonResponse.data.status, 'degraded');
  });
});
