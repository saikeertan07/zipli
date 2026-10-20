const {
  buildDistanceMatrix,
  solveTSP2Opt,
  solveTSPHeldKarp,
  optimizeBatchRoute,
} = require('../../src/algo/tsp');

describe('tsp.js pure solvers', () => {
  const depot = { lat: 12.935, lng: 77.624 };

  describe('buildDistanceMatrix', () => {
    it('creates zero-diagonal symmetric distance matrix', () => {
      const locs = [
        { lat: 12.935, lng: 77.624 },
        { lat: 12.936, lng: 77.625 },
        { lat: 12.937, lng: 77.626 },
      ];
      const matrix = buildDistanceMatrix(locs);
      expect(matrix).toHaveLength(3);
      expect(matrix[0][0]).toBe(0);
      expect(matrix[1][1]).toBe(0);
      expect(matrix[2][2]).toBe(0);
      expect(matrix[0][1]).toBeGreaterThan(0);
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 5);
    });
  });

  describe('solveTSP2Opt and solveTSPHeldKarp base cases', () => {
    it('handles n <= 1 safely', () => {
      const m0 = [];
      expect(solveTSP2Opt(m0)).toEqual({ tour: [0], totalDistance: 0 });
      expect(solveTSPHeldKarp(m0)).toEqual({ tour: [0], totalDistance: 0 });

      const m1 = [[0]];
      expect(solveTSP2Opt(m1)).toEqual({ tour: [0], totalDistance: 0 });
      expect(solveTSPHeldKarp(m1)).toEqual({ tour: [0], totalDistance: 0 });
    });

    it('handles n === 2 safely', () => {
      const m2 = [
        [0, 5],
        [5, 0],
      ];
      expect(solveTSP2Opt(m2)).toEqual({ tour: [0, 1, 0], totalDistance: 10 });
      expect(solveTSPHeldKarp(m2)).toEqual({ tour: [0, 1, 0], totalDistance: 10 });
    });
  });

  describe('2-Opt local search improvement and Held-Karp optimality', () => {
    it('improves crossed edges using 2-Opt on a 4-node square', () => {
      // 4 points on a square: (0,0), (0,1), (1,1), (1,0)
      // If order is crossed: 0 -> (1,1) -> (0,1) -> (1,0) -> 0
      const distMatrix = [
        [0, 1, 1.414, 1],
        [1, 0, 1, 1.414],
        [1.414, 1, 0, 1],
        [1, 1.414, 1, 0],
      ];

      const res2Opt = solveTSP2Opt(distMatrix);
      const resExact = solveTSPHeldKarp(distMatrix);

      expect(res2Opt.tour[0]).toBe(0);
      expect(res2Opt.tour[res2Opt.tour.length - 1]).toBe(0);
      expect(res2Opt.totalDistance).toBeCloseTo(4.0, 1);
      expect(resExact.totalDistance).toBeCloseTo(4.0, 1);
      expect(resExact.tour).toHaveLength(5);
    });

    it('finds exact minimum tour for 6 stops', () => {
      const stops = [
        { lat: 12.935, lng: 77.624 }, // depot
        { lat: 12.936, lng: 77.625 },
        { lat: 12.938, lng: 77.625 },
        { lat: 12.94, lng: 77.626 },
        { lat: 12.937, lng: 77.628 },
        { lat: 12.934, lng: 77.627 },
      ];
      const matrix = buildDistanceMatrix(stops);
      const exact = solveTSPHeldKarp(matrix);
      const heuristic = solveTSP2Opt(matrix);

      expect(exact.totalDistance).toBeGreaterThan(0);
      expect(heuristic.totalDistance).toBeGreaterThanOrEqual(exact.totalDistance - 1e-4);
      expect(exact.tour[0]).toBe(0);
      expect(exact.tour[exact.tour.length - 1]).toBe(0);
      expect(new Set(exact.tour.slice(0, -1)).size).toBe(6);
    });
  });

  describe('optimizeBatchRoute', () => {
    it('throws when depot coordinate is invalid', () => {
      expect(() => optimizeBatchRoute(null, [])).toThrow(
        'Valid depot coordinate required in optimizeBatchRoute'
      );
      expect(() => optimizeBatchRoute({ lat: 'invalid', lng: 77.0 }, [])).toThrow(
        'Valid depot coordinate required in optimizeBatchRoute'
      );
    });

    it('returns empty result when stops are empty or invalid', () => {
      const res0 = optimizeBatchRoute(depot);
      expect(res0.orderedStops).toEqual([]);
      expect(res0.totalDistanceKm).toBe(0);

      const res1 = optimizeBatchRoute(depot, []);
      expect(res1.orderedStops).toEqual([]);
      expect(res1.totalDistanceKm).toBe(0);

      const res2 = optimizeBatchRoute(depot, [{ lat: 'foo', lng: 'bar' }]);
      expect(res2.orderedStops).toEqual([]);
      expect(res2.totalDistanceKm).toBe(0);
    });

    it('optimizes batch route for n <= 10 stops and reports Held-Karp exact bounds', () => {
      const stops = [
        { id: 101, lat: 12.936, lng: 77.625 },
        { id: 102, lat: 12.937, lng: 77.626 },
        { id: 103, lat: 12.938, lng: 77.627 },
        { id: 104, lat: 12.9355, lng: 77.6245 },
      ];

      const res = optimizeBatchRoute(depot, stops);
      expect(res.orderedStops).toHaveLength(4);
      expect(res.totalDistanceKm).toBeGreaterThan(0);
      expect(res.optimalDistanceKm).toBeDefined();
      expect(res.optimalityGapPercent).toBeDefined();
      expect(res.optimalityGapPercent).toBeGreaterThanOrEqual(0);
    });

    it('handles identical zero-distance coordinates correctly', () => {
      const stops = [
        { id: 201, lat: 12.935, lng: 77.624 }, // same as depot
      ];
      const res = optimizeBatchRoute(depot, stops);
      expect(res.totalDistanceKm).toBe(0);
      expect(res.optimalityGapPercent).toBe(0);
    });

    it('switches to pure heuristic mode when stops exceed 10 (n > 10)', () => {
      // 11 distinct stops
      const stops = Array.from({ length: 11 }, (_, i) => ({
        id: `stop-${i + 1}`,
        lat: 12.935 + (i + 1) * 0.001,
        lng: 77.624 + (i + 1) * 0.001,
      }));

      const res = optimizeBatchRoute(depot, stops);
      expect(res.orderedStops).toHaveLength(11);
      expect(res.totalDistanceKm).toBeGreaterThan(0);
      expect(res.optimalDistanceKm).toBeUndefined(); // Held-Karp skipped for scalability
      expect(res.optimalityGapPercent).toBeUndefined();
    });
  });
});
