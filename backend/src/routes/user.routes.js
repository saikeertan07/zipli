/**
 * @file user.routes.js
 * @description User Account & Privacy / GDPR / DPDP Routes.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const { exportUserData, deleteUserAccount } = require('../controllers/security.controller');
const { getMe } = require('../controllers/auth.controller');
const addressRoutes = require('./address.routes');

const router = Router();

router.use('/addresses', addressRoutes);

router.use(requireAuth);

router.get('/me', authorize(PERMISSIONS.USERS_READ_OWN), getMe);
router.get('/me/data-export', authorize(PERMISSIONS.USERS_READ_OWN), exportUserData);
router.post('/me/delete-account', authorize(PERMISSIONS.USERS_DELETE_OWN), deleteUserAccount);

module.exports = router;
