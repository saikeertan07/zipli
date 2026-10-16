/**
 * @file geo.test.js
 * @description Unit tests for pure spatial math algorithms in geo.js
 */

const {
  EARTH_RADIUS_KM,
  isValidCoordinate,
  calculateHaversineDistance,
  calculateBearing,
  getBoundingBox,
  isWithinRadius,
  interpolatePoints,
  calculateDistanceMatrix,
} = require('../../src/algo/geo');

describe('geo.js pure spatial algorithms', () => {
  const bangaloreCenter = { lat: 12.971598, lng: 77.594566 };
  const koramangalaStore = { lat: 12.93524, lng: 77.62448 };
  const indiranagarHub = { lat: 12.978369, lng: 77.640836 };

  describe('isValidCoordinate', () => {
    it('returns true for valid coordinate pairs', () => {
      expect(isValidCoordinate({ lat: 0, lng: 0 })).toBe(true);
      expect(isValidCoordinate({ lat: -90, lng: 180 })).toBe(true);
      expect(isValidCoordinate({ lat: 90, lng: -180 })).toBe(true);
      expect(isValidCoordinate({ lat: 12.97, lng: 77.59 })).toBe(true);
      expect(isValidCoordinate({ lat: '12.97', lng: '77.59' })).toBe(true);
    });

    it('returns false for invalid inputs or out of range coordinates', () => {
      expect(isValidCoordinate(null)).toBe(false);
      expect(isValidCoordinate(undefined)).toBe(false);
      expect(isValidCoordinate('12,77')).toBe(false);
      expect(isValidCoordinate({ lat: 91, lng: 0 })).toBe(false);
      expect(isValidCoordinate({ lat: -91, lng: 0 })).toBe(false);
      expect(isValidCoordinate({ lat: 0, lng: 181 })).toBe(false);
      expect(isValidCoordinate({ lat: 0, lng: -181 })).toBe(false);
      expect(isValidCoordinate({ lat: NaN, lng: 0 })).toBe(false);
      expect(isValidCoordinate({ lat: 0, lng: Infinity })).toBe(false);
    });
  });

  describe('calculateHaversineDistance', () => {
    it('returns 0 for identical coordinates', () => {
      const dist = calculateHaversineDistance(bangaloreCenter, bangaloreCenter);
      expect(dist).toBe(0);
    });

    it('calculates known distance between Bangalore center and Koramangala (~5.2 km)', () => {
      const dist = calculateHaversineDistance(bangaloreCenter, koramangalaStore);
      expect(dist).toBeGreaterThan(5.0);
      expect(dist).toBeLessThan(5.5);
    });

    it('calculates distance across equator / poles properly', () => {
      const northPole = { lat: 90, lng: 0 };
      const southPole = { lat: -90, lng: 0 };
      const poleDist = calculateHaversineDistance(northPole, southPole);
      expect(Math.abs(poleDist - Math.PI * EARTH_RADIUS_KM)).toBeLessThan(1.0);
    });

    it('throws on invalid coordinates', () => {
      expect(() => calculateHaversineDistance(null, bangaloreCenter)).toThrow(
        'Invalid coordinates'
      );
      expect(() => calculateHaversineDistance(bangaloreCenter, { lat: 100, lng: 0 })).toThrow(
        'Invalid coordinates'
      );
    });
  });

  describe('calculateBearing', () => {
    it('returns 0 for identical points', () => {
      expect(calculateBearing(bangaloreCenter, bangaloreCenter)).toBe(0);
    });

    it('calculates due north bearing (~0 / 360)', () => {
      const p1 = { lat: 10, lng: 50 };
      const p2 = { lat: 20, lng: 50 };
      expect(calculateBearing(p1, p2)).toBe(0);
    });

    it('calculates due east bearing (~90)', () => {
      const p1 = { lat: 0, lng: 10 };
      const p2 = { lat: 0, lng: 20 };
      expect(Math.round(calculateBearing(p1, p2))).toBe(90);
    });

    it('calculates due south bearing (~180)', () => {
      const p1 = { lat: 20, lng: 50 };
      const p2 = { lat: 10, lng: 50 };
      expect(Math.round(calculateBearing(p1, p2))).toBe(180);
    });

    it('calculates due west bearing (~270)', () => {
      const p1 = { lat: 0, lng: 20 };
      const p2 = { lat: 0, lng: 10 };
      expect(Math.round(calculateBearing(p1, p2))).toBe(270);
    });

    it('throws for invalid coordinates', () => {
      expect(() => calculateBearing(null, bangaloreCenter)).toThrow('Invalid coordinates');
    });
  });

  describe('getBoundingBox', () => {
    it('generates bounding box enclosing the radius', () => {
      const box = getBoundingBox(bangaloreCenter, 5.0);
      expect(box.minLat).toBeLessThan(bangaloreCenter.lat);
      expect(box.maxLat).toBeGreaterThan(bangaloreCenter.lat);
      expect(box.minLng).toBeLessThan(bangaloreCenter.lng);
      expect(box.maxLng).toBeGreaterThan(bangaloreCenter.lng);
    });

    it('handles near antimeridian boundary wrapping', () => {
      const edgePoint = { lat: 0, lng: 179.99 };
      const box = getBoundingBox(edgePoint, 50.0);
      expect(box.minLng).toBeDefined();
      expect(box.maxLng).toBeDefined();
    });

    it('handles western hemisphere antimeridian wrapping', () => {
      const edgePoint = { lat: 0, lng: -179.99 };
      const box = getBoundingBox(edgePoint, 50.0);
      expect(box.minLng).toBeDefined();
      expect(box.maxLng).toBeDefined();
    });

    it('throws on invalid inputs', () => {
      expect(() => getBoundingBox(null, 5)).toThrow('Invalid center or radius');
      expect(() => getBoundingBox(bangaloreCenter, -1)).toThrow('Invalid center or radius');
    });
  });

  describe('isWithinRadius', () => {
    it('returns true when inside radius', () => {
      expect(isWithinRadius(bangaloreCenter, koramangalaStore, 10.0)).toBe(true);
    });

    it('returns false when outside radius', () => {
      expect(isWithinRadius(bangaloreCenter, koramangalaStore, 2.0)).toBe(false);
    });

    it('returns false for invalid arguments', () => {
      expect(isWithinRadius(null, koramangalaStore, 10)).toBe(false);
      expect(isWithinRadius(bangaloreCenter, null, 10)).toBe(false);
      expect(isWithinRadius(bangaloreCenter, koramangalaStore, -5)).toBe(false);
    });
  });

  describe('interpolatePoints', () => {
    it('interpolates points between origin and destination', () => {
      const points = interpolatePoints(koramangalaStore, indiranagarHub, 5);
      expect(points).toHaveLength(5);
      expect(points[0].lat).toBeCloseTo(koramangalaStore.lat, 4);
      expect(points[4].lat).toBeCloseTo(indiranagarHub.lat, 4);
      expect(points[0].progress).toBe(0);
      expect(points[4].progress).toBe(1);
    });

    it('handles start === end', () => {
      const points = interpolatePoints(koramangalaStore, koramangalaStore, 4);
      expect(points).toHaveLength(4);
      expect(points[0].progress).toBe(0);
      expect(points[3].progress).toBe(1);
      expect(points[0].lat).toBe(koramangalaStore.lat);
    });

    it('enforces minimum 2 steps', () => {
      const points = interpolatePoints(koramangalaStore, indiranagarHub, 1);
      expect(points.length).toBe(2);
    });

    it('throws on invalid coordinates', () => {
      expect(() => interpolatePoints(null, indiranagarHub)).toThrow(
        'Invalid start or end coordinate'
      );
    });
  });

  describe('calculateDistanceMatrix', () => {
    it('computes M x N distance matrix', () => {
      const origins = [koramangalaStore, indiranagarHub];
      const destinations = [bangaloreCenter];
      const matrix = calculateDistanceMatrix(origins, destinations);

      expect(matrix).toHaveLength(2);
      expect(matrix[0]).toHaveLength(1);
      expect(matrix[1]).toHaveLength(1);
      expect(matrix[0][0]).toBeGreaterThan(0);
      expect(matrix[1][0]).toBeGreaterThan(0);
    });

    it('throws if origins or destinations are not arrays', () => {
      expect(() => calculateDistanceMatrix(null, [])).toThrow('must be arrays');
      expect(() => calculateDistanceMatrix([], null)).toThrow('must be arrays');
    });
  });
});
