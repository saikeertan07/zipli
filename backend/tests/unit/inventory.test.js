const {
  getZScore,
  calculateSeriesStats,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateEOQ,
  evaluateReorderSuggestion,
} = require('../../src/algo/inventory');

describe('inventory.js pure inventory control algorithms', () => {
  describe('getZScore', () => {
    it('returns exact standard Z-scores for common service levels', () => {
      expect(getZScore(0.9)).toBe(1.282);
      expect(getZScore(0.95)).toBe(1.645);
      expect(getZScore(0.98)).toBe(2.054);
      expect(getZScore(0.99)).toBe(2.326);
    });

    it('approximates Z-score accurately for non-standard service levels', () => {
      const z85 = getZScore(0.85);
      expect(z85).toBeCloseTo(1.036, 1);
      const z995 = getZScore(0.995);
      expect(z995).toBeCloseTo(2.576, 1);
    });

    it('handles default or invalid service level by defaulting to 0.95', () => {
      expect(getZScore()).toBe(1.645);
      expect(getZScore('invalid')).toBe(1.645);
    });
  });

  describe('calculateSeriesStats', () => {
    it('handles empty or non-array inputs safely', () => {
      expect(calculateSeriesStats([])).toEqual({ mean: 0, stdDev: 0 });
      expect(calculateSeriesStats()).toEqual({ mean: 0, stdDev: 0 });
    });

    it('handles single item series with 0 stdDev', () => {
      expect(calculateSeriesStats([42])).toEqual({ mean: 42, stdDev: 0 });
    });

    it('calculates sample mean and standard deviation accurately', () => {
      const series = [10, 12, 14, 16, 18];
      const stats = calculateSeriesStats(series);
      expect(stats.mean).toBe(14);
      expect(stats.stdDev).toBeCloseTo(3.16, 1);
    });
  });

  describe('calculateSafetyStock', () => {
    it('calculates safety stock buffer for 95% service level with lead time', () => {
      // sigma = 5, L = 4 days -> sqrt(4) = 2 -> 1.645 * 5 * 2 = 16.45 -> ceil = 17
      const ss = calculateSafetyStock(5, 4, 0.95);
      expect(ss).toBe(17);
    });

    it('handles 0 or negative inputs gracefully', () => {
      expect(calculateSafetyStock(0, 2)).toBe(0);
      expect(calculateSafetyStock(-5, -2)).toBe(0);
      expect(calculateSafetyStock()).toBe(0);
    });
  });

  describe('calculateReorderPoint', () => {
    it('calculates reorder point: d_avg * L + SS', () => {
      // dAvg = 20, L = 3, SS = 15 -> 20*3 + 15 = 75
      const rop = calculateReorderPoint(20, 3, 15);
      expect(rop).toBe(75);
    });

    it('handles 0 or negative inputs gracefully', () => {
      expect(calculateReorderPoint(0, 0, 0)).toBe(0);
      expect(calculateReorderPoint()).toBe(0);
    });
  });

  describe('calculateEOQ', () => {
    it('computes optimal batch size using Wilson EOQ formula', () => {
      // D = 1000, S = 20, H = 4 -> sqrt(2 * 1000 * 20 / 4) = sqrt(10000) = 100
      const eoq = calculateEOQ(1000, 20, 4);
      expect(eoq).toBe(100);
    });

    it('handles defaults when params are non-positive', () => {
      const eoq = calculateEOQ(-10, -5, -2);
      expect(eoq).toBeGreaterThan(0);
      expect(calculateEOQ()).toBeGreaterThan(0);
    });
  });

  describe('evaluateReorderSuggestion', () => {
    it('suggests reorder when current stock is at or below ROP', () => {
      const demandHistory = [20, 22, 19, 21, 20, 23, 21]; // mean ~20.86, std ~1.35
      const res = evaluateReorderSuggestion({
        currentStock: 15,
        dailyDemandHistory: demandHistory,
        leadTimeDays: 2,
        serviceLevel: 0.95,
        orderCost: 20,
        unitCost: 40,
        holdingCostRate: 0.2,
      });

      expect(res.shouldReorder).toBe(true);
      expect(res.reorderPoint).toBeGreaterThan(res.currentStock);
      expect(res.suggestedOrderQty).toBeGreaterThan(0);
      expect(res.math.zScore).toBe(1.645);
      expect(res.math.leadTimeDemand).toBeGreaterThan(0);
      expect(res.math.eoq).toBeGreaterThan(0);
    });

    it('does not suggest reorder when current stock is ample', () => {
      const demandHistory = [10, 10, 10, 10];
      const res = evaluateReorderSuggestion({
        currentStock: 500,
        dailyDemandHistory: demandHistory,
        leadTimeDays: 2,
      });

      expect(res.shouldReorder).toBe(false);
      expect(res.suggestedOrderQty).toBe(0);
    });

    it('handles empty parameter object safely with defaults', () => {
      const res = evaluateReorderSuggestion();
      expect(res.currentStock).toBe(0);
      expect(res.shouldReorder).toBe(true);
    });
  });
});
