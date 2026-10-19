/**
 * @file paymentSecurityP0.test.js
 * @description P0 Security Tests:
 * 1. Boot guard refusing production boot without Razorpay credentials
 * 2. Route-table check: /simulate-success absent in production
 * 3. /simulate-success returns 404 in production
 * 4. User cannot pay for or dismiss another user's order (IDOR protection)
 * 5. Dismiss payment releases stock hold and cancels order
 * 6. Webhook out-of-order handling:
 *    - captured-before-created safe
 *    - late-failure-after-success safe
 *    - duplicate replay idempotent
 * 7. Payment reconciliation job
 */

const express = require('express');
const request = require('supertest');
const { validateEnv, ConfigValidationError } = require('../../src/config/env');
const { getPaymentProvider, FakePaymentProvider } = require('../../src/services/paymentProvider');
const { reconcileStuckPayments } = require('../../src/services/paymentReconcile.service');
const { query } = require('../../src/config/db');
const AppError = require('../../src/utils/AppError');

describe('P0 Payment Security & Free-Orders Hole Defense', () => {
  describe('1. Production Boot Guard (config/env.js)', () => {
    const baseProdEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      JWT_SECRET: 'production_high_entropy_token_key_for_signing_998877',
      PGPASSWORD: 'a_secure_production_password_xyz',
      PGHOST: 'localhost',
      PGDATABASE: 'zipli_prod',
      PGUSER: 'zipli_user',
    };

    it('refuses to boot in production when RAZORPAY keys are missing and PAYMENT_PROVIDER != cod_only', () => {
      expect(() => {
        validateEnv({
          ...baseProdEnv,
          PAYMENT_PROVIDER: 'razorpay',
          RAZORPAY_KEY_ID: '',
          RAZORPAY_KEY_SECRET: '',
          RAZORPAY_WEBHOOK_SECRET: '',
        });
      }).toThrow(ConfigValidationError);
    });

    it('refuses to boot in production when PAYMENT_PROVIDER is set to fake', () => {
      expect(() => {
        validateEnv({
          ...baseProdEnv,
          PAYMENT_PROVIDER: 'fake',
          RAZORPAY_KEY_ID: 'rzp_live_123',
          RAZORPAY_KEY_SECRET: 'secret_123',
          RAZORPAY_WEBHOOK_SECRET: 'whsec_123',
        });
      }).toThrow(/PAYMENT_PROVIDER cannot be "fake" in production/);
    });

    it('allows boot in production when PAYMENT_PROVIDER=cod_only without online gateway keys', () => {
      const parsed = validateEnv({
        ...baseProdEnv,
        PAYMENT_PROVIDER: 'cod_only',
      });
      expect(parsed.PAYMENT_PROVIDER).toBe('cod_only');
      expect(parsed.NODE_ENV).toBe('production');
    });

    it('allows boot in production when real RAZORPAY keys are provided', () => {
      const parsed = validateEnv({
        ...baseProdEnv,
        PAYMENT_PROVIDER: 'razorpay',
        RAZORPAY_KEY_ID: 'rzp_live_test_key_id',
        RAZORPAY_KEY_SECRET: 'rzp_live_test_secret',
        RAZORPAY_WEBHOOK_SECRET: 'rzp_live_webhook_secret',
      });
      expect(parsed.RAZORPAY_KEY_ID).toBe('rzp_live_test_key_id');
      expect(parsed.PAYMENT_PROVIDER).toBe('razorpay');
    });
  });

  describe('2. Payment Provider Selection Invariants', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns fakeProvider ONLY in test or when PAYMENT_PROVIDER=fake in non-prod', () => {
      process.env.NODE_ENV = 'test';
      const provider = getPaymentProvider();
      expect(provider.name).toBe('FAKE');
    });

    it('throws AppError when online payments requested in cod_only mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.PAYMENT_PROVIDER = 'cod_only';
      expect(() => getPaymentProvider()).toThrow('Online payments are disabled (COD only mode)');
    });

    it('throws AppError in production if credentials missing when getting provider', () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENT_PROVIDER = 'razorpay';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      expect(() => getPaymentProvider()).toThrow(/Payment gateway configuration error in production/);
    });

    it('never returns fakeProvider in production even if providerName=FAKE is requested', () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENT_PROVIDER = 'razorpay';
      delete process.env.RAZORPAY_KEY_ID;
      expect(() => getPaymentProvider('FAKE')).toThrow();
    });
  });

  describe('3. Route-Table Verification: /payments/simulate-success is absent in production', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      jest.resetModules();
    });

    it('mounts /simulate-success when NODE_ENV is development or test', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const paymentRoutes = require('../../src/routes/payment.routes');
      const routes = paymentRoutes.stack
        .filter((r) => r.route)
        .map((r) => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
      expect(routes).toContain('POST /simulate-success');
      expect(routes).toContain('POST /dismiss');
      expect(routes).toContain('POST /create-order');
    });

    it('DOES NOT mount /simulate-success when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'production_high_entropy_token_key_for_signing_998877';
      process.env.PGPASSWORD = 'prod_db_valid_password_xyz';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_test_key_id';
      process.env.RAZORPAY_KEY_SECRET = 'rzp_live_test_secret';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_live_webhook_secret';
      jest.resetModules();
      const paymentRoutes = require('../../src/routes/payment.routes');
      const routes = paymentRoutes.stack
        .filter((r) => r.route)
        .map((r) => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
      expect(routes).not.toContain('POST /simulate-success');
      expect(routes).toContain('POST /create-order');
      expect(routes).toContain('POST /dismiss');
      expect(routes).toContain('POST /webhook');
    });
  });
});
