/**
 * @file security.routes.js
 * @description Admin Security, Cryptographic Hash Chain Audit Logs, and Fraud Queue Routes.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const { validateZod } = require('../middleware/validateZod');
const { createAuditLogSchema, resolveFraudSchema } = require('../schemas');
const {
  verifyAuditChain,
  getAuditLogs,
  createAuditLog,
  getFraudQueue,
  resolveFraudOrder,
} = require('../controllers/security.controller');

const router = Router();

// All security admin routes require authentication, admin role, and SECURITY_AUDIT permission
router.use(requireAuth, requireRole('admin'), authorize(PERMISSIONS.SECURITY_AUDIT));

router.get('/audit-chain/verify', verifyAuditChain);
router.get('/audit-logs', getAuditLogs);
router.post('/audit-logs', validateZod(createAuditLogSchema), createAuditLog);

router.get('/fraud-queue', getFraudQueue);
router.post('/fraud-queue/:orderId/resolve', validateZod(resolveFraudSchema), resolveFraudOrder);

module.exports = router;
