const {
  sigmoid,
  extractFraudFeatures,
  evaluateFraudRisk,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
} = require('../../src/algo/fraudDetector');

describe('fraudDetector.js pure fraud scoring engine', () => {
  describe('sigmoid mathematical function', () => {
    it('returns exact asymptotic bounds for extreme values', () => {
      expect(sigmoid(25)).toBe(1.0);
      expect(sigmoid(-25)).toBe(0.0);
      expect(sigmoid(0)).toBe(0.5);
    });

    it('returns monotonic values in (0, 1) for normal inputs', () => {
      expect(sigmoid(2.0)).toBeGreaterThan(sigmoid(1.0));
      expect(sigmoid(-1.0)).toBeLessThan(0.5);
      expect(sigmoid(1.0)).toBeGreaterThan(0.5);
    });
  });

  describe('evaluateFraudRisk decision engine', () => {
    it('allows clean legitimate order with low velocity and normal basket size', () => {
      const res = evaluateFraudRisk({
        userVelocity10m: 0,
        userVelocity24h: 1,
        deviceIpVelocity1h: 0,
        addressReuseCount: 1,
        couponDiscountRatio: 0.1,
        orderTotal: 150,
        userHistoricalMean: 140,
        userHistoricalStd: 30,
        isNewAccount: false,
        failedPaymentCount: 0,
      });

      expect(res.decision).toBe('ALLOW');
      expect(res.riskLevel).toBe('LOW');
      expect(res.score).toBeLessThan(0.4);
      expect(res.isFlagged).toBe(false);
      expect(res.triggeredHardRules).toHaveLength(0);
      expect(res.featureContributions).toHaveLength(8);
    });

    it('flags suspicious order for manual REVIEW when multiple moderate risk signals align', () => {
      const res = evaluateFraudRisk({
        userVelocity10m: 1,
        userVelocity24h: 2,
        deviceIpVelocity1h: 1,
        addressReuseCount: 1,
        orderTotal: 250,
        userHistoricalMean: 200,
        userHistoricalStd: 50,
        isNewAccount: false,
        failedPaymentCount: 0,
      });

      expect(res.decision).toBe('REVIEW');
      expect(res.riskLevel).toBe('MEDIUM');
      expect(res.isFlagged).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(0.4);
      expect(res.score).toBeLessThan(0.75);
    });

    it('blocks order when score exceeds block threshold and assigns HIGH or CRITICAL risk', () => {
      // Score in [0.75, 0.89] -> HIGH
      const resHigh = evaluateFraudRisk({
        userVelocity10m: 2,
        userVelocity24h: 2,
        deviceIpVelocity1h: 0,
        orderTotal: 400,
        userHistoricalMean: 200,
        userHistoricalStd: 50,
        isNewAccount: false,
        failedPaymentCount: 0,
      });
      expect(resHigh.decision).toBe('BLOCK');
      expect(resHigh.riskLevel).toBe('HIGH');
      expect(resHigh.score).toBeGreaterThanOrEqual(0.75);
      expect(resHigh.score).toBeLessThan(0.9);

      // Score >= 0.90 -> CRITICAL
      const resCrit = evaluateFraudRisk({
        userVelocity10m: 4,
        userVelocity24h: 12,
        deviceIpVelocity1h: 6,
        addressReuseCount: 4,
        couponDiscountRatio: 0.9,
        orderTotal: 7000,
        userHistoricalMean: 200,
        isNewAccount: true,
        failedPaymentCount: 4,
      });

      expect(resCrit.decision).toBe('BLOCK');
      expect(resCrit.riskLevel).toBe('CRITICAL');
      expect(resCrit.isFlagged).toBe(true);
      expect(resCrit.score).toBeGreaterThanOrEqual(0.9);
    });

    it('triggers hard block for blacklisted entity', () => {
      const res = evaluateFraudRisk({
        isBlacklisted: true,
      });

      expect(res.decision).toBe('BLOCK');
      expect(res.score).toBe(1.0);
      expect(res.triggeredHardRules).toContain('RULE_BLACKLISTED_ENTITY');
    });

    it('triggers hard block for extreme user velocity (>= 5 orders in 10m)', () => {
      const res = evaluateFraudRisk({
        userVelocity10m: 6,
      });

      expect(res.decision).toBe('BLOCK');
      expect(res.score).toBe(1.0);
      expect(res.triggeredHardRules).toContain('RULE_EXTREME_USER_VELOCITY');
    });

    it('triggers hard block for excessive address reuse across accounts (>= 6 accounts)', () => {
      const res = evaluateFraudRisk({
        addressReuseCount: 7,
      });

      expect(res.decision).toBe('BLOCK');
      expect(res.score).toBe(1.0);
      expect(res.triggeredHardRules).toContain('RULE_EXCESSIVE_ADDRESS_REUSE');
    });

    it('triggers review flag for high-value first order on new account', () => {
      const res = evaluateFraudRisk({
        isNewAccount: true,
        orderTotal: 9500,
      });

      expect(res.triggeredHardRules).toContain('RULE_HIGH_VALUE_FIRST_ORDER');
      expect(res.decision).not.toBe('ALLOW');
      expect(res.score).toBeGreaterThanOrEqual(0.4);
    });

    it('supports custom weights and threshold overrides', () => {
      const customWeights = {
        bias: 0.0,
        userVelocity10m: 2.0,
      };

      const res = evaluateFraudRisk(
        { userVelocity10m: 2 },
        { weights: customWeights, reviewThreshold: 0.3, blockThreshold: 0.8 }
      );

      expect(res.score).toBeGreaterThan(0.8);
      expect(res.decision).toBe('BLOCK');
    });

    it('handles empty parameter object with safe defaults', () => {
      const res = evaluateFraudRisk();
      expect(res.decision).toBe('ALLOW');
      expect(res.score).toBeLessThan(0.4);
    });

    it('exports DEFAULT_WEIGHTS and DEFAULT_THRESHOLDS constants', () => {
      expect(DEFAULT_WEIGHTS.bias).toBe(-2.8);
      expect(DEFAULT_THRESHOLDS.reviewThreshold).toBe(0.4);
      expect(DEFAULT_THRESHOLDS.blockThreshold).toBe(0.75);
    });
  });

  describe('extractFraudFeatures', () => {
    it('normalizes raw signals into structured features with defaults', () => {
      const def = extractFraudFeatures();
      expect(def.userVelocity10m).toBe(0);
      expect(def.userVelocity24h).toBe(0);
      expect(def.orderTotal).toBe(100);

      const custom = extractFraudFeatures({
        userVelocity10m: 3,
        userVelocity24h: 5,
        ipVelocity1h: 4,
        couponUseCount: 2,
        isNewAccountHighValue: true,
        isBlacklisted: true,
      });
      expect(custom.userVelocity10m).toBe(3);
      expect(custom.deviceIpVelocity1h).toBe(4);
      expect(custom.couponDiscountRatio).toBe(0.3);
      expect(custom.isNewAccount).toBe(true);
      expect(custom.isBlacklisted).toBe(true);
    });
  });
});
