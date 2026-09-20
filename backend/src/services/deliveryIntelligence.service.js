/**
 * @file deliveryIntelligence.service.js
 * @description Delivery Intelligence service combining CityGraph routing, KD-Tree spatial snapping,
 * Hungarian bipartite matching, Clarke-Wright + TSP batch optimization, SegmentTree slot booking,
 * online SGD ETA estimation, and token-bucket surge limiters.
 */

const {
  createGridCityGraph,
  KDTree,
  hungarianMatching,
  clarkeWrightVRP,
  optimizeBatchRoute,
  SegmentTree,
  SGDOnlineRegressor,
  TokenBucketLimiter,
  SlidingWindowLogLimiter,
  calculateHaversineDistance,
  isValidCoordinate,
} = require('../algo');

class DeliveryIntelligenceService {
  constructor() {
    this._initCityGraph();
    this.slotTree = new SegmentTree(24, 20); // 24 hourly delivery slots, 20 capacity each
    this.sgdModel = new SGDOnlineRegressor();
    this.surgeBucket = new TokenBucketLimiter({ capacity: 30, refillRatePerSec: 2 });
    this.surgeSlidingWindow = new SlidingWindowLogLimiter({ windowSeconds: 60, maxOrders: 50 });
  }

  /**
   * Initializes the Koramangala city street graph and spatial K-d tree.
   * @private
   */
  _initCityGraph() {
    // Generate a 15x15 street grid around Koramangala hub (12.935, 77.624)
    this.graph = createGridCityGraph({
      rows: 15,
      cols: 15,
      baseLat: 12.93524,
      baseLng: 77.62448,
      spacingKm: 0.3,
    });

    // Build spatial KD-Tree from graph nodes
    const spatialPoints = [];
    for (const [nodeId, nodeData] of this.graph.nodes.entries()) {
      spatialPoints.push({
        id: nodeId,
        lat: nodeData.lat,
        lng: nodeData.lng,
      });
    }

    this.kdTree = new KDTree(spatialPoints);
  }

  /**
   * Snaps a geographic coordinate to the nearest road network node.
   * Time Complexity: O(log N)
   *
   * @param {{ lat: number, lng: number }} coord
   * @returns {{ id: string, lat: number, lng: number, distanceKm: number }}
   */
  snapCoordinate(coord) {
    if (!isValidCoordinate(coord)) {
      throw new Error('Invalid coordinate for snapping');
    }
    const nearest = this.kdTree.findNearest(coord);
    if (!nearest || !nearest.node) {
      throw new Error('No graph node found');
    }
    return nearest.node;
  }

  /**
   * Computes shortest path route between two coordinates or node IDs.
   *
   * @param {Object} params
   * @param {Object|string} params.start - { lat, lng } or nodeId
   * @param {Object|string} params.target - { lat, lng } or nodeId
   * @param {'bike'|'car'|'foot'} [params.mode='bike']
   * @param {'astar'|'bidirectional'|'dijkstra'} [params.algo='astar']
   * @returns {Object}
   */
  calculateRoute({ start, target, mode = 'bike', algo = 'astar' }) {
    if (!start || !target) {
      throw new Error('Both start and target must be provided');
    }

    let startNodeId = typeof start === 'string' ? start : null;
    let targetNodeId = typeof target === 'string' ? target : null;

    if (!startNodeId) {
      const snappedStart = this.snapCoordinate(start);
      startNodeId = snappedStart.id;
    }
    if (!targetNodeId) {
      const snappedTarget = this.snapCoordinate(target);
      targetNodeId = snappedTarget.id;
    }

    if (!this.graph.nodes.has(startNodeId) || !this.graph.nodes.has(targetNodeId)) {
      throw new Error('Start or target node does not exist in graph');
    }

    let result;
    const algoLower = String(algo).toLowerCase();

    if (algoLower === 'dijkstra') {
      result = this.graph.dijkstra(startNodeId, targetNodeId, mode);
    } else if (algoLower === 'bidirectional') {
      result = this.graph.bidirectionalDijkstra(startNodeId, targetNodeId, mode);
    } else {
      // Default to A* with Euclidean heuristic
      result = this.graph.aStar(startNodeId, targetNodeId, mode);
    }

    return {
      ...result,
      distanceKm: result.totalDistanceKm,
      timeMinutes: result.totalTimeMinutes,
      startNodeId,
      targetNodeId,
      mode,
      algoUsed: algoLower,
    };
  }

