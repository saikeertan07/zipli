const request = require('supertest');
const app = require('../../src/app');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');
const { truncateUserData } = require('../setup');

describe('Cart Integration Tests (API /api/cart)', () => {
  beforeEach(async () => {
    await truncateUserData();
  });

  describe('GET /api/cart', () => {
    it('returns empty cart representation when user has no items', async () => {
      const { token } = await makeUser();

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.cart.items).toEqual([]);
      expect(res.body.data.cart.itemCount).toBe(0);
      expect(res.body.data.cart.itemTotal).toBe(0);
      expect(res.body.data.cart.deliveryFee).toBe(0);
      expect(res.body.data.cart.grandTotal).toBe(0);
    });

    it('returns items with accurate pricing and delivery fee calculation', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct({ price: 100, mrp: 120 });
      await makeCartFor(user.id, [{ productId: product.id, quantity: 2 }]);

      const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const cart = res.body.data.cart;
      expect(cart.items.length).toBe(1);
      expect(cart.items[0].productId).toBe(product.id);
      expect(cart.items[0].quantity).toBe(2);
      expect(cart.items[0].lineTotal).toBe(200);
      expect(cart.itemTotal).toBe(200);
      expect(cart.taxes).toBe(10);
      expect(cart.deliveryFee).toBe(2);
      expect(cart.grandTotal).toBe(212);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/cart', () => {
    it('adds an item to cart or increments quantity if already exists', async () => {
      const { token } = await makeUser();
      const product = await makeProduct({ price: 75 });

      // First addition
      const res1 = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 1 });

      expect(res1.status).toBe(201);
      expect(res1.body.data.cart.items[0].quantity).toBe(1);

      // Second addition
      const res2 = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 2 });

      expect(res2.status).toBe(201);
      expect(res2.body.data.cart.items[0].quantity).toBe(3);
    });

    it('returns 404 when product does not exist', async () => {
      const { token } = await makeUser();

      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: 999999, quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Product not found/);
    });
  });

  describe('PATCH /api/cart/:productId', () => {
    it('updates quantity directly', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct();
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

      const res = await request(app)
        .patch(`/api/cart/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items[0].quantity).toBe(5);
    });

    it('removes item when quantity is set to 0', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct();
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

      const res = await request(app)
        .patch(`/api/cart/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(0);
    });
  });

  describe('DELETE /api/cart/:productId & DELETE /api/cart', () => {
    it('deletes a single product from cart', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct();
      await makeCartFor(user.id, [{ productId: product.id, quantity: 2 }]);

      const res = await request(app)
        .delete(`/api/cart/${product.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(0);
    });

    it('clears all items in the cart', async () => {
      const { user, token } = await makeUser();
      const p1 = await makeProduct();
      const p2 = await makeProduct();
      await makeCartFor(user.id, [
        { productId: p1.id, quantity: 1 },
        { productId: p2.id, quantity: 2 },
      ]);

      const res = await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items.length).toBe(0);
    });
  });
});
