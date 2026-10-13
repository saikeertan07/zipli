const request = require('supertest');
const app = require('../../src/app');
const { makeUser, makeProduct, makeCartFor, makeOrderFor } = require('../helpers/factories');
const { truncateUserData } = require('../setup');

describe('Orders & Checkout Integration Tests (API /api/orders)', () => {
  beforeEach(async () => {
    await truncateUserData();
  });

  describe('POST /api/orders (Checkout)', () => {
    it('successfully places an order, calculates totals, creates items, and clears the user cart', async () => {
      const { user, token } = await makeUser();
      const product1 = await makeProduct({ price: 40 });
      const product2 = await makeProduct({ price: 60 });

      await makeCartFor(user.id, [
        { productId: product1.id, quantity: 2 },
        { productId: product2.id, quantity: 1 },
      ]);

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ deliveryAddress: 'Flat 101, Indiranagar, Bengaluru' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      const order = res.body.data.order;
      expect(order.id).toBeDefined();
      expect(Number(order.item_total)).toBe(140);
      expect(Number(order.delivery_fee)).toBe(2);
      expect(Number(order.taxes)).toBe(7);
      expect(Number(order.grand_total)).toBe(149);
      expect(order.status).toBe('placed');
      expect(order.items.length).toBe(2);

      // Verify cart has been emptied in the database
      const cartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
      expect(cartRes.body.data.cart.items.length).toBe(0);
      expect(cartRes.body.data.cart.grandTotal).toBe(0);
    });

    it('returns 400 when attempting to checkout with an empty cart', async () => {
      const { token } = await makeUser();

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ deliveryAddress: 'Any Address' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Your cart is empty/);
    });

    it('returns 401 when checkout is attempted without authentication', async () => {
      const res = await request(app).post('/api/orders').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/orders & GET /api/orders/:id (Ownership & Access Control)', () => {
    it('lists orders belonging only to the authenticated user', async () => {
      const userA = await makeUser();
      const userB = await makeUser();

      await makeOrderFor(userA.user.id);
      await makeOrderFor(userA.user.id);
      await makeOrderFor(userB.user.id);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.orders.length).toBe(2);
      for (const order of res.body.data.orders) {
        expect(order.user_id).toBe(userA.user.id);
      }
    });

    it('returns full order detail with items for owned order', async () => {
      const { user, token } = await makeUser();
      const { order, items } = await makeOrderFor(user.id);

      const res = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.order.id).toBe(order.id);
      expect(res.body.data.order.items.length).toBe(items.length);
    });

    it('denies access (404) when attempting to view another user order', async () => {
      const userA = await makeUser();
      const userB = await makeUser();

      const { order: orderB } = await makeOrderFor(userB.user.id);

      const res = await request(app)
        .get(`/api/orders/${orderB.id}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Order not found/);
    });
  });
});
