/**
 * @file hybridRecommender.js
 * @description Pure Hybrid Recommendation Engine combining Association Rules,
 * Item-Item Collaborative Filtering, Reorder Due-ness, Trending Time-Decay, and Cart-Aware Upsell.
 * Zero external algorithmic dependencies.
 */

class HybridRecommender {
  constructor(options = {}) {
    this.options = {
      weights: {
        assoc: 0.25,
        cf: 0.25,
        due: 0.2,
        trend: 0.15,
        margin: 0.05,
        stock: 0.1,
        ...(options.weights || {}),
      },
      trendingHalfLifeDays: 7.0, // Exponential decay half-life for trending items
      ...options,
    };

    // associationRules: Map<antecedentItemId, Array<{ consequentId: string, confidence: number, lift: number }>>
    this.associationRules = new Map();
    // itemCatalog: Map<itemId, Object>
    this.catalog = new Map();
    // trendingCounts: Map<itemId, Array<number>> (timestamps of purchases)
    this.trendingPurchases = new Map();
  }

  /**
   * Sets the active product catalog.
   *
   * @param {Array<Object>} products
   */
  setCatalog(products) {
    this.catalog.clear();
    if (!Array.isArray(products)) return;
    for (const p of products) {
      if (p && p.id !== undefined) {
        this.catalog.set(String(p.id), p);
      }
    }
  }

  /**
   * Ingests association rules mined from Apriori / FP-Growth.
   *
   * @param {Array<{ antecedent: string[], consequent: string[], confidence: number, lift: number }>} rules
   */
  loadAssociationRules(rules) {
    this.associationRules.clear();
    if (!Array.isArray(rules)) return;

    for (const rule of rules) {
      if (!rule || !rule.antecedent || !rule.consequent) continue;

      for (const anteItem of rule.antecedent) {
        const key = String(anteItem);
        let list = this.associationRules.get(key);
        if (!list) {
          list = [];
          this.associationRules.set(key, list);
        }

        for (const conseqItem of rule.consequent) {
          const cKey = String(conseqItem);
          if (cKey !== key) {
            list.push({
              consequentId: cKey,
              confidence: rule.confidence,
              lift: rule.lift,
            });
          }
        }
      }
    }

    // Sort each antecedent's consequences by lift descending
    for (const list of this.associationRules.values()) {
      list.sort((a, b) => b.lift - a.lift);
    }
  }

  /**
   * Ingests recent purchase events for computing time-decayed trending signals.
   *
   * @param {Array<{ productId: string|number, timestamp: Date|string|number }>} events
   */
  loadTrendingEvents(events) {
    this.trendingPurchases.clear();
    if (!Array.isArray(events)) return;

    for (const e of events) {
      if (!e || e.productId === undefined) continue;
      const pId = String(e.productId);
      const t =
        e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
      if (isNaN(t)) continue;

      let list = this.trendingPurchases.get(pId);
      if (!list) {
        list = [];
        this.trendingPurchases.set(pId, list);
      }
      list.push(t);
    }
  }

  /**
   * Computes the exponential time-decayed trending score for a product.
   *
   * @param {string|number} productId
   * @param {number|Date} [now=Date.now()]
   * @returns {number} Normalized trending score (0.0 to 1.0)
   */
  getTrendingScore(productId, now = Date.now()) {
    const pId = String(productId);
    const timestamps = this.trendingPurchases.get(pId);
    if (!timestamps || timestamps.length === 0) return 0;

    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const halfLifeMs = this.options.trendingHalfLifeDays * 24 * 60 * 60 * 1000;

    let score = 0;
    for (const t of timestamps) {
      const ageMs = Math.max(0, nowMs - t);
      score += Math.pow(0.5, ageMs / halfLifeMs);
    }

    // Non-linear saturation to [0, 1]
    return Math.min(1.0, score / 20.0);
  }

  /**
   * Recommends cart-aware complementary items ("Complete Your Meal").
   *
   * @param {Array<string|number>} cartItemIds - Current items in cart.
   * @param {number} [limit=5]
   * @returns {Array<{ product: Object, score: number, reason: string }>}
   */
  recommendForCart(cartItemIds = [], limit = 5) {
    if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
      return this.getColdStartRecommendations(null, limit);
    }

    const cartSet = new Set(cartItemIds.map(String));
    const candidateScores = new Map();

