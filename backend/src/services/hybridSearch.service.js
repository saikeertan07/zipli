/**
 * @file hybridSearch.service.js
 * @description Hybrid Multi-Modal Search Service combining BM25 Sparse Lexical Search,
 * Trigram Fuzzy Matching, and Dense pgvector Cosine Distance via Reciprocal Rank Fusion (F-031).
 */

const { query } = require('../config/db');
const { reciprocalRankFusion } = require('../algo/rrf');
const { getEmbeddingProvider, cosineSimilarity } = require('../ai/embeddingProvider');
const logger = require('../utils/logger');

class HybridSearchService {
  constructor() {
    this._hasVectorExtension = null;
    this._hasTrigramExtension = null;
  }

  /**
   * Checks database capabilities for pgvector and pg_trgm extensions.
   */
  async checkCapabilities() {
    if (this._hasVectorExtension === null) {
      try {
        const vRes = await query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
        this._hasVectorExtension = vRes.rows.length > 0;
      } catch {
        this._hasVectorExtension = false;
      }
    }

    if (this._hasTrigramExtension === null) {
      try {
        const tRes = await query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
        this._hasTrigramExtension = tRes.rows.length > 0;
      } catch {
        this._hasTrigramExtension = false;
      }
    }

    return {
      vectorEnabled: this._hasVectorExtension,
      trigramEnabled: this._hasTrigramExtension,
    };
  }

