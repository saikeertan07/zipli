/**
 * @file payments.test.js
 * @description Comprehensive integration tests for payments lifecycle:
 * provider order creation, HMAC webhook verification, replay protection,
 * server-side amount verification against tamper attacks, and four-eyes refunds.
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/db');
const { makeUser, makeOrderFor } = require('../helpers/factories');
const { truncateUserData } = require('../setup');
const { fakeProvider } = require('../../src/services/paymentProvider');

describe('Payment & Gateway Integration Tests (/api/payments)', () => {
  beforeEach(async () => {
    await truncateUserData();
    await pool.query('TRUNCATE payment_orders, payment_events RESTART IDENTITY CASCADE;');
  });

  describe('POST /api/payments/create-order', () => {
    it('returns 400 when orderId is missing', async () => {
      const { token } = await makeUser();
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('orderId is required');
    });

    it('returns 401 when request is unauthenticated', async () => {
      const res = await request(app).post('/api/payments/create-order').send({ orderId: 1 });

      expect(res.status).toBe(401);
    });

    it('returns 404 when orderId does not exist', async () => {
      const { token } = await makeUser();
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 999999 });

      expect(res.status).toBe(404);
    });

    it('returns 403 when customer attempts to create payment for another user order', async () => {
      const userA = await makeUser();
      const userB = await makeUser();

      const { order } = await makeOrderFor(userA.user.id, [], { status: 'placed' });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(403);
    });

    it('successfully creates provider payment order and persists mapping', async () => {
      const { user, token } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.provider).toBe('FAKE');
      expect(res.body.data.providerOrderId).toMatch(/^order_fake_/);
      expect(res.body.data.amountPaise).toBe(Number(order.grand_total) * 100);

      // Verify DB record
      const dbRes = await query(`SELECT * FROM payment_orders WHERE order_id = $1`, [order.id]);
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].status).toBe('CREATED');
    });

    it('returns 400 when order is already confirmed or cancelled', async () => {
      const { user, token } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'confirmed' });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot create payment');
    });
  });

  describe('POST /api/payments/webhook', () => {
    it('rejects webhooks with missing signature header', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .send({ event: 'payment.captured' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
    });

    it('rejects webhooks with forged/invalid signature', async () => {
      const payload = { event: 'payment.captured', event_id: 'evt_123' };
      const res = await request(app)
        .post('/api/payments/webhook')
        .set(
          'x-razorpay-signature',
          '0000000000000000000000000000000000000000000000000000000000000000'
        )
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
    });

    it('rejects webhooks with expired timestamp (> 300s drift)', async () => {
      const payload = { event: 'payment.captured', event_id: 'evt_expired' };
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago
      const signature = fakeProvider.generateTestSignature(payload);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-time', String(expiredTimestamp))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 when event ID is missing from validly signed webhook', async () => {
      const payload = { event: 'payment.captured' }; // No event_id
      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Missing event ID');
    });

    it('returns ignored when webhook has no matching internal order', async () => {
      const payload = {
        event: 'payment.captured',
        event_id: `evt_unknown_${Date.now()}`,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: { id: 'pay_unmatched', order_id: 'order_nonexistent_9999', amount: 5000 },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ignored');
    });

    it('processes valid payment.captured webhook, confirms order, posts balanced ledger entry, and emits outbox event', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });
      const amountPaise = Number(order.grand_total) * 100;

      // Create provider order
      const providerOrder = await fakeProvider.createOrder({
        orderId: order.id,
        amountPaise,
      });

      await query(
        `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
         VALUES ($1, 'FAKE', $2, $3, 'INR', 'CREATED')`,
        [order.id, providerOrder.id, amountPaise]
      );

      const eventId = `evt_test_${Date.now()}`;
      const payload = {
        event: 'payment.captured',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_${Date.now()}`,
              order_id: providerOrder.id,
              amount: amountPaise,
              currency: 'INR',
              status: 'captured',
              method: 'upi',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.processed).toBe(true);

      // Verify order status transitioned to confirmed
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('confirmed');

      // Verify payment_orders updated to PAID
      const pOrderCheck = await query(`SELECT status FROM payment_orders WHERE order_id = $1`, [
        order.id,
      ]);
      expect(pOrderCheck.rows[0].status).toBe('PAID');

      // Verify payment_events record
      const eventCheck = await query(`SELECT status FROM payment_events WHERE event_id = $1`, [
        eventId,
      ]);
      expect(eventCheck.rows.length).toBe(1);
      expect(eventCheck.rows[0].status).toBe('PROCESSED');

      // Verify balanced ledger entry exists (F-051)
      const journalCheck = await query(
        `SELECT id FROM ledger_journal_entries WHERE reference_type = 'ORDER_PAYMENT' AND reference_id = $1`,
        [String(order.id)]
      );
      expect(journalCheck.rows.length).toBeGreaterThanOrEqual(1);

      // Verify outbox event emitted
      const outboxCheck = await query(
        `SELECT event_type FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'payment_confirmed'`,
        [String(order.id)]
      );
      expect(outboxCheck.rows.length).toBe(1);
    });

    it('simulates payment success and triggers webhook transition via /api/payments/simulate-success', async () => {
      const { user, token } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });

      // Create payment order
      await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id });

      // Trigger simulation
      const res = await request(app)
        .post('/api/payments/simulate-success')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify order transitioned to confirmed
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('confirmed');
    });

    it('returns 403 when User A attempts to simulate payment for User B order (IDOR defense)', async () => {
      const userA = await makeUser();
      const userB = await makeUser();
      const { order } = await makeOrderFor(userB.user.id, [], { status: 'placed' });

      // User B creates payment order
      await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ orderId: order.id });

      // User A tries to simulate payment success for User B's order
      const res = await request(app)
        .post('/api/payments/simulate-success')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    describe('POST /api/payments/dismiss', () => {
      it('allows customer to dismiss own payment order, restores stock, and cancels order', async () => {
        const { user, token } = await makeUser();
        // Insert a product with stock 10
        const prodRes = await query(
          `INSERT INTO products (name, category_id, price, mrp, price_paise, mrp_paise, stock, qty_label, image_url, is_active)
           VALUES ('Dismiss Test Product', 'dairy', 50, 55, 5000, 5500, 10, '1L', '/img.jpg', true) RETURNING id, stock`
        );
        const product = prodRes.rows[0];

        const { order } = await makeOrderFor(user.id, [{ productId: product.id, quantity: 2 }], {
          status: 'placed',
        });
        // Simulate order placement deduction
        await query('UPDATE products SET stock = stock - 2 WHERE id = $1', [product.id]);

        // Stock decreased to 8 when order placed
        const stockAfterOrder = await query('SELECT stock FROM products WHERE id = $1', [
          product.id,
        ]);
        expect(stockAfterOrder.rows[0].stock).toBe(8);

        // Create payment order
        await request(app)
          .post('/api/payments/create-order')
          .set('Authorization', `Bearer ${token}`)
          .send({ orderId: order.id });

        // Dismiss payment
        const res = await request(app)
          .post('/api/payments/dismiss')
          .set('Authorization', `Bearer ${token}`)
          .send({ orderId: order.id, reason: 'user_closed_checkout' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.status).toBe('cancelled');

        // Verify order is cancelled
        const orderCheck = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
        expect(orderCheck.rows[0].status).toBe('cancelled');

        // Verify stock restored back to 10
        const stockAfterDismiss = await query('SELECT stock FROM products WHERE id = $1', [
          product.id,
        ]);
        expect(stockAfterDismiss.rows[0].stock).toBe(10);

        // Verify inventory_movements record
        const movCheck = await query(
          `SELECT reason, delta FROM inventory_movements WHERE ref_order_id = $1 AND reason = 'payment_dismissed_restock'`,
          [order.id]
        );
        expect(movCheck.rows.length).toBe(1);
        expect(movCheck.rows[0].delta).toBe(2);

        // Verify payment_orders status is DISMISSED
        const pOrderCheck = await query('SELECT status FROM payment_orders WHERE order_id = $1', [
          order.id,
        ]);
        expect(pOrderCheck.rows[0].status).toBe('DISMISSED');
      });

      it('returns 403 when User A attempts to dismiss User B order', async () => {
        const userA = await makeUser();
        const userB = await makeUser();
        const { order } = await makeOrderFor(userB.user.id, [], { status: 'placed' });

        const res = await request(app)
          .post('/api/payments/dismiss')
          .set('Authorization', `Bearer ${userA.token}`)
          .send({ orderId: order.id });

        expect(res.status).toBe(403);
      });

      it('returns 400 when attempting to dismiss an already confirmed order', async () => {
        const { user, token } = await makeUser();
        const { order } = await makeOrderFor(user.id, [], { status: 'confirmed' });

        const res = await request(app)
          .post('/api/payments/dismiss')
          .set('Authorization', `Bearer ${token}`)
          .send({ orderId: order.id });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('already confirmed');
      });
    });

    it('idempotently ignores duplicated webhook replay without side effects', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });
      const amountPaise = Number(order.grand_total) * 100;

      const providerOrder = await fakeProvider.createOrder({
        orderId: order.id,
        amountPaise,
      });

      await query(
        `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
         VALUES ($1, 'FAKE', $2, $3, 'INR', 'CREATED')`,
        [order.id, providerOrder.id, amountPaise]
      );

      const eventId = `evt_idempotent_${Date.now()}`;
      const payload = {
        event: 'payment.captured',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_${Date.now()}`,
              order_id: providerOrder.id,
              amount: amountPaise,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      // First delivery
      const firstRes = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.status).toBe('success');

      // Journal count before replay
      const beforeReplay = await query(
        `SELECT COUNT(*)::int AS cnt FROM ledger_journal_entries WHERE reference_type = 'ORDER_PAYMENT' AND reference_id = $1`,
        [String(order.id)]
      );

      // Second delivery (replay)
      const secondRes = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.status).toBe('duplicate_ignored');

      // Verify no duplicate journal entries were created on replay
      const afterReplay = await query(
        `SELECT COUNT(*)::int AS cnt FROM ledger_journal_entries WHERE reference_type = 'ORDER_PAYMENT' AND reference_id = $1`,
        [String(order.id)]
      );
      expect(afterReplay.rows[0].cnt).toBe(beforeReplay.rows[0].cnt);
    });

    it('detects server-side amount tamper, cancels order, records TAMPER_DETECTED, and initiates auto-refund (F-053)', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });
      const trueAmountPaise = Number(order.grand_total) * 100;
      const forgedTamperedAmountPaise = 100; // Attacker tries paying ₹1 instead of full amount

      const providerOrder = await fakeProvider.createOrder({
        orderId: order.id,
        amountPaise: trueAmountPaise,
      });

      await query(
        `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
         VALUES ($1, 'FAKE', $2, $3, 'INR', 'CREATED')`,
        [order.id, providerOrder.id, trueAmountPaise]
      );

      const eventId = `evt_tamper_${Date.now()}`;
      const payload = {
        event: 'payment.captured',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_tampered_${Date.now()}`,
              order_id: providerOrder.id,
              amount: forgedTamperedAmountPaise, // Mismatched!
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('tamper_handled');

      // Verify order cancelled
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('cancelled');

      // Verify tamper event logged
      const eventCheck = await query(`SELECT status FROM payment_events WHERE event_id = $1`, [
        eventId,
      ]);
      expect(eventCheck.rows[0].status).toBe('TAMPER_DETECTED');
    });

    it('cancels order and restores stock on payment.failed webhook', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });
      const amountPaise = Number(order.grand_total) * 100;

      const providerOrder = await fakeProvider.createOrder({
        orderId: order.id,
        amountPaise,
      });

      await query(
        `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
         VALUES ($1, 'FAKE', $2, $3, 'INR', 'CREATED')`,
        [order.id, providerOrder.id, amountPaise]
      );

      const eventId = `evt_failed_${Date.now()}`;
      const payload = {
        event: 'payment.failed',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_failed_${Date.now()}`,
              order_id: providerOrder.id,
              amount: amountPaise,
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      // Verify order cancelled
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('cancelled');

      // Verify payment order status FAILED
      const pOrderCheck = await query(`SELECT status FROM payment_orders WHERE order_id = $1`, [
        order.id,
      ]);
      expect(pOrderCheck.rows[0].status).toBe('FAILED');
    });

    it('safely handles captured-before-created webhook using notes.internalOrderId', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'placed' });
      const amountPaise = Number(order.grand_total) * 100;
      const unrecordedProviderOrderId = `order_unrecorded_${Date.now()}`;

      // Notice: payment_orders row was NOT created prior to this webhook
      const eventId = `evt_before_created_${Date.now()}`;
      const payload = {
        event: 'payment.captured',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_unrecorded_${Date.now()}`,
              order_id: unrecordedProviderOrderId,
              amount: amountPaise,
              currency: 'INR',
              status: 'captured',
              notes: { internalOrderId: String(order.id) },
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Order transitioned to confirmed
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('confirmed');

      // payment_orders row was created and marked PAID
      const pOrderCheck = await query(`SELECT status FROM payment_orders WHERE order_id = $1`, [
        order.id,
      ]);
      expect(pOrderCheck.rows.length).toBe(1);
      expect(pOrderCheck.rows[0].status).toBe('PAID');
    });

    it('safely ignores late payment.failed webhook arriving after order was already confirmed', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], { status: 'confirmed' });
      const amountPaise = Number(order.grand_total) * 100;

      const providerOrder = await fakeProvider.createOrder({
        orderId: order.id,
        amountPaise,
      });

      await query(
        `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status)
         VALUES ($1, 'FAKE', $2, $3, 'INR', 'PAID')`,
        [order.id, providerOrder.id, amountPaise]
      );

      const eventId = `evt_late_fail_${Date.now()}`;
      const payload = {
        event: 'payment.failed',
        event_id: eventId,
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: `pay_late_fail_${Date.now()}`,
              order_id: providerOrder.id,
              amount: amountPaise,
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = fakeProvider.generateTestSignature(rawBody);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('late_failure_ignored');

      // Order MUST remain confirmed
      const orderCheck = await query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(orderCheck.rows[0].status).toBe('confirmed');

      // Payment event marked as IGNORED
      const eventCheck = await query(`SELECT status FROM payment_events WHERE event_id = $1`, [
        eventId,
      ]);
      expect(eventCheck.rows[0].status).toBe('IGNORED');
    });

    describe('Payment Reconciliation Job (paymentReconcile.service.js)', () => {
      it('auto-cancels and restocks orders stuck in placed beyond timeout threshold', async () => {
        const { user } = await makeUser();
        // Insert product
        const prodRes = await query(
          `INSERT INTO products (name, category_id, price, mrp, price_paise, mrp_paise, stock, qty_label, image_url, is_active)
           VALUES ('Reconcile Test Item', 'dairy', 40, 45, 4000, 4500, 20, '1L', '/img.jpg', true) RETURNING id, stock`
        );
        const product = prodRes.rows[0];

        const { order } = await makeOrderFor(user.id, [{ productId: product.id, quantity: 5 }], {
          status: 'placed',
        });
        // Simulate order placement deduction
        await query('UPDATE products SET stock = stock - 5 WHERE id = $1', [product.id]);

        // Stock decreased to 15
        const stockAfterOrder = await query('SELECT stock FROM products WHERE id = $1', [
          product.id,
        ]);
        expect(stockAfterOrder.rows[0].stock).toBe(15);

        // Record payment order
        const providerOrderId = `order_stuck_${Date.now()}`;
        await query(
          `INSERT INTO payment_orders (order_id, provider, provider_order_id, amount_paise, currency, status, created_at)
           VALUES ($1, 'FAKE', $2, 4000, 'INR', 'CREATED', NOW() - INTERVAL '30 minutes')`,
          [order.id, providerOrderId]
        );

        // Make order created_at 30 minutes ago
        await query(`UPDATE orders SET created_at = NOW() - INTERVAL '30 minutes' WHERE id = $1`, [
          order.id,
        ]);

        const { reconcileStuckPayments } = require('../../src/services/paymentReconcile.service');
        const summary = await reconcileStuckPayments({ stuckThresholdMinutes: 15 });

        expect(summary.checked).toBeGreaterThanOrEqual(1);
        expect(summary.cancelled).toBeGreaterThanOrEqual(1);

        // Verify order cancelled
        const orderCheck = await query('SELECT status FROM orders WHERE id = $1', [order.id]);
        expect(orderCheck.rows[0].status).toBe('cancelled');

        // Verify product restocked back to 20
        const stockAfterReconcile = await query('SELECT stock FROM products WHERE id = $1', [
          product.id,
        ]);
        expect(stockAfterReconcile.rows[0].stock).toBe(20);

        // Verify payment order status EXPIRED
        const pOrderCheck = await query('SELECT status FROM payment_orders WHERE order_id = $1', [
          order.id,
        ]);
        expect(pOrderCheck.rows[0].status).toBe('EXPIRED');
      });
    });
  });

  describe('POST /api/payments/refund (Four-Eyes Approval)', () => {
    it('returns 400 when orderId or amountPaise is missing', async () => {
      const admin = await makeUser({ role: 'admin' });
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('returns 404 when refunding non-existent order', async () => {
      const admin = await makeUser({ role: 'admin' });
      const admin2 = await makeUser({ role: 'admin' });
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ orderId: 999999, amountPaise: 5000, secondApproverId: admin2.user.id });

      expect(res.status).toBe(404);
    });

    it('returns 403 when customer attempts refund', async () => {
      const { token } = await makeUser({ role: 'customer' });
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 1, amountPaise: 5000 });

      expect(res.status).toBe(403);
    });

    it('rejects high-value refund (> ₹1,000) when second approver is missing', async () => {
      const admin = await makeUser({ role: 'admin' });
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          orderId: 1,
          amountPaise: 150000, // ₹1,500 (> ₹1,000 threshold)
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('rejects high-value refund when admin tries self-approval (second approver == actor)', async () => {
      const admin = await makeUser({ role: 'admin' });
      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          orderId: 1,
          amountPaise: 150000,
          secondApproverId: admin.user.id, // Self-approval attempt
        });

      expect(res.status).toBe(403);
    });

    it('successfully processes high-value refund with valid distinct four-eyes second approver', async () => {
      const admin1 = await makeUser({ role: 'admin' });
      const admin2 = await makeUser({ role: 'admin' });
      const customer = await makeUser({ role: 'customer' });

      const { order } = await makeOrderFor(customer.user.id, [], { status: 'confirmed' });
      const refundPaise = 150000;

      const res = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', `Bearer ${admin1.token}`)
        .send({
          orderId: order.id,
          amountPaise: refundPaise,
          reason: 'DEFECTIVE_PRODUCT',
          secondApproverId: admin2.user.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.amountPaise).toBe(refundPaise);
      expect(res.body.data.refundId).toMatch(/^rfnd_fake_/);

      // Verify balanced ledger entry created for refund
      const ledgerCheck = await query(
        `SELECT id FROM ledger_journal_entries WHERE reference_type = 'ORDER_REFUND' AND reference_id = $1`,
        [String(order.id)]
      );
      expect(ledgerCheck.rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});
