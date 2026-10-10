const { pool } = require('../src/config/db');
const { closeRedis } = require('../src/config/redis');

module.exports = async () => {
  try {
    await closeRedis();
  } catch (_err) {
    // Ignore teardown errors
  }
  try {
    await pool.end();
  } catch (_err) {
    // Ignore teardown errors on already closed pool
  }
};
