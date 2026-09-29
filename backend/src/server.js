const http = require('http');
const { env } = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const { closeRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { catalogSearchService } = require('./services/catalogSearch.service');
const { wsGateway } = require('./websocket/wsServer');
const { sseHub } = require('./services/sse.service');
const { outboxRelayService } = require('./services/outboxRelay.service');

const PORT = env.PORT;
let server;

async function start() {
  try {
    // Fail fast with a clear message if the database isn't reachable.
    await pool.query('SELECT 1');
    logger.info('Connected to PostgreSQL database');

    // Index active catalog products into in-memory search engine
    await catalogSearchService.init(pool);

    // Start background transactional outbox relay
    outboxRelayService.startRelay(5000);
  } catch (err) {
    logger.error('Could not connect to PostgreSQL database', {
      error: err.message,
      hint: 'Check your .env DATABASE_URL / PG_* values and that Postgres is running.',
    });
    process.exit(1);
  }

  server = http.createServer(app);
  wsGateway.init(server);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Zipli API listening on http://localhost:${PORT}`, {
      port: PORT,
      nodeEnv: env.NODE_ENV,
      wsPath: '/ws',
      ssePath: '/api/events',
      metricsPath: '/metrics',
    });
  });
}

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  try {
    // 1. Close SSE & WebSocket streams
    sseHub.closeAll();
    await wsGateway.close();

    // 2. Stop outbox relay
    outboxRelayService.stopRelay();

    // 3. Disconnect Redis
    await closeRedis();

    // 4. Drain PostgreSQL pool
    await pool.end();
    logger.info('PostgreSQL connection pool drained');

    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  start();
}

module.exports = { start, gracefulShutdown };
