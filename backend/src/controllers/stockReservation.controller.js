const { stockReservationService } = require('../services/stockReservation.service');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/cart/checkout/reserve
 * Holds stock for 10 minutes during checkout.
 */
const reserveCheckout = asyncHandler(async (req, res) => {
  let items = req.body.items;

  // If items not explicitly provided, pull user's current active cart
  if (!items || !items.length) {
    const cartRes = await query(
      `SELECT product_id AS "productId", quantity
       FROM cart_items
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (cartRes.rows.length === 0) {
      throw new AppError('Cannot reserve stock for empty cart', 400);
    }
    items = cartRes.rows;
  }

  const reservation = await stockReservationService.reserveCheckoutStock(req.user.id, items);

  res.status(200).json({
    status: 'success',
    data: reservation,
  });
});

/**
 * GET /api/cart/checkout/reservation
 * Retrieves active reservation hold and countdown for current user.
 */
const getActiveReservation = asyncHandler(async (req, res) => {
  const reservation = await stockReservationService.getActiveReservation(req.user.id);

  res.status(200).json({
    status: 'success',
    data: reservation,
  });
});

/**
 * POST /api/cart/checkout/release
 * Manually cancels / releases held stock.
 */
const releaseReservation = asyncHandler(async (req, res) => {
  const count = await stockReservationService.releaseUserReservation(req.user.id);

  res.status(200).json({
    status: 'success',
    message: 'Reservation released successfully',
    data: { releasedCount: count },
  });
});

module.exports = {
  reserveCheckout,
  getActiveReservation,
  releaseReservation,
};
