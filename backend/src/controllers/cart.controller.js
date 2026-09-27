const { query } = require('../config/db');
const { env } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { calculatePricing, validateCoupon } = require('../algo/couponEngine');

async function buildCartResponse(userId, appliedCouponCode = null) {
  const { rows } = await query(
    `SELECT ci.product_id, ci.quantity,
            p.name, p.qty_label AS qty, p.price, p.mrp, p.emoji, p.category_id AS cat,
            p.badge, p.image_url AS img, p.stock, p.is_active
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1
     ORDER BY ci.created_at ASC`,
    [userId]
  );

  const items = rows.map((r) => ({
    productId: r.product_id,
    quantity: r.quantity,
    name: r.name,
    qty: r.qty,
    price: Number(r.price),
    mrp: Number(r.mrp),
    emoji: r.emoji,
    cat: r.cat,
    badge: r.badge,
    img: r.img,
    stock: r.stock,
    isActive: r.is_active,
    lineTotal: Number(r.price) * r.quantity,
  }));

  const itemTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  let coupon = null;
  if (appliedCouponCode) {
    const couponRes = await query('SELECT * FROM coupons WHERE code = $1', [
      appliedCouponCode.trim().toUpperCase(),
    ]);
    if (couponRes.rows.length) {
      coupon = couponRes.rows[0];
    }
  }

  const pricing = calculatePricing(itemTotal, coupon, {
    FREE_DELIVERY_ABOVE: env.FREE_DELIVERY_ABOVE || 500,
    DELIVERY_FEE: env.DELIVERY_FEE,
    TAX_RATE: 0.05,
  });

  return {
    items,
    itemCount,
    itemTotal: pricing.itemTotal,
    deliveryFee: pricing.deliveryFee,
    amountToFree: pricing.amountToFree,
    taxes: pricing.taxes,
    discountAmount: pricing.discountAmount,
    grandTotal: pricing.grandTotal,
    isFreeDelivery: pricing.isFreeDelivery,
    appliedCoupon: coupon ? coupon.code : null,
  };
}

// GET /api/cart
const getCart = asyncHandler(async (req, res) => {
  const cart = await buildCartResponse(req.user.id);
  res.json({ status: 'success', data: { cart } });
});

// POST /api/cart  { productId, quantity }
const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  const product = await query('SELECT id, stock, is_active FROM products WHERE id = $1', [
    productId,
  ]);
  if (!product.rows.length) {
    throw new AppError('Product not found.', 404);
  }

  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()`,
    [req.user.id, productId, quantity]
  );

  const cart = await buildCartResponse(req.user.id);
  res.status(201).json({ status: 'success', data: { cart } });
});

// PATCH /api/cart/:productId  { quantity }
const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  if (quantity <= 0) {
    await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
      req.user.id,
      productId,
    ]);
  } else {
    const result = await query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW()
       WHERE user_id = $2 AND product_id = $3
       RETURNING id`,
      [quantity, req.user.id, productId]
    );
    if (!result.rows.length) {
      throw new AppError('This item is not in your cart.', 404);
    }
  }

  const cart = await buildCartResponse(req.user.id);
  res.json({ status: 'success', data: { cart } });
});

// DELETE /api/cart/:productId
const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
    req.user.id,
    productId,
  ]);
  const cart = await buildCartResponse(req.user.id);
  res.json({ status: 'success', data: { cart } });
});

// DELETE /api/cart
const clearCart = asyncHandler(async (req, res) => {
  await query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
  const cart = await buildCartResponse(req.user.id);
  res.json({ status: 'success', data: { cart } });
});

// POST /api/cart/coupon  { code }
const applyCoupon = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    throw new AppError('Coupon code is required.', 400);
  }

  const cleanCode = code.trim().toUpperCase();
  const couponResult = await query('SELECT * FROM coupons WHERE code = $1', [cleanCode]);

  if (!couponResult.rows.length) {
    throw new AppError('Coupon does not exist.', 404);
  }

  const coupon = couponResult.rows[0];

  // User redemption count & total redemption count
  const userRedemptions = await query(
    'SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2',
    [cleanCode, req.user.id]
  );
  const totalRedemptions = await query(
    'SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_code = $1',
    [cleanCode]
  );

  const cart = await buildCartResponse(req.user.id);
  const validation = validateCoupon(coupon, cart, {
    userRedemptionCount: parseInt(userRedemptions.rows[0].count, 10),
    totalRedemptionCount: parseInt(totalRedemptions.rows[0].count, 10),
  });

  if (!validation.isValid) {
    throw new AppError(validation.reason, 400);
  }

  const updatedCart = await buildCartResponse(req.user.id, cleanCode);

  res.json({
    status: 'success',
    message: `Coupon ${cleanCode} applied! You saved ₹${validation.discountAmount}.`,
    data: {
      coupon: cleanCode,
      discountAmount: validation.discountAmount,
      cart: updatedCart,
    },
  });
});

module.exports = {
  buildCartResponse,
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
};
