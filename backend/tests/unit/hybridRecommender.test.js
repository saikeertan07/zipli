const { HybridRecommender } = require('../../src/algo/hybridRecommender');

describe('Pure Hybrid Recommendation Engine (/algo/hybridRecommender.js)', () => {
  let recs;

  const catalog = [
    {
      id: 1,
      name: 'Cow Milk 1L',
      category_id: 'dairy',
      price: 60,
      mrp: 65,
      stock: 50,
      badge: 'Bestseller',
    },
    { id: 2, name: 'Sourdough Bread', category_id: 'bakery', price: 50, mrp: 60, stock: 20 },
    { id: 3, name: 'Salted Butter', category_id: 'dairy', price: 55, mrp: 60, stock: 15 },
    { id: 4, name: 'Eggs 6-Pack', category_id: 'dairy', price: 45, mrp: 50, stock: 0 }, // Out of stock
    { id: 5, name: 'Alphonso Mango', category_id: 'fruits', price: 150, mrp: 180, stock: 30 },
    { id: 6, name: 'Paneer 200g', category_id: 'dairy', price: 90, mrp: 100, stock: 10 },
    { id: 7, name: 'Discount Atta', category_id: 'staples', price: 100, mrp: 90 }, // mrp < price, undefined stock
    { id: 8, name: 'Cat Dairy Item', cat: 'dairy', price: 40, mrp: 45, stock: 10 },
  ];

  const rules = [
    { antecedent: ['1'], consequent: ['2'], confidence: 0.8, lift: 2.5 }, // Milk -> Bread
    { antecedent: ['1'], consequent: ['2'], confidence: 0.5, lift: 1.5 }, // Milk -> Bread duplicate
    { antecedent: ['1'], consequent: ['3'], confidence: 0.7, lift: 2.2 }, // Milk -> Butter
    { antecedent: ['1'], consequent: ['4'], confidence: 0.9, lift: 3.0 }, // Milk -> Eggs (out of stock)
    { antecedent: ['1'], consequent: ['9999'], confidence: 0.9, lift: 3.0 }, // Consequent not in catalog
    { antecedent: ['2'], consequent: ['3'], confidence: 0.85, lift: 2.8 }, // Bread -> Butter
  ];

  beforeEach(() => {
    recs = new HybridRecommender();
    recs.setCatalog(catalog);
    recs.loadAssociationRules(rules);
  });

  describe('recommendForCart ("Complete Your Meal")', () => {
    it('suggests complementary items matching cart antecedents', () => {
      // Cart has Milk (1) -> should recommend Bread (2) and Butter (3)
      const suggestions = recs.recommendForCart([1], 5);
      expect(suggestions.length).toBeGreaterThan(0);

      const suggestedIds = suggestions.map((s) => s.product.id);
      expect(suggestedIds).toContain(2); // Bread
      expect(suggestedIds).toContain(3); // Butter
      expect(suggestedIds).not.toContain(1); // Not already in cart
      expect(suggestedIds).not.toContain(4); // Not out of stock Eggs

      // Multi-item cart where a rule consequent is already in the cart
      const multiCart = recs.recommendForCart([1, 2], 3);
      expect(multiCart.map((s) => s.product.id)).not.toContain(2);

      // Padding trending items breaks at limit
      const padded = recs.recommendForCart([1], 4);
      expect(padded.length).toBe(4);

      // No padding needed when results meet limit
      const noPad = recs.recommendForCart([1], 2);
      expect(noPad.length).toBe(2);

      // Cart item with no association rules
      const noRulesCart = recs.recommendForCart([99999], 3);
      expect(noRulesCart.length).toBe(3);
    });

    it('falls back to cold-start trending when cart is empty', () => {
      const suggestions = recs.recommendForCart([], 3);
      expect(suggestions.length).toBeGreaterThan(0);

      // Zero-arg recommendForCart call
      const noArgCart = recs.recommendForCart();
      expect(noArgCart.length).toBe(5);

      // Recommend for product with 'cat' property instead of category_id
      const catProductRecs = recs.recommendForProduct(8, 2);
      expect(catProductRecs.length).toBeGreaterThan(0);
    });
  });

  describe('recommendForProduct', () => {
    it('recommends bought-together items first, then pads with similar category items', () => {
      const suggestions = recs.recommendForProduct(1, 4);
      expect(suggestions.length).toBeGreaterThan(0);

      const firstRec = suggestions[0];
      expect(firstRec.type).toBe('bought_together');
      const types = suggestions.map((s) => s.type);
      expect(types).toContain('similar');

      // Limit reached in similar padding
      const lim3 = recs.recommendForProduct(1, 3);
      expect(lim3.length).toBe(3);

      // Limit reached in bought_together
      const lim1 = recs.recommendForProduct(1, 1);
      expect(lim1.length).toBe(1);

      // Target product not in catalog
      expect(recs.recommendForProduct(99999).length).toBe(0);
    });
  });

  describe('getColdStartRecommendations', () => {
    it('returns available items filtered by category', () => {
      const dairyRecs = recs.getColdStartRecommendations('dairy', 5);
      for (const rec of dairyRecs) {
        expect(rec.product.category_id || rec.product.cat).toBe('dairy');
        expect(rec.product.stock).toBeGreaterThan(0);
      }
    });
  });

  describe('Trending Score & Time-Decay', () => {
    it('calculates exponential time-decayed trending scores', () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      recs.loadTrendingEvents([
        { productId: 1, timestamp: new Date(now - 1 * dayMs) }, // Recent
        { productId: 1, timestamp: new Date(now - 2 * dayMs) },
        { productId: 5, timestamp: new Date(now - 30 * dayMs) }, // Old
      ]);

      const scoreRecent = recs.getTrendingScore(1, now);
      const scoreOld = recs.getTrendingScore(5, now);

      expect(scoreRecent).toBeGreaterThan(scoreOld);
      expect(recs.getTrendingScore(9999)).toBe(0);
      expect(recs.getTrendingScore(1, new Date(now))).toBeGreaterThan(0);
    });
  });

  describe('rankHybrid', () => {
    it('blends multiple signals and returns scoring breakdown', () => {
      const context = {
        cfRecommendations: [
          { itemId: '2', score: 0.9 },
          { itemId: '7', score: 0.5 }, // mrp < price
          { itemId: '9999', score: 0.9 }, // not in catalog
        ],
        dueItems: [
          { product_id: 1, dueScore: 1.2 },
          { id: 3 }, // dueScore missing
        ],
        cartItemIds: ['1'],
      };

      const ranked = recs.rankHybrid(context, 5);
      expect(ranked.length).toBeGreaterThan(0);

      for (const item of ranked) {
        expect(item.finalScore).toBeGreaterThanOrEqual(0);
        expect(item.breakdown).toBeDefined();
        expect(item.breakdown.stock).toBeDefined();
        expect(item.reason).toBeDefined();
        expect(typeof item.reason).toBe('string');
      }
    });

    it('enforces maxPerCategory diversity guardrail', () => {
      // Catalog has multiple dairy items: 1, 3, 6, 8, plus bakery: 2, fruits: 5, staples: 7
      const context = {
        cfRecommendations: [
          { itemId: '1', score: 0.99 }, // dairy
          { itemId: '3', score: 0.95 }, // dairy
          { itemId: '6', score: 0.9 }, // dairy
          { itemId: '8', score: 0.85 }, // dairy
          { itemId: '2', score: 0.8 }, // bakery
          { itemId: '5', score: 0.75 }, // fruits
          { itemId: '7', score: 0.7 }, // staples
        ],
      };

      // Test with maxPerCategory: 2
      const rankedWithMax2 = recs.rankHybrid(context, 5, { maxPerCategory: 2 });
      const dairyCount = rankedWithMax2.filter(
        (r) => (r.product.category_id || r.product.cat) === 'dairy'
      ).length;
      expect(dairyCount).toBeLessThanOrEqual(2);
      expect(rankedWithMax2.length).toBe(5);
    });

    it('provides explainability reasons based on dominant signals', () => {
      // Due-dominated item
      const dueDominant = recs.rankHybrid({ dueItems: [{ id: 1, dueScore: 5.0 }] }, 1);
      expect(dueDominant[0].reason).toContain('restock');

      // Cart association-dominated item
      const assocDominant = recs.rankHybrid({ cartItemIds: ['1'] }, 1);
      expect(assocDominant[0].reason).toContain('Frequently bought');
    });

    it('falls back to cold start when context is empty', () => {
      const ranked = recs.rankHybrid({}, 3);
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].breakdown.coldStart).toBeDefined();
      expect(ranked[0].reason).toBeDefined();

      // No-arg call
      const noArgRanked = recs.rankHybrid();
      expect(noArgRanked.length).toBeGreaterThan(0);

      // Cart item with no rules
      const withUnknownCart = recs.rankHybrid({ cartItemIds: ['unknown_item_999'] });
      expect(withUnknownCart.length).toBeGreaterThan(0);
    });
  });

  describe('Defensive & Edge Cases', () => {
    it('handles null and invalid catalog, rules, and events safely', () => {
      const emptyRecs = new HybridRecommender();
      emptyRecs.setCatalog(null);
      emptyRecs.loadAssociationRules([
        null,
        {},
        { antecedent: null },
        { antecedent: ['1'], consequent: ['1'] },
      ]);
      emptyRecs.loadTrendingEvents([
        null,
        { productId: undefined },
        { productId: 1, timestamp: 'invalid date' },
      ]);

      expect(emptyRecs.recommendForCart([1])).toEqual([]);
      expect(emptyRecs.recommendForProduct(1)).toEqual([]);
      expect(emptyRecs.getColdStartRecommendations()).toEqual([]);
    });

    it('returns unfiltered scored items when maxPerCategory is null or zero', () => {
      const recs = new HybridRecommender({ maxPerCategory: null });
      recs.setCatalog(catalog);
      const results = recs.rankHybrid({
        userId: 'u1',
        dueItems: [{ id: 1 }, { id: 2 }],
        maxPerCategory: 0,
        limit: 3,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('fills from overflow when diversified candidate count is below limit', () => {
      const recs = new HybridRecommender();
      recs.setCatalog([
        { id: 101, name: 'Milk A', category_id: 'Dairy', is_active: true, stock: 10 },
        { id: 102, name: 'Milk B', category_id: 'Dairy', is_active: true, stock: 10 },
        { id: 103, name: 'Milk C', category_id: 'Dairy', is_active: true, stock: 10 },
      ]);
      const results = recs.rankHybrid({
        userId: 'u1',
        dueItems: [{ id: 101 }, { id: 102 }, { id: 103 }],
        maxPerCategory: 1,
        limit: 3,
      });
      expect(results.length).toBe(3);
    });
  });
});
