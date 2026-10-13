/**
 * @file idor-bola.test.js
 * @description Automated IDOR/BOLA and Privilege Escalation Integration Tests (SEC-AZ-02, SEC-AZ-10).
 * Verifies object-level isolation between users and strict RBAC enforcement.
 */

const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct } = require('../helpers/factories');

describe('IDOR / BOLA & Privilege Escalation Security Suite (SEC-AZ-02, SEC-AZ-10)', () => {
  let userA, tokenA;
  let userB, tokenB;
  let adminUser, adminToken;
  let product;
  let orderAId;

  beforeAll(async () => {
    // 1. Setup User A (Alice) and User B (Bob)
    const resA = await makeUser({ name: 'Alice Customer', role: 'customer' });
    userA = resA.user;
    tokenA = resA.token;

    const resB = await makeUser({ name: 'Bob Customer', role: 'customer' });
    userB = resB.user;
    tokenB = resB.token;

    // 2. Setup Admin User
    const resAdmin = await makeUser({ name: 'System Admin', role: 'admin' });
    adminUser = resAdmin.user;
    adminToken = resAdmin.token;

    // 3. Setup a product and add to Alice's cart
    product = await makeProduct({ stock: 50, price: 150 });

    await request(app)
      .post('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, quantity: 2 });

    // 4. Alice creates Order A
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ deliveryAddress: 'Alice Home, Sector 4' });

    expect(orderRes.status).toBe(201);
    orderAId = orderRes.body.data.order.id;
  });

  describe('Object-Level IDOR / BOLA Prevention on Orders (SEC-AZ-02)', () => {
    it('Alice can read her own order detail (GET /api/v1/orders/:id)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.order.id).toBe(orderAId);
    });

    it('Bob is denied access (404 Not Found) when attempting to read Alice order (IDOR)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Must return 404 to avoid leaking order existence
      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
    });

    it('Bob cannot cancel Alice order (POST /api/v1/orders/:id/cancel)', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderAId}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ reason: 'Malicious cancellation attempt' });

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');

      // Verify order A is still placed / not cancelled in database
      const { rows } = await query('SELECT status FROM orders WHERE id = $1', [orderAId]);
      expect(rows[0].status).toBe('placed');
    });
  });

  describe('Cart & Stock Reservation Isolation Between Users (SEC-AZ-02)', () => {
    it('Bob cart is completely isolated and does not expose Alice cart items', async () => {
      const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.cart.itemCount).toBe(0);
      expect(res.body.data.cart.items).toEqual([]);
    });

    it('Bob adding to his cart does not affect Alice cart or stock reservations', async () => {
      // Bob adds product to cart
      await request(app)
        .post('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ productId: product.id, quantity: 1 });

      const resA = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenA}`);
      const resB = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${tokenB}`);

      expect(resB.body.data.cart.itemCount).toBe(1);
      // Alice cart remains unaffected
      expect(resA.status).toBe(200);
    });

    it('Bob cannot see or release Alice active stock reservation', async () => {
      // Alice reserves checkout hold
      await request(app)
        .post('/api/v1/cart/checkout/reserve')
        .set('Authorization', `Bearer ${tokenA}`)
        .send();

      // Bob checks his reservation
      const resB = await request(app)
        .get('/api/v1/cart/checkout/reservation')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data).toBeNull();
    });
  });

  describe('User Profile & Privacy Data Isolation (GDPR / DPDP & SEC-AZ-02)', () => {
    it('Bob only receives his own profile and cannot access Alice profile data', async () => {
      const resB = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${tokenB}`);
      expect(resB.status).toBe(200);
      expect(resB.body.data.user.id).toBe(userB.id);
      expect(resB.body.data.user.email).toBe(userB.email);
      expect(resB.body.data.user.id).not.toBe(userA.id);
    });

    it('Bob data export contains only Bob personal data and zero Alice records', async () => {
      const res = await request(app)
        .get('/api/v1/users/me/data-export')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(userB.id);
      expect(res.body.data.orders.every((o) => o.user_id === userB.id)).toBe(true);
    });
  });

  describe('Privilege Escalation Prevention Across All Roles (SEC-AZ-03 & SEC-AZ-10)', () => {
    it('denies customer from accessing admin orders endpoint (GET /api/v1/admin/orders)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from accessing admin dashboard stats (GET /api/v1/admin/stats)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from modifying product catalog (POST /api/v1/admin/products)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Hacked Product',
          qty_label: '1 unit',
          price: 1,
          category_id: 'dairy',
        });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from adjusting inventory stock (POST /api/v1/admin/inventory/adjust)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: product.id, delta: 100 });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from overriding order statuses (PATCH /api/v1/admin/orders/:id/status)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderAId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from viewing security audit logs (GET /api/v1/security/audit-logs)', async () => {
      const res = await request(app)
        .get('/api/v1/security/audit-logs')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from verifying audit hash chain (GET /api/v1/security/audit-chain/verify)', async () => {
      const res = await request(app)
        .get('/api/v1/security/audit-chain/verify')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('denies customer from dispatching background jobs (POST /api/v1/admin/queues/dispatch)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/queues/dispatch')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ queueName: 'email', jobName: 'broadcast', data: {} });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('grants admin user full access to admin endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.orders).toBeDefined();
    });
  });
});
