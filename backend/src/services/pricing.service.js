/**
 * @file pricing.service.js
 * @description Phase 8 Dynamic Pricing and Basket Completion Service:
 * 1. Expiry-based markdown curve & bounded demand nudges ([-8%, +8%], ceiling MRP)
 * 2. Audit trail in price_changes table
 * 3. Knapsack / Subset-Sum basket completion for "Add ₹X more for free delivery"
 */

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { dynamicPricing, basketOptimizer } = require('../algo');

class PricingService {
  /**
   * Calculates real-time dynamic price for a product without immediately persisting.
   *
   * @param {number|string} productId
   * @param {number} [demandRatio=1.0]
   * @returns {Promise<Object>}
   */
  async calculateDynamicProductPrice(productId, demandRatio = 1.0) {
    const pid = Number(productId);
    if (!pid) {
      throw new AppError('Valid product ID is required', 400);
    }

    const prodRes = await query(
      `SELECT id, name, price, mrp, is_perishable, shelf_life_days
       FROM products
       WHERE id = $1`,
      [pid]
    );

    if (prodRes.rows.length === 0) {
      throw new AppError('Product not found', 404);
    }
    const product = prodRes.rows[0];

    // Find earliest active batch expiry
    const batchRes = await query(
      `SELECT expiry_date
       FROM product_batches
       WHERE product_id = $1 AND quantity > 0
       ORDER BY expiry_date ASC
       LIMIT 1`,
      [pid]
    );

    let daysToExpiry = null;
    if (batchRes.rows.length > 0) {
      const expiryTime = new Date(batchRes.rows[0].expiry_date).getTime();
      daysToExpiry = Math.max(0, Math.round(((expiryTime - Date.now()) / 86400000) * 10) / 10);
    }

    const calc = dynamicPricing.calculateDynamicPrice({
      basePrice: Number(product.price),
      mrp: Number(product.mrp ?? product.price * 1.2),
      daysToExpiry,
      isPerishable: Boolean(product.is_perishable),
      demandRatio: Number(demandRatio ?? 1.0),
    });

    return {
      productId: product.id,
      productName: product.name,
      ...calc,
    };
  }

  /**
   * Evaluates dynamic price and commits change to database with audit log entry.
   *
   * @param {number|string} productId
   * @param {number} [demandRatio=1.0]
   * @param {string} [actor='SYSTEM_DYNAMIC_PRICING']
   * @returns {Promise<Object>}
   */
  async applyDynamicPricing(productId, demandRatio = 1.0, actor = 'SYSTEM_DYNAMIC_PRICING') {
    const calc = await this.calculateDynamicProductPrice(productId, demandRatio);
    const pid = calc.productId;
    const oldPrice = calc.basePrice;
    const newPrice = calc.finalPrice;

    let auditEntry = null;

    if (Math.abs(newPrice - oldPrice) >= 0.01) {
      // Record audit change
      const auditRes = await query(
        `INSERT INTO price_changes (product_id, old_price, new_price, reason, actor)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [pid, oldPrice, newPrice, calc.auditLog.reason, String(actor)]
      );
      auditEntry = auditRes.rows[0];

      // Update active selling price in products table
      await query('UPDATE products SET price = $1 WHERE id = $2', [newPrice, pid]);
      logger.info(
        `Dynamic price updated for product ${pid}: ₹${oldPrice} -> ₹${newPrice} (${calc.auditLog.reason})`
      );
    }

    return {
      productId: pid,
      productName: calc.productName,
      oldPrice,
      newPrice,
      effectiveDiscountPercent: calc.effectiveDiscountPercent,
      expiryStatus: calc.expiryStatus,
      priceUpdated: Boolean(auditEntry),
      auditEntry,
    };
  }

  /**
   * Retrieves audit log history of price adjustments.
   *
   * @param {number|string} [productId]
   * @param {number} [limit=50]
   * @returns {Promise<Array<Object>>}
   */
  async getPriceHistory(productId = null, limit = 50) {
    let sql = `
      SELECT pc.*, p.name as product_name
      FROM price_changes pc
      JOIN products p ON pc.product_id = p.id
    `;
    const params = [];

    if (productId) {
      sql += ' WHERE pc.product_id = $1';
      params.push(Number(productId));
    }

    sql += ' ORDER BY pc.created_at DESC LIMIT $' + (params.length + 1);
    params.push(Math.min(200, Math.max(1, Number(limit) || 50)));

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Optimizes cart completion to qualify for free delivery ("Add ₹X more").
   *
   * @param {number} targetGap
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async optimizeBasket(targetGap, options = {}) {
    const gap = Math.max(0, Math.round(Number(targetGap) || 0));

    if (gap <= 0) {
      return {
        targetGap: 0,
        selectedItems: [],
        totalAddedPrice: 0,
        overshoot: 0,
        totalRelevanceScore: 0,
        freeDeliveryQualified: true,
      };
    }

    // Query active candidate products with stock
    const prodsRes = await query(`
      SELECT id, name, price, mrp, badge, stock
      FROM products
      WHERE is_active = true AND stock > 0
      ORDER BY stock DESC
      LIMIT 40
    `);

    const BADGE_WEIGHTS = { Bestseller: 2.5, Popular: 2.5, Trending: 2.0 };
    const candidatePool = prodsRes.rows.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      relevanceScore: BADGE_WEIGHTS[p.badge] || 1.0,
    }));

    return basketOptimizer.optimizeBasketThreshold({
      targetGap: gap,
      candidatePool,
      options,
    });
  }
}

module.exports = new PricingService();
