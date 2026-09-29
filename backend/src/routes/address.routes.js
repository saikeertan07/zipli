/**
 * @file address.routes.js
 * @description Routes for User Addresses and Serviceability (P0).
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const { validateZod } = require('../middleware/validateZod');
const {
  createAddressSchema,
  updateAddressSchema,
  checkServiceabilitySchema,
} = require('../schemas');
const {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  checkServiceability,
} = require('../controllers/address.controller');

const router = Router();

// Public / pre-auth serviceability check
router.post(
  '/serviceability',
  validateZod(checkServiceabilitySchema),
  checkServiceability
);

// Authenticated user address management
router.use(requireAuth);

router.get('/', authorize(PERMISSIONS.USERS_READ_OWN), listAddresses);
router.post(
  '/',
  authorize(PERMISSIONS.USERS_WRITE_OWN),
  validateZod(createAddressSchema),
  createAddress
);
router.put(
  '/:id',
  authorize(PERMISSIONS.USERS_WRITE_OWN),
  validateZod(updateAddressSchema),
  updateAddress
);
router.delete('/:id', authorize(PERMISSIONS.USERS_WRITE_OWN), deleteAddress);

module.exports = router;
