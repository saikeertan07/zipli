/**
 * @file middlewareExtra.test.js
 * @description Thorough unit tests for dbContext, validate, and authorize middleware.
 */

const express = require('express');
const request = require('supertest');
const { body } = require('express-validator');
const { dbContextMiddleware } = require('../../src/middleware/dbContext');
const validate = require('../../src/middleware/validate');
const { authorize } = require('../../src/middleware/authorize');
const { getDbContext } = require('../../src/config/db');

describe('Middleware Unit Tests (dbContext, validate, authorize)', () => {
  describe('dbContextMiddleware', () => {
    it('initializes context with defaults when unauthenticated', (done) => {
      const req = { headers: {} };
      const res = {};
      dbContextMiddleware(req, res, () => {
        const ctx = getDbContext();
        expect(ctx.userId).toBe('');
        expect(ctx.storeId).toBe('1');
        expect(ctx.isAdmin).toBe(false);
        expect(req.storeId).toBe('1');
        done();
      });
    });

    it('initializes context from user and x-store-id header', (done) => {
      const req = {
        headers: { 'x-store-id': '42' },
        user: { id: 123, role: 'admin', store_id: '99' },
      };
      const res = {};
      dbContextMiddleware(req, res, () => {
        const ctx = getDbContext();
        expect(ctx.userId).toBe('123');
        expect(ctx.storeId).toBe('42');
        expect(ctx.isAdmin).toBe(true);
        expect(req.storeId).toBe('42');
        done();
      });
    });

    it('uses user store_id when x-store-id header is absent', (done) => {
      const req = {
        headers: {},
        user: { id: 456, role: 'store_manager', store_id: '88' },
      };
      const res = {};
      dbContextMiddleware(req, res, () => {
        const ctx = getDbContext();
        expect(ctx.userId).toBe('456');
        expect(ctx.storeId).toBe('88');
        expect(ctx.isAdmin).toBe(false);
        done();
      });
    });
  });

  describe('validate middleware with express-validator', () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/test-validate',
      [body('email').isEmail().withMessage('Valid email required')],
      validate,
      (req, res) => res.status(200).json({ ok: true })
    );

    it('passes and returns 200 when validation succeeds', async () => {
      const res = await request(app)
        .post('/test-validate')
        .send({ email: 'valid@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('formats standardized 422 envelope when validation fails', async () => {
      const res = await request(app)
        .post('/test-validate')
        .set('x-request-id', 'req-val-123')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.requestId).toBe('req-val-123');
      expect(res.body.error.details[0].field).toBe('email');
    });
  });

  describe('authorize middleware', () => {
    it('returns 401 UNAUTHORIZED when req.user is absent', (done) => {
      const middleware = authorize('products:read');
      const req = {};
      const res = {};
      middleware(req, res, (err) => {
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(401);
        expect(err.errorCode).toBe('UNAUTHORIZED');
        done();
      });
    });

    it('returns 403 FORBIDDEN when user lacks permission', (done) => {
      const middleware = authorize('config:write');
      const req = { user: { id: 1, role: 'customer' } };
      const res = {};
      middleware(req, res, (err) => {
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe('FORBIDDEN');
        done();
      });
    });

    it('calls next when user is permitted', (done) => {
      const middleware = authorize('products:read');
      const req = { user: { id: 1, role: 'admin' } };
      const res = {};
      middleware(req, res, (err) => {
        expect(err).toBeUndefined();
        done();
      });
    });
  });
});
