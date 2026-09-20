/**
 * @file dispatch.service.js
 * @description Delivery dispatch orchestrator: driver matching, location ingestion,
 * ETA calculation, WebSocket broadcasts, and route simulation.
 */

const { query, pool } = require('../config/db');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { wsGateway } = require('../websocket/wsServer');
const { geo, dispatchEngine, etaPredictor, driverSimulation } = require('../algo');

// Default Dark Store location (Koramangala central hub)
const DEFAULT_DARK_STORE = Object.freeze({
  lat: 12.93524,
  lng: 77.62448,
});

class DispatchService {
  constructor() {
    this.activeSimulations = new Map(); // orderId -> timerInterval
  }

  /**
   * Fetches nearby drivers within a given radius.
   *
   * @param {Object} params
   * @param {number} params.lat
   * @param {number} params.lng
   * @param {number} [params.radiusKm=10]
   * @param {string} [params.status='IDLE']
   * @returns {Promise<Array<Object>>}
   */
  async getNearbyDrivers({ lat, lng, radiusKm = 10, status = 'IDLE' }) {
    const center = { lat: Number(lat), lng: Number(lng) };
    if (!geo.isValidCoordinate(center)) {
      throw new AppError('Invalid coordinates provided for nearby drivers search', 400);
    }

    const bbox = geo.getBoundingBox(center, radiusKm);

    let sql = `
      SELECT id, name, phone, current_lat, current_lng, status, rating
      FROM drivers
      WHERE current_lat BETWEEN $1 AND $2
        AND current_lng BETWEEN $3 AND $4
    `;
    const params = [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng];

    if (status && status !== 'ALL') {
      sql += ' AND status = $5';
      params.push(status);
    }

    const { rows } = await query(sql, params);

    // Compute precise Haversine distance and filter within exact circle radius
    const nearby = [];
    for (const d of rows) {
      const driverCoord = { lat: Number(d.current_lat), lng: Number(d.current_lng) };
      const distanceKm = geo.calculateHaversineDistance(center, driverCoord);
      if (distanceKm <= radiusKm) {
        nearby.push({
          ...d,
          distance_km: distanceKm,
        });
      }
    }

    nearby.sort((a, b) => a.distance_km - b.distance_km);
    return nearby;
  }

