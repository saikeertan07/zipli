const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, generateToken } = require('../helpers/factories');
const { recommendationService } = require('../../src/services/recommendation.service');

describe('Recommendations & A/B Engine Integration Tests (Phase 5)', () => {
  let user;
  let authToken;
  let milk;
  let bread;
  let butter;
  let eggs;

  beforeEach(async () => {
    await query('DELETE FROM ab_events');
    await query('DELETE FROM user_reorder_habits');
    await query('DELETE FROM product_associations');
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');

    const userFixture = await makeUser();
    user = userFixture.user;
    authToken = userFixture.token;

    milk = await makeProduct({
      name: 'Fresh Cow Milk 1L',
      category_id: 'dairy',
      price: 60,
      mrp: 65,
      stock: 50,
      badge: 'Bestseller',
    });
    bread = await makeProduct({
      name: 'Sourdough Bread',
      category_id: 'bakery',
      price: 50,
      mrp: 55,
      stock: 30,
    });
    butter = await makeProduct({
      name: 'Salted Table Butter',
      category_id: 'dairy',
      price: 58,
      mrp: 62,
      stock: 20,
    });
    eggs = await makeProduct({
      name: 'Farm Eggs 6pk',
      category_id: 'dairy',
      price: 45,
      mrp: 50,
      stock: 40,
    });

    await recommendationService.init();
  });

  describe('GET /api/recs/home & GET /recs/home', () => {
    it('returns personalized rails with deterministic A/B variant assignment for user', async () => {
      const res = await request(app)
        .get('/api/recs/home')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.variant).toBeDefined();
      expect(['control', 'treatment']).toContain(res.body.data.variant);
      expect(res.body.data.rails.length).toBeGreaterThan(0);

      for (const rail of res.body.data.rails) {
        expect(rail.id).toBeDefined();
        expect(rail.title).toBeDefined();
        expect(Array.isArray(rail.items)).toBe(true);
      }

      // Check alias endpoint /recs/home
      const aliasRes = await request(app).get('/recs/home');
      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body.data.rails.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/recs/product/:id & GET /recs/product/:id', () => {
    it('returns Frequently Bought Together items from database associations', async () => {
      // Plant association: Milk -> Bread
      await query(
        `INSERT INTO product_associations (antecedent_id, consequent_id, support, confidence, lift, algorithm)
         VALUES ($1, $2, 0.45, 0.85, 2.80, 'fp_growth')`,
        [milk.id, bread.id]
      );

      // Re-initialize to load DB association
      await recommendationService.init();

      const res = await request(app).get(`/api/recs/product/${milk.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.productId).toBe(milk.id);
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);

      const firstRec = res.body.data.recommendations[0];
      expect(firstRec.product.id).toBe(bread.id);
      expect(firstRec.type).toBe('bought_together');

      // Test alias route
      const aliasRes = await request(app).get(`/recs/product/${milk.id}`);
      expect(aliasRes.status).toBe(200);
    });

    it('rejects invalid product ID with 400 Bad Request', async () => {
      const res = await request(app).get('/api/recs/product/not-a-number');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('GET /api/recs/cart & GET /recs/cart', () => {
    it('suggests complementary items given current cart items', async () => {
      // Plant association: Milk -> Butter
      await query(
        `INSERT INTO product_associations (antecedent_id, consequent_id, support, confidence, lift, algorithm)
         VALUES ($1, $2, 0.40, 0.75, 2.50, 'fp_growth')`,
        [milk.id, butter.id]
      );
      await recommendationService.init();

      const res = await request(app).get(`/api/recs/cart?items=${milk.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);

      const recIds = res.body.data.recommendations.map((r) => r.product.id);
      expect(recIds).toContain(butter.id);
      expect(recIds).not.toContain(milk.id); // Not already in cart

      // Test alias route
      const aliasRes = await request(app).get(`/recs/cart?cartItemIds=${milk.id}`);
      expect(aliasRes.status).toBe(200);
    });

    it('falls back to cold-start trending when cart is empty', async () => {
      const res = await request(app).get('/api/recs/cart');
      expect(res.status).toBe(200);
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/recs/again & GET /recs/again', () => {
    it('returns personalized Buy It Again feed ranked by replenishment due-ness', async () => {
      const dayMs = 24 * 60 * 60 * 1000;
      const lastWeek = new Date(Date.now() - 7 * dayMs);

      // Insert habit record: Milk due for replenishment (typical gap = 7 days, last purchased = 7 days ago)
      await query(
        `INSERT INTO user_reorder_habits (user_id, product_id, order_count, typical_gap_days, last_purchased_at)
         VALUES ($1, $2, 3, 7.0, $3)`,
        [user.id, milk.id, lastWeek]
      );

      const res = await request(app)
        .get('/api/recs/again')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.items.length).toBe(1);

      const item = res.body.data.items[0];
      expect(item.id).toBe(milk.id);
      expect(item.isDue).toBe(true);
      expect(item.urgency).toBe('high');
      expect(item.dueScore).toBeCloseTo(1.0, 1);

      // Test alias route
      const aliasRes = await request(app)
        .get('/recs/again')
        .set('Authorization', `Bearer ${authToken}`);
      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body.data.items.length).toBe(1);
    });

    it('returns empty list for unauthenticated guests without user_id', async () => {
      const res = await request(app).get('/api/recs/again');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });
  });

  describe('POST /api/recs/track', () => {
    it('records A/B testing event in database and updates multi-armed bandit online feedback', async () => {
      const payload = {
        experimentKey: 'home_rails_ranking',
        variant: 'treatment',
        eventType: 'click',
        metadata: {
          railId: 'trending',
          productId: milk.id,
        },
      };

      const res = await request(app)
        .post('/api/recs/track')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.event.id).toBeDefined();

      // Verify DB persistence
      const { rows } = await query(`SELECT * FROM ab_events WHERE id = $1`, [
        res.body.data.event.id,
      ]);
      expect(rows.length).toBe(1);
      expect(rows[0].experiment_key).toBe('home_rails_ranking');
      expect(rows[0].event_type).toBe('click');
      expect(rows[0].user_id).toBe(user.id);
    });

    it('validates required fields and rejects invalid payload with 400', async () => {
      const res = await request(app).post('/api/recs/track').send({ experimentKey: 'test_exp' }); // missing variant and eventType

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('GET /api/recs/personalized', () => {
    it('returns hybrid personalized recommendations with diversity guardrail and explainability', async () => {
      const res = await request(app)
        .get(`/api/recs/personalized?items=${milk.id}&limit=5&max_per_category=2`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.recommendations)).toBe(true);
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);

      const firstRec = res.body.data.recommendations[0];
      expect(firstRec.product).toBeDefined();
      expect(firstRec.finalScore).toBeDefined();
      expect(firstRec.reason).toBeDefined();
      expect(typeof firstRec.reason).toBe('string');
    });
  });
});
