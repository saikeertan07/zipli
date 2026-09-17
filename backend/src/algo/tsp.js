/**
 * @file tsp.js
 * @description Travelling Salesperson Problem (TSP) solvers for delivery stop sequencing:
 * 1. Exact Dynamic Programming (Held-Karp O(n^2 2^n)) for n <= 10
 * 2. Nearest Neighbor heuristic with 2-Opt local search improvement for arbitrary n.
 * Zero external dependencies.
 */

const { calculateHaversineDistance, isValidCoordinate } = require('./geo');

/**
 * Computes pairwise distance matrix between array of coordinates.
 * @param {Array<{ lat: number, lng: number }>} locations
 * @returns {number[][]}
 */
function buildDistanceMatrix(locations) {
  const n = locations.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        matrix[i][j] = calculateHaversineDistance(locations[i], locations[j]);
      }
    }
  }
  return matrix;
}

/**
 * Solves TSP using Nearest-Neighbor greedy heuristic followed by 2-Opt local search.
 *
 * @param {number[][]} distMatrix
 * @returns {{ tour: number[], totalDistance: number }}
 */
function solveTSP2Opt(distMatrix) {
  const n = distMatrix.length;
  if (n <= 1) return { tour: [0], totalDistance: 0 };
  if (n === 2) {
    const dist = distMatrix[0][1] + distMatrix[1][0];
    return { tour: [0, 1, 0], totalDistance: Math.round(dist * 1000) / 1000 };
  }

  // 1. Initial Nearest Neighbor tour starting at depot (0)
  const visited = new Uint8Array(n);
  const tour = [0];
  visited[0] = 1;

  for (let step = 1; step < n; step++) {
    const last = tour[tour.length - 1];
    let nearest = -1;
    let minDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (!visited[j] && distMatrix[last][j] < minDist) {
        minDist = distMatrix[last][j];
        nearest = j;
      }
    }

    if (nearest !== -1) {
      visited[nearest] = 1;
      tour.push(nearest);
    }
  }
  tour.push(0); // Return to depot

  // 2. 2-Opt local search improvement
  let improved = true;
  let iterations = 0;
  const maxIterations = 200;

  const calculateTourLength = (t) => {
    let len = 0;
    for (let k = 0; k < t.length - 1; k++) {
      len += distMatrix[t[k]][t[k + 1]];
    }
    return len;
  };

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const u1 = tour[i - 1];
        const v1 = tour[i];
        const u2 = tour[k];
        const v2 = tour[k + 1];

        // Delta evaluation: change in distance if segment [i..k] is reversed
        const currentDist = distMatrix[u1][v1] + distMatrix[u2][v2];
        const newDist = distMatrix[u1][u2] + distMatrix[v1][v2];

        if (newDist + 1e-9 < currentDist) {
          // Reverse segment between i and k
          let left = i;
          let right = k;
          while (left < right) {
            const temp = tour[left];
            tour[left] = tour[right];
            tour[right] = temp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }

  const finalDistance = calculateTourLength(tour);
  return {
    tour,
    totalDistance: Math.round(finalDistance * 1000) / 1000,
  };
}

/**
 * Solves TSP exactly using Held-Karp Dynamic Programming with bitmask states.
 * Guarantees globally optimal minimum tour distance for n <= 16.
 * Time Complexity: O(n^2 2^n)
 *
 * @param {number[][]} distMatrix
 * @returns {{ tour: number[], totalDistance: number }}
 */
