const request = require('supertest');
const app = require('../../src/app');
const { makeProduct } = require('../helpers/factories');

describe('Products & Categories Integration Tests (API /api/products & /api/categories)', () => {
  describe('GET /api/products', () => {
    it('returns a list of products with pagination metadata', async () => {
      const res = await request(app).get('/api/products?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.products)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
    });

    it('filters products accurately by category', async () => {
      const res = await request(app).get('/api/products?cat=dairy');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      for (const prod of res.body.data.products) {
        expect(prod.cat).toBe('dairy');
      }
    });

    it('searches products by keyword in name', async () => {
      await makeProduct({ name: 'Special Alfonso Mango Juice' });

      const res = await request(app).get('/api/products?q=Alfonso');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.products.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.products.some((p) => p.name.includes('Alfonso'))).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a single product by ID', async () => {
      const created = await makeProduct({ name: 'Fresh Paneer 200g', price: 90 });

      const res = await request(app).get(`/api/products/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.product.id).toBe(created.id);
      expect(res.body.data.product.name).toBe('Fresh Paneer 200g');
    });

    it('returns 404 for a non-existent product ID', async () => {
      const res = await request(app).get('/api/products/999999');

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Product not found/);
    });
  });

  describe('GET /api/categories', () => {
    it('returns all categories from catalog seed', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.categories)).toBe(true);
      expect(res.body.data.categories.length).toBeGreaterThan(0);
      const first = res.body.data.categories[0];
      expect(first.id).toBeDefined();
      expect(first.name).toBeDefined();
      expect(first.emoji).toBeDefined();
    });
  });
});
