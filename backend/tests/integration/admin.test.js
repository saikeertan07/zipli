const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct } = require('../helpers/factories');

describe('Admin API & Role Access Control (Phase 3)', () => {
  let customerUser;
  let adminUser;

  beforeEach(async () => {
    customerUser = await makeUser({ role: 'customer' });
    adminUser = await makeUser({ role: 'admin' });
  });

  describe('RBAC Middleware', () => {
    it('returns 403 Forbidden when a customer attempts to access admin endpoints', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${customerUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Forbidden');
    });

    it('returns 401 Unauthorized when request has no token', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
    });

    it('allows access when user has admin role', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.stats).toBeDefined();
    });
  });

  describe('Product Management (Admin)', () => {
    it('creates a new product with stock and reorder levels', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          name: 'Organic Avocados',
          qty_label: '2 pcs',
          price: 180,
          mrp: 200,
          category_id: 'dairy',
          emoji: '🥑',
          stock: 45,
          reorder_level: 15,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.product.name).toBe('Organic Avocados');
      expect(res.body.data.product.stock).toBe(45);
    });

    it('updates product fields and soft deletes (deactivates)', async () => {
      const product = await makeProduct({ name: 'Fresh Apples', price: 100, stock: 20 });

      // Update price
      const updateRes = await request(app)
        .patch(`/api/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ price: 120 });

      expect(updateRes.status).toBe(200);
      expect(Number(updateRes.body.data.product.price)).toBe(120);

      // Soft delete
      const delRes = await request(app)
        .delete(`/api/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.product.is_active).toBe(false);
    });

    it('handles 404 and 400 errors on product update and delete', async () => {
      // 404 on update non-existent
      const res1 = await request(app)
        .patch('/api/admin/products/999999')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ price: 100 });
      expect(res1.status).toBe(404);

      // 400 when no valid update fields provided
      const product = await makeProduct();
      const res2 = await request(app)
        .patch(`/api/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ invalidField: 'test' });
      expect(res2.status).toBe(400);

      // 404 on delete non-existent
      const res3 = await request(app)
        .delete('/api/admin/products/999999')
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(res3.status).toBe(404);
    });

    it('adjusts inventory stock and logs audit movement', async () => {
      const product = await makeProduct({ stock: 20 });

      const res = await request(app)
        .post('/api/admin/inventory/adjust')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          productId: product.id,
          delta: 15,
          reason: 'restock_supplier_batch',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.newStock).toBe(35);
      expect(res.body.data.previousStock).toBe(20);

      // Verify movement logged
      const { rows } = await query(
        `SELECT delta, reason FROM inventory_movements WHERE product_id = $1 AND reason = $2`,
        [product.id, 'restock_supplier_batch']
      );
      expect(rows.length).toBe(1);
      expect(rows[0].delta).toBe(15);
    });

    it('handles adjustStock errors (404 not found, cannot adjust below 0)', async () => {
      // 404
      const res1 = await request(app)
        .post('/api/admin/inventory/adjust')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ productId: 999999, delta: 5 });
      expect(res1.status).toBe(404);

      // Below 0
      const prod = await makeProduct({ stock: 5 });
      const res2 = await request(app)
        .post('/api/admin/inventory/adjust')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ productId: prod.id, delta: -10 });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toContain('Cannot adjust stock below 0');
    });
  });

  describe('Orders Listing & State Transitions (Admin)', () => {
    it('lists orders with filters and pagination', async () => {
      // Create test order
      await query(
        `INSERT INTO orders (user_id, item_total, delivery_fee, grand_total, status, delivery_address)
         VALUES ($1, 200, 2, 202, 'placed', 'Listing St')`,
        [customerUser.user.id]
      );

      // 1. Unfiltered list
      const resAll = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(resAll.status).toBe(200);
      expect(resAll.body.data.orders.length).toBeGreaterThan(0);

      // 2. Filter by status
      const resStatus = await request(app)
        .get('/api/admin/orders?status=placed')
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(resStatus.status).toBe(200);

      // 3. Filter by userId
      const resUser = await request(app)
        .get(`/api/admin/orders?userId=${customerUser.user.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(resUser.status).toBe(200);
    });

    it('advances order lifecycle and logs state history', async () => {
      const prod = await makeProduct({ stock: 10 });
      const { rows: orderRows } = await query(
        `INSERT INTO orders (user_id, item_total, delivery_fee, grand_total, status, delivery_address)
         VALUES ($1, 100, 2, 102, 'placed', '123 Main St')
         RETURNING id, status`,
        [customerUser.user.id]
      );
      const orderId = orderRows[0].id;

      // 1. Transition placed -> confirmed
      const res1 = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'confirmed', note: 'Order accepted by store' });

      expect(res1.status).toBe(200);
      expect(res1.body.data.newStatus).toBe('confirmed');

      // 2. Transition confirmed -> packed
      const res2 = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'packed' });

      expect(res2.status).toBe(200);
      expect(res2.body.data.newStatus).toBe('packed');

      // 3. Transition packed -> out_for_delivery
      const res3 = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'out_for_delivery' });

      expect(res3.status).toBe(200);
      expect(res3.body.data.newStatus).toBe('out_for_delivery');

      // 4. Transition out_for_delivery -> delivered
      const res4 = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'delivered' });

      expect(res4.status).toBe(200);
      expect(res4.body.data.newStatus).toBe('delivered');

      // 5. Invalid transition: delivered is terminal -> cannot transition to cancelled
      const invalidRes = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'cancelled' });

      expect(invalidRes.status).toBe(409);
      expect(invalidRes.body.status).toBe('error');

      // Verify audit logs in order_status_history
      const { rows: history } = await query(
        `SELECT from_status, to_status, note FROM order_status_history WHERE order_id = $1 ORDER BY id ASC`,
        [orderId]
      );
      expect(history.length).toBe(4);
      expect(history[0]).toEqual({
        from_status: 'placed',
        to_status: 'confirmed',
        note: 'Order accepted by store',
      });
      expect(history[3].to_status).toBe('delivered');
    });

    it('cancels order from admin and restores item stock', async () => {
      const prod = await makeProduct({ stock: 15 });
      const { rows: orderRows } = await query(
        `INSERT INTO orders (user_id, item_total, delivery_fee, grand_total, status, delivery_address)
         VALUES ($1, 100, 2, 102, 'placed', '123 Main St')
         RETURNING id, status`,
        [customerUser.user.id]
      );
      const orderId = orderRows[0].id;

      // Add order item
      await query(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
         VALUES ($1, $2, $3, $4, 3)`,
        [orderId, prod.id, prod.name, prod.price]
      );

      // Admin cancels order
      const cancelRes = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'cancelled', note: 'Customer called store to cancel' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.newStatus).toBe('cancelled');

      // Verify stock was restored by 3 (15 -> 18)
      const { rows: updatedProd } = await query(`SELECT stock FROM products WHERE id = $1`, [
        prod.id,
      ]);
      expect(updatedProd[0].stock).toBe(18);

      // 404 on non-existent order
      const notFoundRes = await request(app)
        .patch('/api/admin/orders/999999/status')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'confirmed' });
      expect(notFoundRes.status).toBe(404);
    });
  });
});
