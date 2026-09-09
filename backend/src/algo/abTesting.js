/**
 * @file abTesting.js
 * @description Pure A/B Testing framework with deterministic hashing and two-proportion z-test calculator.
 * Zero external algorithmic dependencies.
 */

/**
 * 32-bit FNV-1a hash algorithm for fast, uniform deterministic bucketing.
 *
 * @param {string} str
 * @returns {number} Unsigned 32-bit integer
 */
function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime: 16777619
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministically assigns a user to an experiment variant.
 *
 * @param {string|number} userId
 * @param {string} experimentKey
 * @param {Array<{ variant: string, weight: number }>} [variants]
 * @returns {string} Assigned variant name
 */
function getVariant(
  userId,
  experimentKey,
  variants = [
    { variant: 'control', weight: 50 },
    { variant: 'treatment', weight: 50 },
  ]
) {
  if (!userId || !experimentKey) {
    return (variants[0] && variants[0].variant) || 'control';
  }

  const combined = `${userId}:${experimentKey}`;
  const bucket = fnv1a(combined) % 100;

  let cumulative = 0;
  for (const { variant, weight } of variants) {
    cumulative += weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  return variants[variants.length - 1].variant;
}

/**
 * Standard Normal Cumulative Distribution Function (CDF) approximation.
 * Abramowitz and Stegun formula 7.1.26 with error < 1.5e-7.
 *
 * @param {number} z
 * @returns {number} P(Z <= z)
 */
function normalCDF(z) {
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);

  // Constants
  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const t = 1.0 / (1.0 + p * absZ);
  const pdf = (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * absZ * absZ);

  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const cdf = 1.0 - pdf * poly;

  return sign === 1 ? cdf : 1.0 - cdf;
}

/**
 * Evaluates statistical significance between two conversion proportions using a two-proportion z-test.
 *
 * @param {Object} control - { impressions: number, conversions: number }
 * @param {Object} treatment - { impressions: number, conversions: number }
 * @param {number} [confidenceLevel=0.95]
 * @returns {{
 *   controlRate: number,
 *   treatmentRate: number,
 *   relativeLift: number,
 *   zScore: number,
 *   pValue: number,
 *   isSignificant: boolean,
 *   ciLower: number,
 *   ciUpper: number
 * }}
 */
function twoProportionZTest(control, treatment, confidenceLevel = 0.95) {
  const n1 = control.impressions || 0;
  const x1 = control.conversions || 0;
  const n2 = treatment.impressions || 0;
  const x2 = treatment.conversions || 0;

  if (n1 === 0 || n2 === 0) {
    return {
      controlRate: 0,
      treatmentRate: 0,
      relativeLift: 0,
      zScore: 0,
      pValue: 1.0,
      isSignificant: false,
      ciLower: 0,
      ciUpper: 0,
    };
  }

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const diff = p2 - p1;

  // Pooled proportion under H0: p1 = p2
  const pPool = (x1 + x2) / (n1 + n2);
  const sePool = Math.sqrt(pPool * (1.0 - pPool) * (1.0 / n1 + 1.0 / n2));

  let zScore = 0;
  if (sePool > 0) {
    zScore = diff / sePool;
  }

  // Two-tailed p-value: 2 * (1 - Phi(|z|))
  const pValue = 2.0 * (1.0 - normalCDF(Math.abs(zScore)));

  // Critical value for confidence level (e.g. 1.96 for 95%)
  const alpha = 1.0 - confidenceLevel;
  const zCrit = 1.95996; // For 95% CI

  // Unpooled SE for confidence interval of difference
  const seDiff = Math.sqrt((p1 * (1.0 - p1)) / n1 + (p2 * (1.0 - p2)) / n2);
  const ciLower = diff - zCrit * seDiff;
  const ciUpper = diff + zCrit * seDiff;

  const relativeLift = p1 > 0 ? (p2 - p1) / p1 : 0;

  return {
    controlRate: Math.round(p1 * 10000) / 10000,
    treatmentRate: Math.round(p2 * 10000) / 10000,
    relativeLift: Math.round(relativeLift * 10000) / 10000,
    zScore: Math.round(zScore * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    isSignificant: pValue < alpha,
    ciLower: Math.round(ciLower * 10000) / 10000,
    ciUpper: Math.round(ciUpper * 10000) / 10000,
  };
}

module.exports = {
  fnv1a,
  getVariant,
  normalCDF,
  twoProportionZTest,
};
