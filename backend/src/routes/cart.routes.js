const { Router } = require('express');
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const { validateZod } = require('../middleware/validateZod');
const {
  addToCartSchema,
  updateCartItemSchema,
  applyCouponSchema,
  createReservationSchema,
  releaseReservationSchema,
} = require('../schemas');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
} = require('../controllers/cart.controller');

const router = Router();

router.use(requireAuth);

router.get('/', authorize(PERMISSIONS.CART_READ_OWN), getCart);

router.post('/', authorize(PERMISSIONS.CART_WRITE_OWN), validateZod(addToCartSchema), addToCart);

router.patch(
  '/:productId',
  authorize(PERMISSIONS.CART_WRITE_OWN),
  [param('productId').isInt().toInt()],
  validate,
  validateZod(updateCartItemSchema),
  updateCartItem
);

router.delete(
  '/:productId',
  authorize(PERMISSIONS.CART_WRITE_OWN),
  [param('productId').isInt().toInt()],
  validate,
  removeCartItem
);

router.delete('/', authorize(PERMISSIONS.CART_WRITE_OWN), clearCart);

router.post(
  '/coupon',
  authorize(PERMISSIONS.CART_WRITE_OWN),
  validateZod(applyCouponSchema),
  applyCoupon
);

router.delete('/coupon', authorize(PERMISSIONS.CART_WRITE_OWN), (req, res, next) => {
  getCart(req, res, next);
});

// Stock Reservation (10-minute hold & countdown during checkout)
const {
  reserveCheckout,
  getActiveReservation,
  releaseReservation,
} = require('../controllers/stockReservation.controller');

router.post(
  '/checkout/reserve',
  authorize(PERMISSIONS.CART_WRITE_OWN),
  validateZod(createReservationSchema),
  reserveCheckout
);
router.get('/checkout/reservation', authorize(PERMISSIONS.CART_READ_OWN), getActiveReservation);
router.post(
  '/checkout/release',
  authorize(PERMISSIONS.CART_WRITE_OWN),
  validateZod(releaseReservationSchema),
  releaseReservation
);

module.exports = router;
