/**
 * @file pricing.routes.js
 * @description Express routes for Phase 8 Dynamic Pricing, Price Change Audits,
 * and Basket Threshold Optimizer.
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  getDynamicPrice,
  applyDynamicPrice,
  getPriceHistory,
  getBasketOptimizer,
} = require('../controllers/pricing.controller');

// Basket Threshold Completion ("Add ₹X more for free delivery")
router.get('/basket-optimizer', optionalAuth, getBasketOptimizer);

// Dynamic Price preview and update
router.get('/dynamic/:productId', optionalAuth, getDynamicPrice);
router.post('/dynamic/:productId', optionalAuth, applyDynamicPrice);

// Price Changes Audit History
router.get('/history', optionalAuth, getPriceHistory);
router.get('/history/:productId', optionalAuth, getPriceHistory);

module.exports = router;
