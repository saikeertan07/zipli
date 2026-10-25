const { assistiveAIService } = require('../../src/services/assistiveAI.service');

describe('Assistive AI Service Comprehensive Unit Suite (P1)', () => {
  describe('getStoreInventoryStatus (P1 Tool)', () => {
    test('returns empty inventory for empty or non-array productIds', async () => {
      const res1 = await assistiveAIService.getStoreInventoryStatus([]);
      expect(res1.inventory).toEqual([]);
      expect(res1.allInStock).toBe(false);

      const res2 = await assistiveAIService.getStoreInventoryStatus(null);
      expect(res2.inventory).toEqual([]);
      expect(res2.allInStock).toBe(false);
    });

    test('returns empty inventory when product IDs are invalid', async () => {
      const res = await assistiveAIService.getStoreInventoryStatus(['abc', -5]);
      expect(res.inventory).toEqual([]);
      expect(res.allInStock).toBe(false);
    });

    test('checks real-time inventory for valid product IDs', async () => {
      const res = await assistiveAIService.getStoreInventoryStatus([1, 2], 'ds_central');
      expect(res.storeId).toBe('ds_central');
      expect(Array.isArray(res.inventory)).toBe(true);
      expect(typeof res.allInStock).toBe('boolean');
    });
  });

  describe('recipeToCart heuristic and fallback branches', () => {
    test('handles unmapped dish with heuristic stopword extraction', async () => {
      const res = await assistiveAIService.recipeToCart(
        'how to cook special tomato mushroom stew',
        { servings: 4 }
      );
      expect(res).toBeDefined();
      expect(res.dish).toContain('tomato');
      expect(res.servings).toBe(4);
      expect(Array.isArray(res.matchedItems)).toBe(true);
    });

    test('handles empty or blank prompt safely', async () => {
      const res = await assistiveAIService.recipeToCart('');
      expect(res).toBeDefined();
      expect(res.servings).toBe(2);
    });
  });

  describe('getSmartReorderSuggestions', () => {
    test('returns staple suggestions for guest or user without history', async () => {
      const res = await assistiveAIService.getSmartReorderSuggestions(null, { limit: 3 });
      expect(res).toBeDefined();
      expect(Array.isArray(res.suggestions)).toBe(true);
      expect(res.suggestions.length).toBeLessThanOrEqual(3);
    });

    test('returns suggestions for valid user', async () => {
      const res = await assistiveAIService.getSmartReorderSuggestions(1, { limit: 5 });
      expect(res).toBeDefined();
      expect(Array.isArray(res.suggestions)).toBe(true);
    });
  });

  describe('findSubstitutes price band branches', () => {
    test('finds substitutes for product ID 1', async () => {
      const res = await assistiveAIService.findSubstitutes(1, { limit: 3 });
      expect(res).toBeDefined();
      expect(res.originalProduct).toBeDefined();
    });

    test('returns empty substitutes for non-existent product', async () => {
      const res = await assistiveAIService.findSubstitutes(999999);
      expect(res.substitutes).toEqual([]);
      expect(res.hasSubstitutes).toBe(false);
    });
  });
});
