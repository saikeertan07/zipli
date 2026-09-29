/**
 * @file compliance.routes.js
 * @description India DPDP (Digital Personal Data Protection Act 2023) & GDPR
 * compliance endpoints: consent records, data export, and right-to-be-forgotten deletion.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const { exportUserData, deleteUserAccount } = require('../controllers/security.controller');
const asyncHandler = require('../utils/asyncHandler');
const { query } = require('../config/db');

const router = Router();

router.use(requireAuth);

// GET /api/compliance/export (or POST /api/compliance/export)
router.get('/export', authorize(PERMISSIONS.USERS_READ_OWN), exportUserData);
router.post('/export', authorize(PERMISSIONS.USERS_READ_OWN), exportUserData);

// POST /api/compliance/delete (Right to be Forgotten)
router.post('/delete', authorize(PERMISSIONS.USERS_DELETE_OWN), deleteUserAccount);

// POST /api/compliance/consent (DPDP Notice & Consent management)
router.post(
  '/consent',
  authorize(PERMISSIONS.USERS_READ_OWN),
  asyncHandler(async (req, res) => {
    const { analyticsConsent = true, marketingConsent = false, communicationConsent = true } = req.body;
    const ip = req.ip || '127.0.0.1';

    const { rows } = await query(
      `INSERT INTO user_consents (user_id, analytics_consent, marketing_consent, communication_consent, version, ip_address, consented_at, updated_at)
       VALUES ($1, $2, $3, $4, 'dpdp_v1_2026', $5, NOW(), NOW())
       RETURNING id, user_id, analytics_consent, marketing_consent, communication_consent, version, ip_address, consented_at`,
      [req.user.id, Boolean(analyticsConsent), Boolean(marketingConsent), Boolean(communicationConsent), ip]
    );

    const consent = rows[0];

    res.status(200).json({
      status: 'success',
      message: 'DPDP consent preference recorded successfully',
      data: {
        analyticsConsent: consent.analytics_consent,
        marketingConsent: consent.marketing_consent,
        communicationConsent: consent.communication_consent,
        version: consent.version,
        consentedAt: consent.consented_at,
      },
    });
  })
);

// GET /api/compliance/consent
router.get(
  '/consent',
  authorize(PERMISSIONS.USERS_READ_OWN),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT analytics_consent, marketing_consent, communication_consent, version, consented_at
       FROM user_consents
       WHERE user_id = $1
       ORDER BY consented_at DESC LIMIT 1`,
      [req.user.id]
    );

    const consent =
      rows.length > 0
        ? {
            analyticsConsent: rows[0].analytics_consent,
            marketingConsent: rows[0].marketing_consent,
            communicationConsent: rows[0].communication_consent,
            version: rows[0].version,
            consentedAt: rows[0].consented_at,
          }
        : {
            analyticsConsent: true,
            marketingConsent: false,
            communicationConsent: true,
            version: 'default',
          };

    res.status(200).json({
      status: 'success',
      data: consent,
    });
  })
);

module.exports = router;
