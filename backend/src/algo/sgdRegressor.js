/**
 * @file sgdRegressor.js
 * @description Pure hand-written Online Linear Regression with Stochastic Gradient Descent (SGD)
 * for learned delivery ETA correction and residual quantile confidence range estimation.
 * Zero external ML dependencies.
 */

const DEFAULT_LEARNING_RATE = 0.01;
const DEFAULT_L2_LAMBDA = 0.0001;

class SGDOnlineRegressor {
  /**
   * @param {Object} [config]
   * @param {number} [config.numFeatures=12]
   * @param {number} [config.learningRate=0.01]
   * @param {number} [config.l2Lambda=0.0001]
   * @param {number} [config.residualBufferSize=200]
   */
  constructor(config = {}) {
    this.numFeatures = config.numFeatures || 12;
    this.learningRate = config.learningRate || DEFAULT_LEARNING_RATE;
    this.l2Lambda = config.l2Lambda || DEFAULT_L2_LAMBDA;
    this.weights = new Float64Array(this.numFeatures);
    this.stepCount = 0;

    // Rolling circular buffer of recent signed residuals (actual - predicted)
    this.residualBufferSize = config.residualBufferSize || 200;
    this.residuals = [];
    this.totalAbsError = 0;
    this.evalCount = 0;

    // Reasonable initial weights: bias ~3 mins prep, ~2.7 mins/km travel
    this.weights[0] = 3.0; // Intercept (store prep)
    this.weights[1] = 2.72; // Distance coefficient (min/km at ~22 km/h)
    this.weights[2] = 0.15; // Per-item packing time
    this.weights[3] = 0.4; // Store queue pressure
    this.weights[4] = 2.5; // Rain weather penalty
  }

  /**
   * Transforms raw order delivery context into normalized numerical feature vector.
   *
   * @param {Object} context
   * @param {number} context.distanceKm
   * @param {number} [context.itemsCount=1]
   * @param {number} [context.storeQueueLength=0]
   * @param {boolean|number} [context.isRaining=0]
   * @param {number} [context.hourOfDay=12]
   * @param {number} [context.dayOfWeek=2]
   * @returns {Float64Array}
   */
  extractFeatures(context = {}) {
    const x = new Float64Array(this.numFeatures);
    x[0] = 1.0; // Bias intercept
    x[1] = Math.max(0, Number(context.distanceKm) || 0);
    x[2] = Math.max(0, Number(context.itemsCount) || 1);
    x[3] = Math.max(0, Number(context.storeQueueLength) || 0);
    x[4] = context.isRaining ? 1.0 : 0.0;

    const hour = Number(context.hourOfDay !== undefined ? context.hourOfDay : 12);
    // Hour buckets:
    x[5] = hour >= 8 && hour < 11 ? 1.0 : 0.0; // Morning rush
    x[6] = hour >= 12 && hour < 17 ? 1.0 : 0.0; // Midday
    x[7] = hour >= 17 && hour < 21 ? 1.0 : 0.0; // Evening rush
    x[8] = hour >= 22 || hour < 7 ? 1.0 : 0.0; // Late night

    const dow = Number(context.dayOfWeek !== undefined ? context.dayOfWeek : 2);
    x[9] = dow === 0 || dow === 6 ? 1.0 : 0.0; // Weekend surge
    x[10] = x[1] * x[4]; // Distance x Rain interaction
    x[11] = x[1] * x[7]; // Distance x Evening rush interaction

    return x;
  }

  /**
   * Predicts delivery ETA and computes quantile residual confidence bounds.
   *
   * @param {Object|Float64Array} contextOrFeatures
   * @returns {{
   *   predictedEtaMinutes: number,
   *   confidenceLower: number,
   *   confidenceUpper: number,
   *   confidenceRangeText: string
   * }}
   */
  predict(contextOrFeatures) {
    const x =
      contextOrFeatures instanceof Float64Array
        ? contextOrFeatures
        : this.extractFeatures(contextOrFeatures);

    let rawEta = 0;
    for (let i = 0; i < this.numFeatures; i++) {
      rawEta += this.weights[i] * x[i];
    }

    const predicted = Math.max(1.0, Math.round(rawEta * 10) / 10);

    // Compute empirical quantile bounds from stored residuals
    const quantiles = this._getResidualQuantiles();
    const lower = Math.max(1.0, Math.round((predicted + quantiles.q10) * 10) / 10);
    const upper = Math.max(lower + 1.0, Math.round((predicted + quantiles.q90) * 10) / 10);

    return {
      predictedEtaMinutes: predicted,
      confidenceLower: lower,
      confidenceUpper: upper,
      confidenceRangeText: `${Math.round(lower)} - ${Math.round(upper)} mins`,
    };
  }

  /**
   * Ingests a completed delivery observation and updates model weights via SGD.
   *
   * @param {Object|Float64Array} contextOrFeatures
   * @param {number} actualMinutes
   * @returns {{ error: number, absError: number, updatedWeights: number[] }}
   */
  trainOnline(contextOrFeatures, actualMinutes) {
    const x =
      contextOrFeatures instanceof Float64Array
        ? contextOrFeatures
        : this.extractFeatures(contextOrFeatures);

    const actual = Math.max(1.0, Number(actualMinutes) || 1.0);

    let yHat = 0;
    for (let i = 0; i < this.numFeatures; i++) {
      yHat += this.weights[i] * x[i];
    }

    const error = yHat - actual; // Prediction error
    const absErr = Math.abs(error);

    // Adaptive learning rate with inverse time decay
    this.stepCount++;
    const lr = this.learningRate / (1 + 0.0005 * this.stepCount);

    // SGD weight update with L2 weight decay
    for (let i = 0; i < this.numFeatures; i++) {
      const grad = error * x[i] + this.l2Lambda * this.weights[i];
      this.weights[i] -= lr * grad;
    }

    // Keep bias non-negative
    this.weights[0] = Math.max(0.5, this.weights[0]);
    this.weights[1] = Math.max(0.5, this.weights[1]);

    // Store signed residual: actual - predicted
    const residual = actual - yHat;
    if (this.residuals.length >= this.residualBufferSize) {
      this.residuals.shift();
    }
    this.residuals.push(residual);

    this.totalAbsError += absErr;
    this.evalCount++;

    return {
      error: Math.round(error * 100) / 100,
      absError: Math.round(absErr * 100) / 100,
      mae: this.getMAE(),
    };
  }

  /**
   * Returns current running Mean Absolute Error (MAE).
   * @returns {number}
   */
  getMAE() {
    return this.evalCount > 0 ? Math.round((this.totalAbsError / this.evalCount) * 100) / 100 : 0;
  }

  /**
   * Computes 10th and 90th percentile residuals for confidence intervals.
   * @private
   */
  _getResidualQuantiles() {
    if (this.residuals.length < 5) {
      return { q10: -1.5, q90: 2.5 };
    }

    const sorted = [...this.residuals].sort((a, b) => a - b);
    const idx10 = Math.floor(sorted.length * 0.1);
    const idx90 = Math.floor(sorted.length * 0.9);

    return {
      q10: sorted[idx10],
      q90: sorted[idx90],
    };
  }

  /**
   * Returns copy of weights for inspection or persistence.
   * @returns {number[]}
   */
  getWeights() {
    return Array.from(this.weights).map((w) => Math.round(w * 1000) / 1000);
  }
}

module.exports = {
  SGDOnlineRegressor,
};
