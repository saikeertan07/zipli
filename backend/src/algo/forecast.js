/**
 * @file forecast.js
 * @description Pure hand-written time series demand forecasting:
 * 1. Simple Exponential Smoothing (SES) - baseline level tracking
 * 2. Holt's Linear Trend - level + additive slope
 * 3. Holt-Winters Additive Seasonality - level + trend + weekly seasonality (m=7)
 * 4. Rolling-origin cross-validation with Symmetric Mean Absolute Percentage Error (sMAPE)
 * Zero external dependencies.
 */

/**
 * Calculates Symmetric Mean Absolute Percentage Error (sMAPE).
 * Formula: (100% / n) * sum( 2 * |y - yHat| / (|y| + |yHat| + eps) )
 *
 * @param {number[]} actual
 * @param {number[]} predicted
 * @param {number} [eps=1e-6]
 * @returns {number} sMAPE percentage (0 to 200)
 */
function calculateSMAPE(actual = [], predicted = [], eps = 1e-6) {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return 0;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const y = actual[i];
    const yHat = predicted[i];
    const numerator = 2 * Math.abs(y - yHat);
    const denominator = Math.abs(y) + Math.abs(yHat) + eps;
    total += numerator / denominator;
  }

  return Math.round((total / n) * 10000) / 100;
}

/**
 * Simple Exponential Smoothing (SES)
 * Time Complexity: O(N + H)
 * Space Complexity: O(N + H)
 *
 * @param {number[]} series - Historical time series
 * @param {number} [alpha=0.3] - Smoothing factor [0, 1]
 * @param {number} [horizon=1] - Forecast horizon
 * @returns {{ fitted: number[], forecast: number[], alpha: number }}
 */
function simpleExponentialSmoothing(series = [], alpha = 0.3, horizon = 1) {
  if (!Array.isArray(series) || series.length === 0) {
    return { fitted: [], forecast: new Array(Math.max(1, horizon)).fill(0), alpha };
  }

  const safeAlpha = Math.max(0.01, Math.min(0.99, alpha));
  const n = series.length;
  const fitted = new Float64Array(n);

  // Initialize with first observation
  fitted[0] = series[0];
  for (let t = 1; t < n; t++) {
    fitted[t] = safeAlpha * series[t - 1] + (1 - safeAlpha) * fitted[t - 1];
  }

  // Next level
  const lastLevel = safeAlpha * series[n - 1] + (1 - safeAlpha) * fitted[n - 1];
  const forecast = new Array(Math.max(1, horizon)).fill(
    Math.max(0, Math.round(lastLevel * 100) / 100)
  );

  return {
    fitted: Array.from(fitted).map((v) => Math.round(v * 100) / 100),
    forecast,
    alpha: safeAlpha,
  };
}

/**
 * Holt's Linear Trend Exponential Smoothing
 * Time Complexity: O(N + H)
 * Space Complexity: O(N + H)
 *
 * @param {number[]} series
 * @param {number} [alpha=0.3] - Level smoothing factor
 * @param {number} [beta=0.1] - Trend smoothing factor
 * @param {number} [horizon=1] - Forecast horizon
 * @returns {{ fitted: number[], forecast: number[], level: number, trend: number }}
 */
function holtLinearTrend(series = [], alpha = 0.3, beta = 0.1, horizon = 1) {
  if (!Array.isArray(series) || series.length === 0) {
    return { fitted: [], forecast: new Array(Math.max(1, horizon)).fill(0), level: 0, trend: 0 };
  }

  const safeAlpha = Math.max(0.01, Math.min(0.99, alpha));
  const safeBeta = Math.max(0.01, Math.min(0.99, beta));
  const n = series.length;

  if (n === 1) {
    return {
      fitted: [series[0]],
      forecast: new Array(Math.max(1, horizon)).fill(series[0]),
      level: series[0],
      trend: 0,
    };
  }

  const fitted = new Float64Array(n);
  let level = series[0];
  let trend = series[1] - series[0];
  fitted[0] = level;

  for (let t = 1; t < n; t++) {
    const prevLevel = level;
    const prevTrend = trend;
    level = safeAlpha * series[t] + (1 - safeAlpha) * (prevLevel + prevTrend);
    trend = safeBeta * (level - prevLevel) + (1 - safeBeta) * prevTrend;
    fitted[t] = prevLevel + prevTrend;
  }

  const forecast = [];
  for (let h = 1; h <= Math.max(1, horizon); h++) {
    const val = Math.max(0, level + h * trend);
    forecast.push(Math.round(val * 100) / 100);
  }

  return {
    fitted: Array.from(fitted).map((v) => Math.round(v * 100) / 100),
    forecast,
    level: Math.round(level * 100) / 100,
    trend: Math.round(trend * 100) / 100,
  };
}

