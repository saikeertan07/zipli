/**
 * @file otp.routes.js
 * @description Routes for OTP generation and verification (P0).
 */

const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { validateZod } = require('../middleware/validateZod');
const { sendOtpSchema, verifyOtpSchema } = require('../schemas');
const { sendOtp, verifyOtp } = require('../controllers/otp.controller');

const router = Router();

router.use(optionalAuth);

router.post('/send', validateZod(sendOtpSchema), sendOtp);
router.post('/verify', validateZod(verifyOtpSchema), verifyOtp);

module.exports = router;
