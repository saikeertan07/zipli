/**
 * @file fraudDetector.js
 * @description Pure hand-written Fraud Scoring Engine for e-commerce orders:
 * 1. Multi-signal feature extraction (velocity, device/IP, address reuse, coupon abuse, basket Z-score)
 * 2. Hand-crafted Logistic Regression probability model:
 *    P(fraud) = 1 / (1 + e^(-z)), where z = w0 + sum(wi * xi)
 * 3. Hard rule overrides (blacklists, extreme velocities, high value first orders)
 * 4. Categorized outcomes: ALLOW, REVIEW, BLOCK
 * Zero external machine learning dependencies.
 */

// Configurable weights for logistic regression model
const DEFAULT_WEIGHTS = Object.freeze({
  bias: -2.8,
  userVelocity10m: 0.85,
  userVelocity24h: 0.35,
  deviceIpVelocity1h: 0.95,
  addressReuseCount: 0.75,
  couponDiscountRatio: 1.1,
  basketDeviationZ: 0.5,
  isNewAccount: 0.4,
  failedPaymentCount: 0.8,
});

// Decision thresholds
const DEFAULT_THRESHOLDS = Object.freeze({
  reviewThreshold: 0.4,
  blockThreshold: 0.75,
});

/**
 * Computes sigmoid activation: S(z) = 1 / (1 + e^(-z))
 * @param {number} z
 * @returns {number} Value in (0, 1)
 */
