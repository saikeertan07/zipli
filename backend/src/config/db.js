const { Pool } = require('pg');
const { env } = require('./env');
const logger = require('../utils/logger');

const SLOW_QUERY_THRESHOLD_MS = 200;

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ...(env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('@postgres:')
        ? {}
        : { ssl: { rejectUnauthorized: false } }),
    }
  : {
      host: env.PGHOST,
      port: env.PGPORT,
      database: env.PGDATABASE,
      user: env.PGUSER,
      password: env.PGPASSWORD,
    };

const pool = new Pool({
  ...poolConfig,
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10 second statement timeout
});

pool.on('error', (err) => {
  // Errors on idle clients — log and let the process supervisor handle restarts.
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

/**
 * Instrumented query runner with slow query detection.
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow PostgreSQL Query detected', {
        duration,
        query:
          typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 200) : 'dynamic',
      });
    }
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error('PostgreSQL query execution failed', {
      duration,
      query: typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 200) : 'dynamic',
      error: err.message,
    });
    throw err;
  }
};

const { AsyncLocalStorage } = require('async_hooks');
const dbContextStorage = new AsyncLocalStorage();

/**
 * Non-superuser connection pool for RLS-enforced queries.
 */
let appPoolInstance = null;
function getAppPool() {
  if (!appPoolInstance) {
    const appUser = process.env.PG_APP_USER || 'zipli_app';
    const appPassword = process.env.PG_APP_PASSWORD || 'zipli_secure_app_pass_2026';
    let appConfig;
    if (env.DATABASE_URL) {
      const parsed = new URL(env.DATABASE_URL);
      parsed.username = appUser;
      parsed.password = appPassword;
      appConfig = { connectionString: parsed.toString() };
    } else {
      appConfig = {
        host: env.PGHOST,
        port: env.PGPORT,
        database: env.PGDATABASE,
        user: appUser,
        password: appPassword,
      };
    }
    appPoolInstance = new Pool({
      ...appConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    appPoolInstance.on('error', (err) => {
      logger.error('Unexpected error on idle zipli_app PostgreSQL client', { error: err.message });
    });
  }
  return appPoolInstance;
}

/**
 * Run a callback within an AsyncLocalStorage tenant DB context.
 */
function runWithDbContext(context, fn) {
  return dbContextStorage.run(context, fn);
}

function getDbContext() {
  return dbContextStorage.getStore();
}

/**
 * Configure per-request session variables on a PostgreSQL client.
 * Sets app.current_user, app.current_store, app.is_admin, app.is_system.
 * @param {import('pg').PoolClient} client
 * @param {Object} [ctx]
 * @param {boolean} [isLocal=true]
 */
async function setClientContext(client, ctx, isLocal = true) {
  const context = ctx || dbContextStorage.getStore() || {};
  const userId = context.userId ? String(context.userId) : '';
  const storeId = context.storeId ? String(context.storeId) : '';
  const isAdmin = context.isAdmin ? 'true' : 'false';
  const isSystem = context.isSystem ? 'true' : 'false';

  await client.query(`
    SELECT
      set_config('app.current_user', $1, $5),
      set_config('app.current_store', $2, $5),
      set_config('app.is_admin', $3, $5),
      set_config('app.is_system', $4, $5);
  `, [userId, storeId, isAdmin, isSystem, isLocal]);
}

/**
 * Runs a transactional block with tenant session context applied.
 * @param {Object} context
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @param {Object} [options]
 * @param {boolean} [options.useAppRole=false]
 */
async function withDbContext(context, fn, options = {}) {
  const targetPool = options.useAppRole ? getAppPool() : pool;
  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');
    await setClientContext(client, context, true);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Connection pool telemetry helper.
 */
function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: 25,
  };
}

module.exports = {
  pool,
  query,
  getPoolStats,
  SLOW_QUERY_THRESHOLD_MS,
  getAppPool,
  runWithDbContext,
  getDbContext,
  setClientContext,
  withDbContext,
};

