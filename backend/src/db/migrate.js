const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Ensures the schema_migrations tracking table exists.
 * @param {import('pg').PoolClient} client
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Runs all pending migrations in alphabetical order.
 * @param {Object} [options]
 * @param {string} [options.migrationsDir] - Custom directory for migration files.
 * @returns {Promise<string[]>} - List of newly applied migration names.
 */
async function runMigrations(options = {}) {
  const dir = options.migrationsDir || MIGRATIONS_DIR;
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  const appliedMigrations = [];

  try {
    await ensureMigrationsTable(client);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const appliedSet = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      logger.info(`Applying migration: ${file}`);
      const filePath = path.join(dir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedMigrations.push(file);
        logger.info(`Successfully applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Failed to apply migration: ${file}`, { error: err.message });
        throw err;
      }
    }

    if (appliedMigrations.length === 0) {
      logger.info('Database schema is already up to date. No pending migrations.');
    }

    return appliedMigrations;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then((applied) => {
      logger.info(`Migration complete. ${applied.length} migration(s) applied.`);
      return pool.end();
    })
    .catch((err) => {
      logger.error('Migration failed', { error: err.message });
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = {
  runMigrations,
  ensureMigrationsTable,
};