/**
 * Holt-Winters Additive Seasonality Smoothing
 * Time Complexity: O(N + H)
 * Space Complexity: O(N + H)
 *
 * @param {number[]} series - Historical observations (must be >= 2 * seasonLength for reliable initialization)
 * @param {Object} [options]
 * @param {number} [options.alpha=0.3] - Level smoothing
 * @param {number} [options.beta=0.1] - Trend smoothing
 * @param {number} [options.gamma=0.2] - Seasonal smoothing
 * @param {number} [options.seasonLength=7] - Seasonality period (7 for daily quick-commerce)
 * @param {number} [options.horizon=1] - Forecast horizon
 * @returns {{ fitted: number[], forecast: number[], seasonals: number[] }}
 */
function holtWinters(series = [], options = {}) {
  const m = Math.max(2, Math.floor(options.seasonLength ?? 7));
  const h = Math.max(1, Math.floor(options.horizon ?? 1));
  const alpha = Math.max(0.01, Math.min(0.99, options.alpha ?? 0.3));
  const beta = Math.max(0.01, Math.min(0.99, options.beta ?? 0.1));
  const gamma = Math.max(0.01, Math.min(0.99, options.gamma ?? 0.2));

  if (!Array.isArray(series) || series.length < 2 * m) {
    // Fall back to Holt Linear if series is shorter than 2 full seasonal cycles
    const fallback = holtLinearTrend(series, alpha, beta, h);
    return {
      fitted: fallback.fitted,
      forecast: fallback.forecast,
      seasonals: new Array(m).fill(0),
      fallbackUsed: true,
    };
  }

  const n = series.length;
  const fitted = new Float64Array(n);

  // 1. Initial level and trend from first 2 seasonal cycles
  let sumCycle1 = 0;
  let sumCycle2 = 0;
  for (let i = 0; i < m; i++) {
    sumCycle1 += series[i];
    sumCycle2 += series[i + m];
  }
  let level = sumCycle1 / m;
  let trend = (sumCycle2 - sumCycle1) / (m * m);

  // 2. Initial seasonal indices
  const seasonals = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    seasonals[i] = series[i] - level;
  }

  // 3. Iterative Holt-Winters recursion
  for (let t = 0; t < n; t++) {
    const sIdx = t % m;
    const prevLevel = level;
    const prevTrend = trend;
    const prevSeason = seasonals[sIdx];

    // One-step-ahead fitted value
    fitted[t] = prevLevel + prevTrend + prevSeason;

    // State updates
    level = alpha * (series[t] - prevSeason) + (1 - alpha) * (prevLevel + prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    seasonals[sIdx] = gamma * (series[t] - level) + (1 - gamma) * prevSeason;
  }

  // 4. Generate future forecast for horizon h
  const forecast = [];
  for (let step = 1; step <= h; step++) {
    const sIdx = (n + step - 1) % m;
    const val = Math.max(0, level + step * trend + seasonals[sIdx]);
    forecast.push(Math.round(val * 100) / 100);
  }

  return {
    fitted: Array.from(fitted).map((v) => Math.round(v * 100) / 100),
    forecast,
    seasonals: Array.from(seasonals).map((v) => Math.round(v * 100) / 100),
    fallbackUsed: false,
  };
}

