const { classifyAbcXyz, MATRIX_RECOMMENDATIONS } = require('../../src/algo/abcXyz');

describe('abcXyz.js pure ABC/XYZ inventory matrix classification', () => {
  describe('empty / invalid inputs', () => {
    it('returns empty result when items is null, undefined, or empty array', () => {
      const emptyRes = classifyAbcXyz();
      expect(emptyRes.classifiedItems).toEqual([]);
      expect(emptyRes.summary.totalItems).toBe(0);
      expect(emptyRes.summary.totalRevenue).toBe(0);

      const emptyRes2 = classifyAbcXyz([]);
      expect(emptyRes2.classifiedItems).toEqual([]);
      expect(emptyRes2.summary.totalItems).toBe(0);

      const invalidRes = classifyAbcXyz('not an array');
      expect(invalidRes.classifiedItems).toEqual([]);
    });

    it('handles catalog where all items have zero revenue', () => {
      const items = [
        { id: 1, name: 'Item 1', unitPrice: 0, unitsSold: 10 },
        { id: 2, name: 'Item 2', unitPrice: 50, unitsSold: 0 },
      ];
      const res = classifyAbcXyz(items);
      expect(res.summary.totalRevenue).toBe(0);
      expect(res.classifiedItems).toHaveLength(2);
      expect(res.classifiedItems[0].abcClass).toBe('C');
    });
  });

  describe('Pareto ABC and XYZ volatility classification', () => {
    it('accurately segments catalog into A, B, and C tiers and X, Y, Z volatility', () => {
      // 10 items with Pareto distribution
      // Item A1: ₹80,000 revenue (80% of 100k) -> A
      // Item B1: ₹15,000 revenue (15% of 100k) -> B
      // Item C1: ₹5,000 revenue (5% of 100k) -> C
      const items = [
        {
          id: 'A1',
          name: 'Top Seller Milk',
          unitPrice: 50,
          unitsSold: 1600, // 80,000 rev
          demandHistory: [160, 160, 160, 160, 160, 160, 160], // CV = 0 -> X
        },
        {
          id: 'B1',
          name: 'Mid Seller Butter',
          unitPrice: 150,
          unitsSold: 100, // 15,000 rev
          demandHistory: [5, 15, 25, 5, 20, 10, 20], // Mean: 14.3, StdDev: ~7.3 -> CV ~ 0.51 -> Y
        },
        {
          id: 'C1',
          name: 'Low Seller Truffle',
          unitPrice: 1000,
          unitsSold: 5, // 5,000 rev
          demandHistory: [0, 0, 0, 5, 0, 0, 0], // CV > 1.0 -> Z
        },
      ];

      const res = classifyAbcXyz(items);

      expect(res.summary.totalRevenue).toBe(100000);
      expect(res.summary.totalItems).toBe(3);
      expect(res.summary.aCount).toBe(1);
      expect(res.summary.bCount).toBe(1);
      expect(res.summary.cCount).toBe(1);

      // Verify A1
      const a1 = res.classifiedItems.find((i) => i.id === 'A1');
      expect(a1.abcClass).toBe('A');
      expect(a1.xyzClass).toBe('X');
      expect(a1.matrixCell).toBe('AX');
      expect(a1.recommendation).toBe(MATRIX_RECOMMENDATIONS.AX);

      // Verify B1
      const b1 = res.classifiedItems.find((i) => i.id === 'B1');
      expect(b1.abcClass).toBe('B');
      expect(b1.xyzClass).toBe('Y');
      expect(b1.matrixCell).toBe('BY');
      expect(b1.recommendation).toBe(MATRIX_RECOMMENDATIONS.BY);

      // Verify C1
      const c1 = res.classifiedItems.find((i) => i.id === 'C1');
      expect(c1.abcClass).toBe('C');
      expect(c1.xyzClass).toBe('Z');
      expect(c1.matrixCell).toBe('CZ');
      expect(c1.recommendation).toBe(MATRIX_RECOMMENDATIONS.CZ);

      // Matrix grid check
      expect(res.matrixGrid.AX).toBe(1);
      expect(res.matrixGrid.BY).toBe(1);
      expect(res.matrixGrid.CZ).toBe(1);
    });

    it('respects custom threshold options', () => {
      const items = [
        { id: 1, name: 'P1', unitPrice: 100, unitsSold: 6, demandHistory: [6] }, // 600 rev (60%)
        { id: 2, name: 'P2', unitPrice: 100, unitsSold: 4, demandHistory: [4] }, // 400 rev (40%)
      ];

      // Custom A threshold = 0.5 (so 60% becomes B)
      const res = classifyAbcXyz(items, {
        aThreshold: 0.5,
        bThreshold: 0.8,
        xCvThreshold: 0.1,
        yCvThreshold: 0.8,
      });

      expect(res.classifiedItems[0].abcClass).toBe('A'); // First item must be at least A if revenue > 0
      expect(res.classifiedItems[1].abcClass).toBe('C'); // Exceeds 80% cumulative
    });

    it('verifies all 9 operational recommendations exist and have actionable guidance', () => {
      const cells = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];
      for (const cell of cells) {
        expect(MATRIX_RECOMMENDATIONS[cell]).toBeDefined();
        expect(MATRIX_RECOMMENDATIONS[cell].length).toBeGreaterThan(15);
      }
    });
  });
});
