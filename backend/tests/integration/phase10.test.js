const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/db');
const { truncateUserData } = require('../setup');
const jwt = require('jsonwebtoken');
const { env } = require('../../src/config/env');

const { makeUser } = require('../helpers/factories');

describe('Phase 10 Systems Showcase Integration Tests', () => {
  let customerToken;
  let customerUser;
  let adminToken;
  let adminUser;
  let testProductId;

  beforeEach(async () => {
    await truncateUserData();

    // Create customer user
    const customer = await makeUser({ role: 'customer' });
    customerUser = customer.user;
    customerToken = customer.token;

    // Create admin user
    const admin = await makeUser({ role: 'admin' });
    adminUser = admin.user;
    adminToken = admin.token;

    // Get a valid seeded product
    const pRes = await pool.query('SELECT id, price, stock FROM products WHERE stock > 10 LIMIT 1');
    testProductId = pRes.rows[0].id;
  });

  describe('Observability & Probes (10.7 & 10.8)', () => {
    it('GET /metrics returns 200 with Prometheus exposition format', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('# TYPE http_requests_total counter');
      expect(res.text).toContain('cache_hit_ratio');
      expect(res.text).toContain('queue_depth');
      expect(res.text).toContain('process_resident_memory_bytes');
    });

    it('GET /health/liveness returns 200 with UP status', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(res.body.uptime).toBeDefined();
    });

    it('GET /health/readiness returns 200 with READY status and connection pool', async () => {
      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.services.database).toBe('UP');
      expect(res.body.pool).toBeDefined();
    });
  });

  describe('Stock Reservations & Countdown (10.3)', () => {
    it('creates a 10-minute hold on cart items and verifies countdown', async () => {
      // Put item in cart
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: testProductId, quantity: 2 });

      // Reserve stock for checkout
      const reserveRes = await request(app)
        .post('/api/cart/checkout/reserve')
        .set('Authorization', `Bearer ${customerToken}`)
        .send();

      expect(reserveRes.status).toBe(200);
      expect(reserveRes.body.status).toBe('success');
      expect(reserveRes.body.data.holdMinutes).toBe(10);
      expect(reserveRes.body.data.remainingSeconds).toBeGreaterThan(580);
      expect(reserveRes.body.data.items).toHaveLength(1);

      // Check current active reservation countdown
      const getRes = await request(app)
        .get('/api/cart/checkout/reservation')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.status).toBe('ACTIVE');
      expect(getRes.body.data.remainingSeconds).toBeGreaterThan(0);

      // Release reservation
      const releaseRes = await request(app)
        .post('/api/cart/checkout/release')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.status).toBe('success');
    });
  });

  describe('Transactional Outbox Pattern & Order Checkout (10.3 & 10.5)', () => {
    it('places an order, commits stock reservation, and creates outbox_event in the same transaction', async () => {
      // 1. Put item in cart and create hold
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: testProductId, quantity: 1 });

      await request(app)
        .post('/api/cart/checkout/reserve')
        .set('Authorization', `Bearer ${customerToken}`)
        .send();

      // 2. Place order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ deliveryAddress: 'Flat 402, High Street' });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;
      expect(orderId).toBeDefined();

      // 3. Verify stock reservation is COMMITTED
      const holdRes = await pool.query(`SELECT status FROM stock_reservations WHERE user_id = $1`, [
        customerUser.id,
      ]);
      expect(holdRes.rows.some((r) => r.status === 'COMMITTED')).toBe(true);

      // 4. Verify outbox event was recorded atomically in outbox_events table
      const outboxRes = await pool.query(
        `SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'order_placed'`,
        [String(orderId)]
      );
      expect(outboxRes.rows).toHaveLength(1);
      expect(outboxRes.rows[0].status).toBe('PENDING');
      expect(outboxRes.rows[0].aggregate_type).toBe('order');
    });
  });

  describe('Notifications (10.6)', () => {
    it('manages user notifications and marks as read', async () => {
      // Seed a test notification
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'PROMO', 'Flash Sale! 🚀', '50% off on fruits today', '{"discount": 50}')`,
        [customerUser.id]
      );

      // List notifications
      const listRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.unreadCount).toBe(1);
      expect(listRes.body.data.notifications).toHaveLength(1);

      const notifId = listRes.body.data.notifications[0].id;

      // Mark single as read
      const markRes = await request(app)
        .patch(`/api/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(markRes.status).toBe(200);
      expect(markRes.body.data.notification.read).toBe(true);

      // Mark all as read
      const readAllRes = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(readAllRes.status).toBe(200);
      expect(readAllRes.body.status).toBe('success');
    });
  });

  describe('Admin Job Queue Dashboard (10.1)', () => {
    it('GET /api/admin/queues returns queue metrics to admin', async () => {
      const res = await request(app)
        .get('/api/admin/queues')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.zipli_system).toBeDefined();
      expect(res.body.data.zipli_system.waiting).toBeDefined();
    });

    it('rejects queue dashboard access for regular customers with 403', async () => {
      const res = await request(app)
        .get('/api/admin/queues')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
