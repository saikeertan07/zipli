const {
  BloomFilter,
  fnv1a,
  secondaryHash,
  calculateOptimalM,
  calculateOptimalK,
  calculateOptimalBloomParams,
} = require('../../src/algo/bloom');

describe('bloom.js pure Bloom Filter with double hashing', () => {
  describe('hash functions', () => {
    it('computes deterministic FNV-1a hashes', () => {
      const h1 = fnv1a('test-string');
      const h2 = fnv1a('test-string');
      expect(h1).toBe(h2);
      expect(h1).toBeGreaterThan(0);

      // Custom seed
      const hSeed = fnv1a('test-string', 0x12345678);
      expect(hSeed).not.toBe(h1);
    });

    it('computes deterministic secondary Jenkins-style hashes', () => {
      const h1 = secondaryHash('coupon_code_123');
      const h2 = secondaryHash('coupon_code_123');
      expect(h1).toBe(h2);
      expect(h1).toBeGreaterThan(0);

      const hSeed = secondaryHash('coupon_code_123', 0x87654321);
      expect(hSeed).not.toBe(h1);
    });
  });

  describe('initialization and options', () => {
    it('initializes with default options and calculates optimal m and k', () => {
      const filter = new BloomFilter();
      expect(filter.expectedItems).toBe(10000);
      expect(filter.targetFalsePositiveRate).toBe(0.01);
      expect(filter.sizeInBits).toBeGreaterThan(50000);
      expect(filter.hashCount).toBeGreaterThanOrEqual(5);
      expect(filter.bitArray.length).toBe(filter.byteSize);
    });

    it('supports customBitSize and customHashCount overrides', () => {
      const filter = new BloomFilter({ customBitSize: 1024, customHashCount: 3 });
      expect(filter.sizeInBits).toBe(1024);
      expect(filter.hashCount).toBe(3);
      expect(filter.byteSize).toBe(128);

      const filterDefaultHash = new BloomFilter({ customBitSize: 512 });
      expect(filterDefaultHash.sizeInBits).toBe(512);
      expect(filterDefaultHash.hashCount).toBe(4);
    });

    it('handles empty parameter object with safe defaults', () => {
      const filter = new BloomFilter({});
      expect(filter.expectedItems).toBe(10000);
      expect(filter.targetFalsePositiveRate).toBe(0.01);
    });
  });

  describe('add and has operations', () => {
    it('returns false when adding or querying null or undefined', () => {
      const filter = new BloomFilter();
      expect(filter.add(null)).toBe(false);
      expect(filter.add(undefined)).toBe(false);
      expect(filter.has(null)).toBe(false);
      expect(filter.has(undefined)).toBe(false);
    });

    it('guarantees zero false negatives: all added items must return true', () => {
      const filter = new BloomFilter({ expectedItems: 500, falsePositiveRate: 0.01 });
      const items = ['device_fp_abc', 'device_fp_def', 'coupon_VIP50', 987654321];

      for (const item of items) {
        expect(filter.add(item)).toBe(true);
      }

      for (const item of items) {
        expect(filter.has(item)).toBe(true);
      }
    });

    it('correctly reports false for items definitely not in the set', () => {
      const filter = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.01 });
      filter.add('known_fraud_device_1');
      filter.add('known_fraud_device_2');

      expect(filter.has('legitimate_device_99999')).toBe(false);
      expect(filter.has('fresh_coupon_never_used')).toBe(false);
    });
  });

  describe('false positive rate calculation & statistics', () => {
    it('calculates theoretical false positive rate correctly', () => {
      const filter = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.01 });
      expect(filter.getCurrentFalsePositiveRate()).toBe(0.0);

      for (let i = 0; i < 500; i++) {
        filter.add(`item_${i}`);
      }

      const rate = filter.getCurrentFalsePositiveRate();
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(0.05);
    });

    it('returns comprehensive filter stats and supports clearing', () => {
      const filter = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.05 });
      filter.add('key1');
      filter.add('key2');
      filter.add('key3');

      const stats = filter.getStats();
      expect(stats.itemsInserted).toBe(3);
      expect(stats.bitsSet).toBeGreaterThan(0);
      expect(stats.fillRatio).toBeGreaterThan(0);
      expect(stats.byteSize).toBe(filter.byteSize);

      filter.clear();
      const statsAfter = filter.getStats();
      expect(statsAfter.itemsInserted).toBe(0);
      expect(statsAfter.bitsSet).toBe(0);
      expect(statsAfter.fillRatio).toBe(0);
      expect(filter.has('key1')).toBe(false);
    });

    it('empirically verifies false positive rate within statistical bounds on 1,000 items', () => {
      const N = 1000;
      const targetP = 0.02; // 2% target
      const filter = new BloomFilter({ expectedItems: N, falsePositiveRate: targetP });

      // Insert N items
      for (let i = 0; i < N; i++) {
        filter.add(`existing_entry_${i}`);
      }

      // Test 2,000 non-existent items
      let falsePositives = 0;
      const TEST_QUERIES = 2000;
      for (let i = 0; i < TEST_QUERIES; i++) {
        if (filter.has(`random_probe_${i}`)) {
          falsePositives++;
        }
      }

      const empiricalFPRate = falsePositives / TEST_QUERIES;
      // Empirical rate should be close to 2% (well within 5%)
      expect(empiricalFPRate).toBeLessThan(0.05);
    });

    it('calculates optimal m, k, and params with helper functions', () => {
      const m = calculateOptimalM(1000, 0.01);
      expect(m).toBeGreaterThan(9000);
      const k = calculateOptimalK(m, 1000);
      expect(k).toBe(7);

      const params = calculateOptimalBloomParams(1000, 0.01);
      expect(params.m).toBe(m);
      expect(params.k).toBe(k);
      expect(params.n).toBe(1000);
      expect(params.p).toBe(0.01);
    });
  });
});
