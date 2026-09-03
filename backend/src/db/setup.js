// Database setup script - executes pending migrations using the migration runner
const { runMigrations } = require('./migrate');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

async function setup() {
  logger.info('Setting up database using migration runner...');
  const applied = await runMigrations();
  logger.info(`Database setup complete. ${applied.length} migration(s) applied.`);
  await pool.end();
}

setup().catch((err) => {
  logger.error('Failed to set up database', { error: err.message });
  pool.end().finally(() => process.exit(1));
});
