const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');

describe('Coupons, Pricing & Order Cancellation (Phase 3)', () => {
  let user;
  let token;

  beforeEach(async () => {
    const u = await makeUser();
    user = u.user;
    token = u.token;

    // Seed test coupons
    await query(
      `INSERT INTO coupons (code, type, value, min_total, max_discount, per_user_limit, is_active)
       VALUES 
         ('SAVE20', 'percentage', 20.00, 100.00, 40.00, 1, true),
         ('FLAT50', 'flat', 50.00, 150.00, NULL, 1, true)
       ON CONFLICT (code) DO NOTHING`
    );
  });

  describe('Cart Coupon Application', () => {
    it('applies a percentage coupon with cap and calculates totals correctly', async () => {
      const product = await makeProduct({ price: 150, stock: 10 });
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

      const res = await request(app)
        .post('/api/cart/coupon')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'SAVE20' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.coupon).toBe('SAVE20');
      // 20% of 150 = 30
      expect(res.body.data.discountAmount).toBe(30);

      const cart = res.body.data.cart;
      expect(cart.itemTotal).toBe(150);
      expect(cart.discountAmount).toBe(30);
      // Taxes on (150 - 30) = 120 * 0.05 = 6
      expect(cart.taxes).toBe(6);
      expect(cart.deliveryFee).toBe(2);
      expect(cart.grandTotal).toBe(128);
    });

    it('rejects coupon when cart total does not meet min_total', async () => {
      const product = await makeProduct({ price: 80, stock: 10 });
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

      const res = await request(app)
        .post('/api/cart/coupon')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'SAVE20' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('at least ₹100');
    });
  });

  describe('Checkout with Coupon & Redemption Recording', () => {
    it('applies coupon on checkout, records redemption, and enforces per-user limit', async () => {
      const product = await makeProduct({ price: 200, stock: 20 });
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

      // First order with SAVE20
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deliveryAddress: '42 MG Road, Bengaluru',
          couponCode: 'SAVE20',
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data.order;
      expect(order.coupon_code).toBe('SAVE20');
      // 20% of 200 = 40 (capped at 40)
      expect(Number(order.discount_amount)).toBe(40);

      // Verify redemption record exists
      const { rows: redemptions } = await query(
        `SELECT * FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2`,
        ['SAVE20', user.id]
      );
      expect(redemptions.length).toBe(1);
      expect(Number(redemptions[0].discount_amount)).toBe(40);

      // Attempt second checkout with same user and same per-user limited coupon
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);
      const secondOrderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deliveryAddress: '42 MG Road, Bengaluru',
          couponCode: 'SAVE20',
        });

      expect(secondOrderRes.status).toBe(400);
      expect(secondOrderRes.body.message).toContain('maximum allowed times');
    });
  });

  describe('Order Cancellation & Stock Restoration', () => {
    it('cancels order in placed state, restores inventory stock, and denies re-cancellation', async () => {
      const initialStock = 20;
      const product = await makeProduct({ price: 100, stock: initialStock });

      await makeCartFor(user.id, [{ productId: product.id, quantity: 3 }]);

      // 1. Create order (stock decremented to 17)
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ deliveryAddress: 'Indiranagar, Bengaluru' });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;

      // Verify stock was reduced
      const { rows: postOrderProd } = await query(`SELECT stock FROM products WHERE id = $1`, [
        product.id,
      ]);
      expect(postOrderProd[0].stock).toBe(17);

      // 2. Cancel order
      const cancelRes = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('success');
      expect(cancelRes.body.data.status).toBe('cancelled');

      // 3. Verify stock was restored to 20
      const { rows: restoredProd } = await query(`SELECT stock FROM products WHERE id = $1`, [
        product.id,
      ]);
      expect(restoredProd[0].stock).toBe(20);

      // 4. Verify cancellation movement was logged
      const { rows: movements } = await query(
        `SELECT delta, reason, ref_order_id FROM inventory_movements WHERE product_id = $1 AND reason = 'cancellation_restock'`,
        [product.id]
      );
      expect(movements.length).toBe(1);
      expect(movements[0].delta).toBe(3);
      expect(movements[0].ref_order_id).toBe(orderId);

      // 5. Attempt to cancel again -> illegal transition from cancelled to cancelled
      const reCancelRes = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(reCancelRes.status).toBe(409);
      expect(reCancelRes.body.status).toBe('error');
    });
  });
});
