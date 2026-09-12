/**
 * @file hungarian.js
 * @description Pure Kuhn-Munkres (Hungarian) algorithm for optimal minimum-cost
 * bipartite assignment between orders and delivery riders.
 * Time Complexity: O(N^3)
 * Zero external dependencies.
 */

/**
 * Solves the minimum weight bipartite matching problem on an N x M cost matrix.
 *
 * @param {number[][]} costMatrix - Matrix of non-negative costs where costMatrix[i][j] is the cost of assigning order i to rider j.
 * @returns {{
 *   assignments: Array<{ orderIndex: number, riderIndex: number, cost: number }>,
 *   totalCost: number,
 *   unassignedOrders: number[],
 *   unassignedRiders: number[]
 * }}
 */
function solveHungarian(costMatrix) {
  if (!Array.isArray(costMatrix) || costMatrix.length === 0 || !Array.isArray(costMatrix[0])) {
    return {
      assignments: [],
      totalCost: 0,
      unassignedOrders: [],
      unassignedRiders: [],
    };
  }

  const numOrders = costMatrix.length;
  const numRiders = costMatrix[0].length;

  if (numOrders === 0 || numRiders === 0) {
    return {
      assignments: [],
      totalCost: 0,
      unassignedOrders: [],
      unassignedRiders: [],
    };
  }

  // Dimension of balanced square matrix
  const n = Math.max(numOrders, numRiders);

  // Find max cost for padding
  let maxVal = 0;
  for (let i = 0; i < numOrders; i++) {
    for (let j = 0; j < numRiders; j++) {
      if (Number.isFinite(costMatrix[i][j]) && costMatrix[i][j] > maxVal) {
        maxVal = costMatrix[i][j];
      }
    }
  }
  const bigCost = maxVal * 10 + 1000;

  // Build 1-indexed n x n cost matrix
  // a[i][j] where 1 <= i, j <= n
  const a = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i < numOrders && j < numRiders) {
        a[i + 1][j + 1] = Number(costMatrix[i][j]);
      } else {
        a[i + 1][j + 1] = bigCost;
      }
    }
  }

  // Dual variables: u for rows, v for columns
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  // p[j] = row matched with column j
  const p = new Int32Array(n + 1);
  // way[j] = predecessor column in augmenting path
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = a[i0][j] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Extract matchings
  // p[j] gives the 1-based order row assigned to 1-based rider column j
  const orderToRider = new Map();
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) {
      orderToRider.set(p[j] - 1, j - 1);
    }
  }

  const assignments = [];
  const assignedRiders = new Set();
  let totalCost = 0;

  for (let i = 0; i < numOrders; i++) {
    const riderIdx = orderToRider.get(i);
    if (riderIdx !== undefined && riderIdx < numRiders) {
      const cost = costMatrix[i][riderIdx];
      assignments.push({
        orderIndex: i,
        riderIndex: riderIdx,
        cost: Math.round(cost * 1000) / 1000,
      });
      totalCost += cost;
      assignedRiders.add(riderIdx);
    }
  }

  const unassignedOrders = [];
  for (let i = 0; i < numOrders; i++) {
    if (!orderToRider.has(i) || orderToRider.get(i) >= numRiders) {
      unassignedOrders.push(i);
    }
  }

  const unassignedRiders = [];
  for (let j = 0; j < numRiders; j++) {
    if (!assignedRiders.has(j)) {
      unassignedRiders.push(j);
    }
  }

  return {
    assignments,
    totalCost: Math.round(totalCost * 1000) / 1000,
    unassignedOrders,
    unassignedRiders,
  };
}

module.exports = {
  solveHungarian,
};
