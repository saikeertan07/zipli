/**
 * @file payment.controller.js
 * @description Controller for payment order creation, signed webhook processing,
 * server-side amount verification, idempotent event deduplication, and 4-eyes refunds.
 */

const { pool, query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { getPaymentProvider } = require('../services/paymentProvider');
const { transition } = require('../algo/stateMachine');
const { ledgerService } = require('../services/ledger.service');
const { stockReservationService } = require('../services/stockReservation.service');
const { outboxRelayService } = require('../services/outboxRelay.service');
const { can, PERMISSIONS } = require('../security/policy');

/**
 * POST /api/payments/create-order
 * Creates a payment provider order for an existing placed order.
 */
const createPaymentOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    throw new AppError('orderId is required', 400);
  }

  const orderRes = await query(
    `SELECT id, user_id, grand_total, grand_total_paise, status
     FROM orders
     WHERE id = $1`,
    [Number(orderId)]
  );

  if (orderRes.rows.length === 0) {
    throw new AppError('Order not found', 404);
  }

  const order = orderRes.rows[0];

  // User authorization: must be order owner or staff
  if (req.user.role === 'customer' && order.user_id !== req.user.id) {
    throw new AppError('Forbidden: you do not own this order', 403);
  }

  if (order.status !== 'placed') {
    throw new AppError(`Cannot create payment for order in status "${order.status}"`, 400);
  }

  const amountPaise = Number(order.grand_total_paise) || Math.round(Number(order.grand_total) * 100);

  const provider = getPaymentProvider();
  const providerOrder = await provider.createOrder({
    orderId: order.id,
    amountPaise,
    currency: 'INR',
    notes: { internalOrderId: String(order.id), userId: String(order.user_id) },
  });

  // Persist provider order mapping
  await query(
    `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
     VALUES ($1, $2, $3, $4, $5, 'CREATED')
     ON CONFLICT (provider_order_id) DO UPDATE SET updated_at = NOW()`,
    [order.id, provider.name, providerOrder.id, amountPaise, providerOrder.currency || 'INR']
  );

  res.status(200).json({
    status: 'success',
    data: {
      orderId: order.id,
      provider: provider.name,
      providerOrderId: providerOrder.id,
      amountPaise,
      currency: providerOrder.currency || 'INR',
      keyId: provider.keyId || 'rzp_test_mock_key',
    },
  });
});

