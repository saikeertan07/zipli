/**
 * @file security.controller.js
 * @description Controllers for Security, Audit Logs, Fraud Queue, and Privacy (GDPR/DPDP).
 */

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const securityService = require('../services/security.service');
const { query } = require('../config/db');

/**
 * GET /api/security/audit-chain/verify
 * Walks cryptographic hash chain and verifies end-to-end integrity.
 */
const verifyAuditChain = asyncHandler(async (req, res) => {
  const result = await securityService.verifyAuditChainIntegrity();
  return res.json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/security/audit-logs
 * Retrieves paginated audit log entries.
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT a.*, u.name as admin_name, u.email as admin_email
     FROM admin_audit_logs a
     LEFT JOIN users u ON a.admin_id = u.id
     ORDER BY a.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countRes = await query('SELECT COUNT(*) as total FROM admin_audit_logs');
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  return res.json({
    status: 'success',
    data: {
      logs: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/security/audit-logs
 * Appends a new cryptographic audit record.
 */
const createAuditLog = asyncHandler(async (req, res) => {
  const { action, targetType, targetId, payload } = req.body;
  if (!action || !targetType) {
    throw new AppError('Action and targetType are required.', 400);
  }

  const record = await securityService.appendAuditLog({
    adminId: req.user ? req.user.id : null,
    action,
    targetType,
    targetId,
    payload,
  });

  return res.status(201).json({
    status: 'success',
    data: { log: record },
  });
});

/**
 * GET /api/security/fraud-queue
 * Retrieves orders requiring manual fraud review.
 */
const getFraudQueue = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));

  const result = await securityService.getFraudReviewQueue({ page, limit });
  return res.json({
    status: 'success',
    data: result,
  });
});

/**
 * POST /api/security/fraud-queue/:orderId/resolve
 * Resolves an order held in fraud review.
 */
const resolveFraudOrder = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const { decision, notes } = req.body;

  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new AppError('Decision must be either APPROVE or REJECT.', 400);
  }

  const order = await securityService.resolveFraudReview(
    orderId,
    req.user.id,
    decision,
    notes || ''
  );

  return res.json({
    status: 'success',
    data: { order },
  });
});

/**
 * GET /api/users/me/data-export
 * Full GDPR / DPDP personal data portability export.
 */
const exportUserData = asyncHandler(async (req, res) => {
  const exportData = await securityService.exportUserData(req.user.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="zipli_data_export_user_${req.user.id}.json"`
  );
  return res.json({
    status: 'success',
    data: exportData,
  });
});

/**
 * POST /api/users/me/delete-account
 * GDPR / DPDP right-to-erasure account anonymization.
 */
const deleteUserAccount = asyncHandler(async (req, res) => {
  const result = await securityService.anonymizeUserAccount(req.user.id, req.user.id);
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  return res.json({
    status: 'success',
    data: result,
  });
});

module.exports = {
  verifyAuditChain,
  getAuditLogs,
  createAuditLog,
  getFraudQueue,
  resolveFraudOrder,
  exportUserData,
  deleteUserAccount,
};