  /**
   * Automatically or manually assigns the optimal delivery partner to an order.
   *
   * @param {number|string} orderId
   * @param {Object} [options]
   * @param {number} [options.driverId] - Optional manual override
   * @returns {Promise<Object>} Assignment record with driver details and initial ETA
   */
  async assignDriverToOrder(orderId, options = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check order existence and destination
      const { rows: orderRows } = await client.query(
        'SELECT id, status, delivery_lat, delivery_lng, delivery_address FROM orders WHERE id = $1',
        [orderId]
      );

      if (!orderRows.length) {
        throw new AppError(`Order ${orderId} not found`, 404);
      }

      const order = orderRows[0];

      // Check if order already has an active assignment
      const { rows: existingAssign } = await client.query(
        `SELECT da.*, d.name AS driver_name, d.phone AS driver_phone, d.rating AS driver_rating,
                d.current_lat, d.current_lng
         FROM delivery_assignments da
         JOIN drivers d ON d.id = da.driver_id
         WHERE da.order_id = $1 AND da.status NOT IN ('CANCELLED', 'DELIVERED')
         ORDER BY da.id DESC LIMIT 1`,
        [orderId]
      );

      if (existingAssign.length > 0) {
        await client.query('COMMIT');
        return existingAssign[0];
      }

      let selectedDriver;

      if (options.driverId) {
        const { rows: specificDriver } = await client.query(
          'SELECT * FROM drivers WHERE id = $1 FOR UPDATE',
          [options.driverId]
        );
        if (!specificDriver.length) {
          throw new AppError(`Driver ${options.driverId} not found`, 404);
        }
        selectedDriver = specificDriver[0];
      } else {
        // Query candidate drivers with status IDLE
        const { rows: candidates } = await client.query(
          "SELECT * FROM drivers WHERE status = 'IDLE' FOR UPDATE SKIP LOCKED"
        );

        if (!candidates.length) {
          throw new AppError('No available delivery partners nearby at this moment', 503);
        }

        const match = dispatchEngine.findBestDriver(DEFAULT_DARK_STORE, candidates);
        if (!match.bestDriver) {
          throw new AppError('No eligible delivery partners match routing constraints', 503);
        }
        selectedDriver = match.bestDriver;
      }

      // Calculate initial distance & ETA from store to delivery coordinate
      const destination = {
        lat: Number(order.delivery_lat || DEFAULT_DARK_STORE.lat + 0.02),
        lng: Number(order.delivery_lng || DEFAULT_DARK_STORE.lng + 0.02),
      };

      const distanceKm = geo.calculateHaversineDistance(DEFAULT_DARK_STORE, destination);
      const eta = etaPredictor.predictETA(distanceKm);

      // Insert assignment
      const { rows: assignmentRows } = await client.query(
        `INSERT INTO delivery_assignments
           (order_id, driver_id, status, distance_km, estimated_duration_min, assigned_at)
         VALUES ($1, $2, 'ASSIGNED', $3, $4, NOW())
         RETURNING *`,
        [orderId, selectedDriver.id, distanceKm, eta.estimatedDurationMin]
      );

      // Update driver status
      await client.query(
        "UPDATE drivers SET status = 'ASSIGNED', updated_at = NOW() WHERE id = $1",
        [selectedDriver.id]
      );

      // If order is in packed or confirmed state, advance to out_for_delivery
      if (order.status === 'packed' || order.status === 'confirmed') {
        await client.query("UPDATE orders SET status = 'out_for_delivery' WHERE id = $1", [
          orderId,
        ]);
      }

      await client.query('COMMIT');

      const assignment = {
        ...assignmentRows[0],
        driver: {
          id: selectedDriver.id,
          name: selectedDriver.name,
          phone: selectedDriver.phone,
          rating: selectedDriver.rating,
          current_lat: selectedDriver.current_lat,
          current_lng: selectedDriver.current_lng,
        },
        eta,
      };

      // Broadcast WebSocket events
      wsGateway.broadcastToRoom(`order:${orderId}`, {
        type: 'ORDER_ASSIGNED',
        orderId: Number(orderId),
        assignment,
        timestamp: Date.now(),
      });

      wsGateway.broadcastToRoom('admin:tracking', {
        type: 'DISPATCH_EVENT',
        event: 'ORDER_ASSIGNED',
        orderId: Number(orderId),
        driverId: selectedDriver.id,
        timestamp: Date.now(),
      });

      return assignment;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Ingests high-frequency GPS ping from driver device and broadcasts real-time tracking update.
   *
   * @param {Object} params
   * @param {number} params.driverId
   * @param {number} [params.orderId]
   * @param {number} params.lat
   * @param {number} params.lng
   * @param {number} [params.speedKmh=0]
   * @returns {Promise<Object>} Tracking snapshot
   */
  async ingestDriverLocation({ driverId, orderId, lat, lng, speedKmh = 0 }) {
    const coord = { lat: Number(lat), lng: Number(lng) };
    if (!geo.isValidCoordinate(coord)) {
      throw new AppError('Invalid GPS coordinates provided', 400);
    }

    // 1. Update driver latest coordinates
    await query(
      `UPDATE drivers
       SET current_lat = $1, current_lng = $2, updated_at = NOW()
       WHERE id = $3`,
      [coord.lat, coord.lng, driverId]
    );

    // 2. Append to location logs table
    await query(
      `INSERT INTO driver_location_logs (driver_id, order_id, lat, lng, speed_kmh, recorded_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [driverId, orderId || null, coord.lat, coord.lng, speedKmh]
    );

    let trackingData = {
      driverId,
      lat: coord.lat,
      lng: coord.lng,
      speedKmh,
      recordedAt: new Date().toISOString(),
    };

    // 3. If tied to an active order, compute remaining route metrics & ETA
    if (orderId) {
      const { rows: orderRows } = await query(
        'SELECT id, status, delivery_lat, delivery_lng FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderRows.length > 0) {
        const order = orderRows[0];
        const destination = {
          lat: Number(order.delivery_lat || DEFAULT_DARK_STORE.lat + 0.02),
          lng: Number(order.delivery_lng || DEFAULT_DARK_STORE.lng + 0.02),
        };

        const distanceRemainingKm = geo.calculateHaversineDistance(coord, destination);
        const bearing = geo.calculateBearing(coord, destination);
        const eta = etaPredictor.predictETA(distanceRemainingKm, {
          isPickedUp: true,
          baseSpeedKmh: speedKmh > 10 ? speedKmh : 22.0,
        });

        trackingData = {
          ...trackingData,
          orderId: Number(orderId),
          orderStatus: order.status,
          distanceRemainingKm,
          bearing,
          estimatedDurationMin: eta.estimatedDurationMin,
          estimatedArrivalIso: eta.estimatedArrivalIso,
          isNearDestination: distanceRemainingKm <= 0.15,
        };

        // Broadcast to specific order subscribers
        wsGateway.broadcastToRoom(`order:${orderId}`, {
          type: 'DRIVER_LOCATION_UPDATE',
          ...trackingData,
        });
      }
    }

    // Broadcast to global admin tracking
    wsGateway.broadcastToRoom('admin:tracking', {
      type: 'DRIVER_PING',
      driverId,
      orderId: orderId ? Number(orderId) : null,
      lat: coord.lat,
      lng: coord.lng,
      speedKmh,
      timestamp: Date.now(),
    });

    return trackingData;
  }

  /**
   * Verifies if a driver location is within the SLA geofence for delivery completion.
   * Standard SLA radius is 150 meters (0.15 km) per specification, unless overridden with reason.
   *
   * @param {Object} driverCoord - { lat, lng }
   * @param {Object} destinationCoord - { lat, lng }
   * @param {number} [maxDistanceMeters=150]
   * @returns {{ isWithinGeofence: boolean, distanceMeters: number, maxAllowedMeters: number }}
   */
  verifyDeliveryGeofence(driverCoord, destinationCoord, maxDistanceMeters = 150) {
    if (!geo.isValidCoordinate(driverCoord) || !geo.isValidCoordinate(destinationCoord)) {
      throw new AppError('Invalid coordinates for geofence verification', 400);
    }
    const distanceKm = geo.calculateHaversineDistance(driverCoord, destinationCoord);
    const distanceMeters = Math.round(distanceKm * 1000);
    return {
      isWithinGeofence: distanceMeters <= maxDistanceMeters,
      distanceMeters,
      maxAllowedMeters: maxDistanceMeters,
    };
  }

  /**
   * Retrieves complete order tracking snapshot (driver coordinates, polyline path, ETA).
   *
   * @param {number|string} orderId
   * @returns {Promise<Object>}
   */
  async getOrderTracking(orderId) {
    const { rows: orderRows } = await query(
      `SELECT o.id, o.status, o.delivery_address, o.delivery_lat, o.delivery_lng, o.created_at,
              u.name AS customer_name, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!orderRows.length) {
      throw new AppError(`Order ${orderId} not found`, 404);
    }

    const order = orderRows[0];

    // Find active assignment
    const { rows: assignRows } = await query(
      `SELECT da.*, d.name AS driver_name, d.phone AS driver_phone, d.rating AS driver_rating,
              d.current_lat AS driver_lat, d.current_lng AS driver_lng, d.status AS driver_status
       FROM delivery_assignments da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.order_id = $1
       ORDER BY da.id DESC LIMIT 1`,
      [orderId]
    );

    const assignment = assignRows.length > 0 ? assignRows[0] : null;

    const destination = {
      lat: Number(order.delivery_lat || DEFAULT_DARK_STORE.lat + 0.02),
      lng: Number(order.delivery_lng || DEFAULT_DARK_STORE.lng + 0.02),
    };

    let driverPosition = null;
    let distanceRemainingKm = 0;
    let eta = null;
    let polyline = [];

    if (assignment) {
      driverPosition = {
        lat: Number(assignment.driver_lat),
        lng: Number(assignment.driver_lng),
      };

      distanceRemainingKm = geo.calculateHaversineDistance(driverPosition, destination);
      eta = etaPredictor.predictETA(distanceRemainingKm, {
        isPickedUp: assignment.status === 'PICKED_UP' || order.status === 'out_for_delivery',
      });

      // Generate visual polyline connecting dark store, driver, and destination
      polyline = geo.interpolatePoints(driverPosition, destination, 8);
    } else {
      distanceRemainingKm = geo.calculateHaversineDistance(DEFAULT_DARK_STORE, destination);
      eta = etaPredictor.predictETA(distanceRemainingKm, { isPickedUp: false });
      polyline = geo.interpolatePoints(DEFAULT_DARK_STORE, destination, 8);
    }

    return {
      orderId: order.id,
      status: order.status,
      customer: {
        name: order.customer_name,
        address: order.delivery_address,
      },
      darkStore: DEFAULT_DARK_STORE,
      destination,
      assignment: assignment
        ? {
            id: assignment.id,
            status: assignment.status,
            assignedAt: assignment.assigned_at,
            driver: {
              id: assignment.driver_id,
              name: assignment.driver_name,
              phone: assignment.driver_phone,
              rating: assignment.driver_rating,
              status: assignment.driver_status,
              currentPosition: driverPosition,
            },
          }
        : null,
      distanceRemainingKm,
      eta,
      polyline,
    };
  }

  /**
   * Starts an automated mock route simulation for demonstration or testing.
   * Steps along simulated route every intervalMs.
   *
   * @param {number|string} orderId
   * @param {number} [intervalMs=500]
   * @returns {Promise<{ started: boolean, totalSteps: number }>}
   */
  async startOrderSimulation(orderId, intervalMs = 500) {
    if (this.activeSimulations.has(orderId)) {
      clearInterval(this.activeSimulations.get(orderId));
      this.activeSimulations.delete(orderId);
    }

    const tracking = await this.getOrderTracking(orderId);
    let driverId = tracking.assignment ? tracking.assignment.driver.id : null;

    if (!driverId) {
      const assigned = await this.assignDriverToOrder(orderId);
      driverId = assigned.driver.id;
    }

    const routeSteps = driverSimulation.generateRoute({
      origin: DEFAULT_DARK_STORE,
      destination: tracking.destination,
      totalSteps: 15,
      baseSpeedKmh: 25.0,
    });

    const simulator = driverSimulation.createRouteSimulator(routeSteps);

    const timer = setInterval(async () => {
      try {
        const step = simulator.getCurrentStep();
        await this.ingestDriverLocation({
          driverId,
          orderId,
          lat: step.lat,
          lng: step.lng,
          speedKmh: step.speedKmh,
        });

        if (simulator.isComplete()) {
          clearInterval(timer);
          this.activeSimulations.delete(orderId);

          // Mark delivered
          await query("UPDATE orders SET status = 'delivered' WHERE id = $1", [orderId]);
          await query("UPDATE drivers SET status = 'IDLE' WHERE id = $1", [driverId]);
          await query(
            "UPDATE delivery_assignments SET status = 'DELIVERED', delivered_at = NOW() WHERE order_id = $1",
            [orderId]
          );

          wsGateway.broadcastToRoom(`order:${orderId}`, {
            type: 'ORDER_DELIVERED',
            orderId: Number(orderId),
            timestamp: Date.now(),
          });
        } else {
          simulator.step();
        }
      } catch (err) {
        logger.error('Error during order simulation tick', { error: err.message, orderId });
        clearInterval(timer);
        this.activeSimulations.delete(orderId);
      }
    }, intervalMs);

    this.activeSimulations.set(orderId, timer);

    return {
      started: true,
      totalSteps: routeSteps.length,
      driverId,
    };
  }

  /**
   * Stops any running simulation for an order.
   * @param {number|string} orderId
   */
  stopOrderSimulation(orderId) {
    if (this.activeSimulations.has(orderId)) {
      clearInterval(this.activeSimulations.get(orderId));
      this.activeSimulations.delete(orderId);
      return true;
    }
    return false;
  }
}

const dispatchService = new DispatchService();

module.exports = {
  DEFAULT_DARK_STORE,
  DispatchService,
  dispatchService,
};
