/**
 * @file driverSimulation.test.js
 * @description Unit tests for driver route generator and simulator in driverSimulation.js
 */

const { generateRoute, createRouteSimulator } = require('../../src/algo/driverSimulation');

describe('driverSimulation.js route generator & simulator', () => {
  const storeCoord = { lat: 12.93524, lng: 77.62448 };
  const customerCoord = { lat: 12.95, lng: 77.64 };
  const intermediateTurn = { lat: 12.94, lng: 77.63 };

  describe('generateRoute', () => {
    it('generates a valid route between store and customer', () => {
      const route = generateRoute({
        origin: storeCoord,
        destination: customerCoord,
        totalSteps: 10,
      });

      expect(route.length).toBeGreaterThanOrEqual(10);
      expect(route[0].lat).toBeCloseTo(storeCoord.lat, 4);
      expect(route[route.length - 1].lat).toBeCloseTo(customerCoord.lat, 4);
      expect(route[0].isArrived).toBe(false);
      expect(route[route.length - 1].isArrived).toBe(true);
      expect(route[route.length - 1].speedKmh).toBe(0);
      expect(route[0].progressPercent).toBe(0);
      expect(route[route.length - 1].progressPercent).toBe(100);
    });

    it('interpolates accurately with intermediate waypoints', () => {
      const route = generateRoute({
        origin: storeCoord,
        destination: customerCoord,
        waypoints: [intermediateTurn],
        totalSteps: 15,
      });

      expect(route.length).toBeGreaterThanOrEqual(10);
      expect(route[0].distanceRemainingKm).toBeGreaterThan(0);
      expect(route[route.length - 1].distanceRemainingKm).toBe(0);
    });

    it('handles identical origin and destination (0 km distance)', () => {
      const route = generateRoute({
        origin: storeCoord,
        destination: storeCoord,
        totalSteps: 5,
      });

      expect(route).toHaveLength(5);
      expect(route[0].isArrived).toBe(true);
      expect(route[0].distanceRemainingKm).toBe(0);
      expect(route[0].progressPercent).toBe(100);
    });

    it('throws when origin or destination is invalid', () => {
      expect(() =>
        generateRoute({
          origin: null,
          destination: customerCoord,
        })
      ).toThrow('Valid origin and destination coordinates are required');

      expect(() =>
        generateRoute({
          origin: storeCoord,
          destination: { lat: NaN, lng: 77 },
        })
      ).toThrow('Valid origin and destination coordinates are required');
    });
  });

  describe('createRouteSimulator', () => {
    it('throws for empty route steps', () => {
      expect(() => createRouteSimulator([])).toThrow('routeSteps must be a non-empty array');
      expect(() => createRouteSimulator(null)).toThrow('routeSteps must be a non-empty array');
    });

    it('steps through route and tracks completion', () => {
      const route = generateRoute({
        origin: storeCoord,
        destination: customerCoord,
        totalSteps: 4,
      });

      const sim = createRouteSimulator(route);

      expect(sim.getCurrentStep().stepIndex).toBe(0);
      expect(sim.isComplete()).toBe(false);
      expect(sim.getProgress()).toBe(0);

      // Step until end
      while (!sim.isComplete()) {
        const next = sim.step();
        expect(next).toBeDefined();
      }

      expect(sim.isComplete()).toBe(true);
      expect(sim.getCurrentStep().isArrived).toBe(true);

      // Subsequent steps stay at last step
      const finalStep = sim.step();
      expect(finalStep.isArrived).toBe(true);

      // Reset
      sim.reset();
      expect(sim.getCurrentStep().stepIndex).toBe(0);
      expect(sim.isComplete()).toBe(false);
    });
  });
});
