/**
 * @file pricing.controller.js
 * @description Controllers for Phase 8 Dynamic Pricing, Price Audit Logs,
 * and Basket Threshold Optimizer.
 */

const asyncHandler = require('../utils/asyncHandler');
const pricingService = require('../services/pricing.service');
const AppError = require('../utils/AppError');

/**
 * GET /api/pricing/dynamic/:productId
 * Computes dynamic price preview for a product based on expiry decay and demand ratio.
 */
const getDynamicPrice = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  if (!productId || isNaN(productId)) {
    throw new AppError('Valid productId is required', 400);
  }

  const demandRatio = req.query.demandRatio ?? 1.0;
  const result = await pricingService.calculateDynamicProductPrice(productId, demandRatio);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * POST /api/pricing/dynamic/:productId
 * Computes and updates dynamic price in database, logging an audit trail in price_changes.
 */
const applyDynamicPrice = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  if (!productId) {
    throw new AppError('Valid productId is required', 400);
  }

  const demandRatio = req.body.demandRatio ?? 1.0;
  const actor = req.body.actor ?? 'SYSTEM_DYNAMIC_PRICING';

  const result = await pricingService.applyDynamicPricing(productId, demandRatio, actor);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/pricing/history/:productId?
 * Returns audit log of price adjustments.
 */
const getPriceHistory = asyncHandler(async (req, res) => {
  const productId = req.params.productId ? Number(req.params.productId) : null;
  const limit = Number(req.query.limit ?? 50);

  const history = await pricingService.getPriceHistory(productId, limit);

  res.json({
    status: 'success',
    data: {
      count: history.length,
      history,
    },
  });
});

/**
 * GET /api/pricing/basket-optimizer
 * Returns optimized candidate item bundles to reach the free delivery threshold ("Add ₹X more").
 */
const getBasketOptimizer = asyncHandler(async (req, res) => {
  const targetGap = Number(req.query.targetGap);
  if (isNaN(targetGap)) {
    throw new AppError('Valid targetGap query parameter is required', 400);
  }

  const result = await pricingService.optimizeBasket(targetGap, req.query);

  res.json({
    status: 'success',
    data: result,
  });
});

module.exports = {
  getDynamicPrice,
  applyDynamicPrice,
  getPriceHistory,
  getBasketOptimizer,
};
