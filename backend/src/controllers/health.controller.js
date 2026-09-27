const db = require('../config/db');
const { isRedisReady } = require('../config/redis');
const { getAIHealthStatus } = require('../ai/providers');
const packageJson = require('../../package.json');

/**
 * Health check handler returning status of DB, Redis, uptime and version.
 * GET /api/v1/health
 */
async function getHealth(req, res) {
  let dbStatus = 'disconnected';
  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (_err) {
    dbStatus = 'disconnected';
  }

  // Redis is introduced in architecture for queues/caching; report disabled or connected
  const redisReady = isRedisReady();
  const redisStatus = process.env.REDIS_URL
    ? redisReady
      ? 'connected'
      : 'disconnected'
    : 'disabled';

  const aiStatus = getAIHealthStatus();

  const healthData = {
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    version: packageJson.version || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      db: dbStatus,
      redis: redisStatus,
      ai: aiStatus,
    },
    db: dbStatus,
    redis: redisStatus,
    ai: aiStatus,
  };

  const statusCode = dbStatus === 'connected' ? 200 : 503;
  return res.status(statusCode).json({
    status: dbStatus === 'connected' ? 'success' : 'error',
    data: healthData,
  });
}

/**
 * GET /health/liveness
 * Instant probe verifying Node.js event loop and process responsiveness.
 */
function getLiveness(req, res) {
  return res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
}

/**
 * GET /health/readiness
 * Deep dependency check ensuring database connection pool is healthy.
 */
async function getReadiness(req, res) {
  let isDbReady = false;
  try {
    await db.query('SELECT 1');
    isDbReady = true;
  } catch {
    isDbReady = false;
  }

  const redisReady = isRedisReady();
  const poolStats = db.getPoolStats ? db.getPoolStats() : {};
  const aiStatus = getAIHealthStatus();

  const isReady = isDbReady;

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? 'READY' : 'NOT_READY',
    timestamp: new Date().toISOString(),
    services: {
      database: isDbReady ? 'UP' : 'DOWN',
      redis: redisReady ? 'UP' : 'STANDALONE',
      ai: aiStatus,
    },
    pool: poolStats,
  });
}

module.exports = {
  getHealth,
  getLiveness,
  getReadiness,
};
