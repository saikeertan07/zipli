const {
  calculateExpiryMarkdown,
  calculateDemandAdjustment,
  calculateDynamicPrice,
  MAX_SURGE_PCT,
  MAX_DEMAND_DISCOUNT_PCT,
} = require('../../src/algo/dynamicPricing');

describe('dynamicPricing.js pure bounded dynamic pricing', () => {
  describe('calculateExpiryMarkdown', () => {
    it('returns FRESH and zero discount for items far from expiry', () => {
      const res = calculateExpiryMarkdown(10, { thresholdDays: 3 });
      expect(res.discountFraction).toBe(0);
      expect(res.isExpired).toBe(false);
      expect(res.status).toBe('FRESH');
    });

    it('returns EXPIRED and 100% discount for expired items (days <= 0)', () => {
      const res0 = calculateExpiryMarkdown(0);
      expect(res0.isExpired).toBe(true);
      expect(res0.status).toBe('EXPIRED');

      const resNeg = calculateExpiryMarkdown(-2);
      expect(resNeg.isExpired).toBe(true);
    });

    it('calculates progressive discount for near-expiry perishables', () => {
      // 2 days left (threshold = 3) -> WARNING
      const res2 = calculateExpiryMarkdown(2, { thresholdDays: 3, maxMarkdownPct: 0.5 });
      expect(res2.isExpired).toBe(false);
      expect(res2.status).toBe('NEAR_EXPIRY_WARNING');
      expect(res2.discountFraction).toBeGreaterThan(0);
      expect(res2.discountFraction).toBeLessThan(0.3);

      // 0.5 days left (threshold = 3) -> CRITICAL
      const resHalf = calculateExpiryMarkdown(0.5, { thresholdDays: 3, maxMarkdownPct: 0.5 });
      expect(resHalf.status).toBe('NEAR_EXPIRY_CRITICAL');
      expect(resHalf.discountFraction).toBeGreaterThan(res2.discountFraction);
    });

    it('handles NaN or missing days gracefully', () => {
      const res = calculateExpiryMarkdown('invalid');
      expect(res.status).toBe('FRESH');
      expect(res.discountFraction).toBe(0);
    });
  });

  describe('calculateDemandAdjustment', () => {
    it('applies surge up to +8% for high demand ratios (ratio >= 1.25)', () => {
      const res1 = calculateDemandAdjustment(1.5);
      expect(res1.reason).toBe('HIGH_DEMAND_SURGE');
      expect(res1.percentageChange).toBeGreaterThan(0);
      expect(res1.percentageChange).toBeLessThanOrEqual(MAX_SURGE_PCT * 100);

      // Extreme surge ratio caps at 8%
      const resExtreme = calculateDemandAdjustment(5.0);
      expect(resExtreme.percentageChange).toBe(8.0);
      expect(resExtreme.multiplier).toBe(1.08);
    });

    it('applies discount down to -8% for low demand ratios (ratio <= 0.75)', () => {
      const res = calculateDemandAdjustment(0.5);
      expect(res.reason).toBe('LOW_DEMAND_DISCOUNT');
      expect(res.percentageChange).toBeLessThan(0);
      expect(res.percentageChange).toBeGreaterThanOrEqual(-MAX_DEMAND_DISCOUNT_PCT * 100);

      // Extreme low demand caps at -8%
      const resExtreme = calculateDemandAdjustment(0.01);
      expect(resExtreme.percentageChange).toBe(-8.0);
      expect(resExtreme.multiplier).toBe(0.92);
    });

    it('maintains 1.0 multiplier for normal demand (0.75 < ratio < 1.25)', () => {
      const res = calculateDemandAdjustment(1.0);
      expect(res.reason).toBe('NORMAL_DEMAND');
      expect(res.percentageChange).toBe(0);
      expect(res.multiplier).toBe(1.0);

      // Default with no args
      expect(calculateDemandAdjustment().reason).toBe('NORMAL_DEMAND');
    });
  });

  describe('calculateDynamicPrice', () => {
    it('quarantines expired product at price 0', () => {
      const res = calculateDynamicPrice({
        basePrice: 50,
        mrp: 60,
        daysToExpiry: 0,
      });

      expect(res.finalPrice).toBe(0);
      expect(res.expiryStatus).toBe('EXPIRED');
      expect(res.auditLog.reason).toMatch(/expired/);
    });

    it('applies progressive markdown to near-expiry perishables', () => {
      const res = calculateDynamicPrice({
        basePrice: 100,
        mrp: 120,
        daysToExpiry: 1, // 1 day left out of 3
      });

      expect(res.finalPrice).toBeLessThan(100);
      expect(res.effectiveDiscountPercent).toBeGreaterThan(15);
      expect(res.auditLog.reason).toMatch(/Expiry markdown/);
    });

    it('applies bounded demand surge and never exceeds MRP', () => {
      // Base: 100, MRP: 105. Surge tries to go to 108, but MRP caps it at 105
      const res = calculateDynamicPrice({
        basePrice: 100,
        mrp: 105,
        demandRatio: 2.5, // +8% would be 108
      });

      expect(res.finalPrice).toBe(105); // Legal ceiling
      expect(res.finalPrice).toBeLessThanOrEqual(res.mrp);
      expect(res.auditLog.reason).toMatch(/Demand adjustment/);
    });

    it('maintains standard base price when demand is normal and item is fresh', () => {
      const res = calculateDynamicPrice({
        basePrice: 80,
        mrp: 100,
        demandRatio: 1.0,
      });

      expect(res.finalPrice).toBe(80);
      expect(res.auditLog.reason).toBe('Standard base price');
    });

    it('applies bounded demand discount when demand is depressed', () => {
      const res = calculateDynamicPrice({
        basePrice: 100,
        mrp: 120,
        demandRatio: 0.2, // Low demand -> -8%
      });

      expect(res.finalPrice).toBe(92);
      expect(res.auditLog.reason).toMatch(/Demand adjustment -8%/);
    });

    it('handles empty parameter object with safe defaults', () => {
      const res = calculateDynamicPrice();
      expect(res.finalPrice).toBeGreaterThan(0);
      expect(res.finalPrice).toBeLessThanOrEqual(res.mrp);
    });
  });
});
