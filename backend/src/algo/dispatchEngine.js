/**
 * @file dispatchEngine.js
 * @description Pure driver dispatch matching algorithm for Zipli Pro.
 * Matches orders to delivery partners using multi-objective scoring (distance, rating, workload).
 * Zero I/O or external dependencies.
 */

const { calculateHaversineDistance, isValidCoordinate } = require('./geo');

const DEFAULT_WEIGHTS = Object.freeze({
  distance: 0.65,
  rating: 0.25,
  load: 0.1,
});

const DEFAULT_OPTIONS = Object.freeze({
  maxSearchRadiusKm: 15.0,
  maxLoadPerDriver: 3,
  weights: DEFAULT_WEIGHTS,
});

/**
 * Extracts coordinate object safely without converting null to 0.
 * @param {Object} obj
 * @returns {{ lat: number, lng: number }|null}
 */
function extractCoordinate(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const rawLat =
    obj.lat !== undefined
      ? obj.lat
      : obj.current_lat !== undefined
        ? obj.current_lat
        : obj.pickup_lat;
  const rawLng =
    obj.lng !== undefined
      ? obj.lng
      : obj.current_lng !== undefined
        ? obj.current_lng
        : obj.pickup_lng;
  if (rawLat === null || rawLng === null || rawLat === undefined || rawLng === undefined) {
    return null;
  }
  return { lat: Number(rawLat), lng: Number(rawLng) };
}

/**
 * Normalizes and validates dispatch options.
 * @param {Object} [options]
 * @returns {typeof DEFAULT_OPTIONS}
 */
function resolveOptions(options = {}) {
  const w = options.weights || {};
  const distW = typeof w.distance === 'number' ? w.distance : DEFAULT_WEIGHTS.distance;
  const ratingW = typeof w.rating === 'number' ? w.rating : DEFAULT_WEIGHTS.rating;
  const loadW = typeof w.load === 'number' ? w.load : DEFAULT_WEIGHTS.load;
  const sumWeights = distW + ratingW + loadW;

  const normalizedWeights =
    sumWeights > 0
      ? {
          distance: distW / sumWeights,
          rating: ratingW / sumWeights,
          load: loadW / sumWeights,
        }
      : { ...DEFAULT_WEIGHTS };

  const radius =
    typeof options.maxSearchRadiusKm === 'number' && options.maxSearchRadiusKm > 0
      ? options.maxSearchRadiusKm
      : DEFAULT_OPTIONS.maxSearchRadiusKm;

  const load =
    typeof options.maxLoadPerDriver === 'number' && options.maxLoadPerDriver > 0
      ? Math.floor(options.maxLoadPerDriver)
      : DEFAULT_OPTIONS.maxLoadPerDriver;

  return {
    maxSearchRadiusKm: radius,
    maxLoadPerDriver: load,
    weights: normalizedWeights,
  };
}

/**
 * Computes a normalized penalty score for a driver relative to a pickup coordinate.
 * Lower score represents a better match.
 *
 * Scoring:
 * - Normalized distance penalty: min(distance / maxRadius, 1.0)
 * - Normalized rating penalty: (5.0 - rating) / 4.0 (assuming 1-5 scale)
 * - Workload penalty: min(activeCount / maxLoad, 1.0)
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {Object} driver
 * @param {{ lat: number, lng: number }} pickupCoord
 * @param {Object} [options]
 * @returns {{ driverId: number|string, distanceKm: number, score: number, eligible: boolean }}
 */
function scoreDriver(driver, pickupCoord, options = {}) {
  if (!driver || typeof driver !== 'object') {
    throw new Error('Invalid driver supplied to scoreDriver');
  }
  if (!isValidCoordinate(pickupCoord)) {
    throw new Error('Invalid pickupCoord supplied to scoreDriver');
  }

  const driverCoord = extractCoordinate(driver);

  if (!isValidCoordinate(driverCoord)) {
    return {
      driverId: driver.id,
      distanceKm: Infinity,
      score: Infinity,
      eligible: false,
    };
  }

  const opts = resolveOptions(options);
  const distanceKm = calculateHaversineDistance(driverCoord, pickupCoord);

  const isEligibleRadius = distanceKm <= opts.maxSearchRadiusKm;
  const activeOrders = Number(driver.active_orders_count || 0);
  const isEligibleLoad = activeOrders < opts.maxLoadPerDriver;
  const isIdle = !driver.status || driver.status === 'IDLE';

  const eligible = isEligibleRadius && (isIdle || isEligibleLoad);

  // Normalized distance component [0..1]
  const distNorm = Math.min(distanceKm / opts.maxSearchRadiusKm, 1.0);

  // Normalized rating component [0..1] (higher rating = lower penalty)
  const rawRating = Number(driver.rating !== undefined ? driver.rating : 5.0);
  const clampedRating = Math.max(1.0, Math.min(rawRating, 5.0));
  const ratingPenalty = (5.0 - clampedRating) / 4.0;

  // Workload penalty [0..1]
  const loadPenalty = Math.min(activeOrders / opts.maxLoadPerDriver, 1.0);

  const compositeScore =
    opts.weights.distance * distNorm +
    opts.weights.rating * ratingPenalty +
    opts.weights.load * loadPenalty;

  return {
    driverId: driver.id,
    driver,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    score: Math.round(compositeScore * 10000) / 10000,
    eligible,
  };
}

