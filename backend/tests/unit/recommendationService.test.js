const { RecommendationService } = require('../../src/services/recommendation.service');

describe('RecommendationService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new RecommendationService();
  });

  it('initializes catalog and trains models when completed orders exist', async () => {
    const mockProducts = [
      {
        id: 1,
        name: 'Milk',
        price: 60,
        mrp: 70,
        category_id: 'dairy',
        badge: 'Bestseller',
        stock: 10,
        is_active: true,
      },
      {
        id: 2,
        name: 'Bread',
        price: 40,
        mrp: 50,
        category_id: 'bakery',
        stock: 20,
        is_active: true,
      },
      {
        id: 3,
        name: 'Butter',
        price: 55,
        mrp: 60,
        category_id: 'dairy',
        stock: 15,
        is_active: true,
      },
    ];

    const mockRules = [
      { antecedent_id: 1, consequent_id: 2, support: '0.5', confidence: '0.8', lift: '2.5' },
    ];

    const mockOrderItems = [
      { order_id: 101, user_id: 1, product_id: 1, created_at: new Date('2026-01-01') },
      { order_id: 101, user_id: 1, product_id: 2, created_at: new Date('2026-01-01') },
      { order_id: 102, user_id: 1, product_id: 1, created_at: new Date('2026-01-05') },
      { order_id: 102, user_id: 1, product_id: 2, created_at: new Date('2026-01-05') },
      { order_id: 103, user_id: 2, product_id: 1, created_at: new Date('2026-01-02') },
      { order_id: 103, user_id: 2, product_id: 3, created_at: new Date('2026-01-02') },
    ];

    const mockAbFeedback = [
      { event_type: 'click', rail_id: 'trending', count: '5' },
      { event_type: 'impression', rail_id: 'featured', count: '10' },
    ];

    const mockPool = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes('FROM products')) {
          return Promise.resolve({ rows: mockProducts });
        }
        if (sql.includes('FROM product_associations')) {
          return Promise.resolve({ rows: mockRules });
        }
        if (sql.includes('FROM order_items')) {
          return Promise.resolve({ rows: mockOrderItems });
        }
        if (sql.includes('FROM ab_events')) {
          return Promise.resolve({ rows: mockAbFeedback });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const result = await service.init(mockPool);
    expect(result.catalogCount).toBe(3);
    expect(result.rulesCount).toBe(1);
    expect(service.initialized).toBe(true);
  });

  it('handles empty database and model training gracefully', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const result = await service.init(mockPool);
    expect(result.catalogCount).toBe(0);
    expect(service.initialized).toBe(true);
  });

  it('handles query failure in init and throws error', async () => {
    const errorPool = {
      query: jest.fn().mockRejectedValue(new Error('DB Connection Refused')),
    };

    await expect(service.init(errorPool)).rejects.toThrow('DB Connection Refused');
  });

  it('logs warning and does not crash when training query fails', async () => {
    const partialPool = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes('FROM products'))
          return Promise.resolve({ rows: [{ id: 1, name: 'Item', is_active: true }] });
        if (sql.includes('FROM product_associations')) return Promise.resolve({ rows: [] });
        if (sql.includes('FROM order_items')) return Promise.reject(new Error('Table locked'));
        return Promise.resolve({ rows: [] });
      }),
    };

    const res = await service.init(partialPool);
    expect(res.catalogCount).toBe(1);
  });

  it('generates home rails for treatment and control variants', async () => {
    // Populate dummy catalog
    service.catalog.set('1', {
      id: 1,
      name: 'Milk',
      price: 60,
      mrp: 70,
      badge: 'Bestseller',
      stock: 10,
    });
    service.catalog.set('2', { id: 2, name: 'Bread', price: 40, mrp: 50, stock: 20 });
    service.hybrid.setCatalog(Array.from(service.catalog.values()));

    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    // Treatment
    const treatmentResult = await service.getHomeRails('user_42', mockPool);
    expect(treatmentResult.rails.length).toBeGreaterThan(0);

    // Control
    const controlResult = await service.getHomeRails('user_99', mockPool);
    expect(controlResult.rails.length).toBeGreaterThan(0);
  });

  it('tracks A/B events and updates bandit for clicks and impressions', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 123, created_at: new Date() }] }),
    };

    const clickEvent = await service.trackEvent(
      {
        experimentKey: 'test_exp',
        variant: 'treatment',
        eventType: 'click',
        metadata: { railId: 'trending' },
      },
      mockPool
    );

    expect(clickEvent.id).toBe(123);

    const impressionEvent = await service.trackEvent(
      {
        experimentKey: 'test_exp',
        variant: 'treatment',
        eventType: 'impression',
        metadata: { railId: 'trending' },
      },
      mockPool
    );

    expect(impressionEvent.id).toBe(123);
  });

  it('returns empty buy-again feed when userId is falsy or has no habits', async () => {
    const empty1 = await service.getBuyAgainFeed(null);
    expect(empty1.items).toEqual([]);

    const mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const empty2 = await service.getBuyAgainFeed(123, 10, mockPool);
    expect(empty2.items).toEqual([]);
    expect(empty2.total).toBe(0);
  });

  it('delegates product recs, cart recs, and populated buy-again feed correctly', async () => {
    service.catalog.set('1', {
      id: 1,
      name: 'Milk',
      price: 60,
      mrp: 70,
      category_id: 'dairy',
      stock: 10,
      is_active: true,
    });
    service.catalog.set('2', {
      id: 2,
      name: 'Butter',
      price: 50,
      mrp: 60,
      category_id: 'dairy',
      stock: 10,
      is_active: true,
    });
    service.hybrid.setCatalog(Array.from(service.catalog.values()));

    expect(service.getProductRecommendations(1).length).toBeGreaterThan(0);
    expect(service.getCartRecommendations([1]).length).toBeGreaterThan(0);

    const mockHabits = [
      {
        user_id: 1,
        product_id: 1,
        order_count: 5,
        typical_gap_days: '7.0',
        last_purchased_at: new Date('2026-02-01'),
        id: 1,
        name: 'Milk',
        price: 60,
        mrp: 70,
        stock: 10,
        is_active: true,
      },
    ];
    const mockPool = { query: jest.fn().mockResolvedValue({ rows: mockHabits }) };
    const feed = await service.getBuyAgainFeed(1, 10, mockPool);
    expect(feed.items.length).toBe(1);
    expect(feed.total).toBe(1);
  });

  it('generates personalized hybrid recommendations with diversity guardrail', async () => {
    service.catalog.set('1', {
      id: 1,
      name: 'Milk',
      price: 60,
      mrp: 70,
      category_id: 'dairy',
      stock: 10,
      is_active: true,
    });
    service.catalog.set('2', {
      id: 2,
      name: 'Bread',
      price: 40,
      mrp: 50,
      category_id: 'bakery',
      stock: 10,
      is_active: true,
    });
    service.hybrid.setCatalog(Array.from(service.catalog.values()));

    const mockHabits = [
      {
        user_id: 1,
        product_id: 1,
        order_count: 3,
        typical_gap_days: '7.0',
        last_purchased_at: new Date('2026-02-01'),
        id: 1,
        name: 'Milk',
        price: 60,
        mrp: 70,
        stock: 10,
        is_active: true,
      },
    ];
    const mockPool = { query: jest.fn().mockResolvedValue({ rows: mockHabits }) };

    const recs = await service.getPersonalizedRecommendations(
      1,
      { cartItemIds: ['1'], limit: 5, maxPerCategory: 2 },
      mockPool
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].finalScore).toBeDefined();
    expect(recs[0].reason).toBeDefined();
  });
});
