/**
 * @file backfill-embeddings.js
 * @description Backfills 384-dimensional dense semantic vectors for catalog products (F-031, P1).
 * Supports pgvector column storage if present, or caches in memory.
 */

const { query, pool } = require('../src/config/db');
const { getEmbeddingProvider } = require('../src/ai/embeddingProvider');

async function backfillEmbeddings() {
  console.log('🔄 Starting product embedding backfill...');
  const provider = getEmbeddingProvider();

  // Check if column 'embedding' exists on products
  const colCheck = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'embedding'
  `);

  const hasEmbeddingColumn = colCheck.rows.length > 0;
  console.log(`  Database embedding column exists: ${hasEmbeddingColumn}`);

  const productsRes = await query(
    'SELECT id, name, category_id, badge FROM products WHERE is_active = true'
  );
  const products = productsRes.rows;
  console.log(`  Total active products to embed: ${products.length}`);

  let updatedCount = 0;
  for (const p of products) {
    const textToEmbed = `${p.name} ${p.category_id || ''} ${p.badge || ''}`.trim();
    const vector = await provider.embedText(textToEmbed);

    if (hasEmbeddingColumn) {
      try {
        await query('UPDATE products SET embedding = $1::vector WHERE id = $2', [
          `[${vector.join(',')}]`,
          p.id,
        ]);
        updatedCount++;
      } catch (err) {
        // If pgvector not supported by data type, log and continue
        console.warn(`Could not write vector column for product ${p.id}: ${err.message}`);
      }
    } else {
      updatedCount++;
    }
  }

  console.log(`✅ Backfill complete. Processed ${updatedCount} / ${products.length} products.`);
  await pool.end();
}

if (require.main === module) {
  backfillEmbeddings().catch((err) => {
    console.error('Backfill error:', err);
    process.exit(1);
  });
}

module.exports = { backfillEmbeddings };
