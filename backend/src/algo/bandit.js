/**
 * @file bandit.js
 * @description Pure Multi-Armed Bandit implementations for recommendation rail ordering and item exploration.
 * Includes Epsilon-Greedy and Thompson Sampling with a pure, hand-written Beta distribution sampler.
 * Zero external dependencies.
 */

/**
 * Standard Normal sampler using Box-Muller transform.
 *
 * @returns {number} Sample from N(0, 1)
 */
function sampleStandardNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Gamma(alpha, 1) sampler using Marsaglia & Tsang (2000) method.
 *
 * @param {number} alpha - Shape parameter (alpha > 0).
 * @returns {number}
 */
function sampleGamma(alpha) {
  if (alpha < 1.0) {
    // For alpha < 1, use Johnk's multiplication: Gamma(alpha) = Gamma(alpha + 1) * U^(1/alpha)
    const u = Math.random();
    return sampleGamma(alpha + 1.0) * Math.pow(u, 1.0 / alpha);
  }

  const d = alpha - 1.0 / 3.0;
  const c = 1.0 / Math.sqrt(9.0 * d);

  while (true) {
    let z = sampleStandardNormal();
    let v = 1.0 + c * z;

    while (v <= 0) {
      z = sampleStandardNormal();
      v = 1.0 + c * z;
    }

    v = v * v * v;
    const u = Math.random();

    // Squeeze test
    if (u < 1.0 - 0.0331 * z * z * z * z) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * z * z + d * (1.0 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Beta(alpha, beta) sampler using transformation of two independent Gamma variables.
 * If X ~ Gamma(alpha, 1) and Y ~ Gamma(beta, 1), then X / (X + Y) ~ Beta(alpha, beta).
 *
 * @param {number} alpha - Shape parameter alpha > 0
 * @param {number} beta - Shape parameter beta > 0
 * @returns {number} Sample in [0, 1]
 */
function sampleBeta(alpha, beta) {
  const safeAlpha = Math.max(0.0001, alpha);
  const safeBeta = Math.max(0.0001, beta);

  const x = sampleGamma(safeAlpha);
  const y = sampleGamma(safeBeta);

  return x / (x + y);
}

class EpsilonGreedyBandit {
  /**
   * @param {string[]} armIds
   * @param {Object} [options]
   * @param {number} [options.epsilon=0.1] - Exploration probability.
   * @param {number} [options.decay=1.0] - Multiplicative decay per step.
   * @param {number} [options.minEpsilon=0.01] - Floor on epsilon.
   */
  constructor(armIds = [], options = {}) {
    const { epsilon = 0.1, decay = 1.0, minEpsilon = 0.01 } = options;
    this.epsilon = epsilon;
    this.decay = decay;
    this.minEpsilon = minEpsilon;

    // arm -> { impressions: number, clicks: number, reward: number }
    this.arms = new Map();
    for (const armId of armIds) {
      this.addArm(armId);
    }
  }

  addArm(armId) {
    const key = String(armId);
    if (!this.arms.has(key)) {
      this.arms.set(key, { impressions: 0, clicks: 0, reward: 0 });
    }
  }

  /**
   * Selects an arm to display using epsilon-greedy strategy.
   *
   * @returns {string} Selected armId
   */
  selectArm() {
    const armKeys = Array.from(this.arms.keys());
    if (armKeys.length === 0) return null;

    const currentEpsilon = this.epsilon;
    // Decay exploration rate
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.decay);

    // Exploration: pick random arm with probability epsilon
    if (Math.random() < currentEpsilon) {
      const randomIdx = Math.floor(Math.random() * armKeys.length);
      return armKeys[randomIdx];
    }

    // Exploitation: pick arm with highest empirical CTR
    let bestArm = armKeys[0];
    let bestRate = -1;

    for (const key of armKeys) {
      const stats = this.arms.get(key);
      const ctr = stats.impressions > 0 ? stats.clicks / stats.impressions : 0.5; // Optimistic initial value
      if (ctr > bestRate) {
        bestRate = ctr;
        bestArm = key;
      }
    }

    return bestArm;
  }

  /**
   * Records outcome for an arm.
   *
   * @param {string} armId
   * @param {boolean|number} clicked - 1/true if clicked, 0/false otherwise.
   */
  recordFeedback(armId, clicked) {
    const key = String(armId);
    this.addArm(key);
    const stats = this.arms.get(key);
    stats.impressions++;
    if (clicked) {
      stats.clicks++;
      stats.reward += 1;
    }
  }

  /**
   * Returns current statistics across all arms.
   */
  getStats() {
    const res = {};
    for (const [key, stats] of this.arms.entries()) {
      res[key] = {
        ...stats,
        ctr:
          stats.impressions > 0 ? Math.round((stats.clicks / stats.impressions) * 1000) / 1000 : 0,
      };
    }
    return res;
  }
}

class ThompsonSamplingBandit {
  /**
   * @param {string[]} armIds
   * @param {Object} [options]
   * @param {number} [options.priorAlpha=1] - Prior pseudo-clicks
   * @param {number} [options.priorBeta=1] - Prior pseudo-non-clicks
   */
  constructor(armIds = [], options = {}) {
    const { priorAlpha = 1, priorBeta = 1 } = options;
    this.priorAlpha = priorAlpha;
    this.priorBeta = priorBeta;

    // arm -> { alpha: number, beta: number, impressions: number, clicks: number }
    this.arms = new Map();
    for (const armId of armIds) {
      this.addArm(armId);
    }
  }

  addArm(armId) {
    const key = String(armId);
    if (!this.arms.has(key)) {
      this.arms.set(key, {
        alpha: this.priorAlpha,
        beta: this.priorBeta,
        impressions: 0,
        clicks: 0,
      });
    }
  }

  /**
   * Samples theta ~ Beta(alpha, beta) for each arm and selects the highest.
   *
   * @returns {string} Selected armId
   */
  selectArm() {
    const armKeys = Array.from(this.arms.keys());
    if (armKeys.length === 0) return null;

    let bestArm = armKeys[0];
    let bestSample = -Infinity;

    for (const key of armKeys) {
      const stats = this.arms.get(key);
      const theta = sampleBeta(stats.alpha, stats.beta);
      if (theta > bestSample) {
        bestSample = theta;
        bestArm = key;
      }
    }

    return bestArm;
  }

  /**
   * Ranks all arms by their sampled Thompson probability (used for ordering rails).
   *
   * @returns {Array<{ armId: string, sampledScore: number, expectedCtr: number }>}
   */
  rankArms() {
    const ranked = [];
    for (const [key, stats] of this.arms.entries()) {
      const theta = sampleBeta(stats.alpha, stats.beta);
      const expectedCtr = stats.alpha / (stats.alpha + stats.beta);
      ranked.push({
        armId: key,
        sampledScore: Math.round(theta * 10000) / 10000,
        expectedCtr: Math.round(expectedCtr * 10000) / 10000,
      });
    }

    ranked.sort((a, b) => b.sampledScore - a.sampledScore);
    return ranked;
  }

  /**
   * Updates Bayesian posterior after observing impression outcome.
   *
   * @param {string} armId
   * @param {boolean|number} clicked
   */
  recordFeedback(armId, clicked) {
    const key = String(armId);
    this.addArm(key);
    const stats = this.arms.get(key);
    stats.impressions++;
    if (clicked) {
      stats.clicks++;
      stats.alpha += 1;
    } else {
      stats.beta += 1;
    }
  }

  /**
   * Returns current arm stats.
   */
  getStats() {
    const res = {};
    for (const [key, stats] of this.arms.entries()) {
      res[key] = {
        ...stats,
        expectedCtr: Math.round((stats.alpha / (stats.alpha + stats.beta)) * 1000) / 1000,
      };
    }
    return res;
  }
}

module.exports = {
  EpsilonGreedyBandit,
  ThompsonSamplingBandit,
  sampleBeta,
  sampleGamma,
  sampleStandardNormal,
};
