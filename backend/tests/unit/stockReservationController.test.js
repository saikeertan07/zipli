const {
  reserveCheckout,
  getActiveReservation,
  releaseReservation,
} = require('../../src/controllers/stockReservation.controller');
const { stockReservationService } = require('../../src/services/stockReservation.service');
const { pool } = require('../../src/config/db');
const { truncateUserData } = require('../setup');

describe('Stock Reservation Controller unit tests', () => {
  let userId;
  let productId;

  beforeEach(async () => {
    await truncateUserData();
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Resv User', 'resv@example.com', 'hash')
       RETURNING id`
    );
    userId = uRes.rows[0].id;

    const pRes = await pool.query('SELECT id FROM products WHERE stock > 10 LIMIT 1');
    productId = pRes.rows[0].id;
  });

  it('reserveCheckout with items directly in request body', async () => {
    const req = {
      user: { id: userId },
      body: { items: [{ productId, quantity: 2 }] },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await reserveCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ holdMinutes: 10 }),
      })
    );
  });

  it('reserveCheckout rejects when cart is empty and items not provided', async () => {
    const req = {
      user: { id: userId },
      body: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await reserveCheckout(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cannot reserve stock for empty cart', statusCode: 400 })
    );
  });

  it('reserveCheckout pulls items automatically from existing cart items when body is empty', async () => {
    // Insert item into user's cart
    await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, 2)`,
      [userId, productId]
    );

    const req = {
      user: { id: userId },
      body: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await reserveCheckout(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          holdMinutes: 10,
          items: expect.arrayContaining([expect.objectContaining({ productId, quantity: 2 })]),
        }),
      })
    );
  });

  it('getActiveReservation returns null when no reservation is active', async () => {
    const req = { user: { id: userId } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await getActiveReservation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: null,
    });
  });

  it('getActiveReservation and releaseReservation', async () => {
    await stockReservationService.reserveCheckoutStock(userId, [{ productId, quantity: 1 }]);

    const req = { user: { id: userId } };
    const resGet = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await getActiveReservation(req, resGet);
    expect(resGet.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ status: 'ACTIVE' }),
      })
    );

    const resRel = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await releaseReservation(req, resRel);
    expect(resRel.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        message: expect.stringContaining('released'),
      })
    );
  });
});
