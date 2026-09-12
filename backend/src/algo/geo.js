/**
 * @file geo.js
 * @description Pure spatial algorithms: Haversine distance, bearing, bounding box,
 * polyline interpolation, and distance matrix. Zero external dependencies.
 */

// Mean Earth radius in kilometers (IUGG standard recommendation)
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Converts degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Validates a coordinate pair { lat, lng }.
 * @param {{ lat: number, lng: number }} coord
 * @returns {boolean}
 */
function isValidCoordinate(coord) {
  if (!coord || typeof coord !== 'object') return false;
  const lat = Number(coord.lat);
  const lng = Number(coord.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula.
 *
 * Formula:
 *   a = sin²(Δφ/2) + cos(φ₁) ⋅ cos(φ₂) ⋅ sin²(Δλ/2)
 *   c = 2 ⋅ atan2(√a, √(1-a))
 *   d = R ⋅ c
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {{ lat: number, lng: number }} coord1
 * @param {{ lat: number, lng: number }} coord2
 * @returns {number} Distance in kilometers, rounded to 4 decimal places.
 */
function calculateHaversineDistance(coord1, coord2) {
  if (!isValidCoordinate(coord1) || !isValidCoordinate(coord2)) {
    throw new Error('Invalid coordinates supplied to calculateHaversineDistance');
  }

  const lat1 = Number(coord1.lat);
  const lng1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lng2 = Number(coord2.lng);

  if (lat1 === lat2 && lng1 === lng2) {
    return 0;
  }

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lng2 - lng1);

  const sinDeltaPhi2 = Math.sin(deltaPhi / 2);
  const sinDeltaLambda2 = Math.sin(deltaLambda / 2);

  const a =
    sinDeltaPhi2 * sinDeltaPhi2 +
    Math.cos(phi1) * Math.cos(phi2) * sinDeltaLambda2 * sinDeltaLambda2;

  // Clamp a between 0 and 1 to safeguard against floating-point inaccuracies
  const clampedA = Math.min(Math.max(a, 0), 1);
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  const distanceKm = EARTH_RADIUS_KM * c;
  return Math.round(distanceKm * 10000) / 10000;
}

/**
 * Calculates initial forward azimuth (compass bearing) from point 1 to point 2.
 * Output is normalized to [0, 360) degrees clockwise from true north.
 *
 * Formula:
 *   θ = atan2(sin(Δλ) ⋅ cos(φ₂), cos(φ₁) ⋅ sin(φ₂) - sin(φ₁) ⋅ cos(φ₂) ⋅ cos(Δλ))
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {{ lat: number, lng: number }} coord1
 * @param {{ lat: number, lng: number }} coord2
 * @returns {number} Bearing in degrees [0, 360) rounded to 2 decimal places.
 */
function calculateBearing(coord1, coord2) {
  if (!isValidCoordinate(coord1) || !isValidCoordinate(coord2)) {
    throw new Error('Invalid coordinates supplied to calculateBearing');
  }

  const lat1 = Number(coord1.lat);
  const lng1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lng2 = Number(coord2.lng);

  if (lat1 === lat2 && lng1 === lng2) {
    return 0;
  }

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let bearing = toDegrees(Math.atan2(y, x));
  bearing = (bearing + 360) % 360;

  return Math.round(bearing * 100) / 100;
}

/**
 * Computes bounding box latitude and longitude bounds for a given center coordinate and radius.
 * Useful for spatial indexing and database range queries.
 *
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusKm
 * @returns {{ minLat: number, maxLat: number, minLng: number, maxLng: number }}
 */
function getBoundingBox(center, radiusKm) {
  if (!isValidCoordinate(center) || typeof radiusKm !== 'number' || radiusKm <= 0) {
    throw new Error('Invalid center or radius supplied to getBoundingBox');
  }

  const lat = Number(center.lat);
  const lng = Number(center.lng);

  // Angular radius in radians
  const radDist = radiusKm / EARTH_RADIUS_KM;

  const minLat = Math.max(-90, lat - toDegrees(radDist));
  const maxLat = Math.min(90, lat + toDegrees(radDist));

  // Longitude delta adjusts for latitude convergence
  const deltaLng = toDegrees(Math.asin(Math.sin(radDist) / Math.cos(toRadians(lat))));
  let minLng = lng - deltaLng;
  let maxLng = lng + deltaLng;

  // Wrap around international date line if exceeded
  if (minLng < -180) minLng += 360;
  if (maxLng > 180) maxLng -= 360;

  return {
    minLat: Math.round(minLat * 1000000) / 1000000,
    maxLat: Math.round(maxLat * 1000000) / 1000000,
    minLng: Math.round(minLng * 1000000) / 1000000,
    maxLng: Math.round(maxLng * 1000000) / 1000000,
  };
}

/**
 * Checks whether a given point falls within a radius (km) of a center point.
 *
 * @param {{ lat: number, lng: number }} center
 * @param {{ lat: number, lng: number }} point
 * @param {number} radiusKm
 * @returns {boolean}
 */
function isWithinRadius(center, point, radiusKm) {
  if (
    !isValidCoordinate(center) ||
    !isValidCoordinate(point) ||
    typeof radiusKm !== 'number' ||
    radiusKm < 0
  ) {
    return false;
  }
  const distance = calculateHaversineDistance(center, point);
  return distance <= radiusKm;
}

/**
 * Generates N interpolated coordinates along a great-circle path from start to end.
 *
 * Time Complexity: O(steps)
 * Space Complexity: O(steps)
 *
 * @param {{ lat: number, lng: number }} start
 * @param {{ lat: number, lng: number }} end
 * @param {number} [steps=10] - Number of points to generate (minimum 2: start and end).
 * @returns {Array<{ lat: number, lng: number, progress: number, bearing: number }>}
 */
function interpolatePoints(start, end, steps = 10) {
  if (!isValidCoordinate(start) || !isValidCoordinate(end)) {
    throw new Error('Invalid start or end coordinate in interpolatePoints');
  }

  const numSteps = Math.max(2, Math.floor(steps));
  const lat1 = Number(start.lat);
  const lng1 = Number(start.lng);
  const lat2 = Number(end.lat);
  const lng2 = Number(end.lng);

  const totalDistance = calculateHaversineDistance(start, end);
  const bearing = calculateBearing(start, end);

  if (totalDistance === 0) {
    return Array.from({ length: numSteps }, (_, i) => ({
      lat: lat1,
      lng: lng1,
      progress: Math.round((i / (numSteps - 1)) * 1000) / 1000,
      bearing: 0,
    }));
  }

  const phi1 = toRadians(lat1);
  const lambda1 = toRadians(lng1);
  const phi2 = toRadians(lat2);
  const lambda2 = toRadians(lng2);

  // Angular distance in radians
  const delta = totalDistance / EARTH_RADIUS_KM;
  const sinDelta = Math.sin(delta);

  const points = [];

  for (let i = 0; i < numSteps; i++) {
    const f = i / (numSteps - 1); // Fraction of distance [0..1]

    let lat;
    let lng;

    if (f === 0) {
      lat = lat1;
      lng = lng1;
    } else if (f === 1) {
      lat = lat2;
      lng = lng2;
    } else {
      // Slerp formula on unit sphere
      const a = Math.sin((1 - f) * delta) / sinDelta;
      const b = Math.sin(f * delta) / sinDelta;

      const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2);
      const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2);
      const z = a * Math.sin(phi1) + b * Math.sin(phi2);

      lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
      lng = toDegrees(Math.atan2(y, x));
    }

    points.push({
      lat: Math.round(lat * 1000000) / 1000000,
      lng: Math.round(lng * 1000000) / 1000000,
      progress: Math.round(f * 1000) / 1000,
      bearing,
    });
  }

  return points;
}

/**
 * Computes an M x N distance matrix between origin locations and destination locations.
 *
 * @param {Array<{ lat: number, lng: number, id?: any }>} origins
 * @param {Array<{ lat: number, lng: number, id?: any }>} destinations
 * @returns {Array<Array<number>>} Matrix of distances in kilometers
 */
function calculateDistanceMatrix(origins, destinations) {
  if (!Array.isArray(origins) || !Array.isArray(destinations)) {
    throw new Error('Origins and destinations must be arrays in calculateDistanceMatrix');
  }

  return origins.map((origin) =>
    destinations.map((destination) => calculateHaversineDistance(origin, destination))
  );
}

module.exports = {
  EARTH_RADIUS_KM,
  isValidCoordinate,
  calculateHaversineDistance,
  calculateBearing,
  getBoundingBox,
  isWithinRadius,
  interpolatePoints,
  calculateDistanceMatrix,
};
