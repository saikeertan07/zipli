const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');

describe('Idempotent Order Creation (Phase 3)', () => {
  it('returns cached response with Idempotent-Replay header when duplicate key is provided', async () => {
    const { user, token } = await makeUser();
    const product = await makeProduct({ price: 100, stock: 10 });
    await makeCartFor(user.id, [{ productId: product.id, quantity: 2 }]);

    const idempotencyKey = `idemp_key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. Initial request with Idempotency-Key
    const firstRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ deliveryAddress: 'Indiranagar 100ft Rd, Bengaluru' });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.status).toBe('success');
    expect(firstRes.headers['idempotent-replay']).toBeUndefined();
    const createdOrder = firstRes.body.data.order;
    expect(createdOrder.id).toBeDefined();

    // Verify stock decremented by 2 (10 -> 8)
    const { rows: prodAfterFirst } = await query('SELECT stock FROM products WHERE id = $1', [
      product.id,
    ]);
    expect(prodAfterFirst[0].stock).toBe(8);

    // 2. Second request with the identical Idempotency-Key
    const secondRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ deliveryAddress: 'Indiranagar 100ft Rd, Bengaluru' });

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['idempotent-replay']).toBe('true');
    expect(secondRes.body.data.order.id).toBe(createdOrder.id);
    expect(secondRes.body.data.order.grand_total).toBe(createdOrder.grand_total);

    // 3. Verify database invariants: only ONE order exists in total for this user
    const { rows: orderCount } = await query(
      'SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1',
      [user.id]
    );
    expect(orderCount[0].count).toBe(1);

    // 4. Verify stock was NOT decremented again (still 8)
    const { rows: prodAfterSecond } = await query('SELECT stock FROM products WHERE id = $1', [
      product.id,
    ]);
    expect(prodAfterSecond[0].stock).toBe(8);
  });

  it('safely collapses concurrent in-flight requests with identical Idempotency-Key into a single execution', async () => {
    const uniqueEmail = `concurrent_idemp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { user, token } = await makeUser({ email: uniqueEmail });
    const product = await makeProduct({ price: 200, stock: 20 });
    await makeCartFor(user.id, [{ productId: product.id, quantity: 1 }]);

    const concurrentKey = `concurrent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Fire 3 simultaneous checkout requests with the EXACT same Idempotency-Key
    const results = await Promise.all([
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', concurrentKey)
        .send({ deliveryAddress: 'MG Road, Bengaluru' }),
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', concurrentKey)
        .send({ deliveryAddress: 'MG Road, Bengaluru' }),
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', concurrentKey)
        .send({ deliveryAddress: 'MG Road, Bengaluru' }),
    ]);

    // All 3 return 201
    for (const r of results) {
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('success');
      expect(r.body.data.order).toBeDefined();
    }

    // Exactly 1 primary request and 2 replays
    const replayHeaders = results.map((r) => r.headers['idempotent-replay']);
    const replayCount = replayHeaders.filter((h) => h === 'true').length;
    expect(replayCount).toBe(2);

    // Invariant: exactly 1 order in DB
    const { rows: orders } = await query('SELECT id, grand_total FROM orders WHERE user_id = $1', [
      user.id,
    ]);
    expect(orders.length).toBe(1);

    // Invariant: stock decremented by exactly 1 (20 -> 19)
    const { rows: prod } = await query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(prod[0].stock).toBe(19);
  });
});
