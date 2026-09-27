/**
 * @file inventory.controller.js
 * @description Controllers for Phase 8 Inventory Intelligence:
 * Demand forecasting, Reorder evaluation, ABC/XYZ segmentation,
 * Anomaly detection, and FEFO batch inventory operations.
 */

const asyncHandler = require('../utils/asyncHandler');
const inventoryService = require('../services/inventory.service');
const AppError = require('../utils/AppError');

/**
 * GET /api/inventory/forecast/:productId
 * Returns demand forecast using rolling-origin best selected model (SES vs Holt vs Holt-Winters)
 */
const getProductForecast = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  if (!productId || isNaN(productId)) {
    throw new AppError('Valid productId is required', 400);
  }

  const horizon = Math.min(30, Math.max(1, Number(req.query.horizon) || 7));
  const result = await inventoryService.getForecast(productId, horizon);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/inventory/reorder
 * Returns safety stock (SS), reorder point (ROP), and EOQ evaluation.
 */
const getReorderReport = asyncHandler(async (req, res) => {
  const suggestions = await inventoryService.getReorderSuggestions(req.query);

  res.json({
    status: 'success',
    data: {
      count: suggestions.length,
      suggestions,
    },
  });
});

/**
 * GET /api/inventory/abc-xyz
 * Returns 9-box Pareto revenue and demand volatility classification.
 */
const getAbcXyzMatrix = asyncHandler(async (req, res) => {
  const result = await inventoryService.getAbcXyzAnalysis(req.query);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/inventory/anomalies/:productId?
 * Runs robust modified Z-score and CUSUM drift detection on sales.
 */
const getAnomalyReport = asyncHandler(async (req, res) => {
  const productId = req.params.productId ? Number(req.params.productId) : null;
  const result = await inventoryService.getAnomalyReport(productId);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * POST /api/inventory/batches
 * Ingests a new inventory batch for FEFO tracking.
 */
const addProductBatch = asyncHandler(async (req, res) => {
  const { productId, batchNumber, quantity, expiryDate, costPrice } = req.body;

  if (!productId || !quantity || !expiryDate) {
    throw new AppError('productId, quantity, and expiryDate are required', 400);
  }

  const batch = await inventoryService.addBatch({
    productId,
    batchNumber,
    quantity,
    expiryDate,
    costPrice,
  });

  res.status(201).json({
    status: 'success',
    data: {
      batch,
    },
  });
});

/**
 * GET /api/inventory/batches
 * Lists all active batches or batches for a specific product.
 */
const getBatches = asyncHandler(async (req, res) => {
  const productId = req.query.productId ? Number(req.query.productId) : null;
  const batches = await inventoryService.getBatches(productId);

  res.json({
    status: 'success',
    data: {
      count: batches.length,
      batches,
    },
  });
});

/**
 * POST /api/inventory/batches/allocate
 * Allocates requested quantity using FEFO priority.
 */
const allocateFEFO = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || !quantity) {
    throw new AppError('productId and quantity are required', 400);
  }

  const result = await inventoryService.allocateBatchesFEFO(productId, quantity);

  res.json({
    status: result.success ? 'success' : 'fail',
    data: result,
  });
});

/**
 * POST /api/inventory/batches/quarantine
 * Scans for and quarantines all expired batches.
 */
const quarantineExpired = asyncHandler(async (req, res) => {
  const quarantined = await inventoryService.quarantineExpiredBatches();

  res.json({
    status: 'success',
    data: {
      quarantinedCount: quarantined.length,
      quarantined,
    },
  });
});

module.exports = {
  getProductForecast,
  getReorderReport,
  getAbcXyzMatrix,
  getAnomalyReport,
  addProductBatch,
  getBatches,
  allocateFEFO,
  quarantineExpired,
};
