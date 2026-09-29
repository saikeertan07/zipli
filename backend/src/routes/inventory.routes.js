/**
 * @file inventory.routes.js
 * @description Express routes for Phase 8 Inventory Intelligence:
 * Demand forecasting, Reorder Point & Safety Stock, ABC/XYZ Matrix,
 * Anomaly Detection, and FEFO Batch Allocation.
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  getProductForecast,
  getReorderReport,
  getAbcXyzMatrix,
  getAnomalyReport,
  addProductBatch,
  getBatches,
  allocateFEFO,
  quarantineExpired,
} = require('../controllers/inventory.controller');

// Demand Forecasting
router.get('/forecast/:productId', optionalAuth, getProductForecast);

// Reorder Suggestions (ROP, SS, EOQ)
router.get('/reorder', optionalAuth, getReorderReport);

// ABC / XYZ 9-Box Matrix Classification
router.get('/abc-xyz', optionalAuth, getAbcXyzMatrix);

// Anomaly & Sequential Drift Detection
router.get('/anomalies', optionalAuth, getAnomalyReport);
router.get('/anomalies/:productId', optionalAuth, getAnomalyReport);

// FEFO Batches Management
router.get('/batches', optionalAuth, getBatches);
router.post('/batches', optionalAuth, addProductBatch);
router.post('/batches/allocate', optionalAuth, allocateFEFO);
router.post('/batches/quarantine', optionalAuth, quarantineExpired);

module.exports = router;