function solveTSPHeldKarp(distMatrix) {
  const n = distMatrix.length;
  if (n <= 1) return { tour: [0], totalDistance: 0 };
  if (n === 2) {
    const dist = distMatrix[0][1] + distMatrix[1][0];
    return { tour: [0, 1, 0], totalDistance: Math.round(dist * 1000) / 1000 };
  }

  const numSubsets = 1 << n;
  // memo[mask][j] stores { cost, prev }
  const memoCost = Array.from({ length: numSubsets }, () => new Float64Array(n).fill(Infinity));
  const memoPrev = Array.from({ length: numSubsets }, () => new Int8Array(n).fill(-1));

  // Base cases: paths from depot 0 to j
  for (let j = 1; j < n; j++) {
    const mask = (1 << 0) | (1 << j);
    memoCost[mask][j] = distMatrix[0][j];
    memoPrev[mask][j] = 0;
  }

  // Iterate over subset sizes s from 3 to n
  for (let s = 3; s <= n; s++) {
    for (let mask = 0; mask < numSubsets; mask++) {
      // Must contain depot 0
      if ((mask & 1) === 0) continue;

      // Count set bits
      let bitCount = 0;
      for (let b = 0; b < n; b++) {
        if ((mask & (1 << b)) !== 0) bitCount++;
      }
      if (bitCount !== s) continue;

      for (let j = 1; j < n; j++) {
        if ((mask & (1 << j)) === 0) continue;
        const prevMask = mask ^ (1 << j);

        let minCost = Infinity;
        let bestK = -1;

        for (let k = 1; k < n; k++) {
          if (k === j || (prevMask & (1 << k)) === 0) continue;
          const cost = memoCost[prevMask][k] + distMatrix[k][j];
          if (cost < minCost) {
            minCost = cost;
            bestK = k;
          }
        }

        memoCost[mask][j] = minCost;
        memoPrev[mask][j] = bestK;
      }
    }
  }

  // Complete tour back to depot (0)
  const fullMask = (1 << n) - 1;
  let optimalCost = Infinity;
  let lastNode = -1;

  for (let j = 1; j < n; j++) {
    const cost = memoCost[fullMask][j] + distMatrix[j][0];
    if (cost < optimalCost) {
      optimalCost = cost;
      lastNode = j;
    }
  }

  // Reconstruct optimal tour backwards
  const tour = [0];
  let currMask = fullMask;
  let currNode = lastNode;

  while (currNode !== 0 && currNode !== -1) {
    tour.unshift(currNode);
    const prev = memoPrev[currMask][currNode];
    currMask = currMask ^ (1 << currNode);
    currNode = prev;
  }
  tour.unshift(0); // Add depot at start

  return {
    tour,
    totalDistance: Math.round(optimalCost * 1000) / 1000,
  };
}

/**
 * Optimizes stop sequencing for a batch of delivery orders.
 * Automatically verifies heuristic against exact Held-Karp when stops <= 10.
 *
 * @param {Object} depot - { lat, lng }
 * @param {Array<Object>} stops - Array of { id, lat, lng }
 * @returns {{
 *   orderedStops: Object[],
 *   totalDistanceKm: number,
 *   heuristicDistanceKm: number,
 *   optimalDistanceKm?: number,
 *   optimalityGapPercent?: number
 * }}
 */
function optimizeBatchRoute(depot, stops = []) {
  if (!isValidCoordinate(depot)) {
    throw new Error('Valid depot coordinate required in optimizeBatchRoute');
  }

  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0) {
    return {
      orderedStops: [],
      totalDistanceKm: 0,
      heuristicDistanceKm: 0,
    };
  }

  const allPoints = [{ id: 'depot', lat: depot.lat, lng: depot.lng }, ...validStops];
  const distMatrix = buildDistanceMatrix(allPoints);
  const n = allPoints.length;

  const heuristicRes = solveTSP2Opt(distMatrix);

  let result = {
    orderedStops: heuristicRes.tour.slice(1, -1).map((idx) => allPoints[idx]),
    totalDistanceKm: heuristicRes.totalDistance,
    heuristicDistanceKm: heuristicRes.totalDistance,
  };

  if (n <= 10) {
    const exactRes = solveTSPHeldKarp(distMatrix);
    const gap =
      exactRes.totalDistance > 0
        ? Math.max(
            0,
            ((heuristicRes.totalDistance - exactRes.totalDistance) / exactRes.totalDistance) * 100
          )
        : 0;

    result = {
      ...result,
      orderedStops: exactRes.tour.slice(1, -1).map((idx) => allPoints[idx]),
      totalDistanceKm: exactRes.totalDistance,
      optimalDistanceKm: exactRes.totalDistance,
      optimalityGapPercent: Math.round(gap * 100) / 100,
    };
  }

  return result;
}

module.exports = {
  buildDistanceMatrix,
  solveTSP2Opt,
  solveTSPHeldKarp,
  optimizeBatchRoute,
};
