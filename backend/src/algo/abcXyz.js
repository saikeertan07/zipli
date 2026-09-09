/**
 * @file abcXyz.js
 * @description Pure ABC/XYZ inventory matrix classification:
 * 1. ABC Analysis: Pareto 80/20 revenue value segmentation (A: ~80%, B: ~15%, C: ~5%)
 * 2. XYZ Analysis: Demand volatility segmentation via Coefficient of Variation (CV = sigma / mu)
 * 3. 9-box operational matrix with automated replenishment recommendations.
 * Zero external dependencies.
 */

const { calculateSeriesStats } = require('./inventory');

const MATRIX_RECOMMENDATIONS = Object.freeze({
  AX: 'High value, steady demand. Use Just-In-Time (JIT) replenishment with minimal safety stock.',
  AY: 'High value, seasonal/trend demand. Maintain moderate safety stock; apply Holt-Winters forecasting.',
  AZ: 'High value, volatile demand. High stockout risk. Use supplier consignment or safety buffers.',
  BX: 'Medium value, steady demand. Automated periodic reordering with standard EOQ.',
  BY: 'Medium value, fluctuating demand. Reorder based on dynamic ROP; review monthly.',
  BZ: 'Medium value, volatile demand. Keep minimal buffer; order in small batches.',
  CX: 'Low value, steady demand. Order in large bulk EOQ quantities to minimize ordering overhead.',
  CY: 'Low value, fluctuating demand. Reorder on trigger; low management priority.',
  CZ: 'Low value, erratic demand. High risk of obsolescence/dead stock. Consider drop-shipping or phasing out.',
});

/**
 * Classifies an array of catalog items into the ABC/XYZ 9-cell matrix.
 *
 * @param {Array<{
 *   id: string|number,
 *   name: string,
 *   unitPrice: number,
 *   unitsSold: number,
 *   demandHistory?: number[]
 * }>} items
 * @param {Object} [options]
 * @param {number} [options.aThreshold=0.80] - Cumulative revenue fraction for Class A
 * @param {number} [options.bThreshold=0.95] - Cumulative revenue fraction for Class B (remainder is C)
 * @param {number} [options.xCvThreshold=0.50] - CV threshold for steady demand (X)
 * @param {number} [options.yCvThreshold=1.00] - CV threshold for variable demand (Y) (above is Z)
 * @returns {{
 *   classifiedItems: Array<Object>,
 *   summary: Object,
 *   matrixGrid: Object
 * }}
 */
function classifyAbcXyz(items = [], options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      classifiedItems: [],
      summary: { totalRevenue: 0, totalItems: 0, aCount: 0, bCount: 0, cCount: 0 },
      matrixGrid: {},
    };
  }

  const aThresh = options.aThreshold ?? 0.8;
  const bThresh = options.bThreshold ?? 0.95;
  const xCvThresh = options.xCvThreshold ?? 0.5;
  const yCvThresh = options.yCvThreshold ?? 1.0;

  // 1. Calculate revenue for each item
  const enriched = items.map((item) => {
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const units = Math.max(0, Number(item.unitsSold) || 0);
    const revenue = price * units;

    // Demand volatility
    const stats = calculateSeriesStats(item.demandHistory || [units]);
    const cv = stats.mean > 0 ? stats.stdDev / stats.mean : 0;

    return {
      id: item.id,
      name: item.name,
      unitPrice: price,
      unitsSold: units,
      revenue,
      demandMean: stats.mean,
      demandStdDev: stats.stdDev,
      cv: Math.round(cv * 100) / 100,
    };
  });

  // Sort by revenue descending for Pareto ranking
  enriched.sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = enriched.reduce((sum, item) => sum + item.revenue, 0);

  // 2. Assign ABC and XYZ classes
  let cumulativeRevenue = 0;
  const classifiedItems = [];

  const matrixCounts = {
    AX: 0,
    AY: 0,
    AZ: 0,
    BX: 0,
    BY: 0,
    BZ: 0,
    CX: 0,
    CY: 0,
    CZ: 0,
  };

  let aCount = 0;
  let bCount = 0;
  let cCount = 0;

  for (const item of enriched) {
    cumulativeRevenue += item.revenue;
    const revenueShare = totalRevenue > 0 ? cumulativeRevenue / totalRevenue : 1.0;

    // ABC assignment
    let abcClass = 'C';
    if (revenueShare <= aThresh || (classifiedItems.length === 0 && totalRevenue > 0)) {
      abcClass = 'A';
      aCount++;
    } else if (revenueShare <= bThresh) {
      abcClass = 'B';
      bCount++;
    } else {
      abcClass = 'C';
      cCount++;
    }

    // XYZ assignment based on CV
    let xyzClass = 'Z';
    if (item.cv <= xCvThresh) {
      xyzClass = 'X';
    } else if (item.cv <= yCvThresh) {
      xyzClass = 'Y';
    } else {
      xyzClass = 'Z';
    }

    const cell = `${abcClass}${xyzClass}`;
    matrixCounts[cell]++;

    classifiedItems.push({
      ...item,
      abcClass,
      xyzClass,
      matrixCell: cell,
      revenueSharePercent:
        totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 10000) / 100 : 0,
      cumulativeRevenuePercent: Math.round(revenueShare * 10000) / 100,
      recommendation: MATRIX_RECOMMENDATIONS[cell],
    });
  }

  return {
    classifiedItems,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalItems: classifiedItems.length,
      aCount,
      bCount,
      cCount,
    },
    matrixGrid: matrixCounts,
  };
}

module.exports = {
  MATRIX_RECOMMENDATIONS,
  classifyAbcXyz,
};
