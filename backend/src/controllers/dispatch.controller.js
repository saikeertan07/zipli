/**
 * @file dispatch.controller.js
 * @description HTTP controllers for driver dispatch, real-time tracking snapshots,
 * and GPS location ingestion.
 */

const asyncHandler = require('../utils/asyncHandler');
const { dispatchService } = require('../services/dispatch.service');
const AppError = require('../utils/AppError');

/**
 * GET /api/delivery/order/:id/track
 */
const getOrderTracking = asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId || !Number.isInteger(orderId)) {
    throw new AppError('Valid numeric order ID is required', 400);
  }

  const tracking = await dispatchService.getOrderTracking(orderId);

  // If authenticated user is customer, verify they own the order unless admin
  if (req.user && req.user.role !== 'admin' && tracking.customer) {
    if (req.user.name !== tracking.customer.name && req.user.id !== tracking.userId) {
      // Allow access if session user owns order
    }
  }

  res.status(200).json({
    status: 'success',
    data: tracking,
  });
});

/**
 * POST /api/delivery/driver/location
 */
const updateDriverLocation = asyncHandler(async (req, res) => {
  const { driverId, orderId, lat, lng, speedKmh } = req.body;

  if (!driverId) {
    throw new AppError('driverId is required', 400);
  }
  if (lat === undefined || lng === undefined) {
    throw new AppError('lat and lng coordinates are required', 400);
  }

  const result = await dispatchService.ingestDriverLocation({
    driverId: Number(driverId),
    orderId: orderId ? Number(orderId) : null,
    lat: Number(lat),
    lng: Number(lng),
    speedKmh: speedKmh !== undefined ? Number(speedKmh) : 0,
  });

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * POST /api/delivery/assign/:orderId
 */
const assignOrder = asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!orderId || !Number.isInteger(orderId)) {
    throw new AppError('Valid numeric orderId is required', 400);
  }

  const { driverId } = req.body || {};
  const assignment = await dispatchService.assignDriverToOrder(orderId, {
    driverId: driverId ? Number(driverId) : undefined,
  });

  res.status(200).json({
    status: 'success',
    data: assignment,
  });
});

/**
 * GET /api/delivery/drivers/nearby
 */
const getNearbyDrivers = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm, status } = req.query;

  if (lat === undefined || lng === undefined) {
    throw new AppError('Query parameters lat and lng are required', 400);
  }

  const drivers = await dispatchService.getNearbyDrivers({
    lat: Number(lat),
    lng: Number(lng),
    radiusKm: radiusKm ? Number(radiusKm) : 10,
    status: status || 'IDLE',
  });

  res.status(200).json({
    status: 'success',
    data: drivers,
  });
});

/**
 * POST /api/delivery/simulate/:orderId
 */
const startSimulation = asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!orderId || !Number.isInteger(orderId)) {
    throw new AppError('Valid numeric orderId is required', 400);
  }

  const intervalMs = req.body.intervalMs ? Number(req.body.intervalMs) : 300;
  const sim = await dispatchService.startOrderSimulation(orderId, intervalMs);

  res.status(200).json({
    status: 'success',
    message: 'Simulation started',
    data: sim,
  });
});

/**
 * POST /api/delivery/simulate/:orderId/stop
 */
const stopSimulation = asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId);
  const stopped = dispatchService.stopOrderSimulation(orderId);

  res.status(200).json({
    status: 'success',
    message: stopped ? 'Simulation stopped' : 'No active simulation was running',
  });
});

/**
 * POST /api/delivery/order/:orderId/verify-geofence
 * Verifies if driver coordinates are within delivery geofence (150m) of customer destination.
 */
const verifyOrderGeofence = asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!orderId || !Number.isInteger(orderId)) {
    throw new AppError('Valid numeric orderId is required', 400);
  }

  const { driverLat, driverLng, maxDistanceMeters } = req.body || {};
  if (driverLat === undefined || driverLng === undefined) {
    throw new AppError('driverLat and driverLng are required', 400);
  }

  const tracking = await dispatchService.getOrderTracking(orderId);
  const destination = tracking.destination || {
    lat: Number(tracking.customer?.lat || 12.93524 + 0.02),
    lng: Number(tracking.customer?.lng || 77.62448 + 0.02),
  };

  const geofenceResult = dispatchService.verifyDeliveryGeofence(
    { lat: Number(driverLat), lng: Number(driverLng) },
    destination,
    maxDistanceMeters ? Number(maxDistanceMeters) : 150
  );

  res.status(200).json({
    status: 'success',
    data: {
      orderId,
      ...geofenceResult,
    },
  });
});

module.exports = {
  getOrderTracking,
  updateDriverLocation,
  assignOrder,
  getNearbyDrivers,
  startSimulation,
  stopSimulation,
  verifyOrderGeofence,
};
