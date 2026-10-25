/**
 * @file pricingServiceExtra.test.js
 * @description Unit branch coverage tests for PricingService.
 */

jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
}));

const db = require('../../src/config/db');
const pricingService = require('../../src/services/pricing.service');

describe('PricingService Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws 404 when product is not found in calculateDynamicProductPrice', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(pricingService.calculateDynamicProductPrice(999999)).rejects.toThrow(
      'Product not found'
    );
  });

  it('handles product with no batches in calculateDynamicProductPrice', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Test Milk',
            price: '50.00',
            mrp: '60.00',
            is_perishable: true,
            shelf_life_days: 3,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // No active batches

    const res = await pricingService.calculateDynamicProductPrice(1, 1.0);
    expect(res.productId).toBe(1);
    expect(res.finalPrice).toBeDefined();
  });

  it('skips database update when dynamic price change is negligible', async () => {
    jest.spyOn(pricingService, 'calculateDynamicProductPrice').mockResolvedValueOnce({
      productId: 1,
      productName: 'Fresh Milk',
      basePrice: 50.0,
      finalPrice: 50.0, // Difference is 0
      effectiveDiscountPercent: 0,
      expiryStatus: 'FRESH',
      auditLog: { reason: 'Normal demand' },
    });

    const res = await pricingService.applyDynamicPricing(1, 1.0);
    expect(res.priceUpdated).toBe(false);
    expect(res.auditEntry).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('retrieves price history with productId and custom limit', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          product_id: 10,
          old_price: '50.00',
          new_price: '45.00',
          reason: 'Markdown',
        },
      ],
    });

    const history = await pricingService.getPriceHistory(10, 25);
    expect(history.length).toBe(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE pc.product_id = $1'),
      [10, 25]
    );
  });

  it('returns default basket immediately when targetGap is zero or negative', async () => {
    const resZero = await pricingService.optimizeBasket(0);
    expect(resZero.selectedItems).toEqual([]);
    expect(resZero.freeDeliveryQualified).toBe(true);

    const resNegative = await pricingService.optimizeBasket(-10);
    expect(resNegative.selectedItems).toEqual([]);
    expect(resNegative.freeDeliveryQualified).toBe(true);
  });
});
