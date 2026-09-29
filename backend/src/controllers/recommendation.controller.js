/**
 * @file recommendation.controller.js
 * @description Controllers for personalized recommendations, A/B testing bucketing,
 * and user replenishment feeds.
 */

const asyncHandler = require('../utils/asyncHandler');
const { recommendationService } = require('../services/recommendation.service');
const AppError = require('../utils/AppError');

// Ensure engine is ready
async function ensureReady() {
  if (!recommendationService.initialized) {
    await recommendationService.init();
  }
}

/**
 * GET /api/recs/home or /recs/home
 * Returns personalized rails ordered by Thompson Sampling bandit or control variant.
 */
const getHomeRecommendations = asyncHandler(async (req, res) => {
  await ensureReady();

  const userId = req.user
    ? req.user.id
    : req.query.user_id
      ? parseInt(req.query.user_id, 10)
      : null;
  const result = await recommendationService.getHomeRails(userId);

  res.json({
    status: 'success',
    data: {
      variant: result.variant,
      rails: result.rails,
    },
  });
});

/**
 * GET /api/recs/product/:id or /recs/product/:id
 * Returns Frequently Bought Together & similar category items.
 */
const getProductRecommendations = asyncHandler(async (req, res) => {
  await ensureReady();

  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    throw new AppError('Invalid product ID', 400);
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 20);
  const recommendations = recommendationService.getProductRecommendations(productId, limit);

  res.json({
    status: 'success',
    data: {
      productId,
      recommendations,
    },
  });
});

/**
 * GET /api/recs/cart or /recs/cart
 * Returns "Complete Your Meal" complementary upsells for current cart items.
 */
const getCartRecommendations = asyncHandler(async (req, res) => {
  await ensureReady();

  const rawItems = req.query.items || req.query.cartItemIds || req.query.item_ids || '';
  let itemIds = [];

  if (Array.isArray(rawItems)) {
    itemIds = rawItems.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
  } else if (typeof rawItems === 'string' && rawItems.trim().length > 0) {
    itemIds = rawItems
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const recommendations = recommendationService.getCartRecommendations(itemIds, limit);

  res.json({
    status: 'success',
    data: {
      recommendations,
    },
  });
});

/**
 * GET /api/recs/again or /recs/again
 * Returns personalized "Buy It Again" replenishment feed.
 */
const getBuyAgainFeed = asyncHandler(async (req, res) => {
  await ensureReady();

  const userId = req.user
    ? req.user.id
    : req.query.user_id
      ? parseInt(req.query.user_id, 10)
      : null;
  if (!userId) {
    return res.json({
      status: 'success',
      data: {
        items: [],
        total: 0,
      },
    });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const result = await recommendationService.getBuyAgainFeed(userId, limit);

  res.json({
    status: 'success',
    data: {
      items: result.items,
      total: result.total,
    },
  });
});

/**
 * POST /api/recs/track
 * Tracks A/B testing events (impressions, clicks, conversions).
 */
const trackAbEvent = asyncHandler(async (req, res) => {
  await ensureReady();

  const { experimentKey, variant, eventType, metadata = {} } = req.body;

  if (!experimentKey || !variant || !eventType) {
    throw new AppError('experimentKey, variant, and eventType are required', 400);
  }

  const userId = req.user ? req.user.id : req.body.userId ? parseInt(req.body.userId, 10) : null;

  const event = await recommendationService.trackEvent({
    experimentKey,
    variant,
    eventType,
    userId,
    metadata,
  });

  res.status(201).json({
    status: 'success',
    message: 'Event recorded successfully',
    data: {
      event,
    },
  });
});

/**
 * GET /api/recs/personalized or /recs/personalized
 * Returns hybrid personalized recommendations blending CF, replenishment, and cart signals.
 */
const getPersonalizedRecommendations = asyncHandler(async (req, res) => {
  await ensureReady();

  const userId = req.user
    ? req.user.id
    : req.query.user_id
      ? parseInt(req.query.user_id, 10)
      : null;

  const rawItems = req.query.items || req.query.cartItemIds || req.query.item_ids || '';
  let cartItemIds = [];
  if (Array.isArray(rawItems)) {
    cartItemIds = rawItems.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
  } else if (typeof rawItems === 'string' && rawItems.trim().length > 0) {
    cartItemIds = rawItems
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const maxPerCategory = Math.min(Math.max(parseInt(req.query.max_per_category, 10) || 3, 1), 10);

  const recommendations = await recommendationService.getPersonalizedRecommendations(userId, {
    cartItemIds,
    limit,
    maxPerCategory,
  });

  res.json({
    status: 'success',
    data: {
      recommendations,
    },
  });
});

module.exports = {
  getHomeRecommendations,
  getProductRecommendations,
  getCartRecommendations,
  getBuyAgainFeed,
  getPersonalizedRecommendations,
  trackAbEvent,
};
