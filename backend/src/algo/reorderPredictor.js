/**
 * @file reorderPredictor.js
 * @description Pure algorithmic Reorder & Replenishment Predictor for personalized "Buy It Again" feeds.
 * Estimates median inter-purchase intervals per user-product, calculates replenishment due-ness scores,
 * and incorporates recency decay. Zero external dependencies.
 */

const DEFAULT_CATEGORY_GAPS = {
  dairy: 3.5, // Milk, curd, paneer
  bakery: 4.0, // Bread, buns
  vegetables: 4.0, // Fresh produce
  fruits: 5.0, // Fresh fruits
  snacks: 10.0, // Biscuits, chips
  beverages: 14.0, // Tea, coffee, juices
  staples: 21.0, // Atta, rice, oil, pulses
  default: 7.0,
};

/**
 * Calculates the statistical median of a numeric array.
 *
 * @param {number[]} values
 * @returns {number}
 */
function calculateMedian(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

class ReorderPredictor {
  constructor(options = {}) {
    this.options = {
      defaultGapDays: 7.0,
      categoryGaps: { ...DEFAULT_CATEGORY_GAPS, ...(options.categoryGaps || {}) },
      overdueDecayThreshold: 2.5,
      ...options,
    };
  }

  /**
   * Computes the estimated typical purchase gap (in days) from chronological purchase timestamps.
   *
   * @param {Array<Date|string|number>} purchaseDates - Array of order dates.
   * @param {string} [category] - Optional category for default gap fallback.
   * @returns {{ typicalGapDays: number, sampleGapsCount: number }}
   */
  estimatePurchaseGap(purchaseDates, category = 'default') {
    if (!Array.isArray(purchaseDates) || purchaseDates.length < 2) {
      const fallback = this.options.categoryGaps[category] || this.options.defaultGapDays;
      return { typicalGapDays: fallback, sampleGapsCount: 0 };
    }

    // Sort ascending by time
    const timestamps = purchaseDates
      .map((d) => (d instanceof Date ? d.getTime() : new Date(d).getTime()))
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    if (timestamps.length < 2) {
      const fallback = this.options.categoryGaps[category] || this.options.defaultGapDays;
      return { typicalGapDays: fallback, sampleGapsCount: 0 };
    }

    const gapsDays = [];
    for (let i = 1; i < timestamps.length; i++) {
      const diffMs = timestamps[i] - timestamps[i - 1];
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays >= 0.1) {
        gapsDays.push(diffDays);
      }
    }

    if (gapsDays.length === 0) {
      const fallback = this.options.categoryGaps[category] || this.options.defaultGapDays;
      return { typicalGapDays: fallback, sampleGapsCount: 0 };
    }

    const medianGap = calculateMedian(gapsDays);
    return {
      typicalGapDays: Math.max(1.0, Math.round(medianGap * 10) / 10),
      sampleGapsCount: gapsDays.length,
    };
  }

  /**
   * Calculates the replenishment due-ness score for a user-product purchase history.
   *
   * @param {Object} habitRecord
   * @param {Array<Date|string|number>} [habitRecord.purchaseDates]
   * @param {Date|string|number} habitRecord.lastPurchasedAt
   * @param {number} [habitRecord.typicalGapDays]
   * @param {string} [habitRecord.category]
   * @param {number|Date} [now=Date.now()]
   * @returns {{
   *   dueScore: number,
   *   daysSinceLast: number,
   *   typicalGapDays: number,
   *   isDue: boolean,
   *   urgency: 'low'|'medium'|'high'|'overdue'
   * }}
   */
  calculateDueScore(habitRecord, now = Date.now()) {
    if (!habitRecord || !habitRecord.lastPurchasedAt) {
      return {
        dueScore: 0,
        daysSinceLast: 0,
        typicalGapDays: this.options.defaultGapDays,
        isDue: false,
        urgency: 'low',
      };
    }

    const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const lastTime =
      habitRecord.lastPurchasedAt instanceof Date
        ? habitRecord.lastPurchasedAt.getTime()
        : new Date(habitRecord.lastPurchasedAt).getTime();

    const daysSinceLast = Math.max(0, (nowTime - lastTime) / (1000 * 60 * 60 * 24));

    let typicalGap = habitRecord.typicalGapDays;
    if (!typicalGap || typicalGap <= 0) {
      const estimated = this.estimatePurchaseGap(
        habitRecord.purchaseDates || [],
        habitRecord.category || 'default'
      );
      typicalGap = estimated.typicalGapDays;
    }

    // Base due-ness = daysSinceLast / typicalGap
    let rawDueScore = daysSinceLast / typicalGap;

    // Apply soft decay if item is extremely overdue (user may have churned/switched)
    let finalDueScore = rawDueScore;
    if (rawDueScore > this.options.overdueDecayThreshold) {
      const excess = rawDueScore - this.options.overdueDecayThreshold;
      const decayFactor = Math.exp(-excess * 0.15);
      finalDueScore = rawDueScore * decayFactor;
    }

    let urgency = 'low';
    if (finalDueScore >= 1.5) urgency = 'overdue';
    else if (finalDueScore >= 0.9) urgency = 'high';
    else if (finalDueScore >= 0.5) urgency = 'medium';

    return {
      dueScore: Math.round(finalDueScore * 1000) / 1000,
      daysSinceLast: Math.round(daysSinceLast * 10) / 10,
      typicalGapDays: typicalGap,
      isDue: finalDueScore >= 0.8,
      urgency,
    };
  }

  /**
   * Ranks an array of purchased products for a user by replenishment priority.
   *
   * @param {Array<Object>} userPurchasedProducts
   * @param {number} [limit=10]
   * @param {number|Date} [now=Date.now()]
   * @returns {Array<Object>}
   */
  rankBuyItAgain(userPurchasedProducts, limit = 10, now = Date.now()) {
    if (!Array.isArray(userPurchasedProducts)) return [];

    const scored = userPurchasedProducts.map((p) => {
      const metrics = this.calculateDueScore(p, now);
      return {
        ...p,
        ...metrics,
      };
    });

    // Sort by dueScore descending (highest replenishment urgency first)
    scored.sort((a, b) => b.dueScore - a.dueScore);
    return scored.slice(0, limit);
  }
}

module.exports = {
  ReorderPredictor,
  calculateMedian,
  DEFAULT_CATEGORY_GAPS,
};
