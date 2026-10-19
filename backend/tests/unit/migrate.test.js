const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runMigrations } = require('../../src/db/migrate');
const { pool } = require('../../src/config/db');

describe('Database Migration Runner', () => {
  it('applies pending migrations in order and records them in schema_migrations', async () => {
    // Create a temporary migrations directory with dummy migrations
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipli-migrations-test-'));
    fs.writeFileSync(path.join(tempDir, '0001_first.sql'), 'CREATE TABLE test_one (id INT);');
    fs.writeFileSync(path.join(tempDir, '0002_second.sql'), 'CREATE TABLE test_two (id INT);');

    const executedSql = [];
    const insertedVersions = [];

    const mockClient = {
      query: async (sql, params) => {
        executedSql.push({ sql: sql.trim(), params });
        if (sql.includes('SELECT name FROM schema_migrations')) {
          return { rows: [{ name: '0001_first.sql' }] }; // First one already applied
        }
        if (sql.includes('INSERT INTO schema_migrations')) {
          insertedVersions.push(params[0]);
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const originalConnect = pool.connect;
    pool.connect = async () => mockClient;

    try {
      const applied = await runMigrations({ migrationsDir: tempDir });

      assert.deepEqual(applied, ['0002_second.sql']);
      assert.deepEqual(insertedVersions, ['0002_second.sql']);

      const sqlStatements = executedSql.map((e) => e.sql);
      assert.ok(sqlStatements.includes('BEGIN'));
      assert.ok(sqlStatements.includes('CREATE TABLE test_two (id INT);'));
      assert.ok(sqlStatements.includes('COMMIT'));
    } finally {
      pool.connect = originalConnect;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
