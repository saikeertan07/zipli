const {
  calculateMedian,
  calculateMAD,
  detectRobustZOutliers,
  detectCUSUMDrift,
} = require('../../src/algo/anomaly');

describe('anomaly.js pure statistical anomaly detection', () => {
  describe('calculateMedian', () => {
    it('handles empty or non-array inputs safely', () => {
      expect(calculateMedian([])).toBe(0);
      expect(calculateMedian()).toBe(0);
    });

    it('calculates median for odd-length and even-length arrays', () => {
      expect(calculateMedian([5, 1, 9])).toBe(5);
      expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
    });
  });

  describe('calculateMAD', () => {
    it('handles empty inputs safely', () => {
      expect(calculateMAD([])).toBe(0);
      expect(calculateMAD()).toBe(0);
    });

    it('computes median absolute deviation accurately', () => {
      // series: [1, 2, 3, 4, 5, 6, 7] -> median = 4
      // deviations: [3, 2, 1, 0, 1, 2, 3] -> sorted: [0, 1, 1, 2, 2, 3, 3] -> median = 2
      const mad = calculateMAD([1, 2, 3, 4, 5, 6, 7]);
      expect(mad).toBe(2);
    });
  });

  describe('detectRobustZOutliers', () => {
    it('returns empty array for empty inputs', () => {
      expect(detectRobustZOutliers([])).toEqual([]);
      expect(detectRobustZOutliers()).toEqual([]);
    });

    it('identifies positive spikes and negative drops accurately', () => {
      // Normal sales ~20, one spike at 150, one drop at 0
      const sales = [20, 21, 19, 20, 22, 150, 20, 19, 0, 21, 20];
      const results = detectRobustZOutliers(sales, { threshold: 3.5 });

      expect(results).toHaveLength(sales.length);

      const spike = results[5];
      expect(spike.value).toBe(150);
      expect(spike.isAnomaly).toBe(true);
      expect(spike.type).toBe('SPIKE');
      expect(spike.score).toBeGreaterThan(3.5);

      const drop = results[8];
      expect(drop.value).toBe(0);
      expect(drop.isAnomaly).toBe(true);
      expect(drop.type).toBe('DROP');
      expect(drop.score).toBeLessThan(-3.5);

      const normal = results[0];
      expect(normal.isAnomaly).toBe(false);
      expect(normal.type).toBe('NORMAL');
    });

    it('handles zero-MAD series by falling back to mean absolute deviation', () => {
      // More than 50% identical values
      const constantSales = [10, 10, 10, 10, 10, 10, 10, 100];
      const results = detectRobustZOutliers(constantSales, { threshold: 3.0 });
      const last = results[results.length - 1];
      expect(last.isAnomaly).toBe(true);
      expect(last.type).toBe('SPIKE');
    });
  });

  describe('detectCUSUMDrift', () => {
    it('handles empty inputs safely', () => {
      const res = detectCUSUMDrift([]);
      expect(res.driftDetected).toBe(false);
      expect(res.driftType).toBe('NONE');
      expect(res.changePointIndex).toBe(-1);
    });

    it('detects persistent upward shift in demand', () => {
      // Baseline 10, then shifts upward to 30
      const series = [
        10,
        11,
        9,
        10,
        10,
        11,
        9,
        10, // Baseline phase
        30,
        31,
        29,
        32,
        30,
        31,
        30, // Shift phase
      ];

      const res = detectCUSUMDrift(series, { kAllowance: 0.5, hThreshold: 3.5 });
      expect(res.driftDetected).toBe(true);
      expect(res.driftType).toBe('UP');
      expect(res.changePointIndex).toBeGreaterThanOrEqual(8);
      expect(res.sPos.length).toBe(series.length);
    });

    it('detects persistent downward shift / stock depletion', () => {
      // Baseline 50, then drops to 5
      const series = [50, 49, 51, 50, 52, 48, 50, 5, 4, 6, 5, 4, 5, 5];

      const res = detectCUSUMDrift(series, {
        targetMean: 50,
        stdDev: 2,
        kAllowance: 0.5,
        hThreshold: 3.5,
      });
      expect(res.driftDetected).toBe(true);
      expect(res.driftType).toBe('DOWN');
      expect(res.changePointIndex).toBeGreaterThanOrEqual(7);
    });

    it('reports no drift for stationary series with natural noise', () => {
      const stationary = [20, 21, 19, 20, 22, 18, 20, 21, 19, 20];
      const res = detectCUSUMDrift(stationary, { hThreshold: 4.0 });
      expect(res.driftDetected).toBe(false);
      expect(res.driftType).toBe('NONE');
    });

    it('handles length 1 series and default parameters gracefully', () => {
      const res0 = detectCUSUMDrift();
      expect(res0.driftDetected).toBe(false);

      const res1 = detectCUSUMDrift([100]);
      expect(res1.driftDetected).toBe(false);

      // Default options
      const resDef = detectCUSUMDrift([10, 10, 10, 10]);
      expect(resDef.driftDetected).toBe(false);

      const zDef = detectRobustZOutliers([10, 12, 11, 10]);
      expect(zDef).toHaveLength(4);
    });
  });
});