    for (const cartId of cartSet) {
      const rules = this.associationRules.get(cartId) || [];

      for (const { consequentId, confidence, lift } of rules) {
        if (cartSet.has(consequentId)) continue; // Already in cart

        const product = this.catalog.get(consequentId);
        if (!product || (product.stock !== undefined && product.stock <= 0)) {
          continue; // Filter out-of-stock items
        }

        // Score based on confidence * log(1 + lift)
        const ruleScore = confidence * Math.log2(1 + Math.max(1, lift));
        const prev = candidateScores.get(consequentId) || { score: 0, count: 0 };
        candidateScores.set(consequentId, {
          score: prev.score + ruleScore,
          count: prev.count + 1,
        });
      }
    }

    const results = [];
    for (const [pId, { score }] of candidateScores.entries()) {
      const product = this.catalog.get(pId);
      results.push({
        product,
        score: Math.round(score * 1000) / 1000,
        reason: 'Frequently bought with items in your cart',
      });
    }

    results.sort((a, b) => b.score - a.score);

    // If fewer than limit, pad with top trending items not in cart
    if (results.length < limit) {
      const trending = this.getColdStartRecommendations(
        null,
        limit + cartSet.size + candidateScores.size
      );
      for (const t of trending) {
        if (!cartSet.has(String(t.product.id)) && !candidateScores.has(String(t.product.id))) {
          results.push(t);
          if (results.length >= limit) break;
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Recommends complementary and similar items for a specific product page.
   *
   * @param {string|number} productId
   * @param {number} [limit=6]
   * @returns {Array<{ product: Object, score: number, type: 'bought_together'|'similar' }>}
   */
  recommendForProduct(productId, limit = 6) {
    const pId = String(productId);
    const results = [];
    const seen = new Set([pId]);

    // 1. Frequently Bought Together (Association Rules)
    const rules = this.associationRules.get(pId) || [];
    for (const { consequentId, confidence, lift } of rules) {
      if (seen.has(consequentId)) continue;

      const product = this.catalog.get(consequentId);
      if (product && (product.stock === undefined || product.stock > 0)) {
        seen.add(consequentId);
        results.push({
          product,
          score: Math.round(confidence * Math.log2(1 + lift) * 1000) / 1000,
          type: 'bought_together',
        });
        if (results.length >= limit) break;
      }
    }

    // 2. Pad with same category popular items if needed
    if (results.length < limit) {
      const targetProduct = this.catalog.get(pId);
      if (targetProduct) {
        const cat = targetProduct.category_id || targetProduct.cat;
        const categoryRecs = this.getColdStartRecommendations(cat, limit);

        for (const rec of categoryRecs) {
          const recId = String(rec.product.id);
          if (!seen.has(recId)) {
            seen.add(recId);
            results.push({
              product: rec.product,
              score: rec.score,
              type: 'similar',
            });
            if (results.length >= limit) break;
          }
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Cold start recommendations for new users or fallback.
   *
   * @param {string} [categoryId]
   * @param {number} [limit=8]
   * @returns {Array<{ product: Object, score: number, reason: string }>}
   */
  getColdStartRecommendations(categoryId = null, limit = 8) {
    const candidates = [];

    for (const product of this.catalog.values()) {
      if (product.stock !== undefined && product.stock <= 0) continue;
      if (categoryId && (product.category_id || product.cat) !== categoryId) continue;

      const trending = this.getTrendingScore(product.id);
      const isBestseller = product.badge === 'Bestseller' ? 0.4 : 0.1;
      const score = 0.6 * trending + isBestseller;

      candidates.push({
        product,
        score: Math.round(score * 1000) / 1000,
        reason: 'Trending & Popular in catalog',
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  }

  /**
   * Hybrid personalized ranker blending all available signals.
   *
   * @param {Object} context
   * @param {Array<{ itemId: string, score: number }>} [context.cfRecommendations]
   * @param {Array<{ id: string|number, dueScore: number }>} [context.dueItems]
   * @param {Array<string|number>} [context.cartItemIds]
   * @param {number} [limit=10]
   * @param {Object} [options={}]
   * @param {number} [options.maxPerCategory=3]
   * @returns {Array<{ product: Object, finalScore: number, reason: string, breakdown: Object }>}
   */
  rankHybrid(context = {}, limit = 10, options = {}) {
    const { cfRecommendations = [], dueItems = [], cartItemIds = [] } = context;
    const w = this.options.weights;

    // Collect candidate product IDs
    const candidateIds = new Set();
    const cfScores = new Map();
    for (const { itemId, score } of cfRecommendations) {
      candidateIds.add(String(itemId));
      cfScores.set(String(itemId), score);
    }

    const dueScores = new Map();
    for (const item of dueItems) {
      const id = String(item.id || item.product_id);
      candidateIds.add(id);
      dueScores.set(id, item.dueScore || 0);
    }

    // Add cart association candidates
    const assocScores = new Map();
    for (const cartId of cartItemIds) {
      const rules = this.associationRules.get(String(cartId)) || [];
      for (const { consequentId, confidence, lift } of rules) {
        candidateIds.add(consequentId);
        const prev = assocScores.get(consequentId) || 0;
        assocScores.set(consequentId, Math.max(prev, confidence * Math.min(2.0, lift / 2.0)));
      }
    }

    // If no personalized candidates, return cold-start
    if (candidateIds.size === 0) {
      return this.getColdStartRecommendations(null, limit).map((c) => ({
        product: c.product,
        finalScore: c.score,
        reason: c.reason || 'Trending & Popular in catalog',
        breakdown: { coldStart: c.score },
      }));
    }

    const scored = [];
    for (const id of candidateIds) {
      const product = this.catalog.get(id);
      if (!product) continue;

      const sAssoc = assocScores.get(id) || 0;
      const sCf = cfScores.get(id) || 0;
      const sDue = dueScores.get(id) || 0;
      const sTrend = this.getTrendingScore(id);

      // Margin signal
      let sMargin = 0;
      if (product.mrp && product.price && product.mrp > product.price) {
        sMargin = Math.min(1.0, (product.mrp - product.price) / product.mrp);
      }

      // Stock signal
      const sStock = product.stock === undefined || product.stock > 0 ? 1.0 : 0.0;

      const finalScore =
        w.assoc * sAssoc +
        w.cf * sCf +
        w.due * sDue +
        w.trend * sTrend +
        w.margin * sMargin +
        w.stock * sStock;

      // Determine dominant signal for explainability string
      let reason = 'Recommended for you';
      const signals = [
        {
          name: 'assoc',
          score: w.assoc * sAssoc,
          reason: 'Frequently bought with items in your cart',
        },
        { name: 'due', score: w.due * sDue, reason: 'Time to restock based on your routine' },
        { name: 'cf', score: w.cf * sCf, reason: 'Customers with similar taste also bought' },
        { name: 'trend', score: w.trend * sTrend, reason: 'Trending now in your area' },
      ];
      signals.sort((a, b) => b.score - a.score);
      if (signals[0].score > 0) {
        reason = signals[0].reason;
      }

      scored.push({
        product,
        finalScore: Math.round(finalScore * 1000) / 1000,
        reason,
        breakdown: {
          assoc: Math.round(sAssoc * 1000) / 1000,
          cf: Math.round(sCf * 1000) / 1000,
          due: Math.round(sDue * 1000) / 1000,
          trend: Math.round(sTrend * 1000) / 1000,
          margin: Math.round(sMargin * 1000) / 1000,
          stock: sStock,
        },
      });
    }

    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Apply diversity guardrail (maxPerCategory, default 3)
    const maxPerCategory =
      options && typeof options.maxPerCategory === 'number'
        ? options.maxPerCategory
        : this.options.maxPerCategory !== undefined
          ? this.options.maxPerCategory
          : 3;

    if (maxPerCategory > 0) {
      const categoryCounts = new Map();
      const diversified = [];
      const overflow = [];

      for (const item of scored) {
        const cat = String(item.product.category_id || item.product.cat || 'uncategorized');
        const count = categoryCounts.get(cat) || 0;
        if (count < maxPerCategory) {
          categoryCounts.set(cat, count + 1);
          diversified.push(item);
        } else {
          overflow.push(item);
        }
        if (diversified.length >= limit) break;
      }

      // If diversified count is below limit, fill from overflow
      while (diversified.length < limit && overflow.length > 0) {
        diversified.push(overflow.shift());
      }

      return diversified.slice(0, limit);
    }

    return scored.slice(0, limit);
  }
}

module.exports = {
  HybridRecommender,
};
