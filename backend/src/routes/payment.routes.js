/**
 * @file payment.routes.js
 * @description Routes for payment lifecycle: order creation, signed webhook processing,
 * and refunds.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const {
  createPaymentOrder,
  handlePaymentWebhook,
  refundPayment,
  simulatePaymentSuccess,
  dismissPaymentOrder,
} = require('../controllers/payment.controller');

const router = Router();

// Create payment order with gateway provider
router.post('/create-order', requireAuth, authorize(PERMISSIONS.ORDERS_CREATE), createPaymentOrder);

// Dismiss payment / cancel pending order (releases stock hold on modal close)
router.post('/dismiss', requireAuth, authorize(PERMISSIONS.ORDERS_CREATE), dismissPaymentOrder);

// Simulate payment webhook capture (MOUNTED STRICTLY IN NON-PRODUCTION ENVIRONMENTS - P0)
if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/simulate-success',
    requireAuth,
    authorize(PERMISSIONS.ORDERS_CREATE),
    simulatePaymentSuccess
  );
}

// Gateway webhook ingestion (public, authenticated via HMAC signature)
router.post('/webhook', handlePaymentWebhook);

// Refund route (requires auth + staff permission check)
router.post('/refund', requireAuth, authorize(PERMISSIONS.ORDERS_REFUND_APPROVE), refundPayment);

module.exports = router;
