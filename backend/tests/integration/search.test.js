const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/db');
const { makeUser, makeProduct } = require('../helpers/factories');
const { catalogSearchService } = require('../../src/services/catalogSearch.service');

describe('In-Memory Search Engine Integration Tests (Phase 4)', () => {
  let adminUser;

  beforeEach(async () => {
    await query('DELETE FROM cart_items');
    await query('DELETE FROM order_items');
    await query('DELETE FROM products');
    catalogSearchService.clear();

    adminUser = await makeUser({ role: 'admin' });
  });

  describe('GET /api/products?search=... & GET /search?q=...', () => {
    it('returns ranked search results with BM25 score and multi-signal boost', async () => {
      await makeProduct({
        name: 'Fresh Cow Milk',
        category_id: 'dairy',
        price: 60,
        badge: 'Bestseller',
      });
      await makeProduct({
        name: 'Organic Whole Milk',
        category_id: 'dairy',
        price: 75,
        badge: 'Organic',
      });
      await makeProduct({ name: 'Almond Milk Unsweetened', category_id: 'dairy', price: 180 });
      await makeProduct({ name: 'Fresh Hass Avocado', category_id: 'fruits', price: 160 });

      await catalogSearchService.init();

      const res = await request(app).get('/api/products?search=milk');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.results).toBe(3);
      expect(res.body.data.products.length).toBe(3);

      const names = res.body.data.products.map((p) => p.name);
      expect(names).toContain('Fresh Cow Milk');
      expect(names).toContain('Organic Whole Milk');
      expect(names).toContain('Almond Milk Unsweetened');
      expect(names).not.toContain('Fresh Hass Avocado');

      for (const p of res.body.data.products) {
        expect(p._score).toBeDefined();
        expect(p._score).toBeGreaterThan(0);
      }
    });

    it('recovers from single-character typos using BK-tree fuzzy fallback', async () => {
      await makeProduct({ name: 'Fresh Hass Avocado', category_id: 'fruits' });
      await makeProduct({ name: 'Organic Whole Milk', category_id: 'dairy' });

      await catalogSearchService.init();

      // Query with typo "avcado" instead of "avocado"
      const res = await request(app).get('/api/products?search=avcado');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.correctedQuery).toBe('avocado');
      expect(res.body.results).toBe(1);
      expect(res.body.data.products[0].name).toBe('Fresh Hass Avocado');
    });

    it('recovers from transposition typos (mlik -> milk)', async () => {
      await makeProduct({ name: 'Fresh Cow Milk', category_id: 'dairy' });
      await makeProduct({ name: 'Greek Plain Yogurt', category_id: 'dairy' });

      await catalogSearchService.init();

      const res = await request(app).get('/api/products?search=mlik');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.correctedQuery).toBe('milk');
      expect(res.body.results).toBe(1);
      expect(res.body.data.products[0].name).toBe('Fresh Cow Milk');
    });

    it('supports Hindi/Hinglish transliteration (doodh -> milk, aloo -> potato)', async () => {
      await makeProduct({ name: 'Fresh Cow Milk', category_id: 'dairy' });
      await makeProduct({ name: 'Baby Potato', category_id: 'vegetables' });

      await catalogSearchService.init();

      const resMilk = await request(app).get('/api/products?search=doodh');
      expect(resMilk.status).toBe(200);
      expect(resMilk.body.results).toBe(1);
      expect(resMilk.body.data.products[0].name).toBe('Fresh Cow Milk');

      const resPotato = await request(app).get('/api/products?search=aloo');
      expect(resPotato.status).toBe(200);
      expect(resPotato.body.results).toBe(1);
      expect(resPotato.body.data.products[0].name).toBe('Baby Potato');
    });

    it('filters search results by category', async () => {
      await makeProduct({ name: 'Organic Milk', category_id: 'dairy' });
      await makeProduct({ name: 'Organic Bananas', category_id: 'fruits' });

      await catalogSearchService.init();

      const res = await request(app).get('/api/products?search=organic&category=fruits');

      expect(res.status).toBe(200);
      expect(res.body.results).toBe(1);
      expect(res.body.data.products[0].name).toBe('Organic Bananas');
    });

    it('supports pagination parameters in search', async () => {
      for (let i = 1; i <= 5; i++) {
        await makeProduct({ name: `Organic Apple ${i}`, category_id: 'fruits' });
      }

      await catalogSearchService.init();

      const res = await request(app).get('/api/products?search=organic&page=2&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.results).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it('supports explain=1 scoring breakdown debugging parameter', async () => {
      await makeProduct({
        name: 'Fresh Cow Milk',
        category_id: 'dairy',
        price: 60,
        mrp: 80,
        badge: 'Bestseller',
      });

      await catalogSearchService.init();

      const res = await request(app).get('/api/search?q=milk&explain=1');

      expect(res.status).toBe(200);
      expect(res.body.results).toBe(1);
      const product = res.body.data.products[0];
      expect(product._explanation).toBeDefined();
      expect(product._explanation.bm25Weighted).toBeDefined();
      expect(product._explanation.popularityWeighted).toBeDefined();
      expect(product._explanation.inStockWeighted).toBeDefined();
      expect(product._explanation.discountWeighted).toBeDefined();
      expect(product._explanation.finalScore).toBeDefined();
    });
  });

  describe('GET /api/search/facets & Facet Computation', () => {
    it('computes category, price range, and in-stock facets in a single pass', async () => {
      await makeProduct({
        name: 'Milk A',
        category_id: 'dairy',
        price: 40,
        stock: 10,
        badge: 'Organic',
      });
      await makeProduct({ name: 'Milk B', category_id: 'dairy', price: 75, stock: 0 });
      await makeProduct({ name: 'Banana C', category_id: 'fruits', price: 150, stock: 5 });

      await catalogSearchService.init();

      const res = await request(app).get('/api/search/facets');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const facets = res.body.data.facets;
      expect(facets.categories.dairy).toBe(2);
      expect(facets.categories.fruits).toBe(1);
      expect(facets.priceRanges.under_50).toBe(1);
      expect(facets.priceRanges['50_to_100']).toBe(1);
      expect(facets.priceRanges['100_to_200']).toBe(1);
      expect(facets.inStock.true).toBe(2);
      expect(facets.inStock.false).toBe(1);
      expect(facets.badges.Organic).toBe(1);

      // Query-filtered facets
      const queriedRes = await request(app).get('/api/search/facets?q=banana');
      expect(queriedRes.status).toBe(200);
      expect(queriedRes.body.data.facets.categories.fruits).toBe(1);
    });

    it('lazily initializes search engine on /search, /suggest, and /facets when uninitialized', async () => {
      await makeProduct({ name: 'Lazy Milk Item', category_id: 'dairy' });
      catalogSearchService.clear();
      expect(catalogSearchService.initialized).toBe(false);

      // 1. /search triggers lazy init
      const searchRes = await request(app).get('/search?q=lazy&explain=true');
      expect(searchRes.status).toBe(200);
      expect(catalogSearchService.initialized).toBe(true);

      // Clear again
      catalogSearchService.clear();
      expect(catalogSearchService.initialized).toBe(false);

      // 2. /suggest triggers lazy init
      const suggestRes = await request(app).get('/search/suggest?q=laz');
      expect(suggestRes.status).toBe(200);
      expect(catalogSearchService.initialized).toBe(true);

      // Clear again
      catalogSearchService.clear();
      expect(catalogSearchService.initialized).toBe(false);

      // 3. /facets triggers lazy init
      const facetsRes = await request(app).get('/search/facets?q=lazy');
      expect(facetsRes.status).toBe(200);
      expect(catalogSearchService.initialized).toBe(true);
    });
  });

  describe('GET /api/products/suggest & GET /search/suggest (Prefix Autocomplete)', () => {
    it('returns Trie prefix suggestions as string array', async () => {
      await makeProduct({ name: 'Hass Avocado Fresh', category_id: 'fruits' });
      await makeProduct({ name: 'Harvest Crunch Granola', category_id: 'snacks' });
      await makeProduct({ name: 'Organic Whole Milk', category_id: 'dairy' });

      await catalogSearchService.init();

      const res = await request(app).get('/api/products/suggest?q=ha');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.suggestions).toBeDefined();

      const suggestions = res.body.data.suggestions;
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      for (const s of suggestions) {
        expect(s.toLowerCase().startsWith('ha')).toBe(true);
      }

      // Also verify master prompt endpoint GET /search/suggest?q=ha
      const directSuggestRes = await request(app).get('/search/suggest?q=ha');
      expect(directSuggestRes.status).toBe(200);
      expect(Array.isArray(directSuggestRes.body)).toBe(true);
      expect(directSuggestRes.body.length).toBeGreaterThanOrEqual(1);
      expect(directSuggestRes.body[0].toLowerCase().startsWith('ha')).toBe(true);
    });

    it('returns empty suggestions array when no prefix matches', async () => {
      await makeProduct({ name: 'Fresh Cow Milk', category_id: 'dairy' });

      await catalogSearchService.init();

      const res = await request(app).get('/api/products/suggest?q=zzzzz');

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions).toEqual([]);
    });
  });

  describe('Real-time Catalog Synchronization (Admin Mutations)', () => {
    it('immediately reflects new product creation in search and suggestions', async () => {
      await catalogSearchService.init();
      expect(catalogSearchService.size).toBe(0);

      // Create product via Admin API
      const createRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          name: 'Dragon Fruit Delight',
          qty_label: '1 pc',
          price: 150,
          category_id: 'dairy',
          emoji: '🐉',
          stock: 20,
        });

      expect(createRes.status).toBe(201);
      const createdId = createRes.body.data.product.id;

      // Immediate search finds new item
      const searchRes = await request(app).get('/api/products?search=dragon');
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.results).toBe(1);
      expect(searchRes.body.data.products[0].id).toBe(createdId);

      // Suggestion finds new item
      const suggestRes = await request(app).get('/api/products/suggest?q=drag');
      expect(suggestRes.body.data.suggestions).toContain('dragon');
    });

    it('immediately reflects product update in search', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          name: 'Red Delicious Apple',
          qty_label: '4 pcs',
          price: 120,
          category_id: 'dairy',
        });

      const prodId = prodRes.body.data.product.id;

      // Update name via Admin API
      const updateRes = await request(app)
        .patch(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ name: 'Golden Fuji Apple' });

      expect(updateRes.status).toBe(200);

      // Old name no longer returns product
      const oldSearch = await request(app).get('/api/products?search=delicious');
      expect(oldSearch.body.results).toBe(0);

      // New name returns updated product
      const newSearch = await request(app).get('/api/products?search=golden');
      expect(newSearch.body.results).toBe(1);
      expect(newSearch.body.data.products[0].name).toBe('Golden Fuji Apple');
    });

    it('immediately removes soft-deleted product from search', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          name: 'Seasonal Mangoes',
          qty_label: '1 kg',
          price: 250,
          category_id: 'dairy',
        });

      const prodId = prodRes.body.data.product.id;

      // Deactivate product via Admin API
      const delRes = await request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(delRes.status).toBe(200);

      // Search no longer returns deactivated product
      const searchRes = await request(app).get('/api/products?search=mangoes');
      expect(searchRes.body.results).toBe(0);
    });
  });
});
