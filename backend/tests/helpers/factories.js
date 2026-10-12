const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../../src/config/db');
const { env } = require('../../src/config/env');

/**
 * Creates and persists a user in the test database.
 * Generates an active JWT token and returns raw password for login testing.
 */
async function makeUser(overrides = {}) {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const name = overrides.name || 'Test User';
  const email = (overrides.email || `user_${uniqueSuffix}@example.com`).toLowerCase();
  const rawPassword = overrides.password || 'SecureP@ss123';
  const phone = overrides.phone || '+919876543210';
  const address = overrides.address || '42 Innovation Way, Tech Park';
  const role = overrides.role || 'customer';

  const passwordHash = await bcrypt.hash(rawPassword, env.BCRYPT_ROUNDS || 4);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, role, phone, address, created_at`,
    [name, email, passwordHash, role, phone, address]
  );

  const user = rows[0];
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || '1d',
  });

  return {
    user,
    rawPassword,
    token,
  };
}

/**
 * Creates and persists a product in the test database.
 */
async function makeProduct(overrides = {}) {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const categoryId = overrides.category_id || overrides.cat || 'dairy';

  // Ensure category exists
  await query(
    `INSERT INTO categories (id, name, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [categoryId, 'Dairy & Eggs', '🥛']
  );

  const name = overrides.name || `Farm Fresh Item ${uniqueSuffix}`;
  const qtyLabel = overrides.qty_label || overrides.qty || '1 unit';
  const price = overrides.price !== undefined ? overrides.price : 50.0;
  const mrp = overrides.mrp !== undefined ? overrides.mrp : 60.0;
  const emoji = overrides.emoji || '🥑';
  const badge = overrides.badge || null;
  const stock = overrides.stock !== undefined ? overrides.stock : 50;
  const reorderLevel = overrides.reorder_level !== undefined ? overrides.reorder_level : 10;
  const isActive = overrides.is_active !== undefined ? overrides.is_active : true;
  const imageUrl = overrides.image_url || overrides.img || '/images/placeholder.jpg';

  const { rows } = await query(
    `INSERT INTO products (name, qty_label, price, mrp, emoji, category_id, badge, image_url, stock, reorder_level, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, qty_label AS qty, price, mrp, emoji, category_id AS cat, badge, image_url AS img, stock, reorder_level, is_active, created_at`,
    [name, qtyLabel, price, mrp, emoji, categoryId, badge, imageUrl, stock, reorderLevel, isActive]
  );

  return rows[0];
}

/**
 * Creates cart items for a given user in the test database.
 * @param {number} userId
 * @param {Array<{productId?: number, quantity?: number}>} items
 */
async function makeCartFor(userId, items = []) {
  const insertedItems = [];

  for (const item of items) {
    let productId = item.productId || item.product_id;
    if (!productId) {
      const prod = await makeProduct();
      productId = prod.id;
    }
    const quantity = item.quantity || 1;

    const { rows } = await query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING id, user_id, product_id, quantity, created_at, updated_at`,
      [userId, productId, quantity]
    );
    insertedItems.push(rows[0]);
  }

  return insertedItems;
}

/**
 * Creates and persists an order with order_items for a given user.
 * @param {number} userId
 * @param {Array<{product?: any, productId?: number, quantity?: number, unitPrice?: number, name?: string}>} items
 * @param {Object} orderOverrides
 */
async function makeOrderFor(userId, items = [], orderOverrides = {}) {
  const preparedItems = [];

  if (!items.length) {
    const prod = await makeProduct();
    preparedItems.push({
      productId: prod.id,
      name: prod.name,
      unitPrice: Number(prod.price),
      quantity: 1,
    });
  } else {
    for (const item of items) {
      let productId = item.productId || item.product_id;
      let name = item.name;
      let unitPrice = item.unitPrice || item.price;

      if (!productId) {
        const prod = await makeProduct();
        productId = prod.id;
        name = name || prod.name;
        unitPrice = unitPrice !== undefined ? unitPrice : Number(prod.price);
      }
      preparedItems.push({
        productId,
        name: name || `Product ${productId}`,
        unitPrice: Number(unitPrice || 50),
        quantity: item.quantity || 1,
      });
    }
  }

  const itemTotal = preparedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const deliveryFee = orderOverrides.delivery_fee !== undefined ? orderOverrides.delivery_fee : 2;
  const grandTotal = itemTotal + deliveryFee;
  const status = orderOverrides.status || 'placed';
  const deliveryAddress = orderOverrides.delivery_address || 'Test Delivery Address';

  const { rows: orderRows } = await query(
    `INSERT INTO orders (user_id, item_total, delivery_fee, grand_total, status, delivery_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, item_total, delivery_fee, grand_total, status, delivery_address, created_at`,
    [userId, itemTotal, deliveryFee, grandTotal, status, deliveryAddress]
  );
  const order = orderRows[0];

  const orderItems = [];
  for (const item of preparedItems) {
    const { rows: itemRows } = await query(
      `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, order_id, product_id, name, unit_price, quantity`,
      [order.id, item.productId, item.name, item.unitPrice, item.quantity]
    );
    orderItems.push(itemRows[0]);
  }

  return {
    order,
    items: orderItems,
  };
}

/**
 * Creates and persists a coupon in the test database.
 */
async function makeCoupon(overrides = {}) {
  const code =
    overrides.code || `PROMO_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const type = overrides.type || 'flat';
  const value = overrides.value !== undefined ? overrides.value : 50;
  const minTotal = overrides.min_total !== undefined ? overrides.min_total : 0;
  const maxDiscount = overrides.max_discount !== undefined ? overrides.max_discount : null;
  const usageLimit = overrides.usage_limit !== undefined ? overrides.usage_limit : null;
  const perUserLimit = overrides.per_user_limit !== undefined ? overrides.per_user_limit : 1;
  const isActive = overrides.is_active !== undefined ? overrides.is_active : true;

  const { rows } = await query(
    `INSERT INTO coupons (code, type, value, min_total, max_discount, usage_limit, per_user_limit, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [code, type, value, minTotal, maxDiscount, usageLimit, perUserLimit, isActive]
  );
  return rows[0];
}

/**
 * Creates and persists a driver in the test database.
 */
async function makeDriver(overrides = {}) {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const name = overrides.name || `Driver ${uniqueSuffix}`;
  const phone = overrides.phone || `+9199${Math.floor(10000000 + Math.random() * 90000000)}`;
  const lat = overrides.lat || overrides.current_lat || 12.93524;
  const lng = overrides.lng || overrides.current_lng || 77.62448;
  const status = overrides.status || 'IDLE';
  const rating = overrides.rating || 4.85;

  const { rows } = await query(
    `INSERT INTO drivers (name, phone, current_lat, current_lng, status, rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, phone, lat, lng, status, rating]
  );
  return rows[0];
}

module.exports = {
  makeUser,
  makeProduct,
  makeCartFor,
  makeOrderFor,
  makeCoupon,
  makeDriver,
};
