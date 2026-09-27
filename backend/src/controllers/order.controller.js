const { pool, query } = require('../config/db');
const { env } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { calculatePricing, validateCoupon } = require('../algo/couponEngine');
const { transition } = require('../algo/stateMachine');
const securityService = require('../services/security.service');
const { stockReservationService } = require('../services/stockReservation.service');
const { outboxRelayService } = require('../services/outboxRelay.service');
const { addressService } = require('../services/address.service');

// POST /api/orders  { deliveryAddress, deliveryAddressId, couponCode }
// Converts user cart into an order inside a single transaction with oversell protection and deadlock-free locking.
const createOrder = asyncHandler(async (req, res) => {
  const { deliveryAddress, deliveryAddressId, delivery_address_id, couponCode } = req.body;
  const addressId = deliveryAddressId || delivery_address_id || null;

  let finalDeliveryAddress = deliveryAddress || req.user.address || null;
  let finalDeliveryAddressId = null;

  if (addressId) {
    const addrRes = await query(
      `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [Number(addressId), req.user.id]
    );
    if (addrRes.rows.length === 0) {
      throw new AppError('Delivery address not found or unauthorized', 404);
    }
    const addr = addrRes.rows[0];
    const serviceCheck = await addressService.checkServiceability({
      latitude: addr.latitude,
      longitude: addr.longitude,
      pincode: addr.pincode,
    });
    if (!serviceCheck.serviceable) {
      throw new AppError(serviceCheck.reason || 'Address is outside our 10-minute delivery zone', 400);
    }
    finalDeliveryAddressId = addr.id;
    finalDeliveryAddress = `${addr.recipient_name}, ${addr.address_line1}${addr.address_line2 ? ', ' + addr.address_line2 : ''}${addr.landmark ? ', ' + addr.landmark : ''}, ${addr.city} - ${addr.pincode} (Ph: ${addr.phone})`;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch cart items for the user
    const cartRes = await client.query(
      `SELECT product_id, quantity
       FROM cart_items
       WHERE user_id = $1
       ORDER BY product_id ASC`,
      [req.user.id]
    );

    if (!cartRes.rows.length) {
      throw new AppError('Your cart is empty.', 400);
    }

    const productIds = cartRes.rows.map((r) => r.product_id);

    // 2. Lock product rows in strictly ascending primary-key order (prevents deadlocks under concurrency)
    const { rows: productRows } = await client.query(
      `SELECT id, name, qty_label AS qty, price, mrp, emoji, category_id AS cat, badge, image_url AS img, stock, is_active
       FROM products
       WHERE id = ANY($1)
       ORDER BY id ASC
       FOR UPDATE`,
      [productIds]
    );

    const productMap = new Map(productRows.map((p) => [p.id, p]));

    // 3. Oversell protection: verify stock and active status
    const shortItems = [];
    const items = [];

    for (const item of cartRes.rows) {
      const product = productMap.get(item.product_id);
      if (!product || !product.is_active || product.stock < item.quantity) {
        shortItems.push({
          productId: item.product_id,
          name: product ? product.name : 'Unknown Product',
          requested: item.quantity,
          available: product && product.is_active ? product.stock : 0,
        });
      } else {
        const price = Number(product.price);
        items.push({
          productId: product.id,
          name: product.name,
          qty: product.qty,
          price,
          mrp: Number(product.mrp),
          emoji: product.emoji,
          cat: product.cat,
          badge: product.badge,
          img: product.img,
          quantity: item.quantity,
          lineTotal: price * item.quantity,
        });
      }
    }

    if (shortItems.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'error',
        code: 'INSUFFICIENT_STOCK',
        message: 'Some items in your cart are out of stock or have insufficient quantity.',
        data: { shortItems },
      });
    }

    // 4. Calculate pricing (line items, coupons, taxes, delivery fee)
    const rawItemTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

    let validatedCoupon = null;
    let discountAmount = 0;

    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      const couponRes = await client.query(`SELECT * FROM coupons WHERE code = $1 FOR UPDATE`, [
        cleanCode,
      ]);

      if (!couponRes.rows.length) {
        throw new AppError(`Coupon "${couponCode}" does not exist.`, 400);
      }

      const couponRow = couponRes.rows[0];

      // Fetch prior redemptions for user and total
      const userRedemptions = await client.query(
        `SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2`,
        [couponRow.code, req.user.id]
      );
      const totalRedemptions = await client.query(
        `SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_code = $1`,
        [couponRow.code]
      );

      const validation = validateCoupon(
        couponRow,
        { itemTotal: rawItemTotal },
        {
          userRedemptionCount: parseInt(userRedemptions.rows[0].count, 10),
          totalRedemptionCount: parseInt(totalRedemptions.rows[0].count, 10),
        }
      );

      if (!validation.isValid) {
        throw new AppError(validation.reason, 400);
      }

      validatedCoupon = couponRow;
      discountAmount = validation.discountAmount;
    }

    const pricing = calculatePricing(rawItemTotal, validatedCoupon, {
      FREE_DELIVERY_ABOVE: env.FREE_DELIVERY_ABOVE || 500,
      DELIVERY_FEE: env.DELIVERY_FEE,
      TAX_RATE: 0.05,
    });

    // 4.5 Evaluate fraud risk
    const fraudAssessment = await securityService.assessOrderFraudRisk(
      {
        userId: req.user.id,
        orderAmount: pricing.grandTotal,
        shippingAddress: deliveryAddress || req.user.address || '',
        ipAddress: req.ip || (req.headers && req.headers['x-forwarded-for']) || '127.0.0.1',
        deviceFingerprint: (req.headers && req.headers['x-device-fingerprint']) || 'unknown',
        couponCode: validatedCoupon ? validatedCoupon.code : null,
      },
      client
    );

    if (fraudAssessment.fraudDecision === 'BLOCK') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        status: 'error',
        code: 'ORDER_BLOCKED_FRAUD',
        message: 'Order was rejected due to risk assessment.',
        data: { reasons: fraudAssessment.reasons },
      });
    }

    // 5. Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, item_total, delivery_fee, taxes, discount_amount, coupon_code, grand_total, status, delivery_address, delivery_address_id, fraud_score, fraud_decision, fraud_signals)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'placed', $8, $9, $10, $11, $12)
       RETURNING id, user_id, item_total, delivery_fee, taxes, discount_amount, coupon_code, grand_total, status, delivery_address, delivery_address_id, fraud_score, fraud_decision, created_at`,
      [
        req.user.id,
        pricing.itemTotal,
        pricing.deliveryFee,
        pricing.taxes,
        pricing.discountAmount,
        validatedCoupon ? validatedCoupon.code : null,
        pricing.grandTotal,
        finalDeliveryAddress,
        finalDeliveryAddressId,
        fraudAssessment.fraudScore,
        fraudAssessment.fraudDecision,
        JSON.stringify(fraudAssessment.signals),
      ]
    );
    const order = orderResult.rows[0];

    // 6. Insert order items & record inventory deductions
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.name, item.price, item.quantity]
      );

      // Decrement stock
      await client.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [
        item.quantity,
        item.productId,
      ]);

      // Write inventory movements audit row
      await client.query(
        `INSERT INTO inventory_movements (product_id, delta, reason, ref_order_id)
         VALUES ($1, $2, 'purchase', $3)`,
        [item.productId, -item.quantity, order.id]
      );
    }

    // 7. Record coupon redemption if applied
    if (validatedCoupon && discountAmount > 0) {
      await client.query(
        `INSERT INTO coupon_redemptions (coupon_code, user_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [validatedCoupon.code, req.user.id, order.id, discountAmount]
      );
    }

    // 8. Record initial state in order_status_history
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, 'none', 'placed', $2, 'Order successfully placed')`,
      [order.id, req.user.id]
    );

    // 9. Clear user's cart
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    // 10. Commit active stock reservations for user
    await stockReservationService.commitReservation(req.user.id, client);

    // 11. Transactional Outbox Pattern: Record order_placed event atomically
    await outboxRelayService.recordEvent(client, {
      aggregateType: 'order',
      aggregateId: order.id,
      eventType: 'order_placed',
      payload: {
        orderId: order.id,
        userId: req.user.id,
        grandTotal: pricing.grandTotal,
        itemsCount: items.length,
      },
    });

    await client.query('COMMIT');

    return res.status(201).json({
      status: 'success',
      data: {
        order: {
          ...order,
          items,
          pricing,
        },
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/cancel
// Customer cancellation: checks state machine (placed/confirmed/packed -> cancelled) and restores stock
const cancelOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, req.user.id]
    );

    if (!orderRows.length) {
      throw new AppError('Order not found.', 404);
    }

    const order = orderRows[0];

    // State machine check: throws 409 if illegal
    transition(order.status, 'cancelled');

    // Update order status
    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);

    // Fetch order items to restore inventory
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

    // Record state change in history
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, $2, 'cancelled', $3, 'Order cancelled by customer')`,
      [id, order.status, req.user.id]
    );

    // Transactional Outbox Pattern: Record order_status_changed event
    await outboxRelayService.recordEvent(client, {
      aggregateType: 'order',
      aggregateId: id,
      eventType: 'order_status_changed',
      payload: {
        orderId: Number(id),
        fromStatus: order.status,
        toStatus: 'cancelled',
        actorId: req.user.id,
      },
    });

    await client.query('COMMIT');

    return res.json({
      status: 'success',
      message: 'Order cancelled successfully. Stock has been restored.',
      data: { orderId: Number(id), status: 'cancelled' },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/orders
const listOrders = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, user_id, item_total, delivery_fee, taxes, discount_amount, coupon_code, grand_total, status, delivery_address, delivery_address_id, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ status: 'success', results: rows.length, data: { orders: rows } });
});

// GET /api/orders/:id
const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const orderResult = await query(
    `SELECT id, user_id, item_total, delivery_fee, taxes, discount_amount, coupon_code, grand_total, status, delivery_address, delivery_address_id, created_at
     FROM orders WHERE id = $1 AND user_id = $2`,
    [id, req.user.id]
  );
  if (!orderResult.rows.length) {
    throw new AppError('Order not found.', 404);
  }

  const itemsResult = await query(
    `SELECT product_id AS "productId", name, unit_price AS price, quantity
     FROM order_items WHERE order_id = $1`,
    [id]
  );

  const historyResult = await query(
    `SELECT from_status, to_status, created_at, note
     FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  res.json({
    status: 'success',
    data: {
      order: {
        ...orderResult.rows[0],
        items: itemsResult.rows,
        statusHistory: historyResult.rows,
      },
    },
  });
});

module.exports = {
  createOrder,
  cancelOrder,
  listOrders,
  getOrder,
};
