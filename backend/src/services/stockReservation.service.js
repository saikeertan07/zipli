const { pool, query } = require('../config/db');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const RESERVATION_HOLD_MINUTES = 10;

class StockReservationService {
  /**
   * Reserves stock for items during checkout hold.
   * Ensures available physical inventory minus currently ACTIVE holds covers the requested quantities.
   *
   * @param {number} userId
   * @param {Array<{ productId: number, quantity: number }>} items
   * @param {Object} [dbClient]
   * @returns {Promise<Object>}
   */
  async reserveCheckoutStock(userId, items, dbClient = null) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Cannot reserve empty item list', 400);
    }

    const client = dbClient || (await pool.connect());
    const isExternalClient = Boolean(dbClient);

    try {
      if (!isExternalClient) {
        await client.query('BEGIN');
      }

      // 1. First expire any overdue reservations to free up hold allocations
      await this.releaseExpiredReservations(client);

      // 2. Release any previous active reservation for this specific user
      await client.query(
        `UPDATE stock_reservations
         SET status = 'RELEASED'
         WHERE user_id = $1 AND status = 'ACTIVE'`,
        [userId]
      );

      // 3. For each item, lock product and verify physical stock >= requested + other active holds
      const reservedItems = [];
      for (const item of items) {
        const prodId = Number(item.productId || item.product_id);
        const qty = Number(item.quantity);

        if (!prodId || qty <= 0) {
          throw new AppError('Invalid product or quantity in reservation request', 400);
        }

        // Lock product row
        const prodRes = await client.query(
          `SELECT id, name, stock, price FROM products WHERE id = $1 FOR UPDATE`,
          [prodId]
        );

        if (prodRes.rows.length === 0) {
          throw new AppError(`Product with ID ${prodId} not found`, 404);
        }
        const product = prodRes.rows[0];

        // Sum active reservations from OTHER users
        const activeRes = await client.query(
          `SELECT COALESCE(SUM(quantity), 0) AS reserved_qty
           FROM stock_reservations
           WHERE product_id = $1 AND status = 'ACTIVE' AND expires_at > NOW()`,
          [prodId]
        );
        const activeHeld = Number(activeRes.rows[0].reserved_qty || 0);
        const availableStock = product.stock - activeHeld;

        if (availableStock < qty) {
          throw new AppError(
            `Insufficient stock for "${product.name}". Available for checkout: ${Math.max(0, availableStock)}, requested: ${qty}`,
            400
          );
        }

        // Insert new active reservation with 10-minute hold
        const insertRes = await client.query(
          `INSERT INTO stock_reservations
             (user_id, product_id, quantity, status, reserved_at, expires_at)
           VALUES
             ($1, $2, $3, 'ACTIVE', NOW(), NOW() + ($4 || ' minutes')::interval)
           RETURNING id, product_id, quantity, status, reserved_at, expires_at`,
          [userId, prodId, qty, RESERVATION_HOLD_MINUTES]
        );

        const row = insertRes.rows[0];
        reservedItems.push({
          id: row.id,
          productId: row.product_id,
          productName: product.name,
          quantity: row.quantity,
          price: product.price,
          expiresAt: row.expires_at,
        });
      }

      if (!isExternalClient) {
        await client.query('COMMIT');
      }

      const expiresAt = reservedItems[0].expiresAt;
      const remainingSeconds = Math.max(
        0,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );

      return {
        userId,
        status: 'ACTIVE',
        holdMinutes: RESERVATION_HOLD_MINUTES,
        expiresAt,
        remainingSeconds,
        items: reservedItems,
      };
    } catch (err) {
      if (!isExternalClient) {
        await client.query('ROLLBACK').catch(() => {});
      }
      throw err;
    } finally {
      if (!isExternalClient) {
        client.release();
      }
    }
  }

  /**
   * Retrieves active reservation and remaining hold countdown for user.
   * @param {number} userId
   * @param {Object} [dbClient]
   * @returns {Promise<Object|null>}
   */
  async getActiveReservation(userId, dbClient = null) {
    const runner = dbClient ? dbClient.query.bind(dbClient) : query;

    const res = await runner(
      `SELECT r.id, r.product_id, r.quantity, r.status, r.reserved_at, r.expires_at,
              p.name AS product_name, p.price,
              ROUND(EXTRACT(EPOCH FROM (r.expires_at - NOW()))) AS remaining_seconds
       FROM stock_reservations r
       JOIN products p ON r.product_id = p.id
       WHERE r.user_id = $1 AND r.status = 'ACTIVE' AND r.expires_at > NOW()
       ORDER BY r.id ASC`,
      [userId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const remainingSeconds = Math.max(0, Number(res.rows[0].remaining_seconds || 0));
    const expiresAt = res.rows[0].expires_at;

    return {
      userId,
      status: 'ACTIVE',
      expiresAt,
      remainingSeconds,
      items: res.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity,
        price: row.price,
      })),
    };
  }

  /**
   * Releases any active reservations for a user.
   * @param {number} userId
   * @param {Object} [dbClient]
   * @returns {Promise<number>} Number of released reservations.
   */
  async releaseUserReservation(userId, dbClient = null) {
    const runner = dbClient ? dbClient.query.bind(dbClient) : query;
    const res = await runner(
      `UPDATE stock_reservations
       SET status = 'RELEASED'
       WHERE user_id = $1 AND status = 'ACTIVE'
       RETURNING id`,
      [userId]
    );
    return res.rowCount;
  }

  /**
   * Commits active reservations for user when order is placed.
   * @param {number} userId
   * @param {Object} dbClient
   * @returns {Promise<Array>}
   */
  async commitReservation(userId, dbClient) {
    const runner = dbClient ? dbClient.query.bind(dbClient) : query;
    const res = await runner(
      `UPDATE stock_reservations
       SET status = 'COMMITTED'
       WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > NOW()
       RETURNING id, product_id, quantity`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Background task: Transitions expired ACTIVE reservations to EXPIRED.
   * @param {Object} [dbClient]
   * @returns {Promise<number>}
   */
  async releaseExpiredReservations(dbClient = null) {
    const runner = dbClient ? dbClient.query.bind(dbClient) : query;
    const res = await runner(
      `UPDATE stock_reservations
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND expires_at <= NOW()
       RETURNING id`
    );
    if (res.rowCount > 0) {
      logger.info('Released expired stock reservations', { count: res.rowCount });
    }
    return res.rowCount;
  }
}

const stockReservationService = new StockReservationService();

module.exports = {
  StockReservationService,
  stockReservationService,
  RESERVATION_HOLD_MINUTES,
};
