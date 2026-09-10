/**
 * @file clarkeWright.js
 * @description Pure Clarke-Wright Savings algorithm for multi-order vehicle routing (VRP-lite).
 * Groups nearby orders into efficient multi-drop rider trips with capacity, detour, and freshness limits.
 * Zero external dependencies.
 */

const { calculateHaversineDistance, isValidCoordinate } = require('./geo');

const DEFAULT_VRP_OPTIONS = Object.freeze({
  maxOrdersPerTrip: 3,
  maxDetourRatio: 1.75,
  maxTripDurationMin: 25.0,
  speedKmh: 22.0,
  dropServiceMin: 2.5, // Stop time at customer doorstep
});

/**
 * Runs Clarke-Wright savings heuristic to partition orders into optimized delivery batches.
 *
 * @param {Object} depotCoord - { lat, lng } of the dispatch store / hub
 * @param {Array<Object>} orders - Array of { id, lat, lng, itemsCount?, ... }
 * @param {Object} [options]
 * @returns {Array<{
 *   tripId: number,
 *   orders: Object[],
 *   orderIds: any[],
 *   totalDistanceKm: number,
 *   totalDurationMin: number,
 *   savingsKm: number
 * }>}
 */
function clarkeWrightVRP(depotCoord, orders, options = {}) {
  if (!isValidCoordinate(depotCoord) || !Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const validOrders = orders.filter((o) => o && isValidCoordinate(o));
  if (validOrders.length === 0) return [];

  const opts = { ...DEFAULT_VRP_OPTIONS, ...options };
  const numOrders = validOrders.length;

  if (numOrders === 1) {
    const singleDist = calculateHaversineDistance(depotCoord, validOrders[0]) * 2;
    const duration = (singleDist / opts.speedKmh) * 60 + opts.dropServiceMin;
    return [
      {
        tripId: 1,
        orders: [validOrders[0]],
        orderIds: [validOrders[0].id],
        totalDistanceKm: Math.round(singleDist * 1000) / 1000,
        totalDurationMin: Math.round(duration * 10) / 10,
        savingsKm: 0,
      },
    ];
  }

  // Depot distance to each order: d(0, i)
  const depotDist = validOrders.map((o) => calculateHaversineDistance(depotCoord, o));

  // Compute pairwise savings: S(i, j) = d(0, i) + d(0, j) - d(i, j)
  const savings = [];
  for (let i = 0; i < numOrders; i++) {
    for (let j = i + 1; j < numOrders; j++) {
      const distIJ = calculateHaversineDistance(validOrders[i], validOrders[j]);
      const s = Math.max(0, depotDist[i] + depotDist[j] - distIJ);
      savings.push({ i, j, s });
    }
  }

  // Sort savings descending
  savings.sort((a, b) => b.s - a.s);

  // Initially, each order is in its own individual trip [i]
  // trips map: orderIndex -> Array of order indices in trip
  const tripMap = new Map();
  for (let i = 0; i < numOrders; i++) {
    tripMap.set(i, [i]);
  }

  let totalSavingsAcc = 0;

  for (const { i, j, s } of savings) {
    const tripI = tripMap.get(i);
    const tripJ = tripMap.get(j);

    // If already in the same trip, skip
    if (tripI === tripJ) continue;

    // Check capacity constraint
    if (tripI.length + tripJ.length > opts.maxOrdersPerTrip) continue;

    // i and j must be at the endpoints of their respective trips to link
    const iAtEnd = tripI[0] === i || tripI[tripI.length - 1] === i;
    const jAtEnd = tripJ[0] === j || tripJ[tripJ.length - 1] === j;
    if (!iAtEnd || !jAtEnd) continue;

    // Orient seqA so that i is at the end, and seqB so that j is at the start
    const seqA = tripI[tripI.length - 1] === i ? [...tripI] : [...tripI].reverse();
    const seqB = tripJ[0] === j ? [...tripJ] : [...tripJ].reverse();
    const mergedTrip = [...seqA, ...seqB];

    // Calculate total merged trip distance: Depot -> o1 -> o2 ... -> on -> Depot
    let mergedDist = calculateHaversineDistance(depotCoord, validOrders[mergedTrip[0]]);
    for (let k = 0; k < mergedTrip.length - 1; k++) {
      mergedDist += calculateHaversineDistance(
        validOrders[mergedTrip[k]],
        validOrders[mergedTrip[k + 1]]
      );
    }
    mergedDist += calculateHaversineDistance(
      validOrders[mergedTrip[mergedTrip.length - 1]],
      depotCoord
    );

    // Detour ratio constraint check
    const maxDirectDist = Math.max(...mergedTrip.map((idx) => depotDist[idx])) * 2;
    if (maxDirectDist > 0 && mergedDist / maxDirectDist > opts.maxDetourRatio) {
      continue;
    }

    // Freshness / maximum duration constraint check
    const tripDuration =
      (mergedDist / opts.speedKmh) * 60 + mergedTrip.length * opts.dropServiceMin;
    if (tripDuration > opts.maxTripDurationMin) {
      continue;
    }

    // Merge is valid! Update tripMap pointers
    for (const idx of mergedTrip) {
      tripMap.set(idx, mergedTrip);
    }
    totalSavingsAcc += s;
  }

  // Collect unique trips
  const uniqueTripSets = new Set(tripMap.values());
  const finalizedTrips = [];
  let tripCounter = 1;

  for (const tripIndices of uniqueTripSets) {
    let tripDist = calculateHaversineDistance(depotCoord, validOrders[tripIndices[0]]);
    for (let k = 0; k < tripIndices.length - 1; k++) {
      tripDist += calculateHaversineDistance(
        validOrders[tripIndices[k]],
        validOrders[tripIndices[k + 1]]
      );
    }
    tripDist += calculateHaversineDistance(
      validOrders[tripIndices[tripIndices.length - 1]],
      depotCoord
    );

    const tripDuration = (tripDist / opts.speedKmh) * 60 + tripIndices.length * opts.dropServiceMin;

    finalizedTrips.push({
      tripId: tripCounter++,
      orders: tripIndices.map((idx) => validOrders[idx]),
      orderIds: tripIndices.map((idx) => validOrders[idx].id),
      totalDistanceKm: Math.round(tripDist * 1000) / 1000,
      totalDurationMin: Math.round(tripDuration * 10) / 10,
      savingsKm: Math.round(totalSavingsAcc * 1000) / 1000,
    });
  }

  return finalizedTrips;
}

module.exports = {
  DEFAULT_VRP_OPTIONS,
  clarkeWrightVRP,
};
