/**
 * @file inventory.service.js
 * @description Phase 8 Inventory Intelligence Service:
 * 1. Demand forecasting using SES, Holt, Holt-Winters with rolling-origin selection
 * 2. Reorder point (ROP), Safety stock (SS), and EOQ evaluation
 * 3. Robust Z-score & CUSUM anomaly detection
 * 4. FEFO batch management and expired batch quarantine
 * 5. ABC/XYZ revenue and demand volatility classification
 */

const { query, pool } = require('../config/db');
const AppError = require('../utils/AppError');
const {
  forecast,
  inventory,
  anomaly,
  fefo: { FEFOInventoryManager },
  abcXyz,
} = require('../algo');

class InventoryService {
  constructor() {
    this.fefoManager = new FEFOInventoryManager();
  }

  /**
   * Generates a demand forecast for a product using rolling-origin cross-validation.
   *
   * @param {number|string} productId
   * @param {number} [horizon=7]
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getForecast(productId, horizon = 7, options = {}) {
    const pid = Number(productId);
    if (!pid) {
      throw new AppError('Valid product ID is required', 400);
    }

    const prodRes = await query('SELECT id, name FROM products WHERE id = $1', [pid]);
    if (prodRes.rows.length === 0) {
      throw new AppError('Product not found', 404);
    }
    const product = prodRes.rows[0];

    // Query recent historical daily sales
    const salesRes = await query(
      `SELECT DATE(o.created_at) as sale_date, COALESCE(SUM(oi.quantity), 0) as units
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.product_id = $1 AND o.status != 'CANCELLED'
       GROUP BY DATE(o.created_at)
       ORDER BY sale_date ASC`,
      [pid]
    );

    let series = salesRes.rows.map((r) => Number(r.units) || 0);

    // If historical points are too few (< 14) for seasonal modeling, synthesize baseline
    if (series.length < 14) {
      const syntheticBase = [12, 14, 15, 13, 18, 22, 20, 11, 13, 16, 14, 19, 23, 21];
      series =
        series.length > 0
          ? [...syntheticBase.slice(0, 14 - series.length), ...series]
          : syntheticBase;
    }

    const forecastResult = forecast.forecastBestModel(series, { horizon, ...options });

    return {
      productId: product.id,
      productName: product.name,
      historicalSeries: series,
      forecast: forecastResult.forecast,
      bestModel: forecastResult.selectedModel,
      selectedModel: forecastResult.selectedModel,
      bestSmape: forecastResult.metrics ? forecastResult.metrics.bestSmape : 0,
      comparison: forecastResult.metrics,
      horizon,
    };
  }

  /**
   * Evaluates inventory reorder suggestions across all products or a single product.
   *
   * @param {Object} [params]
   * @param {number|string} [params.productId]
   * @param {number} [params.leadTimeDays=3]
   * @param {number} [params.targetServiceLevel=0.95]
   * @returns {Promise<Array<Object>>}
   */
  async getReorderSuggestions(params = {}) {
    const leadTime = Number(params.leadTimeDays ?? 3);
    const serviceLevel = Number(params.targetServiceLevel ?? 0.95);

    let sql = `
      SELECT p.id, p.name, p.price, p.mrp, p.stock,
             COALESCE(p.cost_price, p.price * 0.7) as cost_price,
             p.reorder_level
      FROM products p
      WHERE p.is_active = true
    `;
    const sqlParams = [];

    if (params.productId) {
      sql += ' AND p.id = $1';
      sqlParams.push(Number(params.productId));
    }
    sql += ' ORDER BY p.id ASC';

    const prodsRes = await query(sql, sqlParams);
    const suggestions = [];

    for (const prod of prodsRes.rows) {
      // Historical daily demand
      const demandRes = await query(
        `SELECT DATE(o.created_at) as sale_date, COALESCE(SUM(oi.quantity), 0) as units
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.product_id = $1 AND o.status != 'CANCELLED'
         GROUP BY DATE(o.created_at)
         ORDER BY sale_date DESC
         LIMIT 28`,
        [prod.id]
      );

      let demandSeries = demandRes.rows.map((r) => Number(r.units) || 0);
      if (demandSeries.length < 7) {
        // Fallback baseline daily sales based on current stock / 10
        const baseDaily = Math.max(2, Math.round(prod.stock / 10));
        demandSeries = [
          baseDaily,
          baseDaily + 1,
          baseDaily,
          baseDaily + 2,
          baseDaily - 1,
          baseDaily,
          baseDaily + 1,
        ];
      }

      const evaluation = inventory.evaluateReorderSuggestion({
        currentStock: prod.stock,
        dailyDemandHistory: demandSeries,
        leadTimeDays: leadTime,
        unitCost: Number(prod.cost_price) || 50,
        orderCost: 100, // Standard replenishment ordering cost ₹100
        holdingCostRate: 0.2, // 20% annual holding cost
        serviceLevel,
      });

      suggestions.push({
        productId: prod.id,
        productName: prod.name,
        currentStock: prod.stock,
        eoq: evaluation.math ? evaluation.math.eoq : 0,
        formulas: evaluation.math,
        ...evaluation,
      });
    }

    return suggestions;
  }

