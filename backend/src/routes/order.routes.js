const { Router } = require('express');
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const { validateZod } = require('../middleware/validateZod');
const { createOrderSchema, cancelOrderSchema } = require('../schemas');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const idempotencyMiddleware = require('../middleware/idempotency');
const {
  createOrder,
  cancelOrder,
  listOrders,
  getOrder,
} = require('../controllers/order.controller');

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  authorize(PERMISSIONS.ORDERS_CREATE),
  idempotencyMiddleware({ ttlHours: 24 }),
  validateZod(createOrderSchema),
  createOrder
);

router.post(
  '/:id/cancel',
  authorize(PERMISSIONS.ORDERS_CANCEL_OWN),
  [param('id').isInt().toInt()],
  validate,
  validateZod(cancelOrderSchema),
  cancelOrder
);

router.get('/', authorize(PERMISSIONS.ORDERS_READ_OWN), listOrders);

router.get('/:id', authorize(PERMISSIONS.ORDERS_READ_OWN), [param('id').isInt().toInt()], validate, getOrder);

module.exports = router;
