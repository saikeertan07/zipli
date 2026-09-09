/**
 * @file basketOptimizer.js
 * @description Pure multi-objective Knapsack / Subset-Sum algorithm for the
 * "Add ₹X more for free delivery" basket completion feature.
 * Finds optimal item combination that meets the free delivery threshold with:
 * 1. Minimal price overshoot (saves customer money)
 * 2. Maximal recommendation relevance (items customer actually wants)
 * 3. Bounded bundle size (typically 1 to 3 items)
 * Zero external dependencies.
 */

/**
 * Optimizes basket threshold filler items using multi-objective branch-and-bound / DP.
 *
 * @param {Object} params
 * @param {number} params.targetGap - Amount needed to qualify for free delivery (e.g. ₹65)
 * @param {Array<{
 *   id: string|number,
 *   name: string,
 *   price: number,
 *   relevanceScore?: number
 * }>} params.candidatePool - Pool of recommended or popular products
 * @param {Object} [params.options]
 * @param {number} [params.options.maxItems=3] - Maximum items to suggest
 * @param {number} [params.options.maxOvershootTolerance=1.5] - Max price overshoot factor (e.g. 1.5 * gap)
 * @returns {{
 *   targetGap: number,
 *   selectedItems: Object[],
 *   totalAddedPrice: number,
 *   overshoot: number,
 *   totalRelevanceScore: number,
 *   freeDeliveryQualified: boolean
 * }}
 */
function optimizeBasketThreshold(params = {}) {
  const targetGap = Math.max(0, Math.round(Number(params.targetGap) || 0));
  const candidates = Array.isArray(params.candidatePool) ? params.candidatePool : [];
  const options = params.options || {};
  const maxItems = Math.max(1, Math.min(5, Math.floor(options.maxItems ?? 3)));
  const maxOvershootFactor = Math.max(1.0, Number(options.maxOvershootTolerance ?? 1.8));

  if (targetGap <= 0 || candidates.length === 0) {
    return {
      targetGap,
      selectedItems: [],
      totalAddedPrice: 0,
      overshoot: 0,
      totalRelevanceScore: 0,
      freeDeliveryQualified: targetGap <= 0,
    };
  }

  // Filter valid candidate items with positive price
  const validCandidates = candidates
    .filter((item) => item && Number(item.price) > 0)
    .map((item) => ({
      id: item.id,
      name: item.name,
      price: Math.round(Number(item.price) * 100) / 100,
      relevanceScore: Math.max(0.1, Number(item.relevanceScore) || 1.0),
    }));

  if (validCandidates.length === 0) {
    return {
      targetGap,
      selectedItems: [],
      totalAddedPrice: 0,
      overshoot: targetGap,
      totalRelevanceScore: 0,
      freeDeliveryQualified: false,
    };
  }

  // Maximum price ceiling for search pruning
  const maxPriceCeiling = targetGap * maxOvershootFactor;

  let bestCombo = null;
  let minOvershoot = Infinity;
  let maxRelevance = -Infinity;

  // Branch-and-bound recursive search up to maxItems depth
  // Items sorted by relevance / price ratio for efficient pruning
  validCandidates.sort((a, b) => b.relevanceScore / b.price - a.relevanceScore / a.price);

  function search(startIndex, currentItems, currentPrice, currentRelevance) {
    // If current combo meets or exceeds target gap
    if (currentPrice >= targetGap) {
      const overshoot = currentPrice - targetGap;

      if (overshoot < minOvershoot) {
        minOvershoot = overshoot;
        maxRelevance = currentRelevance;
        bestCombo = [...currentItems];
      } else if (Math.abs(overshoot - minOvershoot) < 0.01 && currentRelevance > maxRelevance) {
        // Tie-breaker: equal minimal overshoot, higher relevance wins
        maxRelevance = currentRelevance;
        bestCombo = [...currentItems];
      }
      return;
    }

    // Stop branching if reached max items limit
    if (currentItems.length >= maxItems) {
      return;
    }

    for (let i = startIndex; i < validCandidates.length; i++) {
      const item = validCandidates[i];
      const nextPrice = currentPrice + item.price;

      // Prune if nextPrice exceeds maximum overshoot tolerance ceiling
      if (nextPrice > maxPriceCeiling) {
        continue;
      }

      // Prune if nextPrice strictly exceeds our best overshoot when we already have a qualifying solution
      if (minOvershoot !== Infinity && nextPrice - targetGap > minOvershoot) {
        continue;
      }

      currentItems.push(item);
      search(i + 1, currentItems, nextPrice, currentRelevance + item.relevanceScore);
      currentItems.pop();
    }
  }

  search(0, [], 0, 0);

  // If no combination >= targetGap was found under the strict ceiling, fallback to lowest price item
  if (!bestCombo) {
    // Find single item closest to targetGap
    let closestItem = validCandidates[0];
    let closestDiff = Math.abs(closestItem.price - targetGap);
    for (const item of validCandidates) {
      const diff = Math.abs(item.price - targetGap);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestItem = item;
      }
    }
    bestCombo = [closestItem];
  }

  const totalAddedPrice = bestCombo.reduce((sum, item) => sum + item.price, 0);
  const overshoot = Math.max(0, totalAddedPrice - targetGap);
  const totalRelevance = bestCombo.reduce((sum, item) => sum + item.relevanceScore, 0);

  return {
    targetGap,
    selectedItems: bestCombo,
    totalAddedPrice: Math.round(totalAddedPrice * 100) / 100,
    overshoot: Math.round(overshoot * 100) / 100,
    totalRelevanceScore: Math.round(totalRelevance * 100) / 100,
    freeDeliveryQualified: totalAddedPrice >= targetGap,
  };
}

module.exports = {
  optimizeBasketThreshold,
};
