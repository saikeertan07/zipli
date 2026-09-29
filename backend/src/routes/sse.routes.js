const { Router } = require('express');
const { sseHub } = require('../services/sse.service');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = Router();

// GET /api/events
// Real-time Server-Sent Events stream for authenticated users
router.get('/', (req, res) => {
  sseHub.handleConnection(req, res);
});

// GET /api/events/stats
// Admin inspection of SSE cluster connections
router.get('/stats', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    status: 'success',
    data: sseHub.getConnectionStats(),
  });
});

module.exports = router;
