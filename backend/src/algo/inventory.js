/**
 * @file inventory.js
 * @description Pure inventory control algorithms:
 * 1. Safety Stock estimation with normal service levels (z * sigma * sqrt(L))
 * 2. Reorder Point (ROP = d_avg * L + SS)
 * 3. Economic Order Quantity (EOQ = sqrt(2*D*S / H))
 * 4. Transparent reorder suggestion generator with explainable math.
 * Zero external dependencies.
 */

// Z-scores for standard cumulative normal service levels
const SERVICE_LEVEL_Z = Object.freeze({
  0.9: 1.282,
  0.95: 1.645,
  0.98: 2.054,
  0.99: 2.326,
});

/**
 * Returns Z-score for a given target service level (clamped between 0.8 and 0.999).
 * Uses standard polynomial approximation of inverse normal CDF.
 *
 * @param {number} [serviceLevel=0.95]
 * @returns {number}
 */
function getZScore(serviceLevel = 0.95) {
  const p = Math.max(0.8, Math.min(0.999, Number(serviceLevel) || 0.95));
  if (SERVICE_LEVEL_Z[p]) return SERVICE_LEVEL_Z[p];

  // Abramowitz and Stegun rational approximation
  const t = Math.sqrt(-2.0 * Math.log(1.0 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const z = t - (c0 + c1 * t + c2 * t * t) / (1.0 + d1 * t + d2 * t * t + d3 * t * t * t);
  return Math.round(z * 1000) / 1000;
}

/**
 * Calculates mean and sample standard deviation of a series.
 *
 * @param {number[]} values
 * @returns {{ mean: number, stdDev: number }}
 */
function calculateSeriesStats(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + Number(v), 0) / n;
  if (n <= 1) {
    return { mean: Math.round(mean * 100) / 100, stdDev: 0 };
  }

  const variance = values.reduce((sum, v) => sum + Math.pow(Number(v) - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(Math.max(0, variance));

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

/**
 * Calculates Safety Stock: SS = z * sigma_d * sqrt(L)
 *
 * @param {number} [dailyDemandStd=0] - Standard deviation of daily demand
 * @param {number} [leadTimeDays=1] - Supplier replenishment lead time in days
 * @param {number} [serviceLevel=0.95] - Target fill rate / service level (e.g. 0.95)
 * @returns {number} Safety stock units
 */
function calculateSafetyStock(dailyDemandStd = 0, leadTimeDays = 1, serviceLevel = 0.95) {
  const sigma = Math.max(0, dailyDemandStd);
  const L = Math.max(1, leadTimeDays);
  const z = getZScore(serviceLevel);

  const ss = z * sigma * Math.sqrt(L);
  return Math.ceil(ss);
}

/**
 * Calculates Reorder Point: ROP = (dailyDemandAvg * L) + SafetyStock
 *
 * @param {number} [dailyDemandAvg=0] - Average units demanded per day
 * @param {number} [leadTimeDays=1] - Supplier replenishment lead time in days
 * @param {number} [safetyStock=0] - Buffer stock for demand/lead time variance
 * @returns {number} Reorder threshold
 */
function calculateReorderPoint(dailyDemandAvg = 0, leadTimeDays = 1, safetyStock = 0) {
  const dAvg = Math.max(0, dailyDemandAvg);
  const L = Math.max(1, leadTimeDays);
  const ss = Math.max(0, safetyStock);

  const rop = dAvg * L + ss;
  return Math.ceil(rop);
}

/**
 * Calculates Economic Order Quantity: EOQ = sqrt( (2 * D * S) / H )
 *
 * @param {number} [annualDemand=1] - Annual or period total demand D
 * @param {number} [orderCost=15] - Fixed ordering cost per order S (e.g. shipping/admin)
 * @param {number} [holdingCostPerUnit=2.0] - Annual holding cost per unit H (carrying cost)
 * @returns {number} Optimal batch order quantity
 */
function calculateEOQ(annualDemand = 1, orderCost = 15, holdingCostPerUnit = 2.0) {
  const D = Math.max(1, annualDemand);
  const S = Math.max(1, orderCost);
  const H = Math.max(0.1, holdingCostPerUnit);

  const eoq = Math.sqrt((2 * D * S) / H);
  return Math.max(1, Math.round(eoq));
}

/**
 * Evaluates inventory state and generates an actionable reorder suggestion
 * with transparent mathematical breakdown.
 *
 * @param {Object} params
 * @param {number} params.currentStock
 * @param {number[]} params.dailyDemandHistory
 * @param {number} [params.leadTimeDays=2]
 * @param {number} [params.serviceLevel=0.95]
 * @param {number} [params.orderCost=25]
 * @param {number} [params.unitCost=50]
 * @param {number} [params.holdingCostRate=0.15] - Annual holding rate as fraction of unit cost
 * @returns {Object}
 */
function evaluateReorderSuggestion(params = {}) {
  const currentStock = Math.max(0, Math.floor(Number(params.currentStock) || 0));
  const leadTimeDays = Math.max(1, Number(params.leadTimeDays) || 2);
  const serviceLevel = Number(params.serviceLevel) || 0.95;
  const orderCost = Math.max(1, Number(params.orderCost) || 25);
  const unitCost = Math.max(1, Number(params.unitCost) || 50);
  const holdingCostRate = Math.max(0.01, Number(params.holdingCostRate) || 0.15);
  const holdingCostPerUnit = unitCost * holdingCostRate;

  const stats = calculateSeriesStats(params.dailyDemandHistory || []);
  const safetyStock = calculateSafetyStock(stats.stdDev, leadTimeDays, serviceLevel);
  const reorderPoint = calculateReorderPoint(stats.mean, leadTimeDays, safetyStock);

  // Annualized demand estimate (365 * daily mean)
  const annualDemand = Math.max(10, Math.round(stats.mean * 365));
  const eoq = calculateEOQ(annualDemand, orderCost, holdingCostPerUnit);

  const shouldReorder = currentStock <= reorderPoint;
  const suggestedOrderQty = shouldReorder ? Math.max(eoq, reorderPoint - currentStock + eoq) : 0;

  return {
    currentStock,
    dailyDemandAvg: stats.mean,
    dailyDemandStd: stats.stdDev,
    leadTimeDays,
    serviceLevel,
    safetyStock,
    reorderPoint,
    shouldReorder,
    suggestedOrderQty,
    math: {
      leadTimeDemand: Math.round(stats.mean * leadTimeDays * 100) / 100,
      zScore: getZScore(serviceLevel),
      annualDemand,
      eoq,
      holdingCostPerUnit: Math.round(holdingCostPerUnit * 100) / 100,
    },
  };
}

module.exports = {
  getZScore,
  calculateSeriesStats,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateEOQ,
  evaluateReorderSuggestion,
};
