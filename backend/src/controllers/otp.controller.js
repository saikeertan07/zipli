/**
 * @file otp.controller.js
 * @description Controller for Phone OTP dispatch and verification (P0).
 */

const asyncHandler = require('../utils/asyncHandler');
const { otpService } = require('../services/otp.service');

const sendOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const userId = req.user ? req.user.id : null;
  const result = await otpService.sendOtp(phone, userId);
  res.json({
    status: 'success',
    data: result,
  });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const userId = req.user ? req.user.id : null;
  const result = await otpService.verifyOtp(phone, otp, userId);
  res.json({
    status: 'success',
    data: result,
  });
});

module.exports = {
  sendOtp,
  verifyOtp,
};