  /**
   * Assigns orders to delivery riders using Hungarian (Kuhn-Munkres) O(N^3) optimal bipartite matching.
   * Also computes greedy baseline to quantify cost savings.
   *
   * @param {Object} params
   * @param {Array<Object>} params.orders - Array of { id, lat, lng }
   * @param {Array<Object>} params.riders - Array of { id, lat, lng }
   * @returns {Object}
   */
  matchOrdersToRiders({ orders = [], riders = [] }) {
    if (!orders.length || !riders.length) {
      return {
        assignments: [],
        totalCostKm: 0,
        greedyCostKm: 0,
        savingsKm: 0,
        savingsPercent: 0,
      };
    }

    // Build cost matrix: rows = orders, cols = riders
    const costMatrix = orders.map((order) =>
      riders.map((rider) => calculateHaversineDistance(order, rider))
    );

    // 1. Hungarian optimal matching
    const hungarianResult = hungarianMatching(costMatrix);

    const assignments = hungarianResult.assignments
      .filter((a) => a.orderIndex < orders.length && a.riderIndex < riders.length)
      .map((a) => ({
        order: orders[a.orderIndex],
        rider: riders[a.riderIndex],
        distanceKm: a.cost,
      }));

    const optimalCost = assignments.reduce((sum, a) => sum + a.distanceKm, 0);

    // 2. Greedy baseline matching
    let greedyCost = 0;
    const usedRiders = new Set();
    const greedyAssignments = [];

    for (let i = 0; i < orders.length; i++) {
      let bestRiderIdx = -1;
      let minD = Infinity;

      for (let j = 0; j < riders.length; j++) {
        if (!usedRiders.has(j) && costMatrix[i][j] < minD) {
          minD = costMatrix[i][j];
          bestRiderIdx = j;
        }
      }

      if (bestRiderIdx !== -1) {
        usedRiders.add(bestRiderIdx);
        greedyCost += minD;
        greedyAssignments.push({
          order: orders[i],
          rider: riders[bestRiderIdx],
          distanceKm: minD,
        });
      }
    }

    const savingsKm = Math.max(0, greedyCost - optimalCost);
    const savingsPercent = greedyCost > 0 ? Math.round((savingsKm / greedyCost) * 10000) / 100 : 0;

    return {
      assignments,
      totalCostKm: Math.round(optimalCost * 1000) / 1000,
      greedyCostKm: Math.round(greedyCost * 1000) / 1000,
      savingsKm: Math.round(savingsKm * 1000) / 1000,
      savingsPercent,
    };
  }

  /**
   * Optimizes multi-order batch delivery using Clarke-Wright Savings and TSP 2-Opt / Held-Karp.
   *
   * @param {Object} params
   * @param {Object} params.depot - Store / dark store coordinate { lat, lng }
   * @param {Array<Object>} params.orders - Array of { id, lat, lng }
   * @param {Object} [params.options]
   * @returns {Object}
   */
  optimizeBatchDelivery({ depot, orders = [], options = {} }) {
    if (!isValidCoordinate(depot)) {
      throw new Error('Valid depot coordinate required');
    }
    if (!orders || orders.length === 0) {
      return {
        trips: [],
        totalBatches: 0,
        totalDistanceKm: 0,
        baselineDistanceKm: 0,
        savingsPercent: 0,
      };
    }

    // Baseline individual roundtrip distances
    const baselineDistanceKm = orders.reduce((sum, o) => {
      return sum + calculateHaversineDistance(depot, o) * 2;
    }, 0);

    // 1. Cluster orders into trips using Clarke-Wright
    const rawTrips = clarkeWrightVRP(depot, orders, options);

    // 2. Refine stop sequencing of each trip using TSP solver
    const optimizedTrips = rawTrips.map((trip) => {
      const tspRes = optimizeBatchRoute(depot, trip.orders);
      return {
        tripId: trip.tripId,
        orders: tspRes.orderedStops,
        stopsCount: tspRes.orderedStops.length,
        totalDistanceKm: tspRes.totalDistanceKm,
        estimatedDurationMin:
          Math.round(((tspRes.totalDistanceKm / 22) * 60 + trip.orders.length * 2.5) * 10) / 10,
        optimalityGapPercent: tspRes.optimalityGapPercent || 0,
      };
    });

    const totalDistanceKm = optimizedTrips.reduce((sum, t) => sum + t.totalDistanceKm, 0);
    const savingsKm = Math.max(0, baselineDistanceKm - totalDistanceKm);
    const savingsPercent =
      baselineDistanceKm > 0 ? Math.round((savingsKm / baselineDistanceKm) * 10000) / 100 : 0;

    return {
      trips: optimizedTrips,
      totalBatches: optimizedTrips.length,
      totalDistanceKm: Math.round(totalDistanceKm * 1000) / 1000,
      baselineDistanceKm: Math.round(baselineDistanceKm * 1000) / 1000,
      savingsKm: Math.round(savingsKm * 1000) / 1000,
      savingsPercent,
    };
  }

