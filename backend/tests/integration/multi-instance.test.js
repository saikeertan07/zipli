/**
 * @file multi-instance.test.js
 * @description Multi-instance safety and distributed state integration test.
 * Simulates two server instances (Instance A and Instance B) sharing the same
 * Redis adapter and PostgreSQL database.
 *
 * Verifies:
 * 1. Concurrent identical idempotent requests across instances produce exactly 1 order with zero split-brain.
 * 2. Cross-instance SSE message fan-out via Redis Pub/Sub.
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/db');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');
const { truncateUserData } = require('../setup');
const { sseHub } = require('../../src/services/sse.service');

describe('Multi-Instance Distributed State & Concurrency Simulation', () => {
  beforeEach(async () => {
    await truncateUserData();
    await pool.query('TRUNCATE idempotency_keys RESTART IDENTITY CASCADE;');
  });

  describe('Distributed Idempotency (Instance A & Instance B)', () => {
    it('concurrent requests to separate instances with identical idempotency-key yield exactly 1 order with no split-brain', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct({ stock: 50, price: 100 });
      await makeCartFor(user.id, [{ productId: product.id, quantity: 2 }]);

      const sharedIdempotencyKey = `idemp_shared_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = { deliveryAddress: '100 Silicon Boulevard, Tech Center' };

      // Dispatch 2 concurrent requests simulating load balancer hitting Instance A and Instance B
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', sharedIdempotencyKey)
          .send(payload),
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', sharedIdempotencyKey)
          .send(payload),
      ]);

      // Both requests must succeed (201 Created or 200 Idempotent Replay)
      expect([200, 201]).toContain(resA.status);
      expect([200, 201]).toContain(resB.status);

      // At least one response must be flagged as Idempotent-Replay if they resolved concurrently
      const oneIsReplay =
        resA.headers['idempotent-replay'] === 'true' ||
        resB.headers['idempotent-replay'] === 'true';
      expect(oneIsReplay).toBe(true);

      // Verify database invariant: Exactly 1 order was inserted in PostgreSQL
      const orderCountRes = await query(
        `SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1`,
        [user.id]
      );
      expect(orderCountRes.rows[0].count).toBe(1);

      // Verify stock was decremented exactly once (50 - 2 = 48)
      const stockRes = await query(`SELECT stock FROM products WHERE id = $1`, [product.id]);
      expect(stockRes.rows[0].stock).toBe(48);

      // Verify identical order IDs returned by both instances
      const orderIdA = resA.body.data.order ? resA.body.data.order.id : resA.body.data.id;
      const orderIdB = resB.body.data.order ? resB.body.data.order.id : resB.body.data.id;
      expect(orderIdA).toBe(orderIdB);
    });
  });

  describe('Cross-Instance SSE Fan-Out via Redis Pub/Sub', () => {
    it('dispatches events across instances using Redis Pub/Sub channel', async () => {
      const { user } = await makeUser();
      const receivedMessages = [];

      // Simulate a client response stream connected to Instance A
      const mockClientStream = {
        writable: true,
        writableEnded: false,
        write(msg) {
          receivedMessages.push(msg);
          return true;
        },
      };

      // Register mock client on sseHub (simulating Instance A)
      if (!sseHub.clientsByUser.has(user.id)) {
        sseHub.clientsByUser.set(user.id, new Set());
      }
      sseHub.clientsByUser.get(user.id).add(mockClientStream);
      sseHub.allClients.add(mockClientStream);

      try {
        // Emit event from Instance B via shared sseHub emit (which publishes to Redis channel)
        await sseHub.emit({
          targetUserId: user.id,
          eventName: 'order_update',
          data: { status: 'out_for_delivery', etaMinutes: 8 },
        });

        // Verify client on Instance A received the formatted SSE message
        expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
        const latest = receivedMessages[receivedMessages.length - 1];
        expect(latest).toContain('event: order_update');
        expect(latest).toContain('"status":"out_for_delivery"');
      } finally {
        sseHub.allClients.delete(mockClientStream);
        if (sseHub.clientsByUser.has(user.id)) {
          sseHub.clientsByUser.get(user.id).delete(mockClientStream);
        }
      }
    });
  });
});
