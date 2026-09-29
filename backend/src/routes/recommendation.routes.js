/**
 * @file recommendation.routes.js
 * @description Routes for homepage rails, item-item associations, cart-aware upsells,
 * replenishment "Buy It Again", and A/B event tracking.
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  getHomeRecommendations,
  getProductRecommendations,
  getCartRecommendations,
  getBuyAgainFeed,
  getPersonalizedRecommendations,
  trackAbEvent,
} = require('../controllers/recommendation.controller');

// Homepage rails with multi-armed bandit ranking and A/B variant assignment
router.get('/home', optionalAuth, getHomeRecommendations);

// Frequently Bought Together for product page
router.get('/product/:id', getProductRecommendations);

// Cart-aware complementary upsells
router.get('/cart', getCartRecommendations);

// Personalized replenishment feed
router.get('/again', optionalAuth, getBuyAgainFeed);

// Hybrid personalized recommendations
router.get('/personalized', optionalAuth, getPersonalizedRecommendations);

// A/B test tracking endpoint
router.post('/track', optionalAuth, trackAbEvent);

module.exports = router;
