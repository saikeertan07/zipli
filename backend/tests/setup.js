const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });
process.env.NODE_ENV = 'test';

const { pool } = require('../src/config/db');

/**
 * Truncates user-data tables to ensure a clean slate between tests.
 * Preserves categories and products seeded for catalog browsing.
 */
async function truncateUserData() {
  await pool.query(`
    TRUNCATE users, cart_items, orders, order_items, stock_reservations, outbox_events, notifications
    RESTART IDENTITY CASCADE;
  `);
}

/**
 * Generic table truncation helper.
 * @param {string[]} tables
 */
async function truncateTables(
  tables = [
    'users',
    'cart_items',
    'orders',
    'order_items',
    'stock_reservations',
    'outbox_events',
    'notifications',
  ]
) {
  if (!tables.length) return;
  const tableList = tables.map((t) => `"${t}"`).join(', ');
  await pool.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE;`);
}

afterAll(async () => {
  await pool.end();
});

module.exports = {
  truncateUserData,
  truncateTables,
};
