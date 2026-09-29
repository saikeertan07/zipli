/**
 * @file dispatch.routes.js
 * @description Express routes for driver tracking, dispatch matching, and real-time navigation.
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

const {
  getOrderTracking,
  updateDriverLocation,
  assignOrder,
  getNearbyDrivers,
  startSimulation,
  stopSimulation,
  verifyOrderGeofence,
} = require('../controllers/dispatch.controller');

// Order tracking snapshot
router.get('/order/:id/track', optionalAuth, getOrderTracking);

// Geofence verification for delivery completion SLA (150m)
router.post('/order/:orderId/verify-geofence', optionalAuth, verifyOrderGeofence);

// Nearby drivers lookup
router.get('/drivers/nearby', optionalAuth, getNearbyDrivers);

// Driver GPS location update ping
router.post('/driver/location', optionalAuth, updateDriverLocation);

// Assign driver to order (Admin or auto-dispatch)
router.post('/assign/:orderId', optionalAuth, assignOrder);

// Real-time route simulation controls
router.post('/simulate/:orderId', optionalAuth, startSimulation);
router.post('/simulate/:orderId/stop', optionalAuth, stopSimulation);

module.exports = router;
