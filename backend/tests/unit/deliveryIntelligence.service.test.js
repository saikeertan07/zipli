const {
  DeliveryIntelligenceService,
  deliveryIntelligenceService,
} = require('../../src/services/deliveryIntelligence.service');

describe('DeliveryIntelligenceService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new DeliveryIntelligenceService();
  });

  describe('snapCoordinate', () => {
    it('snaps valid coordinate to nearest street graph node', () => {
      const snapped = service.snapCoordinate({ lat: 12.935, lng: 77.624 });
      expect(snapped).toBeDefined();
      expect(snapped.id).toMatch(/^node_/);
      expect(snapped.lat).toBeDefined();
    });

    it('throws when coordinate is invalid', () => {
      expect(() => service.snapCoordinate(null)).toThrow('Invalid coordinate for snapping');
      expect(() => service.snapCoordinate({ lat: 'bad', lng: 77.0 })).toThrow(
        'Invalid coordinate for snapping'
      );
    });

    it('throws if kdTree finds no node', () => {
      const emptyService = new DeliveryIntelligenceService();
      emptyService.kdTree.findNearest = () => ({ node: null });
      expect(() => emptyService.snapCoordinate({ lat: 12.9, lng: 77.6 })).toThrow(
        'No graph node found'
      );
    });
  });

  describe('calculateRoute', () => {
    it('throws when start or target is missing', () => {
      expect(() => service.calculateRoute({})).toThrow('Both start and target must be provided');
      expect(() => service.calculateRoute({ start: { lat: 12.9, lng: 77.6 } })).toThrow(
        'Both start and target must be provided'
      );
    });

    it('throws when string node IDs do not exist in graph', () => {
      expect(() =>
        service.calculateRoute({ start: 'nonexistent_node_1', target: 'nonexistent_node_2' })
      ).toThrow('Start or target node does not exist in graph');
    });

    it('calculates route with explicit string node IDs for dijkstra, astar, and bidirectional', () => {
      const resDijkstra = service.calculateRoute({
        start: 'node_0_0',
        target: 'node_2_2',
        algo: 'dijkstra',
      });
      expect(resDijkstra.algoUsed).toBe('dijkstra');
      expect(resDijkstra.distanceKm).toBeGreaterThan(0);

      const resBi = service.calculateRoute({
        start: 'node_0_0',
        target: 'node_2_2',
        algo: 'bidirectional',
      });
      expect(resBi.algoUsed).toBe('bidirectional');
      expect(resBi.distanceKm).toBeGreaterThan(0);

      const resAStar = service.calculateRoute({
        start: 'node_0_0',
        target: 'node_2_2',
        algo: 'astar',
      });
      expect(resAStar.algoUsed).toBe('astar');
      expect(resAStar.distanceKm).toBeGreaterThan(0);
    });
  });

  describe('matchOrdersToRiders', () => {
    it('returns empty result when orders or riders are empty', () => {
      const res = service.matchOrdersToRiders({ orders: [], riders: [] });
      expect(res.assignments).toEqual([]);
      expect(res.totalCostKm).toBe(0);
      expect(res.savingsPercent).toBe(0);
    });

    it('matches when more orders than riders', () => {
      const orders = [
        { id: 1, lat: 12.935, lng: 77.624 },
        { id: 2, lat: 12.936, lng: 77.625 },
        { id: 3, lat: 12.937, lng: 77.626 },
      ];
      const riders = [{ id: 'A', lat: 12.9355, lng: 77.6245 }];
      const res = service.matchOrdersToRiders({ orders, riders });
      expect(res.assignments).toHaveLength(1);
    });
  });

  describe('optimizeBatchDelivery', () => {
    it('throws error when depot coordinate is invalid', () => {
      expect(() => service.optimizeBatchDelivery({ depot: null })).toThrow(
        'Valid depot coordinate required'
      );
    });

    it('handles empty orders list safely', () => {
      const res = service.optimizeBatchDelivery({
        depot: { lat: 12.935, lng: 77.624 },
        orders: [],
      });
      expect(res.trips).toEqual([]);
      expect(res.totalBatches).toBe(0);
      expect(res.totalDistanceKm).toBe(0);
    });
  });

  describe('slot management', () => {
    it('reserves and releases delivery slots', () => {
      expect(service.reserveDeliverySlot(5, 3)).toBe(true);
      const caps = service.getSlotCapacities();
      expect(caps.slots[5].availableCapacity).toBe(17);

      const released = service.releaseDeliverySlot(5, 2);
      expect(released).toBe(19);
    });
  });

  describe('surge limiters and capacity token consumption', () => {
    it('exhausts rolling sliding window and triggers throttle reason', () => {
      // Consume max allowed (50 orders) in rolling 60s window
      for (let i = 0; i < 50; i++) {
        service.consumeSurgeToken(1);
      }

      // Next consume should be blocked by sliding window
      const blocked = service.consumeSurgeToken(1);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toMatch(/Rate limit exceeded in rolling 60s window/);
    });
  });
});
