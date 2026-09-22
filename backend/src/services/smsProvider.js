/**
 * @file smsProvider.js
 * @description SMS provider abstraction layer for phone OTP verification
 * and order status notifications (P0 / P2).
 */

const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

class SMSProvider {
  /**
   * @param {Object} params
   * @param {string} params.phone
   * @param {string} params.otp
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendOtp(_params) {
    throw new Error('sendOtp() must be implemented by provider');
  }

  /**
   * @param {Object} params
   * @param {string} params.phone
   * @param {string} params.message
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendNotification(_params) {
    throw new Error('sendNotification() must be implemented by provider');
  }
}

/**
 * In-memory deterministic fake SMS provider for testing and offline environments.
 */
class FakeSMSProvider extends SMSProvider {
  constructor() {
    super();
    this.name = 'FAKE';
    this.sentMessages = [];
    this.otpsByPhone = new Map();
  }

  async sendOtp({ phone, otp }) {
    const messageId = `msg_otp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      messageId,
      phone,
      otp,
      type: 'OTP',
      timestamp: new Date().toISOString(),
    };
    this.sentMessages.push(record);
    this.otpsByPhone.set(phone, otp);
    logger.info(`[FakeSMSProvider] Sent OTP "${otp}" to ${phone}`, { messageId });
    return { success: true, messageId };
  }

  async sendNotification({ phone, message }) {
    const messageId = `msg_notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      messageId,
      phone,
      message,
      type: 'NOTIFICATION',
      timestamp: new Date().toISOString(),
    };
    this.sentMessages.push(record);
    logger.info(`[FakeSMSProvider] Sent Notification to ${phone}: ${message}`, { messageId });
    return { success: true, messageId };
  }

  getLastOtp(phone) {
    return this.otpsByPhone.get(phone) || null;
  }

  clear() {
    this.sentMessages = [];
    this.otpsByPhone.clear();
  }
}

/**
 * Real SMS Provider using external REST API (e.g. Twilio / Fast2SMS).
 */
class Fast2SMSSMSProvider extends SMSProvider {
  constructor(options = {}) {
    super();
    this.name = 'FAST2SMS';
    this.apiKey = options.apiKey || process.env.SMS_API_KEY;
    this.apiBase = options.apiBase || 'https://www.fast2sms.com/dev/bulkV2';
  }

  async sendOtp({ phone, otp }) {
    if (!this.apiKey) {
      throw new AppError('SMS_API_KEY is not configured', 500);
    }
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const response = await fetch(
      `${this.apiBase}?authorization=${this.apiKey}&variables_values=${otp}&route=otp&numbers=${cleanPhone}`,
      {
        method: 'GET',
        headers: { 'cache-control': 'no-cache' },
      }
    );
    if (!response.ok) {
      throw new AppError(`SMS gateway returned error: ${response.status}`, 502);
    }
    const data = await response.json();
    return { success: true, messageId: data.request_id || `sms_${Date.now()}` };
  }

  async sendNotification({ phone, message }) {
    if (!this.apiKey) {
      throw new AppError('SMS_API_KEY is not configured', 500);
    }
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const response = await fetch(
      `${this.apiBase}?authorization=${this.apiKey}&message=${encodeURIComponent(message)}&language=english&route=q&numbers=${cleanPhone}`,
      {
        method: 'POST',
        headers: { 'cache-control': 'no-cache' },
      }
    );
    if (!response.ok) {
      throw new AppError(`SMS gateway notification error: ${response.status}`, 502);
    }
    const data = await response.json();
    return { success: true, messageId: data.request_id || `notif_${Date.now()}` };
  }
}

const fakeSMSProvider = new FakeSMSProvider();
let fast2smsProvider = null;

function getSMSProvider() {
  if (process.env.NODE_ENV === 'test' || !process.env.SMS_API_KEY) {
    return fakeSMSProvider;
  }
  if (!fast2smsProvider) {
    fast2smsProvider = new Fast2SMSSMSProvider();
  }
  return fast2smsProvider;
}

module.exports = {
  SMSProvider,
  FakeSMSProvider,
  Fast2SMSSMSProvider,
  getSMSProvider,
  fakeSMSProvider,
};
