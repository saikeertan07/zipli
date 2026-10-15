/**
 * @file dispatchService.test.js
 * @description Unit/Service tests for dispatch.service.js covering edge cases and error branches.
 */

const { dispatchService, DEFAULT_DARK_STORE } = require('../../src/services/dispatch.service');
const { truncateTables } = require('../setup');
const { makeUser, makeOrderFor, makeDriver } = require('../helpers/factories');
const { query } = require('../../src/config/db');

describe('DispatchService Unit Tests', () => {
  beforeEach(async () => {
    await truncateTables([
      'driver_location_logs',
      'delivery_assignments',
      'order_items',
      'orders',
      'drivers',
      'users',
    ]);
  });

  describe('getNearbyDrivers', () => {
    it('throws error on invalid coordinates', async () => {
      await expect(dispatchService.getNearbyDrivers({ lat: NaN, lng: 77.6 })).rejects.toThrow(
        'Invalid coordinates provided'
      );
    });

    it('queries with status ALL and filters accurately by distance', async () => {
      await makeDriver({
        name: 'Idle Driver',
        current_lat: DEFAULT_DARK_STORE.lat + 0.005,
        current_lng: DEFAULT_DARK_STORE.lng + 0.005,
        status: 'IDLE',
      });
      await makeDriver({
        name: 'En Route Driver',
        current_lat: DEFAULT_DARK_STORE.lat + 0.008,
        current_lng: DEFAULT_DARK_STORE.lng + 0.008,
        status: 'EN_ROUTE',
      });

      const drivers = await dispatchService.getNearbyDrivers({
        lat: DEFAULT_DARK_STORE.lat,
        lng: DEFAULT_DARK_STORE.lng,
        radiusKm: 5,
        status: 'ALL',
      });

      expect(drivers.length).toBe(2);
      expect(drivers[0].distance_km).toBeLessThanOrEqual(drivers[1].distance_km);
    });
  });

  describe('assignDriverToOrder', () => {
    it('throws 404 when order does not exist', async () => {
      await expect(dispatchService.assignDriverToOrder(999999)).rejects.toThrow(
        'Order 999999 not found'
      );
    });

    it('throws 404 when requested specific driverId does not exist', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id);

      await expect(
        dispatchService.assignDriverToOrder(order.id, { driverId: 88888 })
      ).rejects.toThrow('Driver 88888 not found');
    });

    it('throws 503 when no drivers are available at all', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id);

      await expect(dispatchService.assignDriverToOrder(order.id)).rejects.toThrow(
        'No available delivery partners nearby'
      );
    });

    it('returns existing assignment if order was already assigned', async () => {
      const { user } = await makeUser();
      const driver = await makeDriver({ status: 'IDLE' });
      const { order } = await makeOrderFor(user.id, [], { status: 'packed' });

      // First assignment
      const assign1 = await dispatchService.assignDriverToOrder(order.id, {
        driverId: driver.id,
      });

      // Second assignment call should return existing assignment
      const assign2 = await dispatchService.assignDriverToOrder(order.id);
      expect(assign2.id).toBe(assign1.id);
      expect(assign2.driver_id).toBe(driver.id);
    });

    it('advances order in packed state to out_for_delivery', async () => {
      const { user } = await makeUser();
      await makeDriver({ status: 'IDLE' });
      const { order } = await makeOrderFor(user.id, [], { status: 'packed' });

      await dispatchService.assignDriverToOrder(order.id);

      const { rows } = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
      expect(rows[0].status).toBe('out_for_delivery');
    });
  });

  describe('ingestDriverLocation', () => {
    it('throws error for invalid coordinates', async () => {
      await expect(
        dispatchService.ingestDriverLocation({
          driverId: 1,
          lat: 95, // out of range
          lng: 77,
        })
      ).rejects.toThrow('Invalid GPS coordinates provided');
    });

    it('logs driver location without orderId', async () => {
      const driver = await makeDriver({ status: 'IDLE' });
      const result = await dispatchService.ingestDriverLocation({
        driverId: driver.id,
        lat: 12.935,
        lng: 77.624,
        speedKmh: 20,
      });

      expect(result.driverId).toBe(driver.id);
      expect(result.orderId).toBeUndefined();

      const { rows } = await query('SELECT * FROM driver_location_logs WHERE driver_id = $1', [
        driver.id,
      ]);
      expect(rows.length).toBe(1);
      expect(Number(rows[0].lat)).toBeCloseTo(12.935, 3);
    });
  });

  describe('getOrderTracking', () => {
    it('throws 404 for non-existent order', async () => {
      await expect(dispatchService.getOrderTracking(999999)).rejects.toThrow(
        'Order 999999 not found'
      );
    });

    it('returns tracking snapshot for unassigned order', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });

      const tracking = await dispatchService.getOrderTracking(order.id);
      expect(tracking.orderId).toBe(order.id);
      expect(tracking.assignment).toBeNull();
      expect(tracking.polyline.length).toBeGreaterThan(0);
      expect(tracking.distanceRemainingKm).toBeGreaterThan(0);
    });
  });

  describe('stopOrderSimulation', () => {
    it('returns false when stopping simulation that was not active', () => {
      const res = dispatchService.stopOrderSimulation(12345);
      expect(res).toBe(false);
    });
  });

  describe('verifyDeliveryGeofence', () => {
    it('correctly verifies driver within and outside 150m geofence radius', () => {
      const destination = { lat: 12.93524, lng: 77.62448 };
      // 50 meters away
      const nearDriver = { lat: 12.93524 + 0.0004, lng: 77.62448 };
      const nearResult = dispatchService.verifyDeliveryGeofence(nearDriver, destination, 150);
      expect(nearResult.isWithinGeofence).toBe(true);
      expect(nearResult.distanceMeters).toBeLessThan(150);

      // 500 meters away
      const farDriver = { lat: 12.93524 + 0.005, lng: 77.62448 };
      const farResult = dispatchService.verifyDeliveryGeofence(farDriver, destination, 150);
      expect(farResult.isWithinGeofence).toBe(false);
      expect(farResult.distanceMeters).toBeGreaterThan(150);
    });

    it('throws error when coordinates are invalid', () => {
      expect(() =>
        dispatchService.verifyDeliveryGeofence({ lat: null }, { lat: 12.9, lng: 77.6 })
      ).toThrow('Invalid coordinates');
    });
  });
});