  /**
   * Executes a hybrid multi-modal search combining BM25, Trigram, and Vector results.
   *
   * @param {Object} params
   * @param {string} params.searchTerm - The shopper search query
   * @param {string} [params.category] - Category filter
   * @param {number} [params.maxPrice] - Price ceiling
   * @param {number} [params.limit=10] - Number of items to return
   * @param {Array<number>} [params.queryEmbedding] - Optional dense vector embedding
   * @returns {Promise<{ items: Array<Object>, total: number, sourcesUsed: string[], tookMs: number }>}
   */
  async search({ searchTerm, category = null, maxPrice = null, limit = 10, queryEmbedding = null }) {
    const start = Date.now();
    const cleanTerm = (searchTerm || '').trim();
    if (!cleanTerm) {
      return { items: [], total: 0, sourcesUsed: [], tookMs: 0 };
    }

    const { vectorEnabled, trigramEnabled } = await this.checkCapabilities();
    const rankedLists = [];

    // Automatically compute query embedding if not explicitly provided
    let activeEmbedding = queryEmbedding;
    if (!activeEmbedding) {
      try {
        const embProvider = getEmbeddingProvider();
        activeEmbedding = await embProvider.embedText(cleanTerm);
      } catch (err) {
        logger.warn('Failed to generate query embedding', { error: err.message });
      }
    }

    // 1. BM25 Full-Text Lexical Search
    try {
      const bm25Res = await query(
        `SELECT id, name, price, mrp, stock, image_url AS img, emoji, category_id AS cat,
                ts_rank_cd(to_tsvector('english', name || ' ' || COALESCE(badge, '')), plainto_tsquery('english', $1)) AS score
         FROM products
         WHERE is_active = true
           AND (to_tsvector('english', name || ' ' || COALESCE(badge, '')) @@ plainto_tsquery('english', $1)
                OR name ILIKE $2)
           ${category ? 'AND category_id = $3' : ''}
           ${maxPrice ? (category ? 'AND price <= $4' : 'AND price <= $3') : ''}
         ORDER BY score DESC, stock DESC
         LIMIT 20`,
        [
          cleanTerm,
          `%${cleanTerm}%`,
          ...(category ? [category] : []),
          ...(maxPrice ? [maxPrice] : []),
        ]
      );

      if (bm25Res.rows.length > 0) {
        rankedLists.push({
          name: 'bm25_sparse',
          weight: 1.2,
          items: bm25Res.rows,
        });
      }
    } catch (err) {
      logger.warn('BM25 query failed, continuing with fuzzy fallback', { error: err.message });
    }

    // 2. Trigram / Fuzzy Lexical Search
    if (trigramEnabled) {
      try {
        const fuzzyRes = await query(
          `SELECT id, name, price, mrp, stock, image_url AS img, emoji, category_id AS cat,
                  similarity(name, $1) AS score
           FROM products
           WHERE is_active = true
             AND (name % $1 OR name ILIKE $2)
             ${category ? 'AND category_id = $3' : ''}
             ${maxPrice ? (category ? 'AND price <= $4' : 'AND price <= $3') : ''}
           ORDER BY score DESC, stock DESC
           LIMIT 20`,
          [
            cleanTerm,
            `%${cleanTerm}%`,
            ...(category ? [category] : []),
            ...(maxPrice ? [maxPrice] : []),
          ]
        );

        if (fuzzyRes.rows.length > 0) {
          rankedLists.push({
            name: 'trigram_fuzzy',
            weight: 0.8,
            items: fuzzyRes.rows,
          });
        }
      } catch (err) {
        logger.warn('Trigram search query failed', { error: err.message });
      }
    }

    // 3. Dense Vector Cosine Distance Search (Dense Leg of RRF)
    if (vectorEnabled && Array.isArray(activeEmbedding) && activeEmbedding.length > 0) {
      try {
        const vectorRes = await query(
          `SELECT id, name, price, mrp, stock, image_url AS img, emoji, category_id AS cat,
                  (embedding <=> $1::vector) AS distance
           FROM products
           WHERE is_active = true AND embedding IS NOT NULL
             ${category ? 'AND category_id = $2' : ''}
             ${maxPrice ? (category ? 'AND price <= $3' : 'AND price <= $2') : ''}
           ORDER BY distance ASC
           LIMIT 20`,
          [
            `[${activeEmbedding.join(',')}]`,
            ...(category ? [category] : []),
            ...(maxPrice ? [maxPrice] : []),
          ]
        );

        if (vectorRes.rows.length > 0) {
          rankedLists.push({
            name: 'dense_vector',
            weight: 1.0,
            items: vectorRes.rows,
          });
        }
      } catch (err) {
        logger.warn('Vector cosine search failed', { error: err.message });
      }
    } else if (Array.isArray(activeEmbedding) && activeEmbedding.length > 0) {
      // In-memory dense semantic ranking fallback (guarantees dense leg runs in non-pgvector environments)
      try {
        const embProvider = getEmbeddingProvider();
        const candRes = await query(
          `SELECT id, name, price, mrp, stock, image_url AS img, emoji, category_id AS cat
           FROM products
           WHERE is_active = true
             ${category ? 'AND category_id = $1' : ''}
             ${maxPrice ? (category ? 'AND price <= $2' : 'AND price <= $1') : ''}
           LIMIT 60`,
          [
            ...(category ? [category] : []),
            ...(maxPrice ? [maxPrice] : []),
          ]
        );

        if (candRes.rows.length > 0) {
          const scored = [];
          for (const prod of candRes.rows) {
            const prodEmb = await embProvider.embedText(`${prod.name} ${prod.cat || ''}`);
            const sim = cosineSimilarity(activeEmbedding, prodEmb);
            if (sim > 0.25) {
              scored.push({ ...prod, score: sim });
            }
          }
          scored.sort((a, b) => b.score - a.score);
          if (scored.length > 0) {
            rankedLists.push({
              name: 'dense_vector',
              weight: 1.0,
              items: scored.slice(0, 20),
            });
          }
        }
      } catch (embErr) {
        logger.warn('In-memory dense vector fallback failed', { error: embErr.message });
      }
    }

    // If no results from specialized engines, execute standard ILIKE fallback
    if (rankedLists.length === 0) {
      const fallbackRes = await query(
        `SELECT id, name, price, mrp, stock, image_url AS img, emoji, category_id AS cat
         FROM products
         WHERE is_active = true AND (name ILIKE $1 OR category_id ILIKE $1)
         ORDER BY stock DESC LIMIT $2`,
        [`%${cleanTerm}%`, limit]
      );

      return {
        items: fallbackRes.rows,
        total: fallbackRes.rows.length,
        sourcesUsed: ['ilike_fallback'],
        tookMs: Date.now() - start,
      };
    }

    // 4. Reciprocal Rank Fusion (RRF)
    const fused = reciprocalRankFusion(rankedLists, { k: 60, limit });
    const finalItems = fused.map((f) => ({
      ...f.item,
      rrfScore: f.rrfScore,
      matchSources: f.matchSources,
    }));

    return {
      items: finalItems,
      total: finalItems.length,
      sourcesUsed: rankedLists.map((l) => l.name),
      tookMs: Date.now() - start,
    };
  }

  /**
   * Syncs dense vector embedding for a single product upon catalog change (P1).
   */
  async syncProductEmbedding(productId, productName, category = '') {
    try {
      const { vectorEnabled } = await this.checkCapabilities();
      if (!vectorEnabled) return;
      const embProvider = getEmbeddingProvider();
      const vec = await embProvider.embedText(`${productName} ${category}`.trim());
      await query('UPDATE products SET embedding = $1::vector WHERE id = $2', [
        `[${vec.join(',')}]`,
        productId,
      ]);
    } catch (err) {
      logger.warn('Failed to sync product embedding', { productId, error: err.message });
    }
  }
}

const hybridSearchService = new HybridSearchService();

module.exports = {
  HybridSearchService,
  hybridSearchService,
};
