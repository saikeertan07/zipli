const { CatalogSearchService } = require('../../src/services/catalogSearch.service');

describe('Catalog Search Service Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new CatalogSearchService();
  });

  it('indexes products from database pool on init', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { id: 1, name: 'Cow Milk', price: 50, is_active: true, category_id: 'dairy' },
          { id: 2, name: 'Almond Milk', price: 90, is_active: true, category_id: 'dairy' },
        ],
      }),
    };

    const count = await service.init(mockPool);
    expect(count).toBe(2);
    expect(service.size).toBe(2);
    expect(service.initialized).toBe(true);

    // Search
    const searchRes = service.search('cow');
    expect(searchRes.results.length).toBe(1);

    // Suggest
    const suggestions = service.suggest('al');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    // Facets with query and without query
    const queriedFacets = service.getFacets('cow');
    expect(queriedFacets).toBeDefined();

    const allFacets = service.getFacets('');
    expect(allFacets.categories.dairy).toBe(2);

    // Analytics
    expect(service.getTopQueries()).toBeDefined();
    expect(service.getZeroResultQueries()).toBeDefined();
  });

  it('throws error and logs when database query fails during init', async () => {
    const mockPool = {
      query: jest.fn().mockRejectedValue(new Error('Connection failure')),
    };

    await expect(service.init(mockPool)).rejects.toThrow('Connection failure');
    expect(service.initialized).toBe(false);
  });

  it('handles null products and deactivated products on index and update', () => {
    // Null inputs
    service.indexProduct(null);
    service.updateProduct(null);
    expect(service.size).toBe(0);

    // Active product
    service.indexProduct({ id: 10, name: 'Fresh Apples', price: 100, is_active: true });
    expect(service.size).toBe(1);

    // Deactivated product passed to indexProduct removes it
    service.indexProduct({ id: 10, name: 'Fresh Apples', price: 100, is_active: false });
    expect(service.size).toBe(0);

    // Re-index and update
    service.indexProduct({ id: 20, name: 'Fresh Oranges', price: 80, is_active: true });
    service.updateProduct({ id: 20, name: 'Sweet Oranges', price: 90, is_active: true });
    expect(service.size).toBe(1);

    // Deactivated product passed to updateProduct removes it
    service.updateProduct({ id: 20, is_active: false });
    expect(service.size).toBe(0);

    // Clear
    service.clear();
    expect(service.initialized).toBe(false);
  });
});
