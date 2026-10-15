const { COUPON_TYPES, validateCoupon, calculatePricing } = require('../../src/algo/couponEngine');

describe('Pure Coupon & Pricing Engine (/algo/couponEngine.js)', () => {
  const baseCart = { itemTotal: 600 };

  describe('validateCoupon', () => {
    it('calculates correct percentage discount with max_discount cap', () => {
      const coupon = {
        code: 'SAVE20',
        type: COUPON_TYPES.PERCENTAGE,
        value: 20, // 20%
        min_total: 200,
        max_discount: 100, // Capped at 100
        is_active: true,
      };

      // 20% of 600 is 120, capped at 100
      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(100);
    });

    it('calculates percentage discount without cap', () => {
      const coupon = {
        code: 'SAVE10',
        type: COUPON_TYPES.PERCENTAGE,
        value: 10, // 10%
        min_total: 100,
        max_discount: null,
        is_active: true,
      };

      // 10% of 600 is 60
      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(60);
    });

    it('calculates flat discount correctly', () => {
      const coupon = {
        code: 'FLAT50',
        type: COUPON_TYPES.FLAT,
        value: 50,
        min_total: 300,
        is_active: true,
      };

      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(50);
    });

    it('caps flat discount to itemTotal so total never goes negative', () => {
      const coupon = {
        code: 'FLAT500',
        type: COUPON_TYPES.FLAT,
        value: 500,
        min_total: 100,
        is_active: true,
      };

      const result = validateCoupon(coupon, { itemTotal: 250 });
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(250);
    });

    it('rejects coupon when itemTotal is below min_total', () => {
      const coupon = {
        code: 'BIGSAVER',
        type: COUPON_TYPES.FLAT,
        value: 100,
        min_total: 1000,
        is_active: true,
      };

      const result = validateCoupon(coupon, { itemTotal: 500 });
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/Cart total must be at least ₹1000/);
      expect(result.discountAmount).toBe(0);
    });

    it('rejects expired coupons', () => {
      const coupon = {
        code: 'EXPIRED10',
        type: COUPON_TYPES.FLAT,
        value: 50,
        valid_to: new Date(Date.now() - 3600000).toISOString(),
        is_active: true,
      };

      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/expired/);
    });

    it('rejects future not-yet-active coupons', () => {
      const coupon = {
        code: 'FUTURE10',
        type: COUPON_TYPES.FLAT,
        value: 50,
        valid_from: new Date(Date.now() + 3600000).toISOString(),
        is_active: true,
      };

      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/not yet active/);
    });

    it('rejects deactivated coupons', () => {
      const coupon = {
        code: 'DISABLED',
        type: COUPON_TYPES.FLAT,
        value: 50,
        is_active: false,
      };

      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/no longer active/);
    });

    it('rejects when usage_limit has been reached', () => {
      const coupon = {
        code: 'LIMITED',
        type: COUPON_TYPES.FLAT,
        value: 50,
        usage_limit: 10,
        is_active: true,
      };

      const result = validateCoupon(coupon, baseCart, { totalRedemptionCount: 10 });
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/total usage limit reached/);
    });

    it('rejects when per_user_limit is exceeded', () => {
      const coupon = {
        code: 'ONCEONLY',
        type: COUPON_TYPES.FLAT,
        value: 50,
        per_user_limit: 1,
        is_active: true,
      };

      const result = validateCoupon(coupon, baseCart, { userRedemptionCount: 1 });
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/already redeemed this coupon/);
    });

    it('rejects non-existent coupon or null input', () => {
      expect(validateCoupon(null, baseCart).isValid).toBe(false);
      expect(validateCoupon({}, baseCart).isValid).toBe(false);
    });
  });

  describe('calculatePricing', () => {
    it('calculates pricing for orders above free delivery threshold (FREE delivery)', () => {
      const pricing = calculatePricing(600, null, {
        FREE_DELIVERY_ABOVE: 500,
        DELIVERY_FEE: 25,
        TAX_RATE: 0.05,
      });

      expect(pricing.itemTotal).toBe(600);
      expect(pricing.discountAmount).toBe(0);
      expect(pricing.deliveryFee).toBe(0);
      expect(pricing.amountToFree).toBe(0);
      expect(pricing.taxes).toBe(30); // 5% of 600
      expect(pricing.grandTotal).toBe(630);
      expect(pricing.isFreeDelivery).toBe(true);
    });

    it('calculates pricing for orders below free delivery threshold with delivery fee', () => {
      const pricing = calculatePricing(300, null, {
        FREE_DELIVERY_ABOVE: 500,
        DELIVERY_FEE: 25,
        TAX_RATE: 0.05,
      });

      expect(pricing.itemTotal).toBe(300);
      expect(pricing.discountAmount).toBe(0);
      expect(pricing.deliveryFee).toBe(25);
      expect(pricing.amountToFree).toBe(200);
      expect(pricing.taxes).toBe(15); // 5% of 300
      expect(pricing.grandTotal).toBe(340); // 300 + 25 + 15
      expect(pricing.isFreeDelivery).toBe(false);
    });

    it('integrates coupon discount and re-computes taxes on discounted amount', () => {
      const coupon = {
        code: 'DISCOUNT50',
        type: COUPON_TYPES.FLAT,
        value: 50,
        min_total: 200,
        is_active: true,
      };

      const pricing = calculatePricing(400, coupon, {
        FREE_DELIVERY_ABOVE: 500,
        DELIVERY_FEE: 25,
        TAX_RATE: 0.05,
      });

      expect(pricing.itemTotal).toBe(400);
      expect(pricing.discountAmount).toBe(50);
      expect(pricing.deliveryFee).toBe(25);
      expect(pricing.taxes).toBe(17.5); // 5% of (400 - 50) = 17.5
      expect(pricing.grandTotal).toBe(392.5); // 350 + 25 + 17.5
    });

    it('handles zero item total', () => {
      const pricing = calculatePricing(0);
      expect(pricing.itemTotal).toBe(0);
      expect(pricing.deliveryFee).toBe(0);
      expect(pricing.grandTotal).toBe(0);
    });

    it('rejects unknown coupon type', () => {
      const coupon = {
        code: 'UNKNOWN',
        type: 'bogo',
        value: 10,
        is_active: true,
      };
      const result = validateCoupon(coupon, baseCart);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Unknown coupon type');
    });

    it('handles invalid coupon gracefully during pricing calculation', () => {
      const invalidCoupon = {
        code: 'BAD',
        type: 'flat',
        value: 50,
        min_total: 1000,
        is_active: true,
      };
      const pricing = calculatePricing(200, invalidCoupon);
      expect(pricing.discountAmount).toBe(0);
    });

    it('uses default config when config object is omitted', () => {
      const pricing = calculatePricing(100);
      expect(pricing.deliveryFee).toBe(25);
      expect(pricing.taxes).toBe(5);
    });

    it('handles cart with missing itemTotal', () => {
      const coupon = { code: 'TEST', type: COUPON_TYPES.FLAT, value: 10, is_active: true };
      const result = validateCoupon(coupon, null);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(0);
    });
  });

  describe('allocateOrderDiscount', () => {
    const { allocateOrderDiscount } = require('../../src/algo/couponEngine');

    it('returns empty array when items is empty or non-array', () => {
      expect(allocateOrderDiscount([], 500)).toEqual([]);
      expect(allocateOrderDiscount(null, 500)).toEqual([]);
    });

    it('returns zeroes when discount is zero or negative', () => {
      const items = [{ lineTotalPaise: 1000 }, { lineTotalPaise: 2000 }];
      expect(allocateOrderDiscount(items, 0)).toEqual([0, 0]);
      expect(allocateOrderDiscount(items, -100)).toEqual([0, 0]);
    });

    it('returns zeroes when item totals sum to zero', () => {
      const items = [{ lineTotalPaise: 0 }, { lineTotalPaise: 0 }];
      expect(allocateOrderDiscount(items, 500)).toEqual([0, 0]);
    });

    it('allocates proportionally and preserves invariant when discount exceeds total item price', () => {
      const items = [{ lineTotalPaise: 200 }, { lineTotalPaise: 300 }];
      const res = allocateOrderDiscount(items, 1000);
      expect(res).toEqual([200, 300]);
    });

    it('distributes remainders deterministically across line items', () => {
      const items = [
        { lineTotalPaise: 1000 },
        { lineTotalPaise: 1000 },
        { lineTotalPaise: 1000 },
      ];
      const res = allocateOrderDiscount(items, 100);
      expect(res.reduce((s, x) => s + x, 0)).toBe(100);
      expect(res).toEqual([34, 33, 33]);
    });
  });
});
