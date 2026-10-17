/**
 * @file kdTree.test.js
 * @description Unit tests for pure 2D Spatial K-d Tree in kdTree.js
 */

const { KDNode, KDTree } = require('../../src/algo/kdTree');

describe('kdTree.js pure 2D Spatial Tree', () => {
  const points = [
    { id: 'Koramangala', lat: 12.93524, lng: 77.62448 },
    { id: 'Indiranagar', lat: 12.978369, lng: 77.640836 },
    { id: 'HSR Layout', lat: 12.9121, lng: 77.6446 },
    { id: 'Whitefield', lat: 12.9698, lng: 77.7499 },
    { id: 'MG Road', lat: 12.9756, lng: 77.6066 },
    { id: 'Electronic City', lat: 12.8399, lng: 77.677 },
  ];

  it('instantiates KDNode with default axis', () => {
    const node = new KDNode({ id: 'test', lat: 10, lng: 20 });
    expect(node.axis).toBe(0);
    expect(node.point.id).toBe('test');
  });

  it('handles empty or invalid points initialization gracefully', () => {
    const emptyTree = new KDTree([]);
    expect(emptyTree.size()).toBe(0);
    expect(emptyTree.findNearest({ lat: 12.9, lng: 77.6 }).node).toBeNull();
    expect(emptyTree.findWithinRadius({ lat: 12.9, lng: 77.6 }, 5)).toEqual([]);

    const nullTree = new KDTree();
    expect(nullTree.size()).toBe(0);
  });

  it('builds tree and finds the exact nearest point in O(log N)', () => {
    const tree = new KDTree(points);
    expect(tree.size()).toBe(6);

    // Coordinate right next to Koramangala
    const queryNearKoramangala = { lat: 12.936, lng: 77.625 };
    const result = tree.findNearest(queryNearKoramangala);

    expect(result.node).toBeDefined();
    expect(result.node.id).toBe('Koramangala');
    expect(result.distanceKm).toBeLessThan(0.2);

    // Coordinate near Indiranagar
    const queryNearIndiranagar = { lat: 12.979, lng: 77.641 };
    const resIndira = tree.findNearest(queryNearIndiranagar);
    expect(resIndira.node.id).toBe('Indiranagar');
    expect(resIndira.distanceKm).toBeLessThan(0.2);
  });

  it('finds points within given radius sorted by distance', () => {
    const tree = new KDTree(points);

    // 5 km around Koramangala should find Koramangala, HSR Layout, MG Road
    const nearby = tree.findWithinRadius({ lat: 12.93524, lng: 77.62448 }, 6.0);
    expect(nearby.length).toBeGreaterThanOrEqual(2);
    expect(nearby[0].node.id).toBe('Koramangala');
    expect(nearby[0].distanceKm).toBe(0);

    // Verify sorted by distance ascending
    for (let i = 0; i < nearby.length - 1; i++) {
      expect(nearby[i].distanceKm).toBeLessThanOrEqual(nearby[i + 1].distanceKm);
    }
  });

  it('handles invalid arguments safely', () => {
    const tree = new KDTree(points);
    expect(tree.findNearest(null).node).toBeNull();
    expect(tree.findWithinRadius(null, 5)).toEqual([]);
    expect(tree.findWithinRadius({ lat: 12.9, lng: 77.6 }, -1)).toEqual([]);
    expect(tree.findWithinRadius({ lat: 12.9, lng: 77.6 }, 'not-a-number')).toEqual([]);
  });
});