/**
 * POST /api/payments/webhook
 * Processes incoming signed payment provider webhooks with replay-safety,
 * server-side amount verification, and double-entry ledger posting.
 */
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const provider = getPaymentProvider();
  const signature = req.headers['x-razorpay-signature'] || req.headers['x-signature'];
  const eventTime = req.headers['x-razorpay-event-time'] || (req.body && req.body.created_at);

  const rawBody = req.rawBody || JSON.stringify(req.body);

  // 1. Verify HMAC cryptographic signature
  const isValidSig = provider.verifyWebhookSignature({
    rawBody,
    signature,
    timestamp: eventTime,
    toleranceSeconds: 300,
  });

  if (!isValidSig) {
    logger.warn('Payment webhook signature verification failed', {
      ip: req.ip,
      hasSig: Boolean(signature),
    });
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_SIGNATURE',
      message: 'Webhook signature verification failed or timestamp drift exceeded limit.',
    });
  }

  const payload = req.body || {};
  const eventId = payload.event_id || payload.id || req.headers['x-razorpay-event-id'];
  const eventType = payload.event || payload.event_type || 'payment.captured';

  if (!eventId) {
    return res.status(400).json({ status: 'error', message: 'Missing event ID' });
  }

  // 2. Idempotency Check: Verify if event was already processed
  const existingEvent = await query(
    `SELECT id, status, processed_at FROM payment_events WHERE event_id = $1`,
    [String(eventId)]
  );

  if (existingEvent.rows.length > 0) {
    logger.info(`Idempotent webhook delivery: event ${eventId} already processed, skipping.`);
    return res.status(200).json({
      status: 'duplicate_ignored',
      message: 'Event was previously processed.',
      eventId,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Extract payment and order details
    const paymentEntity = (payload.payload && payload.payload.payment && payload.payload.payment.entity) || payload.payment || {};
    const providerOrderId = paymentEntity.order_id || (payload.payload && payload.payload.order && payload.payload.order.entity && payload.payload.order.entity.id);
    const paymentAmount = Number(paymentEntity.amount) || 0;
    const paymentId = paymentEntity.id || `pay_${Date.now()}`;
    const paymentMethod = (paymentEntity.method || 'GATEWAY').toUpperCase();

    // Look up internal payment order
    let internalOrderId = null;
    let paymentOrderRow = null;

    if (providerOrderId) {
      const pOrderRes = await client.query(
        `SELECT order_id, amount_paise, status FROM payment_orders WHERE provider_order_id = $1 FOR UPDATE`,
        [providerOrderId]
      );
      if (pOrderRes.rows.length > 0) {
        paymentOrderRow = pOrderRes.rows[0];
        internalOrderId = paymentOrderRow.order_id;
      }
    }

    if (!internalOrderId && paymentEntity.notes && paymentEntity.notes.internalOrderId) {
      internalOrderId = Number(paymentEntity.notes.internalOrderId);
    }

    if (!internalOrderId) {
      // Record ignored event without matched order
      await client.query(
        `INSERT INTO payment_events (provider, event_id, event_type, provider_order_id, payment_id, amount_paise, status, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, 'IGNORED', $7)`,
        [provider.name, eventId, eventType, providerOrderId || null, paymentId, paymentAmount, JSON.stringify(payload)]
      );
      await client.query('COMMIT');
      return res.status(200).json({ status: 'ignored', message: 'No matching order found' });
    }

    // Fetch order for verification and locking
    const orderRes = await client.query(
      `SELECT id, user_id, grand_total, grand_total_paise, item_total, item_total_paise,
              delivery_fee, delivery_fee_paise, discount_amount, discount_paise, taxes, taxes_paise, status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [internalOrderId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(200).json({ status: 'ignored', message: 'Internal order missing' });
    }

    const order = orderRes.rows[0];
    const expectedPaise = Number(order.grand_total_paise) || Math.round(Number(order.grand_total) * 100);

    // 3. Server-Side Amount Verification (F-053)
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      if (paymentAmount !== expectedPaise) {
        logger.error('CRITICAL: Payment amount tamper detected!', {
          orderId: order.id,
          expectedPaise,
          receivedAmount: paymentAmount,
        });

        // Record tamper event and auto-refund
        await client.query(
          `INSERT INTO payment_events (provider, event_id, event_type, provider_order_id, payment_id, amount_paise, status, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, 'TAMPER_DETECTED', $7)`,
          [provider.name, eventId, eventType, providerOrderId, paymentId, paymentAmount, JSON.stringify(payload)]
        );

        await client.query(
          `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
          [order.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, note)
           VALUES ($1, $2, 'cancelled', 'Order cancelled: Server-side payment amount mismatch')`,
          [order.id, order.status]
        );

        await client.query('COMMIT');

        // Trigger asynchronous auto-refund
        try {
          await provider.createRefund({
            paymentId,
            amountPaise: paymentAmount,
            reason: 'TAMPER_DETECTED_AUTO_REFUND',
          });
        } catch (rfErr) {
          logger.error('Auto-refund failed for tampered payment', { error: rfErr.message });
        }

        return res.status(200).json({
          status: 'tamper_handled',
          message: 'Payment amount mismatch. Order cancelled and refunded.',
        });
      }

      // Check if order was already confirmed
      if (order.status === 'confirmed') {
        logger.info(`Idempotent webhook delivery: order #${order.id} is already confirmed.`);
        await client.query('COMMIT');
        return res.status(200).json({
          status: 'duplicate_ignored',
          message: 'Order was already confirmed',
          orderId: order.id,
        });
      }

      // If order was already cancelled, handle capture after cancellation by auto-refunding
      if (order.status === 'cancelled') {
        logger.warn('Payment captured for already cancelled order, initiating auto-refund', {
          orderId: order.id,
          paymentId,
        });
        await client.query(
          `INSERT INTO payment_events (provider, event_id, event_type, provider_order_id, payment_id, amount_paise, status, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, 'CAPTURED_AFTER_CANCELLED', $7)`,
          [provider.name, eventId, eventType, providerOrderId, paymentId, paymentAmount, JSON.stringify(payload)]
        );
        await client.query('COMMIT');

        try {
          await provider.createRefund({
            paymentId,
            amountPaise: paymentAmount,
            reason: 'CAPTURED_AFTER_ORDER_CANCELLED_AUTO_REFUND',
          });
        } catch (rfErr) {
          logger.error('Auto-refund failed for captured payment on cancelled order', { error: rfErr.message });
        }

        return res.status(200).json({
          status: 'refunded_cancelled_order',
          message: 'Payment captured for cancelled order; auto-refund initiated.',
        });
      }

      // Valid payment: Transition placed -> confirmed
      if (order.status === 'placed') {
        transition(order.status, 'confirmed');

        await client.query(
          `UPDATE orders SET status = 'confirmed' WHERE id = $1`,
          [order.id]
        );

        // Ensure payment_orders mapping exists / updated (captured-before-created safe)
        await client.query(
          `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
           VALUES ($1, $2, $3, $4, $5, 'PAID')
           ON CONFLICT (provider_order_id) DO UPDATE SET status = 'PAID', updated_at = NOW()`,
          [order.id, provider.name, providerOrderId || `order_${order.id}`, expectedPaise, paymentEntity.currency || 'INR']
        );

        // Record status history
        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, note)
           VALUES ($1, 'placed', 'confirmed', 'Payment verified and captured via webhook')`,
          [order.id]
        );

        // Post balanced journal entry to double-entry ledger (F-051)
        const deliveryFeePaise = Number(order.delivery_fee_paise) || Math.round(Number(order.delivery_fee || 0) * 100);
        const gstPaise = Number(order.taxes_paise) || Math.round(Number(order.taxes || 0) * 100);
        const discountPaise = Number(order.discount_paise) || Math.round(Number(order.discount_amount || 0) * 100);
        // Ensure itemsPaise balances: itemsPaise = expectedPaise + discountPaise - deliveryFeePaise - gstPaise
        const itemsPaise = Math.max(0, expectedPaise + discountPaise - deliveryFeePaise - gstPaise);
        const commissionPaise = Math.round(itemsPaise * 0.15); // Standard 15% platform commission

        await ledgerService.recordOrderPayment(
          {
            orderId: order.id,
            orderTotalPaise: expectedPaise,
            itemsPaise,
            commissionPaise,
            deliveryFeePaise,
            gstPaise,
            discountPaise,
            paymentMethod,
            description: `Payment captured via webhook for order #${order.id}`,
          },
          client
        );

        // Emit outbox event
        await outboxRelayService.recordEvent(client, {
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'payment_confirmed',
          payload: { orderId: order.id, paymentId, amountPaise: expectedPaise },
        });
      }
    } else if (eventType === 'payment.failed') {
      // Late failure after success protection
      if (order.status === 'confirmed') {
        logger.warn('Late payment.failed received for already confirmed order; keeping order confirmed', {
          orderId: order.id,
          paymentId,
          eventId,
        });
        await client.query(
          `INSERT INTO payment_events (provider, event_id, event_type, provider_order_id, payment_id, amount_paise, status, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, 'IGNORED', $7)`,
          [provider.name, eventId, eventType, providerOrderId, paymentId, paymentAmount, JSON.stringify(payload)]
        );
        await client.query('COMMIT');
        return res.status(200).json({
          status: 'late_failure_ignored',
          message: 'Order already confirmed; late failure ignored.',
          orderId: order.id,
        });
      }

      // Payment failure handling: release stock reservation and cancel
      if (order.status === 'placed') {
        await client.query(
          `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
          [order.id]
        );

        await client.query(
          `UPDATE payment_orders SET status = 'FAILED', updated_at = NOW() WHERE order_id = $1`,
          [order.id]
        );

        // Restore product stock and cancel inventory movements
        const itemsRes = await client.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
          [order.id]
        );

        for (const item of itemsRes.rows) {
          await client.query(
            `UPDATE products SET stock = stock + $1 WHERE id = $2`,
            [item.quantity, item.product_id]
          );
          await client.query(
            `INSERT INTO inventory_movements (product_id, delta, reason, ref_order_id)
             VALUES ($1, $2, 'payment_failure_restore', $3)`,
            [item.product_id, item.quantity, order.id]
          );
        }

        // Release holds
        await stockReservationService.releaseUserReservation(order.user_id, client);

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, note)
           VALUES ($1, 'placed', 'cancelled', 'Payment failed via webhook')`,
          [order.id]
        );
      }
    }

    // Record processed event for idempotency
    await client.query(
      `INSERT INTO payment_events (provider, event_id, event_type, provider_order_id, payment_id, amount_paise, status, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSED', $7)`,
      [provider.name, eventId, eventType, providerOrderId, paymentId, paymentAmount, JSON.stringify(payload)]
    );

    await client.query('COMMIT');
    res.status(200).json({ status: 'success', eventId, processed: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error processing payment webhook', { error: err.message, stack: err.stack });
    throw err;
  } finally {
    client.release();
  }
});

