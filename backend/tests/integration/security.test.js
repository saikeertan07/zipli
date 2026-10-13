const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, makeCartFor } = require('../helpers/factories');

describe('Phase 9 Security, Trust, Hash Chain & GDPR Integration Tests', () => {
  let adminUser, adminToken;
  let regularUser, regularToken;

  beforeAll(async () => {
    const admin = await makeUser({ role: 'admin' });
    adminUser = admin.user;
    adminToken = admin.token;

    const reg = await makeUser({ role: 'customer' });
    regularUser = reg.user;
    regularToken = reg.token;
  });

  describe('Cryptographic Audit Log Hash Chain & Verification', () => {
    it('restricts audit chain endpoints to authenticated admin users', async () => {
      const unauth = await request(app).get('/api/security/audit-chain/verify');
      expect(unauth.status).toBe(401);

      const forbidden = await request(app)
        .get('/api/security/audit-chain/verify')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(forbidden.status).toBe(403);
    });

    it('creates chained audit records and validates chain integrity', async () => {
      // 1. Create audit log entries
      const r1 = await request(app)
        .post('/api/security/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'CONFIG_UPDATE',
          targetType: 'SYSTEM',
          targetId: 'FREE_DELIVERY_THRESHOLD',
          payload: { old: 500, new: 400 },
        });
      expect(r1.status).toBe(201);
      expect(r1.body.data.log.current_hash).toHaveLength(64);

      const r2 = await request(app)
        .post('/api/security/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'MERCHANT_APPROVED',
          targetType: 'USER',
          targetId: String(regularUser.id),
          payload: { approvedBy: adminUser.id },
        });
      expect(r2.status).toBe(201);
      expect(r2.body.data.log.prev_hash).toBe(r1.body.data.log.current_hash);

      // 2. Verify entire chain
      const verifyRes = await request(app)
        .get('/api/security/audit-chain/verify')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isValid).toBe(true);
      expect(verifyRes.body.data.verifiedCount).toBeGreaterThanOrEqual(2);

      // 3. List paginated audit logs
      const listRes = await request(app)
        .get('/api/security/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.logs.length).toBeGreaterThanOrEqual(2);
    });

    it('detects tampering when an audit log payload is maliciously altered', async () => {
      // Insert a fresh log
      const logRes = await request(app)
        .post('/api/security/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'SECRET_PAYMENT_GRANT',
          targetType: 'FINANCE',
          targetId: 'TXN_001',
          payload: { amount: 100 },
        });
      const createdId = logRes.body.data.log.id;

      // Maliciously modify the database row without updating hash
      await query(
        'UPDATE admin_audit_logs SET payload = \'{"amount": 1000000}\'::jsonb WHERE id = $1',
        [createdId]
      );

      const verifyRes = await request(app)
        .get('/api/security/audit-chain/verify')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isValid).toBe(false);
      expect(verifyRes.body.data.tamperedRowId).toBe(String(createdId));
      expect(verifyRes.body.data.reason).toMatch(/Tampered content at row/);

      // Clean up / revert tamper so subsequent tests maintain a valid chain
      await query(
        'UPDATE admin_audit_logs SET payload = \'{"amount": 100}\'::jsonb WHERE id = $1',
        [createdId]
      );
    });
  });

  describe('Order Fraud Risk Scoring & Admin Review Queue', () => {
    it('places high-value first order on new account into REVIEW queue and resolves it', async () => {
      // 1. Create a fresh customer
      const { user: newUser, token: newToken } = await makeUser();

      // 2. Expensive product ($250 > $150 threshold)
      const luxuryProduct = await makeProduct({
        name: 'Beluga Caviar Reserve',
        price: 250,
        stock: 10,
      });

      await makeCartFor(newUser.id, [{ productId: luxuryProduct.id, quantity: 1 }]);

      // 3. Place order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ deliveryAddress: 'Penthouse 99, UB City, Bengaluru' });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.order.fraud_decision).toBe('REVIEW');
      expect(Number(orderRes.body.data.order.fraud_score)).toBeGreaterThanOrEqual(0.3);

      const orderId = orderRes.body.data.order.id;

      // 4. View in Admin Fraud Queue
      const queueRes = await request(app)
        .get('/api/security/fraud-queue')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(queueRes.status).toBe(200);
      const heldOrder = queueRes.body.data.orders.find((o) => o.id === orderId);
      expect(heldOrder).toBeDefined();

      // 5. Admin resolves order with APPROVE
      const resolveRes = await request(app)
        .post(`/api/security/fraud-queue/${orderId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVE', notes: 'Verified via customer callback' });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.order.fraud_decision).toBe('APPROVED');
      expect(resolveRes.body.data.order.status).toBe('confirmed');
    });
  });

  describe('Privacy & GDPR / DPDP Right-to-Erasure & Portability', () => {
    it('exports all personal data including orders in compliance with GDPR', async () => {
      const { user: exportUser, token: exportToken } = await makeUser();

      const prod = await makeProduct({ price: 20, stock: 10 });
      await makeCartFor(exportUser.id, [{ productId: prod.id, quantity: 1 }]);
      const orderPostRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${exportToken}`)
        .send({ deliveryAddress: '404 Privacy Lane' });

      expect(orderPostRes.status).toBe(201);

      const res = await request(app)
        .get('/api/users/me/data-export')
        .set('Authorization', `Bearer ${exportToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(exportUser.id);
      expect(res.body.data.orders).toBeInstanceOf(Array);
      expect(res.body.data.orders.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.exportTimestamp).toBeDefined();
    });

    it('anonymizes personal data and revokes access upon account deletion', async () => {
      const rawPassword = 'Password123';
      const { user: delUser, token: delToken } = await makeUser({
        password: rawPassword,
      });

      // Request deletion / anonymization
      const delRes = await request(app)
        .post('/api/users/me/delete-account')
        .set('Authorization', `Bearer ${delToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.success).toBe(true);

      // Verify database record has PII scrubbed
      const { rows } = await query(
        'SELECT name, email, phone, is_anonymized FROM users WHERE id = $1',
        [delUser.id]
      );
      expect(rows[0].name).toBe('Deleted User');
      expect(rows[0].email).toMatch(/^anon_[a-f0-9]{12}@anonymized\.zipli\.internal$/);
      expect(rows[0].is_anonymized).toBe(true);

      // Subsequent login is blocked
      const loginAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: rows[0].email, password: rawPassword });
      expect(loginAttempt.status).toBe(403);
    });
  });

  describe('Security Hardening: CSRF & Auth Lockout', () => {
    it('returns CSRF token endpoint and sets cookie', async () => {
      const res = await request(app).get('/api/auth/csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.data.csrfToken).toBeDefined();
      const cookies = res.headers['set-cookie'];
      expect(cookies.some((c) => c.includes('csrfToken'))).toBe(true);
    });

    it('locks account after 5 consecutive failed login attempts', async () => {
      const { user: targetUser } = await makeUser({ password: 'ValidPass1' });

      // Trigger 4 failed logins
      for (let i = 0; i < 4; i++) {
        const failRes = await request(app)
          .post('/api/auth/login')
          .send({ email: targetUser.email, password: 'WrongPassword' });
        expect(failRes.status).toBe(401);
      }

      // 5th failed login triggers lockout (429)
      const fifthRes = await request(app)
        .post('/api/auth/login')
        .send({ email: targetUser.email, password: 'WrongPassword' });
      expect(fifthRes.status).toBe(429);
      expect(fifthRes.body.message).toMatch(/Account locked/);

      // Even correct password within lockout period is rejected with 429
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .send({ email: targetUser.email, password: 'ValidPass1' });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.message).toMatch(/Account is temporarily locked/);
    });
  });
});
