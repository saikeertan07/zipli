/**
 * @file assistant.controller.js
 * @description Controller for the Zipli AI Grocery Assistant (P0/P1).
 * Features:
 * - Multi-turn agent loop with server-side conversation IDs and Redis TTL storage
 * - Real-time Server-Sent Events (SSE) streaming endpoint (/chat/stream)
 * - Persistent eval analytics via ai_feedback table
 * - Strict authentication enforcement on personalized reorders (/reorders)
 */

const { aiGateway } = require('../ai/gateway');
const { assistiveAIService } = require('../services/assistiveAI.service');
const { conversationStore } = require('../ai/conversationStore');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// POST /api/assistant/chat
const assistantChat = asyncHandler(async (req, res) => {
  const { message = '', conversationId = null, conversationHistory = [] } = req.body;
  const userId = req.user ? req.user.id : null;
  const clientIp = (req.headers && req.headers['x-forwarded-for']) || req.ip || '127.0.0.1';

  const result = await aiGateway.processChat({
    message,
    conversationId,
    conversationHistory,
    userId,
    clientIp,
  });

  res.json({
    status: 'success',
    data: result,
  });
});

// POST /api/assistant/chat/stream (SSE Streaming Endpoint - P1)
const assistantChatStream = asyncHandler(async (req, res) => {
  const { message = '', conversationId = null, conversationHistory = [] } = req.body;
  const userId = req.user ? req.user.id : null;
  const clientIp = (req.headers && req.headers['x-forwarded-for']) || req.ip || '127.0.0.1';

  // Set standard SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await aiGateway.processChat({
      message,
      conversationId,
      conversationHistory,
      userId,
      clientIp,
      onStreamEvent: (type, payload) => {
        sendEvent(type, payload);
      },
    });

    // Stream text chunks
    const responseText = result.response || '';
    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      sendEvent('delta', { text: chunk });
    }

    sendEvent('done', result);
    res.end();
  } catch (err) {
    logger.error('Error during AI chat stream', { error: err.message });
    sendEvent('error', { message: err.message });
    res.end();
  }
});

// POST /api/assistant/feedback (Persisted in ai_feedback table with server-derived metadata - P1)
const assistantFeedback = asyncHandler(async (req, res) => {
  const { rating, messageId = null, conversationId = null, comment = null } = req.body;
  const userId = req.user ? req.user.id : null;

  let provider = null;
  let latencyMs = null;
  let tokensUsed = null;
  let toolNames = [];
  let resolvedConversationId = conversationId;

  // Derive execution metadata server-side to prevent spoofing
  if (messageId) {
    const meta = await conversationStore.getMessageMetadata(messageId);
    if (meta) {
      provider = meta.provider || null;
      latencyMs = meta.latencyMs || null;
      tokensUsed = meta.tokensUsed || null;
      toolNames = Array.isArray(meta.toolNames) ? meta.toolNames : [];
      if (!resolvedConversationId && meta.conversationId) {
        resolvedConversationId = meta.conversationId;
      }
    }
  }

  try {
    await query(
      `INSERT INTO ai_feedback (conversation_id, message_id, user_id, rating, tool_names, provider, latency_ms, tokens_used, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        resolvedConversationId,
        messageId,
        userId,
        rating,
        toolNames,
        provider,
        latencyMs,
        tokensUsed,
        comment,
      ]
    );
  } catch (err) {
    logger.warn('Failed to insert AI feedback into database', { error: err.message });
  }

  logger.info('AI Assistant feedback recorded', {
    rating,
    messageId,
    conversationId: resolvedConversationId,
    userId,
  });
  res.json({
    status: 'success',
    data: { recorded: true, rating, messageId, conversationId: resolvedConversationId },
  });
});

// POST /api/assistant/recipe-to-cart
const recipeToCart = asyncHandler(async (req, res) => {
  const { dish, servings = 2 } = req.body;
  const result = await assistiveAIService.recipeToCart(dish, { servings });
  res.json({
    status: 'success',
    data: result,
  });
});

// GET /api/assistant/substitutes/:productId
const getSubstitutes = asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const limit = parseInt(req.query.limit, 10) || 3;
  const result = await assistiveAIService.findSubstitutes(productId, { limit });
  res.json({
    status: 'success',
    data: result,
  });
});

// GET /api/assistant/reorders (Strictly 401 on unauthenticated guest - P0)
const getReorders = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    throw new AppError('Authentication required to view personalized reorder history', 401);
  }
  const userId = req.user.id;
  const limit = parseInt(req.query.limit, 10) || 5;
  const result = await assistiveAIService.getSmartReorderSuggestions(userId, { limit });
  res.json({
    status: 'success',
    data: result,
  });
});

module.exports = {
  assistantChat,
  assistantChatStream,
  assistantFeedback,
  recipeToCart,
  getSubstitutes,
  getReorders,
};
