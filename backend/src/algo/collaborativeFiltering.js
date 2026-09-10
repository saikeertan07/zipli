/**
 * @file collaborativeFiltering.js
 * @description Pure Item-Item Collaborative Filtering with inverted-index acceleration.
 * Computes cosine similarities between items sharing co-purchasing users and generates
 * personalized top-N recommendations. Zero external algorithmic dependencies.
 */

class ItemItemCF {
  constructor(options = {}) {
    this.options = {
      topNNeighbors: 20,
      minCoOccurrences: 1,
      ...options,
    };

    // Sparse representation:
    // itemUsers: Map<itemId, Map<userId, weight>>
    this.itemUsers = new Map();
    // userItems: Map<userId, Map<itemId, weight>>
    this.userItems = new Map();
    // itemNorms: Map<itemId, number> (Euclidean L2 norm)
    this.itemNorms = new Map();
    // similarities: Map<itemId, Array<{ itemId: string, similarity: number }>>
    this.similarities = new Map();
  }

  /**
   * Ingests user-item purchase interactions.
   *
   * @param {Array<{ userId: string|number, productId: string|number, weight?: number }>} interactions
   */
  fit(interactions) {
    this.clear();
    if (!Array.isArray(interactions)) return;

    // 1. Build sparse user-item and item-user bipartite maps
    for (const record of interactions) {
      if (!record || record.userId === undefined) continue;
      const rawItem = record.productId || record.itemId;
      if (!rawItem) continue;

      const uId = String(record.userId);
      const pId = String(rawItem);
      const weight = typeof record.weight === 'number' && record.weight > 0 ? record.weight : 1;

      // Item -> Users
      let uMap = this.itemUsers.get(pId);
      if (!uMap) {
        uMap = new Map();
        this.itemUsers.set(pId, uMap);
      }
      uMap.set(uId, (uMap.get(uId) || 0) + weight);

      // User -> Items
      let iMap = this.userItems.get(uId);
      if (!iMap) {
        iMap = new Map();
        this.userItems.set(uId, iMap);
      }
      iMap.set(pId, (iMap.get(pId) || 0) + weight);
    }

    // 2. Precompute L2 norms for each item
    for (const [itemId, uMap] of this.itemUsers.entries()) {
      let sumSq = 0;
      for (const weight of uMap.values()) {
        sumSq += weight * weight;
      }
      this.itemNorms.set(itemId, Math.sqrt(sumSq));
    }

    // 3. Inverted-Index Accelerated Cosine Similarity
    // Only compare item pairs (i, j) that share at least one user
    for (const [iId, iUsers] of this.itemUsers.entries()) {
      const iNorm = this.itemNorms.get(iId);

      // Candidate co-purchased items via shared users
      const dotProducts = new Map();
      const coCounts = new Map();

      for (const [uId, iWeight] of iUsers.entries()) {
        const uItems = this.userItems.get(uId);

        for (const [jId, jWeight] of uItems.entries()) {
          if (jId === iId) continue; // Skip self

          dotProducts.set(jId, (dotProducts.get(jId) || 0) + iWeight * jWeight);
          coCounts.set(jId, (coCounts.get(jId) || 0) + 1);
        }
      }

      const neighbors = [];
      for (const [jId, dot] of dotProducts.entries()) {
        const coCount = coCounts.get(jId);
        if (coCount < this.options.minCoOccurrences) continue;

        const jNorm = this.itemNorms.get(jId);
        const cosine = dot / (iNorm * jNorm);

        neighbors.push({
          itemId: jId,
          similarity: Math.round(cosine * 10000) / 10000,
        });
      }

      // Sort by similarity descending, take top-N
      neighbors.sort((a, b) => b.similarity - a.similarity);
      this.similarities.set(iId, neighbors.slice(0, this.options.topNNeighbors));
    }
  }

  /**
   * Retrieves top-N most similar items to a target item.
   *
   * @param {string|number} productId
   * @param {number} [limit=10]
   * @returns {Array<{ itemId: string, similarity: number }>}
   */
  getSimilarItems(productId, limit = 10) {
    const pId = String(productId);
    const neighbors = this.similarities.get(pId) || [];
    return neighbors.slice(0, limit);
  }

  /**
   * Generates personalized recommendations for a user based on their purchase history.
   *
   * @param {string|number} userId
   * @param {number} [limit=10]
   * @param {Set<string>|Array<string>} [excludeItemIds] - Items to exclude (e.g. already in cart)
   * @returns {Array<{ itemId: string, score: number }>}
   */
  recommendForUser(userId, limit = 10, excludeItemIds = null) {
    const uId = String(userId);
    const userHistory = this.userItems.get(uId);

    if (!userHistory) {
      return [];
    }

    const excludeSet = new Set(excludeItemIds ? Array.from(excludeItemIds).map(String) : []);

    const candidateScores = new Map();
    const candidateSimSums = new Map();

    for (const [purchasedId, purchaseWeight] of userHistory.entries()) {
      const neighbors = this.similarities.get(purchasedId) || [];

      for (const { itemId, similarity } of neighbors) {
        if (excludeSet.has(itemId) || userHistory.has(itemId)) {
          continue;
        }

        candidateScores.set(
          itemId,
          (candidateScores.get(itemId) || 0) + similarity * purchaseWeight
        );
        candidateSimSums.set(itemId, (candidateSimSums.get(itemId) || 0) + similarity);
      }
    }

    const scored = [];
    for (const [itemId, weightedSum] of candidateScores.entries()) {
      const simSum = candidateSimSums.get(itemId);
      const score = weightedSum / simSum;
      scored.push({
        itemId,
        score: Math.round(score * 1000) / 1000,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Resets all internal matrices.
   */
  clear() {
    this.itemUsers.clear();
    this.userItems.clear();
    this.itemNorms.clear();
    this.similarities.clear();
  }

  /**
   * Alias for fit() to support buildMatrix naming.
   */
  buildMatrix(interactions, options = {}) {
    return this.fit(interactions, options);
  }
}

module.exports = {
  ItemItemCF,
  ItemItemCollaborativeFiltering: ItemItemCF,
};
