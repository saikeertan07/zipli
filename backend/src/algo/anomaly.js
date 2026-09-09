/**
 * @file anomaly.js
 * @description Pure statistical anomaly detection for stock, sales, and refund monitoring:
 * 1. Robust Modified Z-Score using Median and Median Absolute Deviation (MAD)
 * 2. CUSUM (Cumulative Sum Control Chart) for sequential drift and regime shift detection
 * Zero external dependencies.
 */

/**
 * Calculates median of an array of numbers.
 * @param {number[]} values
 * @returns {number}
 */
function calculateMedian(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD):
 * MAD = median( |x_i - median(X)| )
 *
 * @param {number[]} values
 * @param {number} [medianVal]
 * @returns {number}
 */
function calculateMAD(values = [], medianVal) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const med = medianVal !== undefined ? medianVal : calculateMedian(values);
  const deviations = values.map((v) => Math.abs((Number(v) || 0) - med));
  return calculateMedian(deviations);
}

/**
 * Computes Robust Modified Z-Scores using Median and MAD.
 * Formula: M_i = 0.6745 * (x_i - median) / (MAD + eps)
 * (0.6745 is the consistency factor for normal distributions where MAD = 0.6745 * sigma)
 *
 * @param {number[]} series
 * @param {Object} [options]
 * @param {number} [options.threshold=3.0] - Outlier threshold (standard is 3.0 to 3.5)
 * @param {number} [options.eps=1e-6]
 * @returns {Array<{
 *   index: number,
 *   value: number,
 *   score: number,
 *   isAnomaly: boolean,
 *   type: 'SPIKE'|'DROP'|'NORMAL'
 * }>}
 */
function detectRobustZOutliers(series = [], options = {}) {
  if (!Array.isArray(series) || series.length === 0) return [];
  const threshold = Math.max(1.0, options.threshold ?? 3.0);
  const eps = options.eps ?? 1e-6;

  const median = calculateMedian(series);
  let mad = calculateMAD(series, median);

  // If MAD is zero (e.g. over 50% identical observations), fall back to Mean Absolute Deviation
  if (mad === 0) {
    const mean = series.reduce((s, v) => s + Number(v), 0) / series.length;
    const meanAbsDev = series.reduce((s, v) => s + Math.abs(Number(v) - mean), 0) / series.length;
    mad = meanAbsDev * 0.8; // Approximate MAD from mean deviation
  }

  const denominator = (mad + eps) / 0.6745;

  return series.map((val, idx) => {
    const num = Number(val);
    const score = (num - median) / denominator;
    const absScore = Math.abs(score);
    const isAnomaly = absScore >= threshold;

    let type = 'NORMAL';
    if (isAnomaly) {
      type = score > 0 ? 'SPIKE' : 'DROP';
    }

    return {
      index: idx,
      value: num,
      score: Math.round(score * 100) / 100,
      isAnomaly,
      type,
    };
  });
}

/**
 * Cumulative Sum (CUSUM) Control Chart for sequential shift / drift detection.
 * Detects small, persistent shifts in the mean that point-by-point tests miss.
 *
 * @param {number[]} series - Chronological sequence of values
 * @param {Object} [options]
 * @param {number} [options.targetMean] - Baseline expected mean (defaults to sample mean)
 * @param {number} [options.stdDev] - Baseline standard deviation (defaults to sample stdDev)
 * @param {number} [options.kAllowance=0.5] - Slack parameter k in units of stdDev (allowance for natural noise)
 * @param {number} [options.hThreshold=4.0] - Decision threshold h in units of stdDev
 * @returns {{
 *   driftDetected: boolean,
 *   driftType: 'UP'|'DOWN'|'NONE',
 *   changePointIndex: number,
 *   sPos: number[],
 *   sNeg: number[],
 *   thresholdValue: number
 * }}
 */
function detectCUSUMDrift(series = [], options = {}) {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      driftDetected: false,
      driftType: 'NONE',
      changePointIndex: -1,
      sPos: [],
      sNeg: [],
      thresholdValue: 0,
    };
  }

  const n = series.length;
  let mean = options.targetMean;
  let sigma = options.stdDev;

  if (mean === undefined || sigma === undefined) {
    const sum = series.reduce((s, v) => s + Number(v), 0);
    mean = sum / n;
    if (n > 1) {
      const variance = series.reduce((s, v) => s + Math.pow(Number(v) - mean, 2), 0) / (n - 1);
      sigma = Math.sqrt(Math.max(0.01, variance));
    } else {
      sigma = 1.0;
    }
  }

  const k = (options.kAllowance ?? 0.5) * sigma;
  const h = (options.hThreshold ?? 4.0) * sigma;

  const sPos = new Float64Array(n);
  const sNeg = new Float64Array(n);

  let driftDetected = false;
  let driftType = 'NONE';
  let changePointIndex = -1;

  for (let t = 0; t < n; t++) {
    const x = Number(series[t]);
    const prevPos = t > 0 ? sPos[t - 1] : 0;
    const prevNeg = t > 0 ? sNeg[t - 1] : 0;

    // S_t^+ = max(0, S_{t-1}^+ + (x_t - mean - k))
    sPos[t] = Math.max(0, prevPos + (x - mean - k));
    // S_t^- = max(0, S_{t-1}^- + (mean - k - x_t))
    sNeg[t] = Math.max(0, prevNeg + (mean - k - x));

    if (!driftDetected) {
      if (sPos[t] >= h) {
        driftDetected = true;
        driftType = 'UP';
        changePointIndex = t;
      } else if (sNeg[t] >= h) {
        driftDetected = true;
        driftType = 'DOWN';
        changePointIndex = t;
      }
    }
  }

  return {
    driftDetected,
    driftType,
    changePointIndex,
    sPos: Array.from(sPos).map((v) => Math.round(v * 100) / 100),
    sNeg: Array.from(sNeg).map((v) => Math.round(v * 100) / 100),
    thresholdValue: Math.round(h * 100) / 100,
  };
}

module.exports = {
  calculateMedian,
  calculateMAD,
  detectRobustZOutliers,
  detectCUSUMDrift,
};
