/**
 * @file paymentProvider.test.js
 * @description Unit tests for PaymentProvider, FakePaymentProvider, and RazorpayPaymentProvider.
 */

const {
  PaymentProvider,
  FakePaymentProvider,
  RazorpayPaymentProvider,
  getPaymentProvider,
  fakeProvider,
} = require('../../src/services/paymentProvider');
const AppError = require('../../src/utils/AppError');

describe('PaymentProvider Unit Tests', () => {
  describe('Abstract PaymentProvider Base Class', () => {
    class IncompleteProvider extends PaymentProvider {}
    const provider = new IncompleteProvider();

    it('throws when calling un-implemented methods', async () => {
      await expect(provider.createOrder({})).rejects.toThrow('createOrder() must be implemented');
      expect(() => provider.verifyWebhookSignature({})).toThrow(
        'verifyWebhookSignature() must be implemented'
      );
      await expect(provider.fetchPayment('pay_1')).rejects.toThrow(
        'fetchPayment() must be implemented'
      );
      await expect(provider.createRefund({})).rejects.toThrow('createRefund() must be implemented');
    });
  });

  describe('FakePaymentProvider', () => {
    const fake = new FakePaymentProvider({ secret: 'test_fake_secret' });

    it('creates and records orders', async () => {
      const order = await fake.createOrder({
        orderId: 42,
        amountPaise: 5000,
        notes: { tag: 'unit' },
      });
      expect(order.id).toMatch(/^order_fake_42_/);
      expect(order.amount).toBe(5000);
      expect(order.notes.tag).toBe('unit');
    });

    it('verifies signatures correctly and rejects invalid signatures', () => {
      const payload = JSON.stringify({ event: 'payment.captured', id: 'evt_1' });
      const validSig = fake.generateTestSignature(payload);

      // Empty signature / body
      expect(fake.verifyWebhookSignature({ rawBody: '', signature: validSig })).toBe(false);
      expect(fake.verifyWebhookSignature({ rawBody: payload, signature: '' })).toBe(false);

      // Signature length mismatch
      expect(fake.verifyWebhookSignature({ rawBody: payload, signature: 'abc' })).toBe(false);

      // Invalid signature content
      const badSig = validSig.slice(0, -1) + (validSig.endsWith('a') ? 'b' : 'a');
      expect(fake.verifyWebhookSignature({ rawBody: payload, signature: badSig })).toBe(false);

      // Valid signature
      expect(fake.verifyWebhookSignature({ rawBody: payload, signature: validSig })).toBe(true);
      expect(
        fake.verifyWebhookSignature({ rawBody: Buffer.from(payload), signature: validSig })
      ).toBe(true);

      // Timestamp within tolerance (seconds and milliseconds)
      const nowSec = Math.floor(Date.now() / 1000);
      expect(
        fake.verifyWebhookSignature({
          rawBody: payload,
          signature: validSig,
          timestamp: nowSec,
          toleranceSeconds: 300,
        })
      ).toBe(true);
      expect(
        fake.verifyWebhookSignature({
          rawBody: payload,
          signature: validSig,
          timestamp: Date.now(),
          toleranceSeconds: 300,
        })
      ).toBe(true);

      // Timestamp outside tolerance window
      expect(
        fake.verifyWebhookSignature({
          rawBody: payload,
          signature: validSig,
          timestamp: nowSec - 600,
          toleranceSeconds: 300,
        })
      ).toBe(false);
    });

    it('fetches simulated and stored payments', async () => {
      fake.payments.set('pay_stored', { id: 'pay_stored', amount: 999 });
      const stored = await fake.fetchPayment('pay_stored');
      expect(stored.amount).toBe(999);

      const generated = await fake.fetchPayment('pay_unseen');
      expect(generated.id).toBe('pay_unseen');
      expect(generated.status).toBe('captured');
    });

    it('creates refunds', async () => {
      const ref = await fake.createRefund({
        paymentId: 'pay_123',
        amountPaise: 2500,
        reason: 'RETURN',
      });
      expect(ref.id).toMatch(/^rfnd_fake_/);
      expect(ref.amount).toBe(2500);
      expect(ref.status).toBe('processed');
    });
  });

  describe('RazorpayPaymentProvider', () => {
    it('rejects order creation if keys are missing', async () => {
      const rzp = new RazorpayPaymentProvider({ keyId: null, keySecret: null });
      await expect(rzp.createOrder({ orderId: 10, amountPaise: 1000 })).rejects.toThrow(AppError);
    });

    it('verifies signatures and checks secrets/timestamps', () => {
      const rzp = new RazorpayPaymentProvider({ webhookSecret: 'rzp_secret_key' });
      const payload = '{"status":"captured"}';
      const crypto = require('crypto');
      const validSig = crypto.createHmac('sha256', 'rzp_secret_key').update(payload).digest('hex');

      expect(rzp.verifyWebhookSignature({ rawBody: '', signature: validSig })).toBe(false);
      expect(rzp.verifyWebhookSignature({ rawBody: payload, signature: '' })).toBe(false);

      // Missing secret
      const rzpNoSecret = new RazorpayPaymentProvider({ webhookSecret: null });
      expect(rzpNoSecret.verifyWebhookSignature({ rawBody: payload, signature: validSig })).toBe(
        false
      );

      // Valid signature
      expect(rzp.verifyWebhookSignature({ rawBody: payload, signature: validSig })).toBe(true);
      expect(
        rzp.verifyWebhookSignature({ rawBody: Buffer.from(payload), signature: validSig })
      ).toBe(true);

      // Timestamp checks
      const nowSec = Math.floor(Date.now() / 1000);
      expect(
        rzp.verifyWebhookSignature({ rawBody: payload, signature: validSig, timestamp: nowSec })
      ).toBe(true);
      expect(
        rzp.verifyWebhookSignature({
          rawBody: payload,
          signature: validSig,
          timestamp: nowSec - 500,
          toleranceSeconds: 300,
        })
      ).toBe(false);

      // Mismatched signature
      const badSig = validSig.slice(0, -1) + (validSig.endsWith('0') ? '1' : '0');
      expect(rzp.verifyWebhookSignature({ rawBody: payload, signature: badSig })).toBe(false);
      expect(rzp.verifyWebhookSignature({ rawBody: payload, signature: 'short' })).toBe(false);
    });

    it('handles createOrder, fetchPayment, createRefund with mocked fetch', async () => {
      const rzp = new RazorpayPaymentProvider({
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
        apiBase: 'https://mock.razorpay.test',
      });

      const originalFetch = global.fetch;

      try {
        // Mock success
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ id: 'order_rzp_mock', amount: 5000, status: 'created' }),
        });

        const order = await rzp.createOrder({ orderId: 99, amountPaise: 5000 });
        expect(order.id).toBe('order_rzp_mock');

        // Mock payment fetch
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ id: 'pay_rzp_1', status: 'captured' }),
        });
        const payment = await rzp.fetchPayment('pay_rzp_1');
        expect(payment.id).toBe('pay_rzp_1');

        // Mock refund
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ id: 'rfnd_rzp_1', status: 'processed' }),
        });
        const refund = await rzp.createRefund({ paymentId: 'pay_rzp_1', amountPaise: 1000 });
        expect(refund.id).toBe('rfnd_rzp_1');

        // Mock failure responses
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid parameter',
        });
        await expect(rzp.createOrder({ orderId: 99, amountPaise: 5000 })).rejects.toThrow(AppError);
        await expect(rzp.fetchPayment('pay_bad')).rejects.toThrow(AppError);
        await expect(rzp.createRefund({ paymentId: 'pay_bad', amountPaise: 500 })).rejects.toThrow(
          AppError
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('getPaymentProvider Factory', () => {
    it('returns fakeProvider for FAKE name or test env', () => {
      const provider = getPaymentProvider('FAKE');
      expect(provider).toBe(fakeProvider);
    });
  });
});
