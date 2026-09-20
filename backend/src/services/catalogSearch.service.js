/**
 * @file catalogSearch.service.js
 * @description In-memory catalog search service wrapping SearchEngine.
 * Synchronizes with database on boot and updates in real-time on catalog mutations.
 */

const { SearchEngine } = require('../algo/searchEngine');
const logger = require('../utils/logger');
const { pool } = require('../config/db');

class CatalogSearchService {
  constructor() {
    this.engine = new SearchEngine();
    this.initialized = false;
  }

  /**
   * Loads all active products from PostgreSQL into the in-memory search engine.
   *
   * @param {Object} [dbPool=pool] - PostgreSQL connection pool.
   * @returns {Promise<number>} Number of indexed products.
   */
  async init(dbPool = pool) {
    try {
      const { rows } = await dbPool.query(
        `SELECT id, name, qty_label AS qty, price, mrp, emoji, category_id, category_id AS cat, badge,
                image_url, ('/images/products/' || id || '.jpg') AS img, stock, reorder_level, is_active
         FROM products
         WHERE is_active = true`
      );

      this.engine.clear();
      this.engine.indexProducts(rows);
      this.initialized = true;

      logger.info({
        message: 'Catalog search engine indexed active catalog products',
        count: rows.length,
      });

      return rows.length;
    } catch (err) {
      logger.error({
        message: 'Failed to initialize catalog search engine',
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Searches the in-memory catalog index.
   *
   * @param {string} query - User search query.
   * @param {Object} [options] - Search options (category, offset, limit, fuzzy).
   * @returns {Object} Search results, total count, and corrected query.
   */
  search(query, options = {}) {
    return this.engine.search(query, options);
  }

  /**
   * Retrieves prefix suggestions from the Trie.
   *
   * @param {string} prefix - Prefix string.
   * @param {number} [limit=5] - Max suggestions.
   * @returns {string[]} Autocomplete suggestions.
   */
  suggest(prefix, limit = 5) {
    return this.engine.suggest(prefix, limit);
  }

  /**
   * Computes catalog facets across current indexed documents or matched subset.
   *
   * @param {string} [query] - Optional query to compute facets for.
   * @returns {Object} Facets.
   */
  getFacets(query = '') {
    if (query) {
      const res = this.engine.search(query, { limit: 1000 });
      return res.facets;
    }
    return this.engine.computeFacets(Array.from(this.engine.index.documents.values()));
  }

  /**
   * Returns search queries that produced 0 results.
   */
  getZeroResultQueries(limit = 20) {
    return this.engine.getZeroResultQueries(limit);
  }

  /**
   * Returns top most frequent queries.
   */
  getTopQueries(limit = 20) {
    return this.engine.getTopQueries(limit);
  }

  /**
   * Adds or updates a single product in the in-memory search index.
   *
   * @param {Object} product - Product record.
   */
  indexProduct(product) {
    if (!product) return;
    if (product.is_active === false) {
      this.engine.removeProduct(product.id);
      return;
    }
    const normalized = {
      ...product,
      cat: product.category_id || product.cat,
      category_id: product.category_id || product.cat,
      img: product.img || product.image_url || `/images/products/${product.id}.jpg`,
      qty: product.qty || product.qty_label || '1 unit',
    };
    this.engine.indexProduct(normalized);
  }

  /**
   * Updates an existing product in the search index.
   *
   * @param {Object} product - Product record.
   */
  updateProduct(product) {
    if (!product) return;
    if (product.is_active === false) {
      this.engine.removeProduct(product.id);
      return;
    }
    const normalized = {
      ...product,
      cat: product.category_id || product.cat,
      category_id: product.category_id || product.cat,
      img: product.img || product.image_url || `/images/products/${product.id}.jpg`,
      qty: product.qty || product.qty_label || '1 unit',
    };
    this.engine.updateProduct(normalized);
  }

  /**
   * Removes a product from the search engine.
   *
   * @param {number|string} productId - Product ID.
   */
  removeProduct(productId) {
    this.engine.removeProduct(productId);
  }

  /**
   * Returns current index size.
   */
  get size() {
    return this.engine.size;
  }

  /**
   * Clears the index.
   */
  clear() {
    this.engine.clear();
    this.initialized = false;
  }
}

const catalogSearchService = new CatalogSearchService();

module.exports = {
  CatalogSearchService,
  catalogSearchService,
};
