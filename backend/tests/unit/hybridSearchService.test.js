const { hybridSearchService } = require('../../src/services/hybridSearch.service');
const { getEmbeddingProvider } = require('../../src/ai/embeddingProvider');

describe('Hybrid Search Service Unit Suite (F-031, P1)', () => {
  test('returns empty results for empty or blank search term', async () => {
    const res1 = await hybridSearchService.search({ searchTerm: '' });
    expect(res1.items).toEqual([]);
    expect(res1.total).toBe(0);

    const res2 = await hybridSearchService.search({ searchTerm: '   ' });
    expect(res2.items).toEqual([]);
    expect(res2.total).toBe(0);
  });

  test('checks database capabilities without throwing', async () => {
    const caps = await hybridSearchService.checkCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps.vectorEnabled).toBe('boolean');
    expect(typeof caps.trigramEnabled).toBe('boolean');
  });

  test('searches products with automatic embedding generation', async () => {
    const results = await hybridSearchService.search({
      searchTerm: 'milk',
      limit: 5,
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results.items)).toBe(true);
    expect(results.tookMs).toBeGreaterThanOrEqual(0);
  });

  test('searches products with category and price filters', async () => {
    const results = await hybridSearchService.search({
      searchTerm: 'apple',
      category: 1,
      maxPrice: 500,
      limit: 3,
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results.items)).toBe(true);
  });

  test('searches with precomputed query embedding', async () => {
    const provider = getEmbeddingProvider();
    const embedding = await provider.embedText('fresh butter');

    const results = await hybridSearchService.search({
      searchTerm: 'fresh butter',
      queryEmbedding: embedding,
      limit: 5,
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results.items)).toBe(true);
  });

  test('syncs product embedding safely', async () => {
    // Should not throw even if product doesn't exist
    await expect(
      hybridSearchService.syncProductEmbedding(999999, 'Test Product', 'Dairy')
    ).resolves.not.toThrow();
  });

  test('covers vector search branch when vector capability is active', async () => {
    const origCheck = hybridSearchService.checkCapabilities.bind(hybridSearchService);
    hybridSearchService.checkCapabilities = jest.fn().mockResolvedValue({
      vectorEnabled: true,
      trigramEnabled: true,
    });

    try {
      const results = await hybridSearchService.search({
        searchTerm: 'butter',
        limit: 3,
      });
      expect(results).toBeDefined();
      expect(Array.isArray(results.items)).toBe(true);
    } finally {
      hybridSearchService.checkCapabilities = origCheck;
    }
  });
});
