/**
 * @file kdTree.js
 * @description Pure 2D Spatial K-d Tree for fast O(log N) nearest-neighbor snapping of
 * arbitrary geographic coordinates to city graph nodes.
 * Zero external dependencies.
 */

const { calculateHaversineDistance, isValidCoordinate } = require('./geo');

class KDNode {
  constructor(point, axis = 0) {
    this.point = point; // { id, lat, lng, ... }
    this.axis = axis; // 0 for lat, 1 for lng
    this.left = null;
    this.right = null;
  }
}

class KDTree {
  /**
   * Builds a balanced 2D spatial tree from an array of coordinate points.
   *
   * @param {Array<{ id: any, lat: number, lng: number }>} points
   */
  constructor(points = []) {
    this.root = this._build(points.filter(isValidCoordinate), 0);
    this._size = points.filter(isValidCoordinate).length;
  }

  /**
   * Recursively constructs balanced KDTree.
   * Time Complexity: O(N log N)
   *
   * @param {Array<Object>} points
   * @param {number} depth
   * @returns {KDNode|null}
   * @private
   */
  _build(points, depth) {
    if (!points || points.length === 0) return null;

    const axis = depth % 2;
    const key = axis === 0 ? 'lat' : 'lng';

    points.sort((a, b) => Number(a[key]) - Number(b[key]));
    const median = Math.floor(points.length / 2);

    const node = new KDNode(points[median], axis);
    node.left = this._build(points.slice(0, median), depth + 1);
    node.right = this._build(points.slice(median + 1), depth + 1);

    return node;
  }

  /**
   * Total points stored in tree.
   * @returns {number}
   */
  size() {
    return this._size;
  }

  /**
   * Finds the single nearest node in the tree to a target coordinate.
   * Average Time Complexity: O(log N)
   *
   * @param {{ lat: number, lng: number }} target
   * @returns {{ node: Object|null, distanceKm: number }}
   */
  findNearest(target) {
    if (!isValidCoordinate(target) || !this.root) {
      return { node: null, distanceKm: Infinity };
    }

    let bestNode = null;
    let bestDistSq = Infinity;

    const targetCoord = { lat: Number(target.lat), lng: Number(target.lng) };

    const search = (node) => {
      if (!node) return;

      const dLat = Number(node.point.lat) - targetCoord.lat;
      const dLng = Number(node.point.lng) - targetCoord.lng;
      const distSq = dLat * dLat + dLng * dLng;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNode = node.point;
      }

      const axis = node.axis;
      const key = axis === 0 ? 'lat' : 'lng';
      const delta = targetCoord[key] - Number(node.point[key]);
      const deltaSq = delta * delta;

      const nearChild = delta < 0 ? node.left : node.right;
      const farChild = delta < 0 ? node.right : node.left;

      search(nearChild);

      // Only search far branch if the splitting hyperplane is closer than current best distance
      if (deltaSq < bestDistSq) {
        search(farChild);
      }
    };

    search(this.root);

    const distanceKm = bestNode ? calculateHaversineDistance(targetCoord, bestNode) : Infinity;

    return {
      node: bestNode,
      distanceKm,
    };
  }

  /**
   * Searches for all nodes within a given radius in kilometers.
   *
   * @param {{ lat: number, lng: number }} center
   * @param {number} radiusKm
   * @returns {Array<{ node: Object, distanceKm: number }>}
   */
  findWithinRadius(center, radiusKm) {
    if (!isValidCoordinate(center) || typeof radiusKm !== 'number' || radiusKm < 0 || !this.root) {
      return [];
    }

    const results = [];
    const targetCoord = { lat: Number(center.lat), lng: Number(center.lng) };

    // Approximation of radius in degrees for fast bounding box pruning
    // ~111 km per latitude degree
    const degDelta = radiusKm / 111.0;
    const degDeltaSq = degDelta * degDelta * 1.5;

    const search = (node) => {
      if (!node) return;

      const dLat = Number(node.point.lat) - targetCoord.lat;
      const dLng = Number(node.point.lng) - targetCoord.lng;
      const distSq = dLat * dLat + dLng * dLng;

      if (distSq <= degDeltaSq) {
        const distKm = calculateHaversineDistance(targetCoord, node.point);
        if (distKm <= radiusKm) {
          results.push({ node: node.point, distanceKm: distKm });
        }
      }

      const axis = node.axis;
      const key = axis === 0 ? 'lat' : 'lng';
      const delta = targetCoord[key] - Number(node.point[key]);

      const nearChild = delta < 0 ? node.left : node.right;
      const farChild = delta < 0 ? node.right : node.left;

      search(nearChild);

      if (Math.abs(delta) <= degDelta) {
        search(farChild);
      }
    };

    search(this.root);
    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return results;
  }
}

module.exports = {
  KDNode,
  KDTree,
};
