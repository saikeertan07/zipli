/**
 * @file dispatchEngine.test.js
 * @description Unit tests for driver dispatch matching algorithms in dispatchEngine.js
 */

const {
  DEFAULT_WEIGHTS,
  DEFAULT_OPTIONS,
  extractCoordinate,
  resolveOptions,
  scoreDriver,
  findBestDriver,
  batchDispatch,
} = require('../../src/algo/dispatchEngine');

describe('dispatchEngine.js pure matching algorithms', () => {
  const storeCoord = { lat: 12.93524, lng: 77.62448 }; // Koramangala store

  const mockDrivers = [
    {
      id: 1,
      name: 'Ramesh',
      current_lat: 12.936,
      current_lng: 77.625,
      rating: 4.9,
      status: 'IDLE',
      active_orders_count: 0,
    },
    {
      id: 2,
      name: 'Suresh',
      current_lat: 12.95,
      current_lng: 77.63,
      rating: 4.8,
      status: 'IDLE',
      active_orders_count: 0,
    },
    {
      id: 3,
      name: 'Anil',
      current_lat: 12.9355,
      current_lng: 77.6246,
      rating: 4.5,
      status: 'IDLE',
      active_orders_count: 0,
    },
    {
      id: 4,
      name: 'Busy Driver',
      current_lat: 12.9353,
      current_lng: 77.6245,
      rating: 5.0,
      status: 'EN_ROUTE',
      active_orders_count: 3, // Full capacity
    },
  ];

  describe('extractCoordinate', () => {
    it('returns null for falsy or non-object arguments', () => {
      expect(extractCoordinate(null)).toBeNull();
      expect(extractCoordinate(undefined)).toBeNull();
      expect(extractCoordinate(12345)).toBeNull();
      expect(extractCoordinate('string')).toBeNull();
    });

    it('returns null if coordinates are null or missing', () => {
      expect(extractCoordinate({ lat: null, lng: 77.5 })).toBeNull();
      expect(extractCoordinate({ lat: 12.5, lng: null })).toBeNull();
      expect(extractCoordinate({})).toBeNull();
    });

    it('extracts from pickup_lat / pickup_lng or lat / lng', () => {
      expect(extractCoordinate({ pickup_lat: 12.9, pickup_lng: 77.6 })).toEqual({
        lat: 12.9,
        lng: 77.6,
      });
      expect(extractCoordinate({ current_lat: 12.91, current_lng: 77.61 })).toEqual({
        lat: 12.91,
        lng: 77.61,
      });
    });
  });

  describe('resolveOptions', () => {
    it('returns default options when empty', () => {
      const opts = resolveOptions({});
      expect(opts.maxSearchRadiusKm).toBe(DEFAULT_OPTIONS.maxSearchRadiusKm);
      expect(opts.maxLoadPerDriver).toBe(DEFAULT_OPTIONS.maxLoadPerDriver);
      expect(opts.weights.distance).toBeCloseTo(DEFAULT_WEIGHTS.distance, 2);
    });

    it('customizes options and normalizes weights', () => {
      const opts = resolveOptions({
        maxSearchRadiusKm: 8,
        maxLoadPerDriver: 2,
        weights: { distance: 10, rating: 5, load: 5 },
      });
      expect(opts.maxSearchRadiusKm).toBe(8);
      expect(opts.maxLoadPerDriver).toBe(2);
      expect(opts.weights.distance).toBe(0.5);
      expect(opts.weights.rating).toBe(0.25);
      expect(opts.weights.load).toBe(0.25);
    });

    it('handles negative or invalid radius/load values by reverting to defaults', () => {
      const opts = resolveOptions({
        maxSearchRadiusKm: -5,
        maxLoadPerDriver: -1,
      });
      expect(opts.maxSearchRadiusKm).toBe(DEFAULT_OPTIONS.maxSearchRadiusKm);
      expect(opts.maxLoadPerDriver).toBe(DEFAULT_OPTIONS.maxLoadPerDriver);
    });

    it('handles zero weight sum gracefully', () => {
      const opts = resolveOptions({
        weights: { distance: 0, rating: 0, load: 0 },
      });
      expect(opts.weights.distance).toBe(DEFAULT_WEIGHTS.distance);
    });
  });

  describe('scoreDriver', () => {
    it('scores an eligible driver with valid composite penalty', () => {
      const result = scoreDriver(mockDrivers[0], storeCoord);
      expect(result.eligible).toBe(true);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
      expect(result.driverId).toBe(1);
    });

    it('marks driver with invalid coordinates as ineligible with Infinity score', () => {
      const invalidDriver = { id: 99, current_lat: null, current_lng: null };
      const result = scoreDriver(invalidDriver, storeCoord);
      expect(result.eligible).toBe(false);
      expect(result.score).toBe(Infinity);
    });

    it('marks driver beyond max search radius as ineligible', () => {
      const farDriver = {
        id: 88,
        current_lat: 13.5, // > 50km away
        current_lng: 77.6,
        rating: 5.0,
        status: 'IDLE',
      };
      const result = scoreDriver(farDriver, storeCoord, { maxSearchRadiusKm: 10 });
      expect(result.eligible).toBe(false);
    });

    it('marks driver at max load capacity as ineligible', () => {
      const fullDriver = {
        id: 77,
        current_lat: 12.9353,
        current_lng: 77.6245,
        rating: 5.0,
        status: 'ASSIGNED',
        active_orders_count: 3,
      };
      const result = scoreDriver(fullDriver, storeCoord, { maxLoadPerDriver: 3 });
      expect(result.eligible).toBe(false);
    });

    it('allows busy driver if within load capacity', () => {
      const busyDriver = {
        id: 76,
        current_lat: 12.9353,
        current_lng: 77.6245,
        rating: 5.0,
        status: 'ASSIGNED',
        active_orders_count: 1,
      };
      const result = scoreDriver(busyDriver, storeCoord, { maxLoadPerDriver: 3 });
      expect(result.eligible).toBe(true);
    });

    it('clamps rating to valid [1.0..5.0] bounds', () => {
      const highRated = {
        id: 75,
        lat: 12.9353,
        lng: 77.6245,
        rating: 6.5,
        status: 'IDLE',
      };
      const lowRated = {
        id: 74,
        lat: 12.9353,
        lng: 77.6245,
        rating: 0.5,
        status: 'IDLE',
      };
      expect(scoreDriver(highRated, storeCoord).eligible).toBe(true);
      expect(scoreDriver(lowRated, storeCoord).eligible).toBe(true);
    });

    it('throws when driver or pickupCoord is invalid', () => {
      expect(() => scoreDriver(null, storeCoord)).toThrow('Invalid driver');
      expect(() => scoreDriver(mockDrivers[0], null)).toThrow('Invalid pickupCoord');
    });
  });

  describe('findBestDriver', () => {
    it('returns null when drivers array is empty', () => {
      const res = findBestDriver(storeCoord, []);
      expect(res.bestDriver).toBeNull();
      expect(res.rankedCandidates).toEqual([]);
    });

    it('throws when order/pickup coordinate is invalid', () => {
      expect(() => findBestDriver({}, mockDrivers)).toThrow('Invalid order/pickup coordinates');
    });

    it('selects best ranked driver near store', () => {
      const res = findBestDriver(storeCoord, mockDrivers);
      expect(res.bestDriver).toBeDefined();
      expect(res.bestDriver.id).toBeDefined();
      expect(res.rankedCandidates.length).toBeGreaterThan(0);
      expect(res.rankedCandidates[0].score).toBeLessThanOrEqual(res.rankedCandidates[1].score);
    });

    it('breaks ties using distance when scores are identical', () => {
      const d1 = { id: 10, lat: 12.9353, lng: 77.6245, rating: 5.0, status: 'IDLE' };
      const d2 = { id: 11, lat: 12.936, lng: 77.6245, rating: 5.0, status: 'IDLE' };
      // Weight distance = 0 so score depends only on rating, forcing score tie
      const res = findBestDriver(storeCoord, [d2, d1], {
        weights: { distance: 0, rating: 1, load: 0 },
      });
      // d1 has shorter distance (0.007 vs 0.084)
      expect(res.bestDriver.id).toBe(10);
    });
  });

  describe('batchDispatch', () => {
    it('throws if orders or drivers are not arrays', () => {
      expect(() => batchDispatch(null, [])).toThrow('must be arrays');
      expect(() => batchDispatch([], null)).toThrow('must be arrays');
    });

    it('assigns orders to available drivers up to capacity', () => {
      const orders = [
        { id: 101, lat: 12.93524, lng: 77.62448 },
        { id: 102, lat: 12.936, lng: 77.625 },
        { id: 103, lat: 12.937, lng: 77.626 },
      ];

      const res = batchDispatch(orders, mockDrivers, { maxLoadPerDriver: 1 });
      expect(res.assignments.length).toBe(3);
      expect(res.unassignedOrders.length).toBe(0);

      const assignedDriverIds = res.assignments.map((a) => a.driverId);
      const uniqueDrivers = new Set(assignedDriverIds);
      expect(uniqueDrivers.size).toBe(3);
    });

    it('marks order unassigned if pickup coordinate is invalid or no driver available', () => {
      const orders = [
        { id: 999, lat: 'invalid', lng: 'invalid' },
        { id: 1000, lat: 12.935, lng: 77.624 },
      ];
      const singleDriverList = [
        { id: 1, current_lat: 12.935, current_lng: 77.624, status: 'IDLE', active_orders_count: 0 },
      ];

      const res = batchDispatch(orders, singleDriverList, { maxLoadPerDriver: 1 });
      expect(res.unassignedOrders.length).toBe(1);
      expect(res.unassignedOrders[0].id).toBe(999);
      expect(res.assignments.length).toBe(1);
      expect(res.assignments[0].orderId).toBe(1000);
    });

    it('puts order in unassigned when all drivers are at capacity', () => {
      const orders = [
        { id: 101, lat: 12.935, lng: 77.624 },
        { id: 102, lat: 12.935, lng: 77.624 },
      ];
      const singleDriver = [
        { id: 1, current_lat: 12.935, current_lng: 77.624, status: 'IDLE', active_orders_count: 0 },
      ];

      const res = batchDispatch(orders, singleDriver, { maxLoadPerDriver: 1 });
      expect(res.assignments.length).toBe(1);
      expect(res.unassignedOrders.length).toBe(1);
      expect(res.unassignedOrders[0].id).toBe(102);
    });
  });
});
