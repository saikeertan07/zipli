/**
 * @file otp.service.js
 * @description OTP Generation and Verification Service for phone verification (P0).
 */

const crypto = require('crypto');
const { query } = require('../config/db');
const { getSMSProvider } = require('./smsProvider');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function hashOtp(phone, otp) {
  return crypto.createHash('sha256').update(`${phone}:${otp}`).digest('hex');
}

class OTPService {
  /**
   * Generates and transmits a one-time password to the target phone number.
   *
   * @param {string} phone
   * @param {number} [userId]
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async sendOtp(phone, _userId = null) {
    // Check rate limit: maximum 1 OTP per 30 seconds for the same phone
    const recentRes = await query(
      `SELECT created_at FROM phone_verifications
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '30 seconds'
       LIMIT 1`,
      [phone]
    );

    if (recentRes.rows.length > 0) {
      throw new AppError('Please wait 30 seconds before requesting another OTP.', 429);
    }

    // Generate 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOtp(phone, otp);

    const { rows } = await query(
      `INSERT INTO phone_verifications (phone, otp_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       RETURNING id, expires_at`,
      [phone, otpHash]
    );

    const smsProvider = getSMSProvider();
    await smsProvider.sendOtp({ phone, otp });

    logger.info('OTP generated and dispatched', {
      phone: phone.slice(-4),
      verificationId: rows[0].id,
    });

    return {
      success: true,
      message: 'OTP sent successfully to your mobile number.',
      expiresAt: rows[0].expires_at,
    };
  }

  /**
   * Verifies an OTP and updates the user's verification status.
   *
   * @param {string} phone
   * @param {string} otp
   * @param {number} [userId]
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async verifyOtp(phone, otp, userId = null) {
    const { rows } = await query(
      `SELECT id, otp_hash, attempts, expires_at
       FROM phone_verifications
       WHERE phone = $1 AND verified_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [phone]
    );

    if (rows.length === 0) {
      throw new AppError('OTP expired or not found. Please request a new OTP.', 400);
    }

    const verification = rows[0];

    if (verification.attempts >= 5) {
      throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
    }

    const expectedHash = hashOtp(phone, otp);
    if (verification.otp_hash !== expectedHash) {
      await query(`UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1`, [
        verification.id,
      ]);
      throw new AppError('Invalid OTP. Please check and try again.', 400);
    }

    // Mark verification completed
    await query(`UPDATE phone_verifications SET verified_at = NOW() WHERE id = $1`, [
      verification.id,
    ]);

    // If a logged-in user is verifying their phone, update user profile
    if (userId) {
      await query(`UPDATE users SET is_phone_verified = true, phone = $1 WHERE id = $2`, [
        phone,
        userId,
      ]);
    }

    logger.info('OTP successfully verified', { phone: phone.slice(-4), userId });

    return {
      success: true,
      message: 'Phone number successfully verified.',
    };
  }
}

const otpService = new OTPService();

module.exports = {
  OTPService,
  otpService,
  hashOtp,
};