  /**
   * Retrieves current delivery slot capacities.
   * @returns {Object}
   */
  getSlotCapacities() {
    const capacities = this.slotTree.getAllCapacities();
    return {
      slots: capacities.map((cap, idx) => ({
        slotIndex: idx,
        hourWindow: `${String(idx).padStart(2, '0')}:00 - ${String(idx + 1).padStart(2, '0')}:00`,
        availableCapacity: cap,
        isAvailable: cap > 0,
      })),
      totalAvailableCapacity: this.slotTree.querySum(0, capacities.length - 1),
      minSlotCapacity: this.slotTree.queryMin(0, capacities.length - 1),
    };
  }

  /**
   * Reserves capacity in a specific delivery slot.
   *
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {boolean}
   */
  reserveDeliverySlot(slotIndex, count = 1) {
    return this.slotTree.reserveSlot(slotIndex, count);
  }

  /**
   * Releases capacity back to a delivery slot.
   *
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {number}
   */
  releaseDeliverySlot(slotIndex, count = 1) {
    return this.slotTree.releaseSlot(slotIndex, count);
  }

  /**
   * Predicts delivery ETA using the online SGD regressor.
   *
   * @param {Object} context
   * @returns {Object}
   */
  predictETA(context) {
    return this.sgdModel.predict(context);
  }

  /**
   * Feeds back completed delivery duration to update online SGD model weights.
   *
   * @param {Object} context
   * @param {number} actualMinutes
   * @returns {Object}
   */
  feedDeliveryObservation(context, actualMinutes) {
    return this.sgdModel.trainOnline(context, actualMinutes);
  }

  /**
   * Returns current surge capacity status and throttling gauge.
   * @returns {Object}
   */
  getSurgeCapacity() {
    const gauge = this.surgeBucket.getCapacityGauge();
    const activeRate = this.surgeSlidingWindow.getCurrentCount();

    return {
      burstCapacity: gauge.capacity,
      availableTokens: gauge.availableTokens,
      fillPercent: gauge.fillPercent,
      isThrottled: gauge.isThrottling,
      rollingMinuteOrders: activeRate,
      maxAllowedPerMinute: this.surgeSlidingWindow.maxOrders,
    };
  }

  /**
   * Consumes surge token for incoming dispatch request.
   *
   * @param {number} [count=1]
   * @returns {{ allowed: boolean, remainingTokens: number, retryAfterSec: number }}
   */
  consumeSurgeToken(count = 1) {
    const slidingCheck = this.surgeSlidingWindow.tryAcquire();
    if (!slidingCheck.allowed) {
      return {
        allowed: false,
        remainingTokens: 0,
        retryAfterSec: 5,
        reason: 'Rate limit exceeded in rolling 60s window',
      };
    }

    return this.surgeBucket.consume(count);
  }
}

// Export singleton instance
const deliveryIntelligenceService = new DeliveryIntelligenceService();

module.exports = {
  DeliveryIntelligenceService,
  deliveryIntelligenceService,
};
