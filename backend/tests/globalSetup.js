const path = require('path');
const dotenv = require('dotenv');

// Explicitly load .env.test before any app code runs
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
process.env.NODE_ENV = 'test';

const { runMigrations } = require('../src/db/migrate');
const { seed } = require('../src/db/seed');
const { pool } = require('../src/config/db');
const logger = require('../src/utils/logger');

module.exports = async () => {
  logger.info(
    '[Jest globalSetup] Preparing test database: running migrations and seeding catalog...'
  );
  try {
    await runMigrations();
    await seed({ closePool: false });
    logger.info('[Jest globalSetup] Test database setup successfully.');
  } catch (err) {
    logger.error('[Jest globalSetup] Failed to initialize test database', { error: err.message });
    throw err;
  } finally {
    await pool.end();
  }
};
