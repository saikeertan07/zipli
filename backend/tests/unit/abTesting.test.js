const { fnv1a, getVariant, normalCDF, twoProportionZTest } = require('../../src/algo/abTesting');

describe('Pure A/B Testing Framework (/algo/abTesting.js)', () => {
  describe('Deterministic Hashing (FNV-1a) & Variant Bucketing', () => {
    it('produces consistent 32-bit unsigned hashes', () => {
      const h1 = fnv1a('user_123:search_v2');
      const h2 = fnv1a('user_123:search_v2');
      expect(h1).toBe(h2);
      expect(h1).toBeGreaterThan(0);
    });

    it('deterministically assigns the exact same variant for the same user and experiment', () => {
      const v1 = getVariant('user_42', 'checkout_redesign');
      const v2 = getVariant('user_42', 'checkout_redesign');
      expect(v1).toBe(v2);
    });

    it('distributes 1,000 users approximately 50/50 between control and treatment', () => {
      let controlCount = 0;
      let treatmentCount = 0;

      for (let i = 0; i < 1000; i++) {
        const variant = getVariant(`user_${i}`, 'exp_homepage_rail');
        if (variant === 'control') controlCount++;
        else if (variant === 'treatment') treatmentCount++;
      }

      // Check balance is within reasonable binomial range (~500 +/- 60)
      expect(controlCount).toBeGreaterThan(420);
      expect(controlCount).toBeLessThan(580);
      expect(treatmentCount).toBeGreaterThan(420);
      expect(treatmentCount).toBeLessThan(580);
    });

    it('supports custom multi-variant weights', () => {
      const customVariants = [
        { variant: 'A', weight: 70 },
        { variant: 'B', weight: 30 },
      ];

      let aCount = 0;
      for (let i = 0; i < 500; i++) {
        if (getVariant(`u_${i}`, 'multi_var_exp', customVariants) === 'A') {
          aCount++;
        }
      }

      expect(aCount).toBeGreaterThan(300); // ~70% of 500 = 350
    });

    it('handles null and missing inputs safely', () => {
      expect(getVariant(null, 'exp')).toBe('control');
      expect(getVariant('u1', null)).toBe('control');
    });
  });

  describe('normalCDF Approximation', () => {
    it('computes accurate standard normal cumulative probabilities', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 4);
      expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
      expect(normalCDF(-1.96)).toBeCloseTo(0.025, 2);
      expect(normalCDF(3.0)).toBeGreaterThan(0.998);
    });
  });

  describe('twoProportionZTest Calculator', () => {
    it('detects a statistically significant lift (e.g. 10% vs 14% on 2000 users)', () => {
      const control = { impressions: 2000, conversions: 200 }; // 10.0%
      const treatment = { impressions: 2000, conversions: 280 }; // 14.0%

      const result = twoProportionZTest(control, treatment);

      expect(result.controlRate).toBe(0.1);
      expect(result.treatmentRate).toBe(0.14);
      expect(result.relativeLift).toBeCloseTo(0.4, 2); // 40% lift
      expect(result.zScore).toBeGreaterThan(3.0);
      expect(result.pValue).toBeLessThan(0.01);
      expect(result.isSignificant).toBe(true);
      expect(result.ciLower).toBeGreaterThan(0);
    });

    it('detects lack of statistical significance when difference is within noise', () => {
      const control = { impressions: 500, conversions: 50 }; // 10.0%
      const treatment = { impressions: 500, conversions: 52 }; // 10.4%

      const result = twoProportionZTest(control, treatment);

      expect(result.pValue).toBeGreaterThan(0.05);
      expect(result.isSignificant).toBe(false);
      // CI should cross 0
      expect(result.ciLower).toBeLessThan(0);
      expect(result.ciUpper).toBeGreaterThan(0);
    });

    it('handles zero impressions edge cases', () => {
      const result = twoProportionZTest({ impressions: 0 }, { impressions: 0 });
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBe(1.0);

      // sePool = 0 (both have 0 conversions)
      const resZeroConv = twoProportionZTest(
        { impressions: 100, conversions: 0 },
        { impressions: 100, conversions: 0 }
      );
      expect(resZeroConv.zScore).toBe(0);
      expect(resZeroConv.relativeLift).toBe(0);

      // p1 = 0 but p2 > 0
      const resP1Zero = twoProportionZTest(
        { impressions: 100, conversions: 0 },
        { impressions: 100, conversions: 10 }
      );
      expect(resP1Zero.relativeLift).toBe(0);
    });

    it('handles under-weighted variant fallthrough and negative normalCDF', () => {
      // Under-weighted variants list
      const variant = getVariant('user_special_123', 'exp_test', [
        { variant: 'first', weight: 0 },
        { variant: 'last', weight: 0 },
      ]);
      expect(variant).toBe('last');

      // Negative normalCDF
      expect(normalCDF(-1.96)).toBeCloseTo(0.025, 2);
    });
  });
});
