const { Router } = require('express');
const { validateZod } = require('../middleware/validateZod');
const { optionalAuth } = require('../middleware/auth');
const { assistantLimiter } = require('../middleware/rateLimit');
const { assistantChatSchema, assistantFeedbackSchema, recipeToCartSchema } = require('../schemas');
const {
  assistantChat,
  assistantChatStream,
  assistantFeedback,
  recipeToCart,
  getSubstitutes,
  getReorders,
} = require('../controllers/assistant.controller');

const router = Router();

// POST /api/assistant/chat (GCRA Rate Limited)
router.post('/chat', assistantLimiter, optionalAuth, validateZod(assistantChatSchema), assistantChat);

// POST /api/assistant/chat/stream (SSE Streaming Endpoint - P1)
router.post('/chat/stream', assistantLimiter, optionalAuth, validateZod(assistantChatSchema), assistantChatStream);

// POST /api/assistant/feedback (Persisted in ai_feedback table - P1)
router.post('/feedback', optionalAuth, validateZod(assistantFeedbackSchema), assistantFeedback);

// POST /api/assistant/recipe-to-cart (GCRA Rate Limited)
router.post('/recipe-to-cart', assistantLimiter, optionalAuth, validateZod(recipeToCartSchema), recipeToCart);

// GET /api/assistant/substitutes/:productId (GCRA Rate Limited)
router.get('/substitutes/:productId', assistantLimiter, optionalAuth, getSubstitutes);

// GET /api/assistant/reorders (Strictly requires auth - 401 for guests)
router.get('/reorders', assistantLimiter, optionalAuth, getReorders);

module.exports = router;
