/**
 * @file dynamicPricing.js
 * @description Pure bounded and ethical dynamic pricing engine:
 * 1. Expiry-based markdown for perishables via progressive shelf-life decay curves
 * 2. Demand-aware nudges strictly bounded within [-8%, +8%]
 * 3. Ethical guarantees: Never exceed MRP, never negative price, explicit audit reasons.
 * Zero external dependencies.
 */

const MAX_SURGE_PCT = 0.08; // Maximum +8% demand surge nudge
const MAX_DEMAND_DISCOUNT_PCT = 0.08; // Maximum -8% demand slowdown discount
const DEFAULT_EXPIRY_THRESHOLD_DAYS = 3; // Start markdown 3 days before expiry
const MAX_EXPIRY_MARKDOWN_PCT = 0.5; // Maximum 50% discount for same-day expiring perishable

/**
 * Calculates progressive markdown discount based on days remaining until expiry.
 * Formula: discount = maxMarkdown * (1 - daysLeft / thresholdDays)^power
 *
 * @param {number} daysToExpiry - Days remaining (can be fractional)
 * @param {Object} [options]
 * @param {number} [options.thresholdDays=3]
 * @param {number} [options.maxMarkdownPct=0.5]
 * @param {number} [options.decayPower=1.5] - Convex curvature (steeper near expiry)
 * @returns {{ discountFraction: number, isExpired: boolean, status: string }}
 */
function calculateExpiryMarkdown(daysToExpiry, options = {}) {
  const thresholdDays = Math.max(1, Number(options.thresholdDays) || DEFAULT_EXPIRY_THRESHOLD_DAYS);
  const maxMarkdown = Math.max(
    0.05,
    Math.min(0.8, Number(options.maxMarkdownPct) || MAX_EXPIRY_MARKDOWN_PCT)
  );
  const power = Math.max(0.5, Number(options.decayPower) || 1.5);

  const days = Number(daysToExpiry);

  if (isNaN(days) || days > thresholdDays) {
    return { discountFraction: 0, isExpired: false, status: 'FRESH' };
  }

  if (days <= 0) {
    return { discountFraction: 1.0, isExpired: true, status: 'EXPIRED' };
  }

  // Fraction of markdown window elapsed: 0 when days = threshold, 1 when days = 0
  const elapsedRatio = 1.0 - days / thresholdDays;
  const discountFraction = maxMarkdown * Math.pow(elapsedRatio, power);

  return {
    discountFraction: Math.round(discountFraction * 1000) / 1000,
    isExpired: false,
    status: days <= 1 ? 'NEAR_EXPIRY_CRITICAL' : 'NEAR_EXPIRY_WARNING',
  };
}

/**
 * Calculates demand-aware price adjustment factor bounded within [-8%, +8%].
 *
 * @param {number} [demandRatio=1.0] - Ratio of current demand rate to baseline average
 * @returns {{ multiplier: number, percentageChange: number, reason: string }}
 */
function calculateDemandAdjustment(demandRatio = 1.0) {
  const ratio = Math.max(0, Number(demandRatio));

  if (ratio >= 1.25) {
    // High demand surge: reaches full +8% at ratio >= 2.0
    const surgeFraction = Math.min(1.0, (ratio - 1.25) / 0.75);
    const surge = Math.round(surgeFraction * MAX_SURGE_PCT * 1000) / 1000;
    return {
      multiplier: 1.0 + surge,
      percentageChange: Math.round(surge * 1000) / 10,
      reason: 'HIGH_DEMAND_SURGE',
    };
  }

  if (ratio <= 0.75) {
    // Low demand slowdown: reaches full -8% at ratio <= 0.25
    const dropFraction = Math.min(1.0, (0.75 - ratio) / 0.5);
    const discount = Math.round(dropFraction * MAX_DEMAND_DISCOUNT_PCT * 1000) / 1000;
    return {
      multiplier: 1.0 - discount,
      percentageChange: -Math.round(discount * 1000) / 10,
      reason: 'LOW_DEMAND_DISCOUNT',
    };
  }

  return {
    multiplier: 1.0,
    percentageChange: 0,
    reason: 'NORMAL_DEMAND',
  };
}