function sigmoid(z) {
  if (z > 20) return 1.0;
  if (z < -20) return 0.0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Extracts and normalizes raw fraud signals into a structured features object.
 * @param {Object} raw
 * @returns {Object}
 */
function extractFraudFeatures(raw = {}) {
  return {
    userVelocity10m: Number(raw.userVelocity10m || 0),
    userVelocity24h: Number(raw.userVelocity24h || 0),
    deviceIpVelocity1h: Number(raw.deviceIpVelocity1h || raw.ipVelocity1h || 0),
    addressReuseCount: Number(raw.addressReuseCount || 1),
    couponDiscountRatio: Number(raw.couponDiscountRatio || (raw.couponUseCount ? 0.3 : 0)),
    orderTotal: Number(raw.orderTotal || 100),
    userHistoricalMean: Number(raw.userHistoricalMean || 100),
    userHistoricalStd: Number(raw.userHistoricalStd || 20),
    isNewAccount: Boolean(raw.isNewAccount || raw.isNewAccountHighValue),
    isNewAccountHighValue: Boolean(raw.isNewAccountHighValue),
    failedPaymentCount: Number(raw.failedPaymentCount || 0),
    isBlacklisted: Boolean(raw.isBlacklisted),
  };
}

/**
 * Evaluates an order for fraud risk using rules and logistic regression.
 *
 * @param {Object} features
 * @param {Object} [options]
 * @returns {{
 *   score: number,
 *   fraudScore: number,
 *   decision: 'ALLOW' | 'REVIEW' | 'BLOCK',
 *   fraudDecision: 'ALLOW' | 'REVIEW' | 'BLOCK',
 *   isFlagged: boolean,
 *   triggeredHardRules: string[],
 *   featureContributions: Array<{ feature: string, value: number, weight: number, contribution: number }>,
 *   riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * }}
 */
function evaluateFraudRisk(features = {}, options = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const reviewThresh = options.reviewThreshold ?? DEFAULT_THRESHOLDS.reviewThreshold;
  const blockThresh = options.blockThreshold ?? DEFAULT_THRESHOLDS.blockThreshold;

  const triggeredHardRules = [];

  // 1. Check Hard Rules
  if (features.isBlacklisted) {
    triggeredHardRules.push('RULE_BLACKLISTED_ENTITY');
  }

  const v10m = Math.max(0, Number(features.userVelocity10m ?? 0));
  if (v10m >= 5) {
    triggeredHardRules.push('RULE_EXTREME_USER_VELOCITY');
  }

  const addrReuse = Math.max(1, Number(features.addressReuseCount ?? 1));
  if (addrReuse >= 6) {
    triggeredHardRules.push('RULE_EXCESSIVE_ADDRESS_REUSE');
  }

  const orderTotal = Math.max(0, Number(features.orderTotal ?? 100));
  const isNew = Boolean(features.isNewAccount);
  const isHighValue = features.isNewAccountHighValue || (isNew && orderTotal > 150);
  if (isHighValue) {
    triggeredHardRules.push('RULE_HIGH_VALUE_FIRST_ORDER');
  }

  // 2. Feature Normalization
  const v24h = Math.max(0, Number(features.userVelocity24h ?? 0));
  const devVel1h = Math.max(0, Number(features.deviceIpVelocity1h ?? 0));
  const couponRatio = Math.max(0, Math.min(1.0, Number(features.couponDiscountRatio ?? 0)));
  const failedPayments = Math.max(0, Number(features.failedPaymentCount ?? 0));

  // Basket deviation Z-score: |total - mean| / (std + 1.0)
  const histMean = Math.max(1, Number(features.userHistoricalMean ?? orderTotal));
  const histStd = Math.max(1, Number(features.userHistoricalStd ?? 20));
  const basketZ = Math.max(0, Math.min(10.0, Math.abs(orderTotal - histMean) / (histStd + 1.0)));

  // Feature vector
  const featureList = [
    { feature: 'userVelocity10m', value: Math.min(10, v10m), weight: w.userVelocity10m },
    { feature: 'userVelocity24h', value: Math.min(30, v24h), weight: w.userVelocity24h },
    { feature: 'deviceIpVelocity1h', value: Math.min(15, devVel1h), weight: w.deviceIpVelocity1h },
    {
      feature: 'addressReuseCount',
      value: Math.min(10, addrReuse - 1),
      weight: w.addressReuseCount,
    },
    { feature: 'couponDiscountRatio', value: couponRatio, weight: w.couponDiscountRatio },
    { feature: 'basketDeviationZ', value: basketZ, weight: w.basketDeviationZ },
    { feature: 'isNewAccount', value: isNew ? 1.0 : 0.0, weight: w.isNewAccount },
    {
      feature: 'failedPaymentCount',
      value: Math.min(5, failedPayments),
      weight: w.failedPaymentCount,
    },
  ];

  // Linear log-odds dot product
  let z = w.bias;
  const contributions = [];

  for (const f of featureList) {
    const cont = Math.round(f.value * f.weight * 1000) / 1000;
    z += cont;
    contributions.push({
      feature: f.feature,
      value: Math.round(f.value * 100) / 100,
      weight: f.weight,
      contribution: cont,
    });
  }

  let probability = sigmoid(z);

  // If hard blocking rule triggered, clamp score to 1.0
  const isHardBlock = triggeredHardRules.some((r) => r !== 'RULE_HIGH_VALUE_FIRST_ORDER');
  if (isHardBlock) {
    probability = 1.0;
  } else if (triggeredHardRules.length > 0 && probability < reviewThresh) {
    // If high value first order rule triggered, ensure at least review threshold
    probability = Math.max(probability, reviewThresh + 0.05);
  }

  const finalScore = Math.round(probability * 1000) / 1000;

  // Decision assignment
  let decision = 'ALLOW';
  let riskLevel = 'LOW';

  if (finalScore >= blockThresh) {
    decision = 'BLOCK';
    riskLevel = finalScore >= 0.9 ? 'CRITICAL' : 'HIGH';
  } else if (finalScore >= reviewThresh) {
    decision = 'REVIEW';
    riskLevel = 'MEDIUM';
  }

  return {
    score: finalScore,
    fraudScore: finalScore,
    decision,
    fraudDecision: decision,
    isFlagged: decision !== 'ALLOW',
    triggeredHardRules,
    featureContributions: contributions,
    riskLevel,
  };
}

module.exports = {
  sigmoid,
  extractFraudFeatures,
  evaluateFraudRisk,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
};