  /**
   * Generates ABC/XYZ matrix classification across entire catalog.
   *
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getAbcXyzAnalysis(options = {}) {
    const productsRes = await query(`
      SELECT p.id, p.name, p.price as unit_price,
             COALESCE(SUM(oi.quantity), 0) as units_sold
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.price
      ORDER BY (p.price * COALESCE(SUM(oi.quantity), 0)) DESC
    `);

    // Map items with demand history
    const items = [];
    for (const p of productsRes.rows) {
      const histRes = await query(
        `SELECT COALESCE(SUM(oi.quantity), 0) as units
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.product_id = $1 AND o.status != 'CANCELLED'
         GROUP BY DATE(o.created_at)
         ORDER BY DATE(o.created_at) DESC
         LIMIT 14`,
        [p.id]
      );

      let demandHistory = histRes.rows.map((r) => Number(r.units) || 0);
      if (demandHistory.length === 0) {
        demandHistory = [Number(p.units_sold) || 0];
      }

      items.push({
        id: p.id,
        name: p.name,
        unitPrice: Number(p.unit_price) || 0,
        unitsSold: Number(p.units_sold) || 0,
        demandHistory,
      });
    }

    return abcXyz.classifyAbcXyz(items, options);
  }

  /**
   * Detects sales anomalies and drift for inventory monitoring.
   *
   * @param {number|string} [productId]
   * @returns {Promise<Object>}
   */
  async getAnomalyReport(productId = null) {
    let series = [];
    let productName = 'All Products Combined';

    if (productId) {
      const pid = Number(productId);
      const prodRes = await query('SELECT id, name FROM products WHERE id = $1', [pid]);
      if (prodRes.rows.length === 0) {
        throw new AppError('Product not found', 404);
      }
      productName = prodRes.rows[0].name;

      const salesRes = await query(
        `SELECT DATE(o.created_at) as sale_date, COALESCE(SUM(oi.quantity), 0) as units
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.product_id = $1 AND o.status != 'CANCELLED'
         GROUP BY DATE(o.created_at)
         ORDER BY sale_date ASC`,
        [pid]
      );
      series = salesRes.rows.map((r) => Number(r.units) || 0);
    } else {
      const globalSalesRes = await query(
        `SELECT DATE(created_at) as sale_date, COUNT(*) as orders_count
         FROM orders
         WHERE status != 'CANCELLED'
         GROUP BY DATE(created_at)
         ORDER BY sale_date ASC
         LIMIT 30`
      );
      series = globalSalesRes.rows.map((r) => Number(r.orders_count) || 0);
    }

    if (series.length < 5) {
      // Baseline synthetic sequence with typical variance for testing/demo
      series = [20, 22, 19, 21, 24, 20, 22, 23, 21, 25, 22, 20];
    }

    const robustPoints = anomaly.detectRobustZOutliers(series);
    const cusum = anomaly.detectCUSUMDrift(series);

    return {
      productId: productId ? Number(productId) : null,
      productName,
      series,
      robustZ: {
        points: robustPoints,
        outliers: robustPoints.filter((p) => p.isAnomaly),
        threshold: 3.0,
      },
      cusum,
    };
  }