/**
 * Selects the optimal demand forecasting model per product using rolling-origin
 * cross-validation, evaluated by minimum sMAPE.
 *
 * @param {number[]} series - Historical sales series
 * @param {Object} [options]
 * @param {number} [options.horizon=7] - Forecast horizon
 * @param {number} [options.seasonLength=7] - Weekly season length
 * @param {number} [options.validationWindow=7] - Rolling test window
 * @returns {{
 *   selectedModel: 'SES'|'HOLT'|'HOLT_WINTERS',
 *   forecast: number[],
 *   metrics: { sesSmape: number, holtSmape: number, hwSmape: number, bestSmape: number },
 *   modelDiagnostics: Object
 * }}
 */
function forecastBestModel(series = [], options = {}) {
  const horizon = Math.max(1, Math.floor(options.horizon ?? 7));
  const seasonLength = Math.max(2, Math.floor(options.seasonLength ?? 7));
  const valWindow = Math.max(
    1,
    Math.min(series ? series.length - 2 : 1, Math.floor(options.validationWindow ?? 7))
  );

  if (!Array.isArray(series) || series.length <= 3) {
    const fallback = simpleExponentialSmoothing(series, 0.3, horizon);
    return {
      selectedModel: 'SES',
      forecast: fallback.forecast,
      metrics: { sesSmape: 0, holtSmape: 0, hwSmape: 0, bestSmape: 0 },
      modelDiagnostics: { reason: 'Insufficient data points for rolling-origin CV' },
    };
  }

  // Split into train and test for rolling-origin evaluation
  const splitIdx = Math.max(2, series.length - valWindow);
  const trainSeries = series.slice(0, splitIdx);
  const testActual = series.slice(splitIdx);
  const testLen = testActual.length;

  // 1. Evaluate SES
  const sesTest = simpleExponentialSmoothing(trainSeries, 0.3, testLen);
  const sesSmape = calculateSMAPE(testActual, sesTest.forecast);

  // 2. Evaluate Holt
  const holtTest = holtLinearTrend(trainSeries, 0.3, 0.1, testLen);
  const holtSmape = calculateSMAPE(testActual, holtTest.forecast);

  // 3. Evaluate Holt-Winters
  const hwTest = holtWinters(trainSeries, {
    alpha: 0.3,
    beta: 0.1,
    gamma: 0.2,
    seasonLength,
    horizon: testLen,
  });
  const hwSmape = calculateSMAPE(testActual, hwTest.forecast);

  // Pick best model by lowest sMAPE
  let selectedModel = 'SES';
  let bestSmape = sesSmape;

  if (holtSmape < bestSmape) {
    bestSmape = holtSmape;
    selectedModel = 'HOLT';
  }
  if (trainSeries.length >= 2 * seasonLength && hwSmape < bestSmape) {
    bestSmape = hwSmape;
    selectedModel = 'HOLT_WINTERS';
  }

  // Fit final chosen model on entire series
  let finalForecast;
  let finalDiagnostics;

  if (selectedModel === 'HOLT_WINTERS') {
    const res = holtWinters(series, { alpha: 0.3, beta: 0.1, gamma: 0.2, seasonLength, horizon });
    finalForecast = res.forecast;
    finalDiagnostics = { seasonals: res.seasonals };
  } else if (selectedModel === 'HOLT') {
    const res = holtLinearTrend(series, 0.3, 0.1, horizon);
    finalForecast = res.forecast;
    finalDiagnostics = { level: res.level, trend: res.trend };
  } else {
    const res = simpleExponentialSmoothing(series, 0.3, horizon);
    finalForecast = res.forecast;
    finalDiagnostics = { alpha: res.alpha };
  }

  return {
    selectedModel,
    forecast: finalForecast,
    metrics: {
      sesSmape,
      holtSmape,
      hwSmape,
      bestSmape,
    },
    modelDiagnostics: finalDiagnostics,
  };
}

module.exports = {
  calculateSMAPE,
  simpleExponentialSmoothing,
  holtLinearTrend,
  holtWinters,
  forecastBestModel,
};
