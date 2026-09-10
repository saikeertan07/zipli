/**
 * @file driverSimulation.js
 * @description Pure driver route generator and step-by-step route simulator.
 * Generates realistic interpolated GPS tracking positions along dark store to customer delivery routes.
 * Zero external dependencies.
 */

const { calculateHaversineDistance, interpolatePoints, isValidCoordinate } = require('./geo');

/**
 * Generates a full path of GPS coordinates from origin to destination through optional waypoints.
 *
 * @param {Object} params
 * @param {{ lat: number, lng: number }} params.origin - Starting coordinate (store or driver start)
 * @param {{ lat: number, lng: number }} params.destination - Customer drop-off coordinate
 * @param {Array<{ lat: number, lng: number }>} [params.waypoints=[]] - Optional intermediate turns
 * @param {number} [params.totalSteps=20] - Total step count along route
 * @param {number} [params.baseSpeedKmh=24.0] - Simulated cruise speed
 * @returns {Array<{
 *   stepIndex: number,
 *   lat: number,
 *   lng: number,
 *   bearing: number,
 *   speedKmh: number,
 *   distanceRemainingKm: number,
 *   progressPercent: number,
 *   isArrived: boolean
 * }>}
 */
function generateRoute({
  origin,
  destination,
  waypoints = [],
  totalSteps = 20,
  baseSpeedKmh = 24.0,
}) {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    throw new Error('Valid origin and destination coordinates are required for generateRoute');
  }

  const steps = Math.max(2, Math.floor(totalSteps));
  const fullWaypoints = [origin, ...waypoints.filter(isValidCoordinate), destination];

  // Calculate leg distances
  const legs = [];
  let totalRouteDistanceKm = 0;

  for (let i = 0; i < fullWaypoints.length - 1; i++) {
    const legDist = calculateHaversineDistance(fullWaypoints[i], fullWaypoints[i + 1]);
    legs.push({
      start: fullWaypoints[i],
      end: fullWaypoints[i + 1],
      distanceKm: legDist,
    });
    totalRouteDistanceKm += legDist;
  }

  if (totalRouteDistanceKm === 0) {
    return Array.from({ length: steps }, (_, idx) => ({
      stepIndex: idx,
      lat: Number(origin.lat),
      lng: Number(origin.lng),
      bearing: 0,
      speedKmh: 0,
      distanceRemainingKm: 0,
      progressPercent: 100,
      isArrived: true,
    }));
  }

  // Allocate steps proportionally across legs
  const points = [];
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx];
    const legRatio = leg.distanceKm / totalRouteDistanceKm;
    const legSteps = Math.max(2, Math.round(legRatio * steps));

    const interpolated = interpolatePoints(leg.start, leg.end, legSteps);

    // Omit first point of subsequent legs to avoid duplicate overlapping steps
    const startIndex = legIdx === 0 ? 0 : 1;
    for (let k = startIndex; k < interpolated.length; k++) {
      points.push(interpolated[k]);
    }
  }

  // Build finalized enriched route steps
  const totalPoints = points.length;
  const result = [];

  for (let idx = 0; idx < totalPoints; idx++) {
    const pt = points[idx];
    const isLast = idx === totalPoints - 1;
    const remainingKm = calculateHaversineDistance(pt, destination);
    const progress = Math.min(100, Math.round((idx / (totalPoints - 1)) * 1000) / 10);

    // Varied urban speed simulation: decelerates near destination
    let speed = baseSpeedKmh;
    if (idx === 0) {
      speed = Math.min(12, baseSpeedKmh * 0.5);
    } else if (isLast) {
      speed = 0;
    } else if (remainingKm < 0.2) {
      speed = Math.min(8, baseSpeedKmh * 0.35);
    }

    result.push({
      stepIndex: idx,
      lat: pt.lat,
      lng: pt.lng,
      bearing: pt.bearing,
      speedKmh: Math.round(speed * 10) / 10,
      distanceRemainingKm: Math.round(remainingKm * 1000) / 1000,
      progressPercent: progress,
      isArrived: isLast,
    });
  }

  return result;
}

/**
 * In-memory step controller for executing route simulation.
 *
 * @param {Array<Object>} routeSteps
 * @returns {{
 *   getCurrentStep: () => Object,
 *   step: () => Object|null,
 *   isComplete: () => boolean,
 *   reset: () => void,
 *   getProgress: () => number
 * }}
 */
function createRouteSimulator(routeSteps) {
  if (!Array.isArray(routeSteps) || routeSteps.length === 0) {
    throw new Error('routeSteps must be a non-empty array');
  }

  let currentIndex = 0;

  return {
    getCurrentStep() {
      return routeSteps[currentIndex];
    },
    step() {
      if (currentIndex < routeSteps.length - 1) {
        currentIndex++;
        return routeSteps[currentIndex];
      }
      return routeSteps[currentIndex];
    },
    isComplete() {
      return currentIndex >= routeSteps.length - 1;
    },
    reset() {
      currentIndex = 0;
    },
    getProgress() {
      return routeSteps[currentIndex].progressPercent;
    },
  };
}

module.exports = {
  generateRoute,
  createRouteSimulator,
};
