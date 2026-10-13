const { pool, getAppPool, withDbContext, setClientContext } = require('../../src/config/db');

describe('Database Row-Level Security (RLS) Isolation (F-013, SEC-AZ-05)', () => {
  let appPool;
  let testUserAId;
  let testUserBId;
  let orderAId;
  let orderBId;

  beforeAll(async () => {
    appPool = getAppPool();

    // Setup test users in users table
    const suffix = Date.now();
    const uA = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, 'hash123', 'customer') RETURNING id`,
      [`RLS Alice ${suffix}`, `alice_rls_${suffix}@example.com`]
    );
    testUserAId = uA.rows[0].id;

    const uB = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, 'hash123', 'customer') RETURNING id`,
      [`RLS Bob ${suffix}`, `bob_rls_${suffix}@example.com`]
    );
    testUserBId = uB.rows[0].id;

    // Insert orders for User A (Store 1) and User B (Store 2)
    const oA = await pool.query(
      `INSERT INTO orders (user_id, store_id, item_total, delivery_fee, grand_total, status)
       VALUES ($1, 1, 500, 0, 500, 'placed') RETURNING id`,
      [testUserAId]
    );
    orderAId = oA.rows[0].id;

    const oB = await pool.query(
      `INSERT INTO orders (user_id, store_id, item_total, delivery_fee, grand_total, status)
       VALUES ($1, 2, 800, 0, 800, 'placed') RETURNING id`,
      [testUserBId]
    );
    orderBId = oB.rows[0].id;

    // Insert cart items for User A
    const prodRes = await pool.query('SELECT id FROM products LIMIT 1');
    const prodId = prodRes.rows[0].id;

    await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, 2)
       ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = 2`,
      [testUserAId, prodId]
    );
  });

  afterAll(async () => {
    if (orderAId) await pool.query('DELETE FROM orders WHERE id = $1', [orderAId]);
    if (orderBId) await pool.query('DELETE FROM orders WHERE id = $1', [orderBId]);
    if (testUserAId) await pool.query('DELETE FROM cart_items WHERE user_id = $1', [testUserAId]);
    if (testUserAId) await pool.query('DELETE FROM users WHERE id = $1', [testUserAId]);
    if (testUserBId) await pool.query('DELETE FROM users WHERE id = $1', [testUserBId]);
    if (appPool) await appPool.end();
  });

  describe('User-Scoped RLS Policies (orders & cart_items)', () => {
    it('blocks User B from reading User A orders at the database layer', async () => {
      await withDbContext(
        { userId: testUserBId, isSystem: false, isAdmin: false },
        async (client) => {
          // Explicit query for Order A
          const res = await client.query('SELECT * FROM orders WHERE id = $1', [orderAId]);
          expect(res.rows).toHaveLength(0);

          // General query: only User B orders should be visible
          const allOrders = await client.query('SELECT id, user_id FROM orders');
          const visibleIds = allOrders.rows.map((r) => r.id);
          expect(visibleIds).not.toContain(orderAId);
        },
        { useAppRole: true }
      );
    });

    it('blocks User B from modifying or cancelling User A orders at the database layer', async () => {
      await withDbContext(
        { userId: testUserBId, isSystem: false, isAdmin: false },
        async (client) => {
          const updateRes = await client.query(
            "UPDATE orders SET status = 'cancelled' WHERE id = $1",
            [orderAId]
          );
          expect(updateRes.rowCount).toBe(0);

          const deleteRes = await client.query('DELETE FROM orders WHERE id = $1', [orderAId]);
          expect(deleteRes.rowCount).toBe(0);
        },
        { useAppRole: true }
      );

      // Verify Order A is still intact in the database
      const verify = await pool.query('SELECT status FROM orders WHERE id = $1', [orderAId]);
      expect(verify.rows[0].status).toBe('placed');
    });

    it('blocks cross-tenant INSERT spoofing at the DB layer via RLS CHECK constraint', async () => {
      await expect(
        withDbContext(
          { userId: testUserBId, isSystem: false, isAdmin: false },
          async (client) => {
            // User B attempts to forge an order under User A's identity
            await client.query(
              `INSERT INTO orders (user_id, store_id, item_total, delivery_fee, grand_total, status)
               VALUES ($1, 1, 100, 0, 100, 'placed')`,
              [testUserAId]
            );
          },
          { useAppRole: true }
        )
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('enforces cart_items isolation at the database layer', async () => {
      await withDbContext(
        { userId: testUserBId, isSystem: false, isAdmin: false },
        async (client) => {
          const cartRes = await client.query('SELECT * FROM cart_items WHERE user_id = $1', [
            testUserAId,
          ]);
          expect(cartRes.rows).toHaveLength(0);
        },
        { useAppRole: true }
      );
    });
  });

  describe('Store-Scoped RLS Policies (dark store multi-tenancy)', () => {
    it('isolates store orders between different dark stores', async () => {
      // Store 1 manager context
      await withDbContext(
        { storeId: 1, isSystem: false, isAdmin: false },
        async (client) => {
          const res = await client.query('SELECT id, store_id FROM orders WHERE id = $1', [
            orderBId,
          ]);
          expect(res.rows).toHaveLength(0);

          const storeOrders = await client.query('SELECT id, store_id FROM orders');
          const storeIds = storeOrders.rows.map((r) => r.store_id);
          storeIds.forEach((sid) => expect(sid).toBe(1));
        },
        { useAppRole: true }
      );

      // Store 2 manager context
      await withDbContext(
        { storeId: 2, isSystem: false, isAdmin: false },
        async (client) => {
          const res = await client.query('SELECT id, store_id FROM orders WHERE id = $1', [
            orderAId,
          ]);
          expect(res.rows).toHaveLength(0);
        },
        { useAppRole: true }
      );
    });
  });

  describe('Admin and System Bypass', () => {
    it('allows admin role to access all orders across tenants', async () => {
      await withDbContext(
        { isAdmin: true, isSystem: false },
        async (client) => {
          const resA = await client.query('SELECT id FROM orders WHERE id = $1', [orderAId]);
          const resB = await client.query('SELECT id FROM orders WHERE id = $1', [orderBId]);
          expect(resA.rows).toHaveLength(1);
          expect(resB.rows).toHaveLength(1);
        },
        { useAppRole: true }
      );
    });

    it('allows system background workers to access all records', async () => {
      await withDbContext(
        { isSystem: true, isAdmin: false },
        async (client) => {
          const res = await client.query('SELECT id FROM orders WHERE id IN ($1, $2)', [
            orderAId,
            orderBId,
          ]);
          expect(res.rows).toHaveLength(2);
        },
        { useAppRole: true }
      );
    });
  });

  describe('Session Context Cleanup and Pool Safety', () => {
    it('ensures session variables do not leak across pooled connections', async () => {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await setClientContext(client, { userId: testUserAId }, true);

        const inTx = await client.query("SELECT current_setting('app.current_user', true) as u");
        expect(inTx.rows[0].u).toBe(String(testUserAId));

        await client.query('COMMIT');

        const afterTx = await client.query("SELECT current_setting('app.current_user', true) as u");
        expect(afterTx.rows[0].u).toBe('');
      } finally {
        client.release();
      }
    });
  });
});
