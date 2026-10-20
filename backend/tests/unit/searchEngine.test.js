const { SearchEngine } = require('../../src/algo/searchEngine');

describe('Pure In-Memory Search Engine (/algo/searchEngine.js)', () => {
  let engine;

  const catalog = [
    {
      id: 1,
      name: 'Fresh Cow Milk',
      category_id: 'dairy',
      badge: 'Bestseller',
      price: 60,
    },
    {
      id: 2,
      name: 'Organic Whole Milk',
      category_id: 'dairy',
      badge: 'Organic',
      price: 75,
    },
    {
      id: 3,
      name: 'Almond Milk Unsweetened',
      category_id: 'dairy',
      badge: 'Vegan',
      price: 180,
    },
    {
      id: 4,
      name: 'Hass Avocado',
      category_id: 'fruits',
      badge: 'Fresh',
      price: 160,
    },
    {
      id: 5,
      name: 'Organic Cavendish Bananas',
      category_id: 'fruits',
      badge: null,
      price: 45,
    },
  ];

  beforeEach(() => {
    engine = new SearchEngine();
    engine.indexProducts(catalog);
  });

  describe('Indexing & Corpus Management', () => {
    it('indexes all catalog items accurately', () => {
      expect(engine.size).toBe(5);
    });

    it('removes a product from index', () => {
      engine.removeProduct(1);
      expect(engine.size).toBe(4);
      const res = engine.search('cow');
      expect(res.results.length).toBe(0);
    });

    it('updates product and refreshes searchable terms', () => {
      engine.updateProduct({
        id: 4,
        name: 'Premium Mexican Avocado',
        category_id: 'fruits',
      });

      const res = engine.search('mexican');
      expect(res.results.length).toBe(1);
      expect(res.results[0].product.name).toBe('Premium Mexican Avocado');
    });
  });

  describe('Search Relevance & BM25 Scoring', () => {
    it('ranks exact and relevant matches at the top', () => {
      const res = engine.search('milk');
      expect(res.results.length).toBe(3);

      // All 3 milk products returned
      const ids = res.results.map((r) => r.product.id);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).toContain(3);
      expect(res.results[0].score).toBeGreaterThan(0);
    });

    it('multi-word query matches documents containing multiple terms higher', () => {
      const res = engine.search('organic milk');
      expect(res.results.length).toBeGreaterThan(0);

      // Organic Whole Milk has both "organic" and "milk" -> ranks #1
      expect(res.results[0].product.id).toBe(2);
      expect(res.results[0].product.name).toBe('Organic Whole Milk');
    });

    it('applies category filter correctly', () => {
      const res = engine.search('milk', { category: 'fruits' });
      expect(res.results.length).toBe(0);

      const resDairy = engine.search('milk', { category: 'dairy' });
      expect(resDairy.results.length).toBe(3);
    });

    it('returns all items when query is empty string or whitespace', () => {
      const res = engine.search('   ');
      expect(res.results.length).toBe(5);
      expect(res.total).toBe(5);
    });

    it('supports pagination offset and limit', () => {
      const page1 = engine.search('milk', { limit: 2, offset: 0 });
      expect(page1.results.length).toBe(2);

      const page2 = engine.search('milk', { limit: 2, offset: 2 });
      expect(page2.results.length).toBe(1);
      expect(page1.results[0].product.id).not.toBe(page2.results[0].product.id);
    });

    it('gives prefix boost to product titles starting with the query', () => {
      engine.indexProduct({ id: 99, name: 'Tofu Silk', cat: 'vegan' });
      const res = engine.search('tofu', { category: 'vegan' });
      expect(res.results.length).toBe(1);
      expect(res.results[0].product.name).toBe('Tofu Silk');
    });
  });

  describe('Typo Tolerance / Fuzzy Matching Fallback', () => {
    it('corrects single-character typo and finds matching products', () => {
      // "avcado" typo for "avocado"
      const res = engine.search('avcado');
      expect(res.results.length).toBe(1);
      expect(res.results[0].product.name).toBe('Hass Avocado');
      expect(res.correctedQuery).toBe('avocado');
    });

    it('corrects transposition typo (mlik -> milk)', () => {
      const res = engine.search('mlik');
      expect(res.results.length).toBe(3);
      expect(res.correctedQuery).toBe('milk');
    });

    it('returns empty when typo distance exceeds threshold', () => {
      const res = engine.search('xyz123random');
      expect(res.results.length).toBe(0);
      expect(res.correctedQuery).toBeNull();
    });
  });

  describe('Autocomplete / Suggestions (Trie)', () => {
    it('returns instant prefix suggestions for partial search input', () => {
      const suggestions = engine.suggest('m');
      expect(suggestions.length).toBeGreaterThan(0);

      const words = suggestions.map((s) => s.word);
      expect(words).toContain('milk');
    });

    it('suggests full title or specific product prefix', () => {
      const suggestions = engine.suggest('hass');
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0].word).toBe('hass avocado');
    });

    it('returns empty array when prefix has no matches', () => {
      expect(engine.suggest('zzz')).toEqual([]);
      expect(engine.suggest('')).toEqual([]);
      expect(engine.suggest(null)).toEqual([]);
    });
  });

  describe('Edge Cases & Defensive Handling', () => {
    it('handles empty query with category filter', () => {
      const res = engine.search('', { category: 'fruits' });
      expect(res.results.length).toBe(2);
      for (const item of res.results) {
        expect(item.product.category_id).toBe('fruits');
      }
    });

    it('handles purely punctuation or symbol queries', () => {
      const res = engine.search('!@#$%^&*()');
      expect(res.results).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('honors fuzzy: false option to disable typo recovery', () => {
      const res = engine.search('avcado', { fuzzy: false });
      expect(res.results.length).toBe(0);
    });

    it('handles invalid index, update, and remove calls safely', () => {
      engine.indexProduct(null);
      engine.indexProduct({});
      engine.indexProducts(null);
      engine.updateProduct(null);
      engine.updateProduct({});
      expect(engine.size).toBe(5);
    });

    it('handles mixed typo queries and non-string inputs', () => {
      // One token typo corrected, other uncorrected
      const res = engine.search('avcado zzzzznonexistent');
      expect(res.results.length).toBe(1);
      expect(res.correctedQuery).toBe('avocado zzzzznonexistent');

      // Non-string input
      expect(engine.search(12345).results.length).toBe(5);
    });

    it('breaks ties deterministically by product name, handling null/empty names', () => {
      engine.indexProduct({ id: 101, name: 'Identical Name', price: 10 });
      engine.indexProduct({ id: 102, name: 'Identical Name', price: 10 });
      engine.indexProduct({ id: 103, name: null, badge: 'identical', price: 10 });

      const res = engine.search('identical');
      expect(res.results.length).toBe(3);
    });

    it('handles document missing from index.documents in candidate loop', () => {
      // Artificially remove document from internal map while keeping posting
      engine.index.documents.delete('1');
      const res = engine.search('cow');
      expect(res.results.length).toBe(0);
    });

    it('handles product removal on non-existent id and documents with empty names', () => {
      engine.removeProduct(99999);
      engine.indexProduct({ id: 200, name: '', price: 10 });
      engine.indexProduct({ id: 201, price: 10 });
      engine.removeProduct(200);
      engine.removeProduct(201);
    });

    it('filters empty query search by category matching cat or category_id', () => {
      engine.indexProduct({ id: 300, name: 'Snack A', cat: 'snacks' });
      engine.indexProduct({ id: 301, name: 'Snack B', category_id: 'snacks' });
      engine.indexProduct({ id: 302, name: 'Other', category_id: 'beverages' });

      const res = engine.search('', { category: 'snacks' });
      expect(res.results.length).toBe(2);
    });

    it('clears index completely', () => {
      engine.clear();
      expect(engine.size).toBe(0);
      expect(engine.search('milk').results.length).toBe(0);
      expect(engine.suggest('m')).toEqual([]);
    });

    it('tracks query analytics and computes facets across all price bands', () => {
      engine.indexProduct({ id: 501, name: 'Expensive Item', price: 250, badge: 'Premium' });
      engine.indexProduct({ id: 502, name: 'Budget Item', price: 30, stock: 0 });

      // Run multiple searches
      engine.search('expensive', { explain: true });
      engine.search('expensive');
      engine.search('nonexistentproductxyz');

      const topQueries = engine.getTopQueries(5);
      expect(topQueries.length).toBeGreaterThan(0);
      expect(topQueries[0].query).toBe('expensive');
      expect(topQueries[0].count).toBe(2);

      const zeroResults = engine.getZeroResultQueries(5);
      expect(zeroResults.length).toBe(1);
      expect(zeroResults[0].query).toBe('nonexistentproductxyz');

      // Test Suggestion toJSON serialization
      const suggestions = engine.suggest('exp');
      expect(suggestions[0].toJSON()).toBe('expensive item');

      // Test product with custom popularity and stock=0
      engine.indexProduct({
        id: 503,
        name: 'Discounted Item',
        price: 80,
        mrp: 100,
        popularity: 0.95,
        stock: 0,
      });
      const explainedSearch = engine.search('discounted', { explain: true });
      expect(explainedSearch.results.length).toBe(1);
      expect(explainedSearch.results[0].explanation.popularityWeighted).toBeGreaterThan(0);
      expect(explainedSearch.results[0].explanation.inStockWeighted).toBe(0);
      expect(explainedSearch.results[0].explanation.discountWeighted).toBeGreaterThan(0);

      // Test facets calculation with above 200 price
      const facets = engine.computeFacets(Array.from(engine.index.documents.values()));
      expect(facets.priceRanges.above_200).toBeGreaterThanOrEqual(1);
      expect(facets.priceRanges.under_50).toBeGreaterThanOrEqual(1);

      // Overflow analytics buffer (500 items)
      for (let i = 0; i < 505; i++) {
        engine._recordAnalytics(`bulk_query_${i}`, 1);
      }
      expect(engine.analytics.recentQueries.length).toBe(500);

      // Edge cases on analytics logging
      engine._recordAnalytics(null, 0);
      engine._recordAnalytics('   ', 0);
    });
  });
});
