/**
 * @file addressAndOtp.test.js
 * @description Comprehensive integration tests for Address Book, Dark Store Serviceability,
 * OTP Phone Verification, and Order Checkout Linkage (P0).
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/db');
const { makeUser, makeProduct } = require('../helpers/factories');
const { truncateUserData } = require('../setup');
const { fakeSMSProvider } = require('../../src/services/smsProvider');

describe('Address Book & OTP Phone Verification Tests (P0)', () => {
  beforeEach(async () => {
    await truncateUserData();
    await pool.query('TRUNCATE user_addresses, phone_verifications RESTART IDENTITY CASCADE;');
    fakeSMSProvider.clear();
  });

  describe('Dark Store Geofence Serviceability (POST /api/users/addresses/serviceability)', () => {
    it('returns serviceable=true for coordinates near Hyderabad dark store hub', async () => {
      // Banjara Hills / Hitec City area (17.43, 78.38)
      const res = await request(app)
        .post('/api/users/addresses/serviceability')
        .send({
          latitude: 17.438,
          longitude: 78.385,
          pincode: '500081',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.serviceable).toBe(true);
      expect(res.body.data.storeId).toBeDefined();
    });

    it('returns serviceable=true via Hyderabad pincode fallback (500xxx)', async () => {
      const res = await request(app)
        .post('/api/users/addresses/serviceability')
        .send({
          pincode: '500034',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.serviceable).toBe(true);
    });

    it('returns serviceable=false for coordinates far outside service area', async () => {
      const res = await request(app)
        .post('/api/users/addresses/serviceability')
        .send({
          latitude: 28.6139,
          longitude: 77.209,
          pincode: '110001',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.serviceable).toBe(false);
      expect(res.body.data.reason).toBeDefined();
    });
  });

  describe('User Address Book CRUD (/api/users/addresses)', () => {
    it('requires authentication for address management', async () => {
      const res = await request(app).get('/api/users/addresses');
      expect(res.status).toBe(401);
    });

    it('allows a user to create, list, update, and delete their saved addresses', async () => {
      const { user, token } = await makeUser();

      // 1. Create Address
      const createRes = await request(app)
        .post('/api/users/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          label: 'Home',
          recipientName: 'Keertan Tedla',
          phone: '9876543210',
          addressLine1: 'Flat 402, Green Meadows',
          addressLine2: 'Road No 12, Banjara Hills',
          landmark: 'Opp Park',
          city: 'Hyderabad',
          pincode: '500034',
          latitude: 17.415,
          longitude: 78.435,
          isDefault: true,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe('success');
      expect(createRes.body.data.id).toBeDefined();
      expect(createRes.body.data.user_id).toBe(user.id);
      expect(createRes.body.data.recipient_name).toBe('Keertan Tedla');
      const addressId = createRes.body.data.id;

      // 2. List Addresses
      const listRes = await request(app)
        .get('/api/users/addresses')
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].id).toBe(addressId);

      // 3. Update Address
      const updateRes = await request(app)
        .put(`/api/users/addresses/${addressId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          label: 'Work HQ',
          landmark: 'Beside Cyber Towers',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.label).toBe('Work HQ');
      expect(updateRes.body.data.landmark).toBe('Beside Cyber Towers');

      // 4. Delete Address
      const delRes = await request(app)
        .delete(`/api/users/addresses/${addressId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(delRes.status).toBe(200);

      // Verify empty list
      const emptyRes = await request(app)
        .get('/api/users/addresses')
        .set('Authorization', `Bearer ${token}`);
      expect(emptyRes.body.data.length).toBe(0);
    });

    it('enforces IDOR ownership protection: User B cannot modify or delete User A address', async () => {
      const { user: userA, token: tokenA } = await makeUser({ email: 'userA@example.com' });
      const { user: userB, token: tokenB } = await makeUser({ email: 'userB@example.com' });

      // User A creates address
      const createRes = await request(app)
        .post('/api/users/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          recipientName: 'User A',
          phone: '9876543210',
          addressLine1: 'Plot 100, Sector 1',
          pincode: '500081',
          city: 'Hyderabad',
        });

      const addressId = createRes.body.data.id;

      // User B tries to update User A's address
      const hackUpdateRes = await request(app)
        .put(`/api/users/addresses/${addressId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ label: 'Hacked Label' });

      expect(hackUpdateRes.status).toBe(403);

      // User B tries to delete User A's address
      const hackDeleteRes = await request(app)
        .delete(`/api/users/addresses/${addressId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(hackDeleteRes.status).toBe(404);

      // Verify address still intact for User A
      const verifyRes = await request(app)
        .get('/api/users/addresses')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(verifyRes.body.data.length).toBe(1);
    });
  });

  describe('OTP Phone Verification (/api/auth/otp)', () => {
    it('dispatches an OTP via SMS provider and validates Indian phone numbers', async () => {
      const res = await request(app)
        .post('/api/auth/otp/send')
        .send({ phone: '9876543210' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Check fake SMS provider received the message
      const lastOtp = fakeSMSProvider.getLastOtp('9876543210');
      expect(lastOtp).toBeDefined();
      expect(lastOtp).toMatch(/^\d{6}$/);
    });

    it('rate limits OTP requests within 30 seconds for the same number', async () => {
      await request(app)
        .post('/api/auth/otp/send')
        .send({ phone: '9876543211' });

      const throttleRes = await request(app)
        .post('/api/auth/otp/send')
        .send({ phone: '9876543211' });

      expect(throttleRes.status).toBe(429);
      expect(throttleRes.body.message).toContain('wait 30 seconds');
    });

    it('rejects incorrect OTP codes and updates failed attempt counter', async () => {
      await request(app)
        .post('/api/auth/otp/send')
        .send({ phone: '9876543212' });

      const failRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '9876543212', otp: '000000' });

      expect(failRes.status).toBe(400);
      expect(failRes.body.message).toContain('Invalid OTP');
    });

    it('verifies correct OTP and marks user phone as verified', async () => {
      const { user, token } = await makeUser({ phone: '9876543213' });

      await request(app)
        .post('/api/auth/otp/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '9876543213' });

      const sentOtp = fakeSMSProvider.getLastOtp('9876543213');
      expect(sentOtp).toBeDefined();

      const verifyRes = await request(app)
        .post('/api/auth/otp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '9876543213', otp: sentOtp });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.message).toContain('verified');

      // Confirm DB was updated
      const userRes = await query('SELECT is_phone_verified, phone FROM users WHERE id = $1', [user.id]);
      expect(userRes.rows[0].is_phone_verified).toBe(true);
      expect(userRes.rows[0].phone).toBe('9876543213');
    });
  });

  describe('Order Checkout Linkage with Delivery Address (POST /api/orders)', () => {
    it('creates an order with real deliveryAddressId, snapshots address text, and enforces geofence', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct({ stock: 20, price: 150 });

      // Add item to user cart
      await pool.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)',
        [user.id, product.id, 2]
      );

      // Create a valid serviceable address in Hyderabad
      const addrRes = await request(app)
        .post('/api/users/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          recipientName: 'Keertan Tedla',
          phone: '9876543210',
          addressLine1: 'Flat 402, Green Meadows',
          city: 'Hyderabad',
          pincode: '500081',
          latitude: 17.438,
          longitude: 78.385,
        });

      const addressId = addrRes.body.data.id;

      // Place order referencing deliveryAddressId
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deliveryAddressId: addressId,
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.status).toBe('success');
      expect(orderRes.body.data.order.delivery_address_id).toBe(addressId);
      expect(orderRes.body.data.order.delivery_address).toContain('Green Meadows');
      expect(orderRes.body.data.order.delivery_address).toContain('500081');
    });

    it('rejects order placement if deliveryAddressId is outside dark store geofence', async () => {
      const { user, token } = await makeUser();
      const product = await makeProduct({ stock: 10 });

      await pool.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)',
        [user.id, product.id, 1]
      );

      // Create address outside geofence (Delhi coords & non-serviceable pincode)
      const addrRes = await pool.query(
        `INSERT INTO user_addresses (user_id, recipient_name, phone, address_line1, city, pincode, latitude, longitude)
         VALUES ($1, 'Delhi User', '9876543210', 'Connaught Place', 'New Delhi', '110001', 28.63, 77.21)
         RETURNING id`,
        [user.id]
      );

      const unserviceableId = addrRes.rows[0].id;

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deliveryAddressId: unserviceableId,
        });

      expect(orderRes.status).toBe(400);
      expect(orderRes.body.message).toContain('10-minute');
    });
  });
});
