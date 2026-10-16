const { FEFOInventoryManager } = require('../../src/algo/fefo');

describe('fefo.js pure FEFO batch inventory manager', () => {
  let fefo;
  const NOW = Date.now() + 86400000; // Baseline tomorrow timestamp
  const ONE_DAY = 86400000;

  beforeEach(() => {
    fefo = new FEFOInventoryManager();
  });

  describe('parseExpiry', () => {
    it('returns timestamp when given a number', () => {
      expect(FEFOInventoryManager.parseExpiry(12345678)).toBe(12345678);
    });

    it('parses valid date string or Date object', () => {
      const d = new Date(NOW);
      expect(FEFOInventoryManager.parseExpiry(d)).toBe(NOW);
      expect(FEFOInventoryManager.parseExpiry('2035-01-01T00:00:00.000Z')).toBe(
        new Date('2035-01-01T00:00:00.000Z').getTime()
      );
    });

    it('falls back to default future timestamp for invalid date string', () => {
      const parsed = FEFOInventoryManager.parseExpiry('invalid-date-string');
      expect(parsed).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('addBatch', () => {
    it('throws error when batch is invalid or missing required ids', () => {
      expect(() => fefo.addBatch()).toThrow('Valid batch with productId and batchId required');
      expect(() => fefo.addBatch({ productId: 'p1' })).toThrow();
      expect(() => fefo.addBatch({ batchId: 'b1' })).toThrow();
    });

    it('returns current stock without adding if quantity is 0 or negative', () => {
      const stock = fefo.addBatch(
        {
          productId: 'prod_1',
          batchId: 'batch_0',
          quantity: 0,
          expiryDate: NOW + ONE_DAY,
        },
        NOW
      );
      expect(stock).toBe(0);
      expect(fefo.getTotalStock('prod_1', NOW)).toBe(0);
    });

    it('successfully adds batches and accumulates total stock', () => {
      const stock1 = fefo.addBatch(
        {
          productId: 'prod_1',
          batchId: 'b1',
          quantity: 10,
          expiryDate: NOW + 2 * ONE_DAY,
          costPrice: 45,
        },
        NOW
      );
      expect(stock1).toBe(10);

      const stock2 = fefo.addBatch(
        {
          productId: 'prod_1',
          batchId: 'b2',
          quantity: 15,
          expiryDate: NOW + ONE_DAY, // earlier expiry
        },
        NOW
      );
      expect(stock2).toBe(25);
    });
  });

  describe('getTotalStock & getActiveBatches', () => {
    it('returns 0 and empty array for non-existent product', () => {
      expect(fefo.getTotalStock('non_existent', NOW)).toBe(0);
      expect(fefo.getActiveBatches('non_existent', NOW)).toEqual([]);
    });

    it('excludes expired batches from getTotalStock', () => {
      fefo.addBatch({
        productId: 'prod_milk',
        batchId: 'batch_expired',
        quantity: 5,
        expiryDate: NOW - ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_milk',
        batchId: 'batch_fresh',
        quantity: 12,
        expiryDate: NOW + 3 * ONE_DAY,
      });

      expect(fefo.getTotalStock('prod_milk', NOW)).toBe(12);

      const active = fefo.getActiveBatches('prod_milk', NOW);
      expect(active).toHaveLength(2);
      expect(active[0].batchId).toBe('batch_expired');
      expect(active[0].isExpired).toBe(true);
      expect(active[1].batchId).toBe('batch_fresh');
      expect(active[1].isExpired).toBe(false);
      expect(active[1].daysToExpiry).toBe(3);
    });
  });

  describe('allocateFEFO', () => {
    it('returns success for 0 requested quantity', () => {
      const res = fefo.allocateFEFO('p1', 0, NOW);
      expect(res.success).toBe(true);
      expect(res.allocatedBatches).toEqual([]);
      expect(res.shortage).toBe(0);
    });

    it('returns failure when total stock is insufficient', () => {
      fefo.addBatch({
        productId: 'prod_bread',
        batchId: 'b1',
        quantity: 4,
        expiryDate: NOW + ONE_DAY,
      });

      const res = fefo.allocateFEFO('prod_bread', 10, NOW);
      expect(res.success).toBe(false);
      expect(res.shortage).toBe(6);
      expect(res.remainingStock).toBe(4);
    });

    it('allocates from earliest expiring batch first', () => {
      fefo.addBatch({
        productId: 'prod_apple',
        batchId: 'b_later',
        quantity: 20,
        expiryDate: NOW + 5 * ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_apple',
        batchId: 'b_sooner',
        quantity: 10,
        expiryDate: NOW + ONE_DAY,
      });

      // Request 5: should only take from b_sooner
      const res = fefo.allocateFEFO('prod_apple', 5, NOW);
      expect(res.success).toBe(true);
      expect(res.allocatedBatches).toEqual([
        {
          batchId: 'b_sooner',
          quantityAllocated: 5,
          expiryDate: new Date(NOW + ONE_DAY).toISOString(),
        },
      ]);
      expect(res.remainingStock).toBe(25);
    });

    it('exhausts multiple batches in FEFO sequence across partial and full quantities', () => {
      fefo.addBatch({
        productId: 'prod_yogurt',
        batchId: 'b1_day1',
        quantity: 5,
        expiryDate: NOW + ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_yogurt',
        batchId: 'b2_day2',
        quantity: 10,
        expiryDate: NOW + 2 * ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_yogurt',
        batchId: 'b3_day4',
        quantity: 8,
        expiryDate: NOW + 4 * ONE_DAY,
      });

      // Request 12 units: should exhaust b1 (5 units) + partial b2 (7 units)
      const res = fefo.allocateFEFO('prod_yogurt', 12, NOW);
      expect(res.success).toBe(true);
      expect(res.allocatedBatches).toHaveLength(2);
      expect(res.allocatedBatches[0]).toEqual({
        batchId: 'b1_day1',
        quantityAllocated: 5,
        expiryDate: new Date(NOW + ONE_DAY).toISOString(),
      });
      expect(res.allocatedBatches[1]).toEqual({
        batchId: 'b2_day2',
        quantityAllocated: 7,
        expiryDate: new Date(NOW + 2 * ONE_DAY).toISOString(),
      });
      expect(res.remainingStock).toBe(11); // (10-7) + 8 = 11

      // Next allocation of 4 units should take remaining 3 from b2 and 1 from b3
      const res2 = fefo.allocateFEFO('prod_yogurt', 4, NOW);
      expect(res2.success).toBe(true);
      expect(res2.allocatedBatches[0].batchId).toBe('b2_day2');
      expect(res2.allocatedBatches[0].quantityAllocated).toBe(3);
      expect(res2.allocatedBatches[1].batchId).toBe('b3_day4');
      expect(res2.allocatedBatches[1].quantityAllocated).toBe(1);
      expect(res2.remainingStock).toBe(7);
    });

    it('skips expired batches during allocation', () => {
      fefo.addBatch({
        productId: 'prod_cheese',
        batchId: 'expired_b',
        quantity: 10,
        expiryDate: NOW - ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_cheese',
        batchId: 'valid_b',
        quantity: 10,
        expiryDate: NOW + ONE_DAY,
      });

      const res = fefo.allocateFEFO('prod_cheese', 5, NOW);
      expect(res.success).toBe(true);
      expect(res.allocatedBatches[0].batchId).toBe('valid_b');
      expect(res.allocatedBatches[0].quantityAllocated).toBe(5);
    });
  });

  describe('quarantineExpiredBatches', () => {
    it('quarantines expired batches across multiple products and retains active stock', () => {
      fefo.addBatch({
        productId: 'prod_A',
        batchId: 'A_exp',
        quantity: 6,
        expiryDate: NOW - 2 * ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_A',
        batchId: 'A_fresh',
        quantity: 14,
        expiryDate: NOW + 3 * ONE_DAY,
      });
      fefo.addBatch({
        productId: 'prod_B',
        batchId: 'B_exp',
        quantity: 2,
        expiryDate: NOW - ONE_DAY,
      });

      const quarantined = fefo.quarantineExpiredBatches(NOW);
      expect(quarantined).toHaveLength(2);
      expect(quarantined.map((b) => b.batchId).sort()).toEqual(['A_exp', 'B_exp']);

      // Only fresh batches remain in inventory
      expect(fefo.getTotalStock('prod_A', NOW)).toBe(14);
      expect(fefo.getTotalStock('prod_B', NOW)).toBe(0);

      // Running quarantine again returns empty
      expect(fefo.quarantineExpiredBatches(NOW)).toEqual([]);
    });

    it('uses default now argument when omitted', () => {
      fefo.addBatch({
        productId: 'prod_default',
        batchId: 'b_def',
        quantity: 10,
        expiryDate: Date.now() + 1000000,
      });

      expect(fefo.getTotalStock('prod_default')).toBe(10);
      expect(fefo.getActiveBatches('prod_default')).toHaveLength(1);
      const alloc = fefo.allocateFEFO('prod_default', 2);
      expect(alloc.success).toBe(true);
      expect(alloc.remainingStock).toBe(8);
      expect(fefo.quarantineExpiredBatches()).toEqual([]);
    });
  });
});
