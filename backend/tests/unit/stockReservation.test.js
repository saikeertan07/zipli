const {
  stockReservationService,
  RESERVATION_HOLD_MINUTES,
} = require('../../src/services/stockReservation.service');
const { pool } = require('../../src/config/db');
const { truncateUserData } = require('../setup');

describe('StockReservationService (10-Minute Hold & Expiry)', () => {
  let testUserId;
  let testProductId;

  beforeEach(async () => {
    await truncateUserData();

    // Create user
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Hold Customer', 'hold@example.com', 'hashed')
       RETURNING id`
    );
    testUserId = userRes.rows[0].id;

    // Fetch existing product from seed
    const prodRes = await pool.query('SELECT id, stock FROM products WHERE stock > 10 LIMIT 1');
    testProductId = prodRes.rows[0].id;
  });

  describe('reserveCheckoutStock', () => {
    it('creates a 10-minute active stock reservation with remaining seconds', async () => {
      const reservation = await stockReservationService.reserveCheckoutStock(testUserId, [
        { productId: testProductId, quantity: 2 },
      ]);

      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.holdMinutes).toBe(RESERVATION_HOLD_MINUTES);
      expect(reservation.remainingSeconds).toBeGreaterThanOrEqual(590);
      expect(reservation.items).toHaveLength(1);
      expect(reservation.items[0].productId).toBe(testProductId);
      expect(reservation.items[0].quantity).toBe(2);
    });

    it('rejects reservation if requested quantity exceeds available physical stock minus active holds', async () => {
      // Create user 2
      const u2 = await pool.query(
        `INSERT INTO users (name, email, password_hash) VALUES ('User 2', 'u2@example.com', 'h') RETURNING id`
      );
      const user2Id = u2.rows[0].id;

      // Check current physical stock
      const pRes = await pool.query('SELECT stock FROM products WHERE id = $1', [testProductId]);
      const currentStock = pRes.rows[0].stock;

      // User 1 reserves almost all stock
      await stockReservationService.reserveCheckoutStock(testUserId, [
        { productId: testProductId, quantity: currentStock - 1 },
      ]);

      // User 2 attempts to reserve 5 items (only 1 remaining available)
      await expect(
        stockReservationService.reserveCheckoutStock(user2Id, [
          { productId: testProductId, quantity: 5 },
        ])
      ).rejects.toThrow(/Insufficient stock/);
    });

    it('rejects empty reservation lists', async () => {
      await expect(stockReservationService.reserveCheckoutStock(testUserId, [])).rejects.toThrow(
        /Cannot reserve empty item list/
      );
    });

    it('rejects reservation with non-positive quantity or missing product id', async () => {
      await expect(
        stockReservationService.reserveCheckoutStock(testUserId, [
          { productId: testProductId, quantity: 0 },
        ])
      ).rejects.toThrow(/Invalid product or quantity/);
    });

    it('throws 404 when reserving a non-existent product', async () => {
      await expect(
        stockReservationService.reserveCheckoutStock(testUserId, [
          { productId: 999999, quantity: 1 },
        ])
      ).rejects.toThrow(/not found/);
    });
  });

  describe('getActiveReservation & releaseUserReservation', () => {
    it('retrieves active reservation and remaining countdown', async () => {
      await stockReservationService.reserveCheckoutStock(testUserId, [
        { productId: testProductId, quantity: 3 },
      ]);

      const active = await stockReservationService.getActiveReservation(testUserId);
      expect(active).not.toBeNull();
      expect(active.status).toBe('ACTIVE');
      expect(active.remainingSeconds).toBeGreaterThan(0);
      expect(active.items).toHaveLength(1);
      expect(active.items[0].quantity).toBe(3);
    });

    it('releases reservation and marks status as RELEASED', async () => {
      await stockReservationService.reserveCheckoutStock(testUserId, [
        { productId: testProductId, quantity: 3 },
      ]);

      const count = await stockReservationService.releaseUserReservation(testUserId);
      expect(count).toBe(1);

      const activeAfter = await stockReservationService.getActiveReservation(testUserId);
      expect(activeAfter).toBeNull();
    });
  });

  describe('commitReservation and releaseExpiredReservations', () => {
    it('commits active reservations upon order placement', async () => {
      await stockReservationService.reserveCheckoutStock(testUserId, [
        { productId: testProductId, quantity: 2 },
      ]);

      const client = await pool.connect();
      try {
        const committed = await stockReservationService.commitReservation(testUserId, client);
        expect(committed).toHaveLength(1);
        expect(committed[0].product_id).toBe(testProductId);
      } finally {
        client.release();
      }

      const activeAfter = await stockReservationService.getActiveReservation(testUserId);
      expect(activeAfter).toBeNull();
    });

    it('releases expired reservations', async () => {
      // Insert an expired reservation
      await pool.query(
        `INSERT INTO stock_reservations (user_id, product_id, quantity, status, reserved_at, expires_at)
         VALUES ($1, $2, 1, 'ACTIVE', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '5 minutes')`,
        [testUserId, testProductId]
      );

      const count = await stockReservationService.releaseExpiredReservations();
      expect(count).toBe(1);

      const check = await pool.query(`SELECT status FROM stock_reservations WHERE user_id = $1`, [
        testUserId,
      ]);
      expect(check.rows[0].status).toBe('EXPIRED');
    });
  });
});