/**
 * POST /api/payments/refund
 * Initiates a refund for an order under four-eyes approval policy (SEC-AZ-04).
 */
const refundPayment = asyncHandler(async (req, res) => {
  const { orderId, amountPaise, reason = 'CUSTOMER_REFUND', secondApproverId } = req.body;
  if (!orderId || !amountPaise) {
    throw new AppError('orderId and amountPaise are required', 400);
  }

  // 4-eyes approval authorization check
  const amountRupees = Number(amountPaise) / 100;
  const isAuthorized = can(
    req.user,
    PERMISSIONS.ORDERS_REFUND_APPROVE,
    { amount: amountRupees },
    { secondApproverId, amount: amountRupees }
  );
  if (!isAuthorized) {
    throw new AppError(
      'Forbidden: High-value refunds require four-eyes dual-party approval (SEC-AZ-04).',
      403
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT id, user_id, grand_total_paise, grand_total, status FROM orders WHERE id = $1 FOR UPDATE`,
      [Number(orderId)]
    );

    if (orderRes.rows.length === 0) {
      throw new AppError('Order not found', 404);
    }
    const order = orderRes.rows[0];

    // Find captured payment
    const paymentRes = await client.query(
      `SELECT payment_id FROM payment_events
       WHERE provider_order_id IN (SELECT provider_order_id FROM payment_orders WHERE order_id = $1)
         AND event_type = 'payment.captured'
       LIMIT 1`,
      [order.id]
    );

    const paymentId = paymentRes.rows.length > 0 ? paymentRes.rows[0].payment_id : `pay_mock_${order.id}`;

    const provider = getPaymentProvider();
    const refund = await provider.createRefund({
      paymentId,
      amountPaise: Number(amountPaise),
      reason,
      notes: { orderId: String(order.id), approvedBy: String(req.user.id) },
    });

    // Record balanced reversing ledger entry
    const refundPaise = Math.round(Number(amountPaise));
    const storeDeductionPaise = Math.round(refundPaise * 0.85);
    const platformDeductionPaise = refundPaise - storeDeductionPaise;

    await ledgerService.recordOrderRefund(
      {
        orderId: order.id,
        refundTotalPaise: refundPaise,
        storeDeductionPaise,
        platformDeductionPaise,
        taxDeductionPaise: 0,
        refundTarget: 'GATEWAY',
        reason,
      },
      client
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, $2, $2, $3, $4)`,
      [order.id, order.status, req.user.id, `Refund of ₹${(refundPaise / 100).toFixed(2)} processed: ${reason}`]
    );

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        refundId: refund.id,
        amountPaise: refundPaise,
        status: refund.status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * POST /api/payments/dismiss
 * Handles user closing or cancelling the payment gateway modal without completing payment.
 * Automatically releases held inventory and transitions order to cancelled.
 */
const dismissPaymentOrder = asyncHandler(async (req, res) => {
  const { orderId, reason = 'PAYMENT_DISMISSED_BY_USER' } = req.body;
  if (!orderId) {
    throw new AppError('orderId is required', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT id, user_id, status FROM orders WHERE id = $1 FOR UPDATE`,
      [Number(orderId)]
    );

    if (orderRes.rows.length === 0) {
      throw new AppError('Order not found', 404);
    }

    const order = orderRes.rows[0];

    // Ownership check: Customer cannot dismiss another user's order
    if (req.user.role === 'customer' && order.user_id !== req.user.id) {
      throw new AppError('Forbidden: you do not own this order', 403);
    }

    if (order.status === 'confirmed') {
      throw new AppError('Cannot dismiss payment for an already confirmed order', 400);
    }

    if (order.status === 'cancelled') {
      await client.query('COMMIT');
      return res.status(200).json({
        status: 'success',
        message: 'Order already cancelled',
        data: { orderId: order.id, status: 'cancelled' },
      });
    }

    if (order.status !== 'placed') {
      throw new AppError(`Cannot dismiss payment for order in status "${order.status}"`, 400);
    }

    // Cancel order
    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [order.id]);

    // Restore stock and log inventory movements
    const itemsRes = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    for (const item of itemsRes.rows) {
      if (item.product_id) {
        await client.query(
          `UPDATE products SET stock = stock + $1 WHERE id = $2`,
          [item.quantity, item.product_id]
        );
        await client.query(
          `INSERT INTO inventory_movements (product_id, delta, reason, ref_order_id)
           VALUES ($1, $2, 'payment_dismissed_restock', $3)`,
          [item.product_id, item.quantity, order.id]
        );
      }
    }

    // Release any active stock reservations for user
    await stockReservationService.releaseUserReservation(order.user_id, client);

    // Update payment orders status
    await client.query(
      `UPDATE payment_orders SET status = 'DISMISSED', updated_at = NOW() WHERE order_id = $1`,
      [order.id]
    );

    // Audit status history
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note)
       VALUES ($1, 'placed', 'cancelled', $2, $3)`,
      [order.id, req.user.id, `Payment dismissed: ${reason}`]
    );

    // Outbox relay event
    await outboxRelayService.recordEvent(client, {
      aggregateType: 'order',
      aggregateId: order.id,
      eventType: 'payment_dismissed',
      payload: { orderId: order.id, reason },
    });

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'Payment dismissed and stock reservation released successfully.',
      data: { orderId: order.id, status: 'cancelled' },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

/**
 * POST /api/payments/simulate-success
 * Allowed only in test / fake provider environments: constructs a payment.captured webhook
 * with valid HMAC signature and invokes the webhook handler.
 */
const simulatePaymentSuccess = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Endpoint not available in production', 404);
  }

  const { orderId } = req.body;
  if (!orderId) {
    throw new AppError('orderId is required', 400);
  }

  // Order ownership verification
  const orderRes = await query(`SELECT id, user_id FROM orders WHERE id = $1`, [Number(orderId)]);
  if (orderRes.rows.length === 0) {
    throw new AppError('Order not found', 404);
  }
  const order = orderRes.rows[0];
  if (req.user.role === 'customer' && order.user_id !== req.user.id) {
    throw new AppError('Forbidden: you do not own this order', 403);
  }

  const provider = getPaymentProvider();
  if (provider.name !== 'FAKE' && process.env.NODE_ENV !== 'test' && process.env.RAZORPAY_KEY_ID) {
    throw new AppError('Simulated payment completion is strictly disabled in production', 403);
  }

  const pOrderRes = await query(
    `SELECT id, order_id, provider_order_id, amount_paise, currency, status
     FROM payment_orders
     WHERE order_id = $1`,
    [Number(orderId)]
  );

  if (pOrderRes.rows.length === 0) {
    throw new AppError('Payment order not found', 404);
  }

  const paymentOrder = pOrderRes.rows[0];
  const eventId = `evt_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const paymentId = `pay_sim_${Date.now()}`;
  const payload = {
    event: 'payment.captured',
    event_id: eventId,
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: paymentOrder.provider_order_id,
          amount: paymentOrder.amount_paise,
          currency: paymentOrder.currency || 'INR',
          status: 'captured',
          method: 'upi',
        },
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const signature = provider.generateTestSignature(rawBody);

  const fakeReq = {
    headers: {
      'x-razorpay-signature': signature,
      'x-razorpay-event-time': String(payload.created_at),
    },
    body: payload,
    rawBody,
    ip: req.ip,
  };

  let simulatedResponse = null;
  const fakeRes = {
    status: (code) => ({
      json: (data) => {
        simulatedResponse = { code, data };
      },
    }),
  };

  await handlePaymentWebhook(fakeReq, fakeRes);

  res.status(200).json({
    status: 'success',
    message: 'Payment webhook simulated and verified',
    data: simulatedResponse?.data || { orderId },
  });
});

module.exports = {
  createPaymentOrder,
  handlePaymentWebhook,
  refundPayment,
  simulatePaymentSuccess,
  dismissPaymentOrder,
};
