const { pool, query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { transition } = require('../algo/stateMachine');
const { catalogSearchService } = require('../services/catalogSearch.service');
const { outboxRelayService } = require('../services/outboxRelay.service');

// POST /api/admin/products
const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    qty_label,
    price,
    mrp,
    emoji,
    category_id,
    badge,
    image_url,
    stock = 50,
    reorder_level = 10,
    is_active = true,
  } = req.body;

  const { rows } = await query(
    `INSERT INTO products (name, qty_label, price, mrp, emoji, category_id, badge, image_url, stock, reorder_level, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      name,
      qty_label,
      price,
      mrp || price,
      emoji || '📦',
      category_id,
      badge || null,
      image_url || '/images/placeholder.jpg',
      stock,
      reorder_level,
      is_active,
    ]
  );

  const product = rows[0];
  catalogSearchService.indexProduct(product);

  res.status(201).json({ status: 'success', data: { product } });
});

// PATCH /api/admin/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const allowedFields = [
    'name',
    'qty_label',
    'price',
    'mrp',
    'emoji',
    'category_id',
    'badge',
    'image_url',
    'stock',
    'reorder_level',
    'is_active',
  ];

  const setClauses = [];
  const params = [id];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      params.push(updates[field]);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (!setClauses.length) {
    throw new AppError('No valid fields provided for update.', 400);
  }

  const { rows } = await query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  if (!rows.length) {
    throw new AppError('Product not found.', 404);
  }

  const product = rows[0];
  catalogSearchService.updateProduct(product);

  res.json({ status: 'success', data: { product } });
});

// DELETE /api/admin/products/:id
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Soft-delete to preserve foreign-key relationships in order_items
  const { rows } = await query(
    `UPDATE products SET is_active = false WHERE id = $1 RETURNING id, name, is_active`,
    [id]
  );
  if (!rows.length) {
    throw new AppError('Product not found.', 404);
  }

  catalogSearchService.removeProduct(id);

  res.json({
    status: 'success',
    message: 'Product deactivated successfully.',
    data: { product: rows[0] },
  });
});

// POST /api/admin/inventory/adjust
const adjustStock = asyncHandler(async (req, res) => {
  const { productId, delta, reason = 'admin_adjustment' } = req.body;

  if (delta === 0) {
    throw new AppError('Delta cannot be 0.', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: prodRows } = await client.query(
      `SELECT id, name, stock FROM products WHERE id = $1 FOR UPDATE`,
      [productId]
    );

    if (!prodRows.length) {
      throw new AppError('Product not found.', 404);
    }

    const currentStock = prodRows[0].stock;
    const newStock = currentStock + delta;

    if (newStock < 0) {
      throw new AppError(
        `Cannot adjust stock below 0 (current: ${currentStock}, adjustment: ${delta}).`,
        400
      );
    }

    await client.query(`UPDATE products SET stock = $1 WHERE id = $2`, [newStock, productId]);

    await client.query(
      `INSERT INTO inventory_movements (product_id, delta, reason)
       VALUES ($1, $2, $3)`,
      [productId, delta, reason]
    );

    await client.query('COMMIT');

    res.json({
      status: 'success',
      data: {
        productId,
        previousStock: currentStock,
        newStock,
        delta,
        reason,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/admin/orders
const listAdminOrders = asyncHandler(async (req, res) => {
  const { status, userId, page = 1, limit = 50 } = req.query;
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const offset = (parsedPage - 1) * parsedLimit;

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(parsedLimit, offset);
  const { rows } = await query(
    `SELECT id, user_id, item_total, delivery_fee, taxes, discount_amount, coupon_code, grand_total, status, delivery_address, created_at
     FROM orders ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    status: 'success',
    results: rows.length,
    page: parsedPage,
    limit: parsedLimit,
    data: { orders: rows },
  });
});

// PATCH /api/admin/orders/:id/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: targetStatus, note = 'Status updated by admin' } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (!orderRows.length) {
      throw new AppError('Order not found.', 404);
    }

    const order = orderRows[0];

    // State machine validation throws 409 on illegal transitions
    transition(order.status, targetStatus);

    await client.query(`UPDATE orders SET status = $1 WHERE id = $2`, [targetStatus, id]);

    // If transitioned to cancelled, restore stock and log inventory movement
    if (targetStatus === 'cancelled') {
      const { rows: items } = await client.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [id]
      );
      for (const item of items) {
        if (item.product_id) {
          await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
            item.quantity,
            item.product_id,
          ]);
          await client.query(
            `INSERT INTO inventory_movements (product_id, delta, reason, ref_order_id)
             VALUES ($1, $2, 'cancellation_restock', $3)`,
            [item.product_id, item.quantity, id]
          );
        }
      }
    }

    // Record transition in order_status_history
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, order.status, targetStatus, req.user.id, note]
    );

    // Transactional Outbox Pattern: Record order_status_changed event
    await outboxRelayService.recordEvent(client, {
      aggregateType: 'order',
      aggregateId: id,
      eventType: 'order_status_changed',
      payload: {
        orderId: Number(id),
        fromStatus: order.status,
        toStatus: targetStatus,
        actorId: req.user.id,
        note: note || '',
      },
    });

    await client.query('COMMIT');

    res.json({
      status: 'success',
      data: {
        orderId: Number(id),
        previousStatus: order.status,
        newStatus: targetStatus,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/admin/stats
const getAdminStats = asyncHandler(async (req, res) => {
  // 1. Orders & revenue grouped by day (last 30 days)
  const revenueByDayResult = await query(
    `SELECT DATE(created_at) AS date,
            COUNT(*) AS order_count,
            COALESCE(SUM(grand_total), 0) AS total_revenue
     FROM orders
     WHERE status != 'cancelled'
     GROUP BY DATE(created_at)
     ORDER BY DATE(created_at) DESC
     LIMIT 30`
  );

  // 2. Top products by units sold
  const topProductsResult = await query(
    `SELECT oi.product_id, oi.name,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.quantity * oi.unit_price) AS total_revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled'
     GROUP BY oi.product_id, oi.name
     ORDER BY units_sold DESC
     LIMIT 10`
  );

  // 3. Low stock list (stock <= reorder_level)
  const lowStockResult = await query(
    `SELECT id, name, stock, reorder_level, category_id, price
     FROM products
     WHERE stock <= reorder_level AND is_active = true
     ORDER BY stock ASC
     LIMIT 50`
  );

  // 4. Average delivery time in minutes
  const deliveryTimeResult = await query(
    `SELECT AVG(EXTRACT(EPOCH FROM (del.created_at - plc.created_at)) / 60) AS avg_delivery_minutes
     FROM order_status_history plc
     JOIN order_status_history del ON plc.order_id = del.order_id
     WHERE plc.to_status = 'placed' AND del.to_status = 'delivered'`
  );

  const avgMinutes = deliveryTimeResult.rows[0]?.avg_delivery_minutes;

  res.json({
    status: 'success',
    data: {
      stats: {
        revenueByDay: revenueByDayResult.rows,
        topProducts: topProductsResult.rows,
        lowStockProducts: lowStockResult.rows,
        avgDeliveryTimeMinutes: avgMinutes ? Number(Number(avgMinutes).toFixed(1)) : 13.0,
      },
    },
  });
});

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  listAdminOrders,
  updateOrderStatus,
  getAdminStats,
};
