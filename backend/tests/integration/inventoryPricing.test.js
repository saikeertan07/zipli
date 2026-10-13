const request = require('supertest');
const app = require('../../src/app');
const { makeProduct } = require('../helpers/factories');
const { query } = require('../../src/config/db');

describe('Inventory Intelligence & Dynamic Pricing API Integration Tests', () => {
  let testProduct;

  beforeAll(async () => {
    testProduct = await makeProduct({
      name: 'Organic Pasteurized Whole Milk',
      price: 60,
      mrp: 75,
      stock: 40,
      is_perishable: true,
      shelf_life_days: 7,
    });
  });

  describe('Inventory Demand Forecasting (/api/inventory/forecast)', () => {
    it('returns rolling-origin best forecast model and prediction array', async () => {
      const res = await request(app).get(`/api/inventory/forecast/${testProduct.id}?horizon=7`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.productId).toBe(testProduct.id);
      expect(res.body.data.forecast).toHaveLength(7);
      expect(res.body.data.bestModel).toBeDefined();
      expect(res.body.data.bestSmape).toBeGreaterThanOrEqual(0);
      expect(res.body.data.comparison).toBeDefined();
    });

    it('returns 400 when productId is invalid', async () => {
      const res = await request(app).get('/api/inventory/forecast/abc');
      expect(res.status).toBe(400);
    });

    it('returns 404 when product does not exist', async () => {
      const res = await request(app).get('/api/inventory/forecast/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('Reorder Suggestions & Safety Stock (/api/inventory/reorder)', () => {
    it('calculates safety stock, ROP, and EOQ for inventory replenishment', async () => {
      const res = await request(app).get(
        `/api/inventory/reorder?productId=${testProduct.id}&leadTimeDays=3&targetServiceLevel=0.95`
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.suggestions.length).toBeGreaterThanOrEqual(1);

      const sugg = res.body.data.suggestions[0];
      expect(sugg.productId).toBe(testProduct.id);
      expect(sugg.safetyStock).toBeGreaterThanOrEqual(0);
      expect(sugg.reorderPoint).toBeGreaterThanOrEqual(0);
      expect(sugg.eoq).toBeGreaterThan(0);
      expect(typeof sugg.shouldReorder).toBe('boolean');
      expect(sugg.formulas).toBeDefined();
    });
    it('calculates reorder suggestions across all catalog products when productId is omitted', async () => {
      const res = await request(app).get('/api/inventory/reorder');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.suggestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ABC / XYZ Inventory Matrix (/api/inventory/abc-xyz)', () => {
    it('segments catalog items into 9-box Pareto revenue and demand volatility matrix', async () => {
      const res = await request(app).get(
        '/api/inventory/abc-xyz?aThreshold=0.75&bThreshold=0.90&xCvThreshold=0.45&yCvThreshold=0.95'
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.classifiedItems).toBeInstanceOf(Array);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.matrixGrid).toBeDefined();
    });
  });

  describe('Anomaly & Drift Detection (/api/inventory/anomalies)', () => {
    it('runs robust modified Z-score and CUSUM control chart sequential drift detection', async () => {
      const res = await request(app).get(`/api/inventory/anomalies/${testProduct.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.robustZ).toBeDefined();
      expect(res.body.data.robustZ.outliers).toBeInstanceOf(Array);
      expect(res.body.data.cusum).toBeDefined();
      expect(typeof res.body.data.cusum.driftDetected).toBe('boolean');
    });

    it('returns global sales anomaly report when productId is omitted', async () => {
      const res = await request(app).get('/api/inventory/anomalies');
      expect(res.status).toBe(200);
      expect(res.body.data.robustZ).toBeDefined();
    });

    it('returns 404 when product for anomaly report does not exist', async () => {
      const res = await request(app).get('/api/inventory/anomalies/999999');
      expect(res.status).toBe(404);
    });
  });

  describe('FEFO Batch Tracking & Allocation (/api/inventory/batches)', () => {
    const futureExpiry = new Date(Date.now() + 5 * 86400000).toISOString();
    const batchNumber = `MILK-BATCH-${Date.now()}`;

    it('adds a new product batch with expiry tracking', async () => {
      const res = await request(app).post('/api/inventory/batches').send({
        productId: testProduct.id,
        batchNumber,
        quantity: 20,
        expiryDate: futureExpiry,
        costPrice: 42,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.batch.batch_number).toBe(batchNumber);
      expect(res.body.data.batch.quantity).toBe(20);
    });

    it('auto-generates batch number when omitted', async () => {
      const res = await request(app).post('/api/inventory/batches').send({
        productId: testProduct.id,
        quantity: 10,
        expiryDate: futureExpiry,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.batch.batch_number).toMatch(/^BATCH-/);
    });

    it('returns 400 when required batch fields are missing or invalid', async () => {
      const resMissing = await request(app)
        .post('/api/inventory/batches')
        .send({ productId: testProduct.id });
      expect(resMissing.status).toBe(400);

      const resBadDate = await request(app)
        .post('/api/inventory/batches')
        .send({ productId: testProduct.id, quantity: 5, expiryDate: 'invalid-date' });
      expect(resBadDate.status).toBe(400);

      const resNonExistent = await request(app)
        .post('/api/inventory/batches')
        .send({ productId: 999999, quantity: 5, expiryDate: futureExpiry });
      expect(resNonExistent.status).toBe(404);
    });

    it('lists all batches when productId is omitted', async () => {
      const res = await request(app).get('/api/inventory/batches');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.batches).toBeInstanceOf(Array);
    });

    it('lists batches for a product sorted by earliest expiry', async () => {
      const res = await request(app).get(`/api/inventory/batches?productId=${testProduct.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.batches.length).toBeGreaterThanOrEqual(1);
    });

    it('allocates units from batches using FEFO order', async () => {
      const res = await request(app).post('/api/inventory/batches/allocate').send({
        productId: testProduct.id,
        quantity: 5,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.allocatedBatches.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.shortage).toBe(0);
    });

    it('handles batch allocation errors and shortages', async () => {
      const resBad = await request(app)
        .post('/api/inventory/batches/allocate')
        .send({ productId: testProduct.id });
      expect(resBad.status).toBe(400);

      const resShortage = await request(app)
        .post('/api/inventory/batches/allocate')
        .send({ productId: testProduct.id, quantity: 99999 });
      expect(resShortage.status).toBe(200);
      expect(resShortage.body.status).toBe('fail');
      expect(resShortage.body.data.shortage).toBeGreaterThan(0);
    });

    it('quarantines expired batches safely', async () => {
      // Insert an expired batch directly into DB
      await query(
        `INSERT INTO product_batches (product_id, batch_number, quantity, initial_quantity, expiry_date)
         VALUES ($1, $2, 10, 10, NOW() - INTERVAL '2 days')`,
        [testProduct.id, `EXPIRED-${Date.now()}`]
      );

      const res = await request(app).post('/api/inventory/batches/quarantine');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.quarantinedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Dynamic Pricing Engine (/api/pricing/dynamic)', () => {
    it('calculates dynamic pricing preview with progressive markdown and surge guardrails', async () => {
      const res = await request(app).get(`/api/pricing/dynamic/${testProduct.id}?demandRatio=1.5`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.finalPrice).toBeGreaterThan(0);
      expect(res.body.data.finalPrice).toBeLessThanOrEqual(res.body.data.mrp); // Never exceed MRP
    });

    it('returns 400 for invalid productId on dynamic pricing endpoints', async () => {
      const resGet = await request(app).get('/api/pricing/dynamic/invalid');
      expect(resGet.status).toBe(400);

      const resPost = await request(app).post('/api/pricing/dynamic/invalid').send({});
      expect(resPost.status).toBe(400);
    });

    it('returns 404 when product not found on dynamic pricing', async () => {
      const res = await request(app).get('/api/pricing/dynamic/999999');
      expect(res.status).toBe(404);
    });

    it('applies dynamic price update and records price audit trail', async () => {
      const res = await request(app).post(`/api/pricing/dynamic/${testProduct.id}`).send({
        demandRatio: 1.8,
        actor: 'ADMIN_SUPERVISOR',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.newPrice).toBeDefined();

      // Verify audit history endpoint
      const histRes = await request(app).get(`/api/pricing/history/${testProduct.id}`);
      expect(histRes.status).toBe(200);
      expect(histRes.body.status).toBe('success');
      expect(histRes.body.data.history.length).toBeGreaterThanOrEqual(1);

      // Verify global history endpoint
      const histAll = await request(app).get('/api/pricing/history?limit=10');
      expect(histAll.status).toBe(200);
      expect(histAll.body.data.history).toBeInstanceOf(Array);
    });
  });

  describe('Basket Threshold Optimizer (/api/pricing/basket-optimizer)', () => {
    it('optimizes filler items for free delivery qualification', async () => {
      const res = await request(app).get('/api/pricing/basket-optimizer?targetGap=65&maxItems=3');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.targetGap).toBe(65);
      expect(res.body.data.selectedItems).toBeInstanceOf(Array);
      expect(res.body.data.selectedItems.length).toBeLessThanOrEqual(3);
      expect(res.body.data.overshoot).toBeGreaterThanOrEqual(0);
    });

    it('returns qualified status when targetGap is 0', async () => {
      const res = await request(app).get('/api/pricing/basket-optimizer?targetGap=0');

      expect(res.status).toBe(200);
      expect(res.body.data.freeDeliveryQualified).toBe(true);
      expect(res.body.data.selectedItems).toHaveLength(0);
    });

    it('returns 400 when targetGap is missing or NaN', async () => {
      const res = await request(app).get('/api/pricing/basket-optimizer');
      expect(res.status).toBe(400);
    });
  });
});
