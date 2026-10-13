const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');

describe('Concurrency & Oversell Protection (Phase 3.3)', () => {
  it('prevents overselling when 20 parallel checkouts contend for stock = 5', async () => {
    // 1. Create a scarce product with initial stock = 5
    const product = await makeProduct({
      name: 'Limited Edition Mango Basket',
      price: 150,
      stock: 5,
    });

    // 2. Create 20 distinct users and add 1 quantity of the scarce product to each cart
    const userCount = 20;
    const users = [];

    for (let i = 0; i < userCount; i++) {
      const { user, token } = await makeUser();
      await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);
      users.push({ user, token });
    }

    // 3. Fire all 20 checkout requests concurrently with distinct delivery addresses
    const startMs = Date.now();
    const responses = await Promise.all(
      users.map((u, i) =>
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${u.token}`)
          .send({ deliveryAddress: `100 Race Condition Ave, Flat ${i + 1}, Bengaluru` })
      )
    );
    const durationMs = Date.now() - startMs;

    // 4. Categorize responses
    const successful = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);
    const otherErrors = responses.filter((r) => r.status !== 201 && r.status !== 409);

    // No 500 errors, no deadlocks
    expect(otherErrors.map((r) => ({ status: r.status, body: r.body }))).toEqual([]);

    // Exactly 5 should succeed
    expect(successful.length).toBe(5);

    // Exactly 15 should be rejected with 409 INSUFFICIENT_STOCK
    expect(rejected.length).toBe(15);
    for (const r of rejected) {
      expect(r.body.code).toBe('INSUFFICIENT_STOCK');
      expect(r.body.status).toBe('error');
    }

    // 5. Verify final database stock is strictly 0 (never negative)
    const { rows: prodRows } = await query('SELECT stock FROM products WHERE id = $1', [
      product.id,
    ]);
    expect(prodRows[0].stock).toBe(0);

    // 6. Verify exactly 5 sale movements were logged in inventory_movements
    const { rows: movements } = await query(
      `SELECT delta, reason, ref_order_id FROM inventory_movements WHERE product_id = $1 ORDER BY id ASC`,
      [product.id]
    );
    expect(movements.length).toBe(5);
    for (const m of movements) {
      expect(m.delta).toBe(-1);
      expect(m.ref_order_id).toBeDefined();
      expect(m.reason).toBe('purchase');
    }

    // 7. Verify exactly 5 order items exist in total
    const { rows: orderItems } = await query(
      `SELECT COUNT(*)::int AS count FROM order_items WHERE product_id = $1`,
      [product.id]
    );
    expect(orderItems[0].count).toBe(5);
  }, 20000);
});