/**
 * Finds the single best available driver for an order pickup location.
 *
 * Time Complexity: O(N log N) where N is candidate driver count.
 * Space Complexity: O(N)
 *
 * @param {{ lat: number, lng: number }|Object} orderOrPickup
 * @param {Array<Object>} drivers
 * @param {Object} [options]
 * @returns {{ bestDriver: Object|null, rankedCandidates: Array<Object> }}
 */
function findBestDriver(orderOrPickup, drivers, options = {}) {
  if (!Array.isArray(drivers) || drivers.length === 0) {
    return { bestDriver: null, rankedCandidates: [] };
  }

  const pickupCoord = extractCoordinate(orderOrPickup);

  if (!isValidCoordinate(pickupCoord)) {
    throw new Error('Invalid order/pickup coordinates in findBestDriver');
  }

  const scored = [];
  for (const driver of drivers) {
    const res = scoreDriver(driver, pickupCoord, options);
    if (res.eligible) {
      scored.push(res);
    }
  }

  scored.sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm);

  return {
    bestDriver: scored.length > 0 ? scored[0].driver : null,
    rankedCandidates: scored,
  };
}

/**
 * Greedily assigns a batch of orders to the optimal available drivers.
 * Guarantees no driver is assigned past maximum capacity.
 *
 * Time Complexity: O(M ⋅ N ⋅ log(N)) where M is orders count, N is drivers count.
 * Space Complexity: O(M + N)
 *
 * @param {Array<Object>} orders
 * @param {Array<Object>} drivers
 * @param {Object} [options]
 * @returns {{ assignments: Array<{ orderId: any, driverId: any, distanceKm: number, score: number }>, unassignedOrders: Array<any> }}
 */
function batchDispatch(orders, drivers, options = {}) {
  if (!Array.isArray(orders) || !Array.isArray(drivers)) {
    throw new Error('orders and drivers must be arrays in batchDispatch');
  }

  const opts = resolveOptions(options);
  const assignments = [];
  const unassignedOrders = [];

  // Track driver remaining slots
  const driverSlotMap = new Map();
  for (const d of drivers) {
    const active = Number(d.active_orders_count || 0);
    const capacity = Math.max(0, opts.maxLoadPerDriver - active);
    driverSlotMap.set(d.id, capacity);
  }

  for (const order of orders) {
    const pickup = extractCoordinate(order);

    if (!isValidCoordinate(pickup)) {
      unassignedOrders.push(order);
      continue;
    }

    // Candidate drivers with remaining capacity
    const eligibleDrivers = drivers.filter((d) => (driverSlotMap.get(d.id) || 0) > 0);

    const { bestDriver, rankedCandidates } = findBestDriver(pickup, eligibleDrivers, opts);

    if (bestDriver && rankedCandidates.length > 0) {
      const topMatch = rankedCandidates[0];
      assignments.push({
        orderId: order.id,
        driverId: bestDriver.id,
        driverName: bestDriver.name,
        distanceKm: topMatch.distanceKm,
        score: topMatch.score,
      });

      // Decrement driver remaining capacity
      const rem = (driverSlotMap.get(bestDriver.id) || 1) - 1;
      driverSlotMap.set(bestDriver.id, rem);
    } else {
      unassignedOrders.push(order);
    }
  }

  return {
    assignments,
    unassignedOrders,
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  DEFAULT_OPTIONS,
  extractCoordinate,
  resolveOptions,
  scoreDriver,
  findBestDriver,
  batchDispatch,
};
