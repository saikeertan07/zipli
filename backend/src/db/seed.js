// Seeds categories and products using the data extracted from the original
// static frontend, so the catalog matches exactly what was on the page.
const { pool } = require('../config/db');
const logger = require('../utils/logger');
const categories = require('./categories.seed.json');
const products = require('./products.seed.json');

async function seed(options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info(`Seeding ${categories.length} categories ...`);
    for (const c of categories) {
      await client.query(
        `INSERT INTO categories (id, name, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, emoji = EXCLUDED.emoji`,
        [c.id, c.name, c.emoji]
      );
    }

    logger.info(`Seeding ${products.length} products ...`);
    for (const p of products) {
      await client.query(
        `INSERT INTO products (id, name, qty_label, price, mrp, emoji, category_id, badge, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, qty_label = EXCLUDED.qty_label, price = EXCLUDED.price,
           mrp = EXCLUDED.mrp, emoji = EXCLUDED.emoji, category_id = EXCLUDED.category_id,
           badge = EXCLUDED.badge, image_url = EXCLUDED.image_url`,
        [p.id, p.name, p.qty, p.price, p.mrp, p.emoji, p.cat, p.badge, '/images/placeholder.jpg']
      );
    }

    // Keep the products_id_seq ahead of the highest manually-inserted id.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('products','id'), (SELECT MAX(id) FROM products))`
    );

    await client.query('COMMIT');
    logger.info('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (options.closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  seed({ closePool: true }).catch((err) => {
    logger.error('Seeding failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { seed };
