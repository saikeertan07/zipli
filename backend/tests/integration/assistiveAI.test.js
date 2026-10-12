/**
 * @file assistiveAI.test.js
 * @description Integration tests for Assistive AI Features:
 * 1. Recipe -> Cart conversion
 * 2. Substitution assistant
 * 3. Smart reorder cadence predictor
 * 4. Multi-modal hybrid search integration
 */

const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct, makeOrderFor } = require('../helpers/factories');

describe('Assistive AI Integration Tests (F-030, F-031)', () => {
  let customerUser;
  let milkProduct, butterProduct, spinachProduct, paneerProduct;

  beforeEach(async () => {
    await query('DELETE FROM cart_items');
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');

    customerUser = await makeUser({ role: 'customer' });

    milkProduct = await makeProduct({
      name: 'Fresh Cow Milk 1L',
      category_id: 'dairy',
      price: 65,
      price_paise: 6500,
      stock: 40,
    });

    butterProduct = await makeProduct({
      name: 'Amul Butter 100g',
      category_id: 'dairy',
      price: 58,
      price_paise: 5800,
      stock: 25,
    });

    spinachProduct = await makeProduct({
      name: 'Fresh Palak Spinach 500g',
      category_id: 'produce',
      price: 30,
      price_paise: 3000,
      stock: 20,
    });

    paneerProduct = await makeProduct({
      name: 'Malai Paneer 200g',
      category_id: 'dairy',
      price: 95,
      price_paise: 9500,
      stock: 15,
    });
  });

  describe('POST /api/assistant/recipe-to-cart', () => {
    it('converts a recipe query into matched inventory items and a proposed cart action', async () => {
      const res = await request(app)
        .post('/api/assistant/recipe-to-cart')
        .send({
          dish: 'palak paneer',
          servings: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.dish).toBe('palak paneer');
      expect(res.body.data.servings).toBe(4);
      expect(res.body.data.matchedItems.length).toBeGreaterThan(0);

      // Check matched items contain palak / paneer
      const names = res.body.data.matchedItems.map((m) => m.name);
      expect(names.some((n) => n.includes('Palak') || n.includes('Paneer') || n.includes('Butter'))).toBe(true);

      // Verify cart proposal
      expect(res.body.data.cartProposal.actionType).toBe('ADD_RECIPE_TO_CART');
      expect(res.body.data.cartProposal.readyToAdd).toBe(true);
      expect(res.body.data.totalEstimatedPaise).toBeGreaterThan(0);
    });

    it('rejects invalid inputs with Zod validation error', async () => {
      const res = await request(app)
        .post('/api/assistant/recipe-to-cart')
        .send({
          dish: '', // too short
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/assistant/substitutes/:productId', () => {
    it('returns ranked substitutes within the same category for an item', async () => {
      const res = await request(app).get(`/api/assistant/substitutes/${milkProduct.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.originalProduct.id).toBe(milkProduct.id);
      expect(res.body.data.hasSubstitutes).toBe(true);

      const substitutes = res.body.data.substitutes;
      expect(substitutes.length).toBeGreaterThan(0);
      // None of the substitutes should be the original product
      expect(substitutes.every((s) => s.id !== milkProduct.id)).toBe(true);
      expect(substitutes[0].substituteScore).toBeDefined();
      expect(substitutes[0].reason).toContain('dairy');
    });

    it('returns empty list for non-existent product', async () => {
      const res = await request(app).get('/api/assistant/substitutes/999999');

      expect(res.status).toBe(200);
      expect(res.body.data.substitutes).toEqual([]);
      expect(res.body.data.hasSubstitutes).toBe(false);
    });
  });

  describe('GET /api/assistant/reorders', () => {
    it('predicts replenishment reorders based on previous order history', async () => {
      // Create a delivered order 4 days ago for milk
      const pastDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const { order } = await makeOrderFor(
        customerUser.user.id,
        [{ productId: milkProduct.id, quantity: 2, unitPrice: milkProduct.price }],
        { status: 'delivered', created_at: pastDate }
      );

      // Explicitly update created_at on orders in case factory defaults to NOW()
      await query('UPDATE orders SET created_at = $1 WHERE id = $2', [pastDate, order.id]);

      const res = await request(app)
        .get('/api/assistant/reorders')
        .set('Authorization', `Bearer ${customerUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.suggestions.length).toBeGreaterThan(0);

      const milkSuggestion = res.body.data.suggestions.find((s) => s.productId === milkProduct.id);
      expect(milkSuggestion).toBeDefined();
      expect(milkSuggestion.urgency).toBe('high'); // Milk cycle is ~2 days, 4 days elapsed -> high
    });

    it('strictly returns 401 Unauthorized when unauthenticated guest calls /reorders (P0)', async () => {
      const res = await request(app).get('/api/assistant/reorders');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Authentication required');
    });

    it('returns staple recommendations when authenticated user has no order history', async () => {
      const newUser = await makeUser({ role: 'customer' });
      const res = await request(app)
        .get('/api/assistant/reorders')
        .set('Authorization', `Bearer ${newUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/search?mode=hybrid', () => {
    it('successfully queries hybrid search and returns fused results with metadata', async () => {
      const res = await request(app).get('/api/search?q=milk&mode=hybrid');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.mode).toBe('hybrid');
      expect(res.body.results).toBeGreaterThan(0);
      expect(res.body.sourcesUsed).toBeDefined();
      expect(res.body.data.products[0].name).toContain('Milk');
    });
  });
});
