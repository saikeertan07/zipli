const { optimizeBasketThreshold } = require('../../src/algo/basketOptimizer');

describe('basketOptimizer.js pure knapsack basket threshold optimizer', () => {
  describe('boundary and invalid input handling', () => {
    it('handles empty or missing parameters object', () => {
      const res = optimizeBasketThreshold();
      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.selectedItems).toHaveLength(0);
    });

    it('returns empty result when targetGap is 0 or negative', () => {
      const res0 = optimizeBasketThreshold({ targetGap: 0, candidatePool: [{ price: 50 }] });
      expect(res0.freeDeliveryQualified).toBe(true);
      expect(res0.selectedItems).toHaveLength(0);

      const resNeg = optimizeBasketThreshold({ targetGap: -10 });
      expect(resNeg.freeDeliveryQualified).toBe(true);
    });

    it('returns empty result when candidatePool is empty or invalid', () => {
      const res = optimizeBasketThreshold({ targetGap: 100, candidatePool: [] });
      expect(res.freeDeliveryQualified).toBe(false);
      expect(res.selectedItems).toHaveLength(0);

      const resNull = optimizeBasketThreshold({ targetGap: 100, candidatePool: null });
      expect(resNull.selectedItems).toHaveLength(0);
    });

    it('filters out null items or items with invalid/zero price', () => {
      const candidates = [
        null,
        { id: 1, name: 'Free promo', price: 0 },
        { id: 2, name: 'Invalid', price: -5 },
      ];
      const res = optimizeBasketThreshold({ targetGap: 50, candidatePool: candidates });
      expect(res.selectedItems).toHaveLength(0);
      expect(res.freeDeliveryQualified).toBe(false);
    });
  });

  describe('optimal item selection', () => {
    it('finds single exact match when available', () => {
      const candidates = [
        { id: 'c1', name: 'Chips', price: 20 },
        { id: 'c2', name: 'Chocolate', price: 50, relevanceScore: 2.0 },
        { id: 'c3', name: 'Olive Oil', price: 200 },
      ];

      const res = optimizeBasketThreshold({ targetGap: 50, candidatePool: candidates });
      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.totalAddedPrice).toBe(50);
      expect(res.overshoot).toBe(0);
      expect(res.selectedItems).toHaveLength(1);
      expect(res.selectedItems[0].id).toBe('c2');
    });

    it('finds optimal multi-item bundle minimizing overshoot', () => {
      // Customer needs ₹65 for free delivery
      // Candidates: ₹40, ₹25, ₹70, ₹100
      // 40 + 25 = 65 (exact match, 0 overshoot) vs 70 (+5 overshoot)
      const candidates = [
        { id: 'b1', name: 'Biscuits', price: 40, relevanceScore: 1.5 },
        { id: 'b2', name: 'Juice', price: 25, relevanceScore: 1.2 },
        { id: 'b3', name: 'Shampoo', price: 70, relevanceScore: 0.8 },
      ];

      const res = optimizeBasketThreshold({ targetGap: 65, candidatePool: candidates });
      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.totalAddedPrice).toBe(65);
      expect(res.overshoot).toBe(0);
      expect(res.selectedItems).toHaveLength(2);
      expect(res.selectedItems.map((i) => i.id).sort()).toEqual(['b1', 'b2']);
    });

    it('breaks ties using maximum relevance score when overshoot is equal', () => {
      // Candidate 1: price 10, rel 1 (ratio 0.1) -> examined first
      // Candidate 2: price 90, rel 1 (ratio 0.011) -> 10 + 90 = 100, rel = 2.0 (overshoot 0)
      // Candidate 3: price 100, rel 5 (ratio 0.05) -> price 100, rel = 5.0 (overshoot 0)
      // Combo [Cand 3] replaces [Cand 1, Cand 2] because relevance 5 > 2 with equal 0 overshoot
      const candidates = [
        { id: 'item_10', name: 'Item 10', price: 10, relevanceScore: 1.0 },
        { id: 'item_90', name: 'Item 90', price: 90, relevanceScore: 1.0 },
        { id: 'item_100', name: 'Item 100', price: 100, relevanceScore: 5.0 },
      ];

      const res = optimizeBasketThreshold({ targetGap: 100, candidatePool: candidates });
      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.selectedItems).toHaveLength(1);
      expect(res.selectedItems[0].id).toBe('item_100');
    });

    it('prunes branches when nextPrice exceeds maxPriceCeiling', () => {
      // targetGap: 50, maxOvershootFactor: 1.2 -> ceiling: 60
      // Cand A: price 30, rel 10 (ratio 0.33) -> chosen first
      // Cand B: price 40, rel 1 (ratio 0.025) -> nextPrice = 70 > 60 -> pruned!
      // Cand C: price 20, rel 1 -> 30 + 20 = 50 <= 60 -> matches!
      const candidates = [
        { id: 'A', name: 'Item A', price: 30, relevanceScore: 10.0 },
        { id: 'B', name: 'Item B', price: 40, relevanceScore: 1.0 },
        { id: 'C', name: 'Item C', price: 20, relevanceScore: 1.0 },
      ];

      const res = optimizeBasketThreshold({
        targetGap: 50,
        candidatePool: candidates,
        options: { maxOvershootTolerance: 1.2 },
      });

      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.totalAddedPrice).toBe(50);
      expect(res.selectedItems.map((i) => i.id).sort()).toEqual(['A', 'C']);
    });

    it('respects maxItems configuration limit', () => {
      // Target: ₹60. Items available: ₹20, ₹20, ₹20, ₹65
      // 3 items of ₹20 would give ₹60, but maxItems is restricted to 2.
      // So best combo within 2 items is ₹65 (overshoot 5)
      const candidates = [
        { id: 'i1', name: 'Gum 1', price: 20 },
        { id: 'i2', name: 'Gum 2', price: 20 },
        { id: 'i3', name: 'Gum 3', price: 20 },
        { id: 'i4', name: 'Soap', price: 65 },
      ];

      const res = optimizeBasketThreshold({
        targetGap: 60,
        candidatePool: candidates,
        options: { maxItems: 2 },
      });

      expect(res.selectedItems.length).toBeLessThanOrEqual(2);
      expect(res.freeDeliveryQualified).toBe(true);
      expect(res.totalAddedPrice).toBe(65);
      expect(res.overshoot).toBe(5);
    });

    it('falls back to single closest item when ceiling prevents full qualification', () => {
      // Target: ₹500, but all items are small (₹10, ₹15) and maxItems is 2
      const candidates = [
        { id: 's1', name: 'Small 1', price: 10 },
        { id: 's2', name: 'Small 2', price: 25 },
      ];

      const res = optimizeBasketThreshold({
        targetGap: 500,
        candidatePool: candidates,
        options: { maxItems: 2, maxOvershootTolerance: 1.1 },
      });

      expect(res.selectedItems).toHaveLength(1);
      expect(res.selectedItems[0].id).toBe('s2'); // 25 is closer to 500 than 10
      expect(res.freeDeliveryQualified).toBe(false);
    });
  });
});