/**
 * Computes optimized dynamic price combining shelf-life decay and bounded demand nudges.
 * Strictly guarantees price <= MRP and price >= 1.
 *
 * @param {Object} params
 * @param {number} params.basePrice - Standard catalog price
 * @param {number} [params.mrp] - Maximum Retail Price (hard legal ceiling)
 * @param {number} [params.daysToExpiry] - Days until batch expires (for perishables)
 * @param {number} [params.demandRatio=1.0] - Live demand vs baseline ratio
 * @param {Object} [params.options]
 * @returns {{
 *   finalPrice: number,
 *   basePrice: number,
 *   mrp: number,
 *   effectiveDiscountPercent: number,
 *   expiryStatus: string,
 *   demandReason: string,
 *   auditLog: { oldPrice: number, newPrice: number, reason: string, actor: string }
 * }}
 */
function calculateDynamicPrice(params = {}) {
  const basePrice = Math.max(1, Number(params.basePrice) || 100);
  const mrp = Math.max(basePrice, Number(params.mrp) || basePrice * 1.15);
  const demandRatio = Number(params.demandRatio) || 1.0;

  // 1. Check shelf-life decay markdown
  const expiryInfo =
    params.daysToExpiry !== undefined
      ? calculateExpiryMarkdown(params.daysToExpiry, params.options)
      : { discountFraction: 0, isExpired: false, status: 'NON_PERISHABLE' };

  if (expiryInfo.isExpired) {
    return {
      finalPrice: 0,
      basePrice,
      mrp,
      effectiveDiscountPercent: 100,
      expiryStatus: 'EXPIRED',
      demandReason: 'EXPIRED_DO_NOT_SELL',
      auditLog: {
        oldPrice: basePrice,
        newPrice: 0,
        reason: 'Product expired - zero price quarantine',
        actor: 'system',
      },
    };
  }

  // 2. Compute demand nudge
  const demandInfo = calculateDemandAdjustment(demandRatio);

  // Apply demand multiplier to base price
  let adjustedPrice = basePrice * demandInfo.multiplier;

  // Apply expiry markdown if applicable (takes precedence over surge)
  if (expiryInfo.discountFraction > 0) {
    adjustedPrice = Math.min(adjustedPrice, basePrice * (1.0 - expiryInfo.discountFraction));
  }

  // 3. Ethical and legal constraints:
  // - Never exceed MRP
  // - Never exceed basePrice * 1.08
  // - Never go below 1.0
  const maxAllowedPrice = Math.min(mrp, basePrice * (1.0 + MAX_SURGE_PCT));
  const finalPrice = Math.max(
    1.0,
    Math.min(maxAllowedPrice, Math.round(adjustedPrice * 100) / 100)
  );

  const totalDiscountPct = Math.round(((mrp - finalPrice) / mrp) * 1000) / 10;

  const reasonParts = [];
  if (expiryInfo.discountFraction > 0) {
    reasonParts.push(
      `Expiry markdown ${Math.round(expiryInfo.discountFraction * 100)}% (${expiryInfo.status})`
    );
  }
  if (demandInfo.percentageChange !== 0) {
    reasonParts.push(
      `Demand adjustment ${demandInfo.percentageChange > 0 ? '+' : ''}${demandInfo.percentageChange}%`
    );
  }
  if (reasonParts.length === 0) {
    reasonParts.push('Standard base price');
  }

  return {
    finalPrice,
    basePrice,
    mrp,
    effectiveDiscountPercent: totalDiscountPct,
    expiryStatus: expiryInfo.status,
    demandReason: demandInfo.reason,
    auditLog: {
      oldPrice: basePrice,
      newPrice: finalPrice,
      reason: reasonParts.join('; '),
      actor: 'system',
    },
  };
}

module.exports = {
  MAX_SURGE_PCT,
  MAX_DEMAND_DISCOUNT_PCT,
  calculateExpiryMarkdown,
  calculateDemandAdjustment,
  calculateDynamicPrice,
};
