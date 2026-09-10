/**
 * @file couponEngine.js
 * @description Pure coupon validation and pricing engine for Zipli Pro.
 * Computes discounts, enforces usage limits, and calculates final order totals.
 */

const COUPON_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FLAT: 'flat',
});

/**
 * Validates a coupon against a shopping cart and user redemption context.
 *
 * Time Complexity: O(1) - arithmetic and boundary checks
 * Space Complexity: O(1) - fixed size result object
 *
 * @param {Object} coupon - Database coupon record.
 * @param {Object} cart - User cart summary with itemTotal.
 * @param {Object} [context] - Execution context with timestamps and prior redemption counts.
 * @param {number|Date} [context.now=Date.now()]
 * @param {number} [context.userRedemptionCount=0]
 * @param {number} [context.totalRedemptionCount=0]
 * @returns {{ isValid: boolean, reason?: string, discountAmount: number }}
 */
function validateCoupon(coupon, cart, context = {}) {
  if (!coupon || !coupon.code) {
    return { isValid: false, reason: 'Coupon not found.', discountAmount: 0 };
  }

  if (coupon.is_active === false) {
    return { isValid: false, reason: 'This coupon is no longer active.', discountAmount: 0 };
  }

  const now = new Date(context.now || Date.now()).getTime();

  if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now) {
    return { isValid: false, reason: 'This coupon is not yet active.', discountAmount: 0 };
  }

  if (coupon.valid_to && new Date(coupon.valid_to).getTime() < now) {
    return { isValid: false, reason: 'This coupon has expired.', discountAmount: 0 };
  }

  const usageLimit = coupon.usage_limit;
  const totalRedemptions = context.totalRedemptionCount || 0;
  if (usageLimit !== null && usageLimit !== undefined && totalRedemptions >= usageLimit) {
    return { isValid: false, reason: 'Coupon total usage limit reached.', discountAmount: 0 };
  }

  const perUserLimit = coupon.per_user_limit || 1;
  const userRedemptions = context.userRedemptionCount || 0;
  if (userRedemptions >= perUserLimit) {
    return {
      isValid: false,
      reason: `You have already redeemed this coupon the maximum allowed times (${perUserLimit}).`,
      discountAmount: 0,
    };
  }

  const itemTotal = Number(cart?.itemTotal || 0);
  const minTotal = Number(coupon.min_total || 0);

  if (itemTotal < minTotal) {
    return {
      isValid: false,
      reason: `Cart total must be at least ₹${minTotal} to apply coupon ${coupon.code}.`,
      discountAmount: 0,
    };
  }

  // Calculate discount amount
  let discount = 0;
  const couponValue = Number(coupon.value);

  if (coupon.type === COUPON_TYPES.PERCENTAGE) {
    discount = (couponValue / 100) * itemTotal;
    if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }
  } else if (coupon.type === COUPON_TYPES.FLAT) {
    discount = Math.min(couponValue, itemTotal);
  } else {
    return { isValid: false, reason: `Unknown coupon type "${coupon.type}".`, discountAmount: 0 };
  }

  discount = Math.max(0, Math.round(discount * 100) / 100);

  return {
    isValid: true,
    discountAmount: discount,
  };
}

/**
 * Calculates complete pricing breakdown for cart/order including delivery, taxes, and coupons.
 *
 * Stackability rule: A maximum of one coupon may be applied per order.
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {number} itemTotal - Raw sum of line items.
 * @param {Object|null} [coupon] - Validated coupon object.
 * @param {Object} [config] - System pricing parameters.
 * @returns {Object} Pricing breakdown with itemTotal, deliveryFee, amountToFree, taxes, discountAmount, and grandTotal.
 */
function calculatePricing(itemTotal, coupon = null, config = {}) {
  const total = Number(itemTotal) || 0;
  const freeAbove = Number(
    config.FREE_DELIVERY_ABOVE !== undefined ? config.FREE_DELIVERY_ABOVE : 500
  );
  const standardDelivery = Number(config.DELIVERY_FEE !== undefined ? config.DELIVERY_FEE : 25);
  const taxRate = Number(config.TAX_RATE !== undefined ? config.TAX_RATE : 0.05);

  let discountAmount = 0;
  if (coupon) {
    const validation = validateCoupon(coupon, { itemTotal: total }, config.context || {});
    if (validation.isValid) {
      discountAmount = validation.discountAmount;
    }
  }

  const discountedTotal = Math.max(0, total - discountAmount);
  const deliveryFee = total === 0 || total >= freeAbove ? 0 : standardDelivery;
  const amountToFree = Math.max(0, freeAbove - total);
  const taxes = Number((discountedTotal * taxRate).toFixed(2));
  const grandTotal = Number((discountedTotal + deliveryFee + taxes).toFixed(2));

  return {
    itemTotal: total,
    discountAmount,
    deliveryFee,
    amountToFree,
    taxes,
    grandTotal,
    isFreeDelivery: deliveryFee === 0 && total > 0,
  };
}

/**
 * Allocates an order-level discount proportionally across line items using the
 * Largest Remainder (Hamilton-Hare) method.
 *
 * Invariant: SUM(allocatedDiscounts) === MIN(discountPaise, totalItemPaise)
 *
 * @param {Array<{ lineTotalPaise?: number, lineTotal?: number }>} items
 * @param {number} discountPaise
 * @returns {number[]} Allocated discount per line item in paise
 */
function allocateOrderDiscount(items, discountPaise) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const discount = Math.max(0, Math.round(Number(discountPaise) || 0));
  if (discount === 0) return items.map(() => 0);

  const totalPaise = items.reduce(
    (s, it) => s + Math.max(0, Math.round(Number(it.lineTotalPaise || it.lineTotal) || 0)),
    0
  );
  if (totalPaise === 0) return items.map(() => 0);

  const clampedDiscount = Math.min(discount, totalPaise);

  const shares = items.map((it, idx) => {
    const lineTotal = Math.max(0, Math.round(Number(it.lineTotalPaise || it.lineTotal) || 0));
    const exact = (lineTotal / totalPaise) * clampedDiscount;
    const base = Math.floor(exact);
    const rem = exact - base;
    return { idx, lineTotal, base, rem };
  });

  const allocatedSum = shares.reduce((s, x) => s + x.base, 0);
  const remainderToDistribute = clampedDiscount - allocatedSum;

  const sortedByRemainder = [...shares].sort((a, b) => b.rem - a.rem || a.idx - b.idx);

  for (let i = 0; i < remainderToDistribute; i++) {
    const item = sortedByRemainder[i % sortedByRemainder.length];
    if (item.base < item.lineTotal) {
      item.base += 1;
    }
  }

  shares.sort((a, b) => a.idx - b.idx);
  return shares.map((s) => s.base);
}

module.exports = {
  COUPON_TYPES,
  validateCoupon,
  calculatePricing,
  allocateOrderDiscount,
};
