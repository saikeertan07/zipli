const { Router } = require('express');
const { validateZod } = require('../middleware/validateZod');
const { registerSchema, loginSchema, mfaVerifySchema } = require('../schemas');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const {
  register,
  login,
  refresh,
  logout,
  getMe,
  getCsrfToken,
  setupMfa,
  verifyMfa,
} = require('../controllers/auth.controller');
const otpRoutes = require('./otp.routes');

const router = Router();

router.use('/otp', otpRoutes);

router.get('/csrf-token', getCsrfToken);
router.post('/register', validateZod(registerSchema), register);
router.post('/login', validateZod(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, authorize(PERMISSIONS.USERS_READ_OWN), getMe);

// TOTP MFA setup & verification (F-015, SEC-AUTH-02)
router.post('/mfa/setup', requireAuth, authorize(PERMISSIONS.USERS_WRITE_OWN), setupMfa);
router.post(
  '/mfa/verify',
  requireAuth,
  authorize(PERMISSIONS.USERS_WRITE_OWN),
  validateZod(mfaVerifySchema),
  verifyMfa
);

module.exports = router;
