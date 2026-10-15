const assert = require('node:assert/strict');
const { createOrder } = require('../../src/controllers/order.controller');
const { pool } = require('../../src/config/db');

describe('Checkout Transactional Atomicity (createOrder)', () => {
  it('executes cart read, order insert, items insert, and cart clear inside a single BEGIN/COMMIT transaction', async () => {
    const executedQueries = [];
    let released = false;

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });

        if (sql.includes('FROM cart_items') && sql.startsWith('SELECT')) {
          // Return simulated cart items with product_id and quantity
          return {
            rows: [
              {
                product_id: 1,
                quantity: 2,
              },
            ],
          };
        }

        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: 1,
                name: 'Fresh Milk',
                qty: '1 L',
                price: '60.00',
                mrp: '65.00',
                emoji: '🥛',
                cat: 'dairy',
                badge: 'Fresh',
                img: '/images/placeholder.jpg',
                stock: 10,
                is_active: true,
              },
            ],
          };
        }

        if (sql.includes('INSERT INTO orders')) {
          return {
            rows: [
              {
                id: 101,
                item_total: 120,
                delivery_fee: 2,
                taxes: 6,
                discount_amount: 0,
                grand_total: 128,
                status: 'placed',
                delivery_address: '123 Test St',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }

        return { rows: [] };
      },
      release: () => {
        released = true;
      },
    };

    const originalConnect = pool.connect;
    pool.connect = async () => mockClient;

    const req = {
      user: { id: 42, address: '123 Test St' },
      body: { deliveryAddress: '123 Test St' },
    };

    let responseStatus = null;
    let responseData = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    try {
      await createOrder(req, res, () => {});

      const sqlList = executedQueries.map((q) => q.sql);
      assert.equal(responseStatus, 201);
      assert.equal(responseData.status, 'success');
      assert.equal(responseData.data.order.id, 101);
      assert.equal(responseData.data.order.grand_total, 128);

      // Verify transaction sequence
      assert.equal(sqlList[0], 'BEGIN');
      assert.ok(sqlList.some((s) => s.includes('FROM cart_items')));
      assert.ok(sqlList.some((s) => s.includes('FOR UPDATE')));
      assert.ok(sqlList.some((s) => s.includes('INSERT INTO orders')));
      assert.ok(sqlList.some((s) => s.includes('INSERT INTO order_items')));
      assert.ok(sqlList.some((s) => s.includes('DELETE FROM cart_items')));
      assert.equal(sqlList[sqlList.length - 1], 'COMMIT');
      assert.ok(released, 'Connection must be released');
    } finally {
      pool.connect = originalConnect;
    }
  });

  it('rolls back transaction on error and releases connection', async () => {
    const executedQueries = [];
    let released = false;

    const mockClient = {
      query: async (sql) => {
        executedQueries.push(sql.trim());
        if (sql.includes('FROM cart_items') && sql.startsWith('SELECT')) {
          throw new Error('Database disk error during cart checkout');
        }
        return { rows: [] };
      },
      release: () => {
        released = true;
      },
    };

    const originalConnect = pool.connect;
    pool.connect = async () => mockClient;

    const req = {
      user: { id: 42 },
      body: {},
    };

    let errorPassed = null;
    const next = (err) => {
      errorPassed = err;
    };

    try {
      await createOrder(req, {}, next);

      assert.ok(errorPassed, 'Error must be passed to next()');
      assert.equal(errorPassed.message, 'Database disk error during cart checkout');
      assert.ok(executedQueries.includes('BEGIN'));
      assert.ok(executedQueries.includes('ROLLBACK'));
      assert.ok(!executedQueries.includes('COMMIT'));
      assert.ok(released, 'Connection must be released on failure');
    } finally {
      pool.connect = originalConnect;
    }
  });
});
