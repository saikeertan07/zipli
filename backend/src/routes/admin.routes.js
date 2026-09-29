const { Router } = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const validate = require('../middleware/validate');
const { validateZod } = require('../middleware/validateZod');
const {
  adminCreateProductSchema,
  adminUpdateProductSchema,
  adminAdjustStockSchema,
  adminUpdateOrderStatusSchema,
  adminDispatchJobSchema,
} = require('../schemas');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  listAdminOrders,
  updateOrderStatus,
  getAdminStats,
} = require('../controllers/admin.controller');

const router = Router();

// All admin routes require authentication, 'admin' role, and ADMIN_ACCESS permission
router.use(requireAuth, requireRole('admin'), authorize(PERMISSIONS.ADMIN_ACCESS));

// Product CRUD
router.post(
  '/products',
  authorize(PERMISSIONS.PRODUCTS_WRITE),
  validateZod(adminCreateProductSchema),
  [
    body('name').isString().trim().notEmpty(),
    body('qty_label').isString().trim().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('category_id').isString().trim().notEmpty(),
    body('stock').optional().isInt({ min: 0 }),
    body('reorder_level').optional().isInt({ min: 0 }),
  ],
  validate,
  createProduct
);

router.patch(
  '/products/:id',
  authorize(PERMISSIONS.PRODUCTS_WRITE),
  [param('id').isInt()],
  validate,
  validateZod(adminUpdateProductSchema),
  updateProduct
);

router.delete(
  '/products/:id',
  authorize(PERMISSIONS.PRODUCTS_DELETE),
  [param('id').isInt()],
  validate,
  deleteProduct
);

// Stock Adjustments
router.post(
  '/inventory/adjust',
  authorize(PERMISSIONS.INVENTORY_ADJUST),
  validateZod(adminAdjustStockSchema),
  [
    body('productId').isInt(),
    body('delta').isInt().not().equals('0').withMessage('Delta must be a non-zero integer'),
    body('reason').optional().isString().trim(),
  ],
  validate,
  adjustStock
);

// Orders management & state transitions
router.get(
  '/orders',
  authorize(PERMISSIONS.ORDERS_READ_ALL),
  [queryValidator('status').optional().isString(), queryValidator('userId').optional().isInt()],
  validate,
  listAdminOrders
);

router.patch(
  '/orders/:id/status',
  authorize(PERMISSIONS.ORDERS_UPDATE_STATUS),
  validateZod(adminUpdateOrderStatusSchema),
  [
    param('id').isInt(),
    body('status').isString().trim().notEmpty(),
    body('note').optional().isString().trim(),
  ],
  validate,
  updateOrderStatus
);

// Dashboard Statistics
router.get('/stats', authorize(PERMISSIONS.ADMIN_METRICS), getAdminStats);

// Background Job Queues Management & Dead Letter Queue (DLQ)
const {
  getQueueStats,
  getQueueJobs,
  retryDeadLetterJob,
  dispatchManualJob,
} = require('../controllers/queue.controller');

router.get('/queues', authorize(PERMISSIONS.QUEUES_MANAGE), getQueueStats);
router.get('/queues/:queueName/jobs', authorize(PERMISSIONS.QUEUES_MANAGE), getQueueJobs);
router.post('/queues/:queueName/retry/:jobId', authorize(PERMISSIONS.QUEUES_MANAGE), retryDeadLetterJob);
router.post(
  '/queues/dispatch',
  authorize(PERMISSIONS.QUEUES_MANAGE),
  validateZod(adminDispatchJobSchema),
  dispatchManualJob
);

module.exports = router;
