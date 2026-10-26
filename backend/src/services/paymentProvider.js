/**
 * @file paymentProvider.js
 * @description Payment provider abstraction layer with Fake (deterministic tests)
 * and Razorpay adapter. Supports HMAC signature verification, timestamp tolerance,
 * and server-side amount verification.
 */

const crypto = require('crypto');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Abstract PaymentProvider interface.
 */
class PaymentProvider {
  /**
   * @param {Object} params
   * @param {string|number} params.orderId
   * @param {number} params.amountPaise
   * @param {string} [params.currency='INR']
   * @param {Object} [params.notes={}]
   * @returns {Promise<Object>} Provider order object
   */
  async createOrder(_params) {
    throw new Error('createOrder() must be implemented by provider adapter');
  }

  /**
   * @param {Object} params
   * @param {string|Buffer} params.rawBody
   * @param {string} params.signature
   * @param {string} params.secret
   * @param {number} [params.timestamp]
   * @returns {boolean} True if signature is valid and within timestamp window
   */
  verifyWebhookSignature(_params) {
    throw new Error('verifyWebhookSignature() must be implemented by provider adapter');
  }

  /**
   * @param {string} _paymentId
   * @returns {Promise<Object>}
   */
  async fetchPayment(_paymentId) {
    throw new Error('fetchPayment() must be implemented by provider adapter');
  }

  /**
   * @param {Object} params
   * @param {string} params.paymentId
   * @param {number} params.amountPaise
   * @param {string} [params.reason]
   * @param {Object} [params.notes]
   * @returns {Promise<Object>}
   */
  async createRefund(_params) {
    throw new Error('createRefund() must be implemented by provider adapter');
  }
}

/**
 * Deterministic FakePaymentProvider for tests and offline local environments.
 */
class FakePaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.name = 'FAKE';
    this.secret = options.secret || 'fake_webhook_secret_key_12345';
    this.orders = new Map();
    this.payments = new Map();
    this.refunds = new Map();
  }

  async createOrder({ orderId, amountPaise, currency = 'INR', notes = {} }) {
    const providerOrderId = `order_fake_${orderId}_${Date.now()}`;
    const orderData = {
      id: providerOrderId,
      entity: 'order',
      amount: Math.round(Number(amountPaise)),
      amount_paid: 0,
      amount_due: Math.round(Number(amountPaise)),
      currency,
      receipt: String(orderId),
      status: 'created',
      notes,
      created_at: Math.floor(Date.now() / 1000),
    };

    this.orders.set(providerOrderId, orderData);
    return orderData;
  }

  verifyWebhookSignature({
    rawBody,
    signature,
    secret = null,
    timestamp = null,
    toleranceSeconds = 300,
  }) {
    if (!signature || !rawBody) {
      return false;
    }

    // Timestamp replay protection (± tolerance window)
    if (timestamp !== null && timestamp !== undefined) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const eventSeconds = Math.floor(
        Number(timestamp) > 1e11 ? Number(timestamp) / 1000 : Number(timestamp)
      );
      if (Math.abs(nowSeconds - eventSeconds) > toleranceSeconds) {
        logger.warn('Webhook rejected due to timestamp drift', {
          nowSeconds,
          eventSeconds,
          toleranceSeconds,
        });
        return false;
      }
    }

    const signingKey = secret || this.secret;
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', signingKey).update(bodyStr).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  generateTestSignature(payload, secret = null) {
    const key = secret || this.secret;
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', key).update(bodyStr).digest('hex');
  }

  async fetchPayment(paymentId) {
    if (this.payments.has(paymentId)) {
      return this.payments.get(paymentId);
    }
    const pidStr = String(paymentId).toLowerCase();
    if (
      pidStr.includes('failed') ||
      pidStr.includes('unpaid') ||
      pidStr.includes('expired') ||
      pidStr.includes('stuck')
    ) {
      return {
        id: paymentId,
        entity: 'payment',
        amount: 10000,
        currency: 'INR',
        status: 'failed',
        method: 'upi',
        created_at: Math.floor(Date.now() / 1000),
      };
    }
    // Return synthetic simulated payment
    return {
      id: paymentId,
      entity: 'payment',
      amount: 10000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  async createRefund({ paymentId, amountPaise, reason = 'CUSTOMER_REQUEST', notes = {} }) {
    const refundId = `rfnd_fake_${Date.now()}`;
    const refund = {
      id: refundId,
      entity: 'refund',
      payment_id: paymentId,
      amount: Math.round(Number(amountPaise)),
      currency: 'INR',
      status: 'processed',
      notes: { ...notes, reason },
      created_at: Math.floor(Date.now() / 1000),
    };
    this.refunds.set(refundId, refund);
    return refund;
  }
}

/**
 * Production Razorpay Payment Provider Adapter.
 */
class RazorpayPaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.name = 'RAZORPAY';
    this.keyId = options.keyId || process.env.RAZORPAY_KEY_ID;
    this.keySecret = options.keySecret || process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
    this.apiBase = options.apiBase || 'https://api.razorpay.com/v1';
  }

  async createOrder({ orderId, amountPaise, currency = 'INR', notes = {} }) {
    if (!this.keyId || !this.keySecret) {
      throw new AppError('Razorpay API keys not configured', 500);
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const body = JSON.stringify({
      amount: Math.round(Number(amountPaise)),
      currency,
      receipt: `zipli_${orderId}`,
      notes,
    });

    const response = await fetch(`${this.apiBase}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body,
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error('Razorpay order creation failed', { status: response.status, errBody });
      throw new AppError(`Payment provider order creation failed: ${response.statusText}`, 502);
    }

    return response.json();
  }

  verifyWebhookSignature({
    rawBody,
    signature,
    secret = null,
    timestamp = null,
    toleranceSeconds = 300,
  }) {
    if (!signature || !rawBody) {
      return false;
    }

    if (timestamp !== null && timestamp !== undefined) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const eventSeconds = Math.floor(
        Number(timestamp) > 1e11 ? Number(timestamp) / 1000 : Number(timestamp)
      );
      if (Math.abs(nowSeconds - eventSeconds) > toleranceSeconds) {
        logger.warn('Razorpay webhook timestamp out of tolerance', { nowSeconds, eventSeconds });
        return false;
      }
    }

    const key = secret || this.webhookSecret;
    if (!key) {
      logger.error('Cannot verify webhook signature: RAZORPAY_WEBHOOK_SECRET not set');
      return false;
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', key).update(bodyStr).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  async fetchPayment(paymentId) {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch(`${this.apiBase}/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) {
      throw new AppError(`Failed to fetch payment from provider: ${response.status}`, 502);
    }
    return response.json();
  }

  async createRefund({ paymentId, amountPaise, reason = 'CUSTOMER_REQUEST', notes = {} }) {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const body = JSON.stringify({
      amount: Math.round(Number(amountPaise)),
      notes: { ...notes, reason },
    });

    const response = await fetch(`${this.apiBase}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new AppError(`Razorpay refund failed: ${errBody}`, 502);
    }

    return response.json();
  }
}

// Singleton instances
const fakeProvider = new FakePaymentProvider();
let razorpayProvider = null;

function getPaymentProvider(providerName = null) {
  const isTest = process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';
  const configuredProvider = (process.env.PAYMENT_PROVIDER || '').toLowerCase();

  // If online payments are explicitly disabled
  if (configuredProvider === 'cod_only' || providerName === 'cod_only') {
    throw new AppError('Online payments are disabled (COD only mode)', 400);
  }

  // Fake provider ONLY when NODE_ENV=test or (PAYMENT_PROVIDER=fake AND NODE_ENV!=production)
  if (
    isTest ||
    (configuredProvider === 'fake' && !isProd) ||
    (providerName === 'FAKE' && !isProd)
  ) {
    return fakeProvider;
  }

  // In production, missing credentials is a critical configuration error
  if (isProd) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new AppError(
        'Payment gateway configuration error in production: missing credentials',
        500
      );
    }
  }

  // If Razorpay keys are not configured in non-production, fallback to fakeProvider for local dev and testing
  if (!isProd && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
    return fakeProvider;
  }

  if (!razorpayProvider) {
    razorpayProvider = new RazorpayPaymentProvider();
  }
  return razorpayProvider;
}

module.exports = {
  PaymentProvider,
  FakePaymentProvider,
  RazorpayPaymentProvider,
  getPaymentProvider,
  fakeProvider,
};
