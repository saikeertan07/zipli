/**
 * @file graph.test.js
 * @description Unit tests for CityGraph: Dijkstra, A*, and Bidirectional Dijkstra.
 */

const { CityGraph, createGridCityGraph } = require('../../src/algo/graph');

describe('graph.js pure CityGraph & Shortest Path Algorithms', () => {
  let smallGraph;

  beforeEach(() => {
    smallGraph = new CityGraph();
    // Diamond network:
    // A -> B (cost 10)
    // A -> C (cost 1)
    // C -> B (cost 2)
    // B -> D (cost 1)
    smallGraph.addNode('A', 12.93, 77.62);
    smallGraph.addNode('B', 12.94, 77.62);
    smallGraph.addNode('C', 12.935, 77.625);
    smallGraph.addNode('D', 12.95, 77.63);
    smallGraph.addNode('Z_isolated', 12.99, 77.99);

    smallGraph.addEdge('A', 'B', 10.0, 20.0);
    smallGraph.addEdge('A', 'C', 1.0, 20.0);
    smallGraph.addEdge('C', 'B', 2.0, 20.0);
    smallGraph.addEdge('B', 'D', 1.0, 20.0);
  });

  it('throws error when adding edge to non-existent nodes', () => {
    expect(() => smallGraph.addEdge('A', 'NON_EXISTENT')).toThrow('must exist');
  });

  it('computes edge distance automatically from Haversine coordinates if omitted', () => {
    const autoGraph = new CityGraph();
    autoGraph.addNode('X', 12.93, 77.62);
    autoGraph.addNode('Y', 12.94, 77.62);
    autoGraph.addEdge('X', 'Y'); // Distance omitted
    const neighbors = autoGraph.adj.get('X');
    expect(neighbors[0].distanceKm).toBeGreaterThan(0);
    expect(neighbors[0].speedKmh).toBe(25.0);
  });

  describe('dijkstra', () => {
    it('returns empty path when start or target does not exist', () => {
      expect(smallGraph.dijkstra('NON_EXISTENT', 'D').path).toEqual([]);
      expect(smallGraph.dijkstra('A', 'NON_EXISTENT').path).toEqual([]);
    });

    it('returns empty path for disconnected destination', () => {
      const res = smallGraph.dijkstra('A', 'Z_isolated');
      expect(res.path).toEqual([]);
      expect(res.totalDistanceKm).toBe(Infinity);
    });

    it('finds shortest path by distance exercising lazy deletion: A -> C -> B -> D (4 km vs 11 km)', () => {
      const res = smallGraph.dijkstra('A', 'D', 'distance');
      expect(res.path).toEqual(['A', 'C', 'B', 'D']);
      expect(res.totalDistanceKm).toBe(4.0);
    });

    it('finds shortest path by travel time', () => {
      const res = smallGraph.dijkstra('A', 'D', 'time');
      expect(res.path).toBeDefined();
      expect(res.totalTimeMinutes).toBeGreaterThan(0);
    });

    it('handles start === target', () => {
      const res = smallGraph.dijkstra('A', 'A');
      expect(res.path).toEqual(['A']);
      expect(res.totalDistanceKm).toBe(0);
    });
  });

  describe('aStar', () => {
    it('returns empty path when start or target does not exist or disconnected', () => {
      expect(smallGraph.aStar('UNKNOWN', 'D').path).toEqual([]);
      expect(smallGraph.aStar('A', 'Z_isolated').path).toEqual([]);
    });

    it('finds optimal path matching Dijkstra by distance', () => {
      const res = smallGraph.aStar('A', 'D', 'distance');
      expect(res.path).toEqual(['A', 'C', 'B', 'D']);
      expect(res.totalDistanceKm).toBe(4.0);
    });

    it('finds optimal path by time', () => {
      const res = smallGraph.aStar('A', 'D', 'time');
      expect(res.path).toBeDefined();
      expect(res.totalTimeMinutes).toBeGreaterThan(0);
    });
  });

  describe('bidirectionalDijkstra', () => {
    it('returns empty path for invalid or disconnected nodes', () => {
      expect(smallGraph.bidirectionalDijkstra('UNKNOWN', 'D').path).toEqual([]);
      expect(smallGraph.bidirectionalDijkstra('A', 'Z_isolated').path).toEqual([]);
    });

    it('handles start === target', () => {
      const res = smallGraph.bidirectionalDijkstra('A', 'A');
      expect(res.path).toEqual(['A']);
      expect(res.totalDistanceKm).toBe(0);
    });

    it('finds optimal path on multi-hop network', () => {
      // Connect bidirectional edges
      smallGraph.addUndirectedEdge('A', 'C', 1.0, 20.0);
      smallGraph.addUndirectedEdge('C', 'B', 2.0, 20.0);
      smallGraph.addUndirectedEdge('B', 'D', 1.0, 20.0);

      const res = smallGraph.bidirectionalDijkstra('A', 'D', 'distance');
      expect(res.path).toEqual(['A', 'C', 'B', 'D']);
      expect(res.totalDistanceKm).toBe(4.0);
    });
  });

  describe('createGridCityGraph', () => {
    it('generates a grid road network with default options', () => {
      const defaultGrid = createGridCityGraph();
      expect(defaultGrid.nodes.size).toBe(400); // 20x20
    });

    it('routes across custom grid network accurately', () => {
      const grid = createGridCityGraph({ rows: 10, cols: 10, spacingKm: 0.2 });
      expect(grid.nodes.size).toBe(100);

      const dijkstraRes = grid.dijkstra('node_0_0', 'node_9_9');
      const aStarRes = grid.aStar('node_0_0', 'node_9_9');
      const biRes = grid.bidirectionalDijkstra('node_0_0', 'node_9_9');

      expect(dijkstraRes.path.length).toBeGreaterThan(10);
      expect(aStarRes.totalDistanceKm).toBeCloseTo(dijkstraRes.totalDistanceKm, 2);
      expect(biRes.totalDistanceKm).toBeCloseTo(dijkstraRes.totalDistanceKm, 2);
    });
  });
});