  /**
   * Adds a new inventory batch to DB and FEFO manager.
   *
   * @param {Object} batch
   * @param {number|string} batch.productId
   * @param {string} batch.batchNumber
   * @param {number} batch.quantity
   * @param {string|Date} batch.expiryDate
   * @param {number} [batch.costPrice=0]
   * @returns {Promise<Object>}
   */
  async addBatch({ productId, batchNumber, quantity, expiryDate, costPrice = 0 }) {
    const pid = Number(productId);
    const qty = Math.max(1, Math.floor(Number(quantity) || 0));
    const bNum = String(batchNumber || `BATCH-${Date.now()}`);
    const expiry = new Date(expiryDate);

    if (isNaN(expiry.getTime())) {
      throw new AppError('Valid expiryDate is required', 400);
    }

    const prodCheck = await query('SELECT id, stock FROM products WHERE id = $1', [pid]);
    if (prodCheck.rows.length === 0) {
      throw new AppError('Product not found', 404);
    }

    const insertRes = await query(
      `INSERT INTO product_batches (product_id, batch_number, quantity, initial_quantity, expiry_date, cost_price)
       VALUES ($1, $2, $3, $3, $4, $5)
       ON CONFLICT (product_id, batch_number)
       DO UPDATE SET quantity = product_batches.quantity + EXCLUDED.quantity, updated_at = NOW()
       RETURNING *`,
      [pid, bNum, qty, expiry.toISOString(), Number(costPrice) || 0]
    );

    // Increment overall stock on products
    await query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, pid]);

    const createdBatch = insertRes.rows[0];

    // Mirror in FEFO manager
    this.fefoManager.addBatch({
      productId: pid,
      batchId: createdBatch.id,
      quantity: qty,
      expiryDate: expiry.getTime(),
      costPrice: Number(costPrice) || 0,
    });

    return createdBatch;
  }

  /**
   * Gets batches for a product or all batches.
   *
   * @param {number|string} [productId]
   * @returns {Promise<Array<Object>>}
   */
  async getBatches(productId = null) {
    let sql = `
      SELECT pb.*, p.name as product_name, p.price as selling_price
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
    `;
    const params = [];
    if (productId) {
      sql += ' WHERE pb.product_id = $1';
      params.push(Number(productId));
    }
    sql += ' ORDER BY pb.expiry_date ASC, pb.id ASC';

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Allocates units using FEFO order within a database transaction.
   *
   * @param {number|string} productId
   * @param {number} requestedQty
   * @returns {Promise<Object>}
   */
  async allocateBatchesFEFO(productId, requestedQty) {
    const pid = Number(productId);
    const qtyNeeded = Math.max(1, Math.floor(Number(requestedQty) || 0));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock available non-expired batches ordered by earliest expiry
      const batchesRes = await client.query(
        `SELECT id, batch_number, quantity, expiry_date
         FROM product_batches
         WHERE product_id = $1 AND quantity > 0 AND expiry_date > NOW()
         ORDER BY expiry_date ASC
         FOR UPDATE`,
        [pid]
      );

      const availableBatches = batchesRes.rows;
      const totalAvailable = availableBatches.reduce((sum, b) => sum + Number(b.quantity), 0);

      if (totalAvailable < qtyNeeded) {
        await client.query('ROLLBACK');
        return {
          success: false,
          allocatedBatches: [],
          shortage: qtyNeeded - totalAvailable,
          totalAvailable,
        };
      }

      let remaining = qtyNeeded;
      const allocatedBatches = [];

      for (const batch of availableBatches) {
        if (remaining <= 0) break;
        const bQty = Number(batch.quantity);
        const take = Math.min(bQty, remaining);

        await client.query(
          'UPDATE product_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
          [take, batch.id]
        );

        allocatedBatches.push({
          batchId: batch.id,
          batchNumber: batch.batch_number,
          quantityAllocated: take,
          expiryDate: batch.expiry_date,
        });

        remaining -= take;
      }

      // Decrement stock in products table
      await client.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2', [
        qtyNeeded,
        pid,
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        allocatedBatches,
        shortage: 0,
        remainingStock: totalAvailable - qtyNeeded,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Identifies expired batches and marks them quarantined.
   *
   * @returns {Promise<Array<Object>>}
   */
  async quarantineExpiredBatches() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const expiredRes = await client.query(
        `SELECT id, product_id, batch_number, quantity, expiry_date
         FROM product_batches
         WHERE quantity > 0 AND expiry_date <= NOW()
         FOR UPDATE`
      );

      const quarantined = [];
      for (const b of expiredRes.rows) {
        await client.query(
          'UPDATE product_batches SET quantity = 0, updated_at = NOW() WHERE id = $1',
          [b.id]
        );
        await client.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2', [
          b.quantity,
          b.product_id,
        ]);
        quarantined.push(b);
      }

      await client.query('COMMIT');
      return quarantined;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new InventoryService();
