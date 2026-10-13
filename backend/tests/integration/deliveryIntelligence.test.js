const request = require('supertest');
const app = require('../../src/app');

describe('Delivery Intelligence API Integration Tests (/api/delivery-intel)', () => {
  const storeHub = { lat: 12.935, lng: 77.624 }; // Koramangala Hub

  describe('POST /api/delivery-intel/route', () => {
    it('calculates optimal path using A* routing', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/route')
        .send({
          start: { lat: 12.925, lng: 77.615 },
          target: { lat: 12.94, lng: 77.63 },
          mode: 'bike',
          algo: 'astar',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.distanceKm).toBeGreaterThan(0);
      expect(res.body.data.timeMinutes).toBeGreaterThan(0);
      expect(res.body.data.path).toBeInstanceOf(Array);
      expect(res.body.data.path.length).toBeGreaterThan(1);
      expect(res.body.data.algoUsed).toBe('astar');
    });

    it('calculates path using Dijkstra algorithm', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/route')
        .send({
          start: { lat: 12.925, lng: 77.615 },
          target: { lat: 12.94, lng: 77.63 },
          mode: 'car',
          algo: 'dijkstra',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.algoUsed).toBe('dijkstra');
      expect(res.body.data.distanceKm).toBeGreaterThan(0);
    });

    it('calculates path using Bidirectional Dijkstra algorithm', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/route')
        .send({
          start: { lat: 12.925, lng: 77.615 },
          target: { lat: 12.94, lng: 77.63 },
          mode: 'foot',
          algo: 'bidirectional',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.algoUsed).toBe('bidirectional');
      expect(res.body.data.distanceKm).toBeGreaterThan(0);
    });

    it('returns 400 when start or target is missing', async () => {
      const res = await request(app).post('/api/delivery-intel/route').send({ start: storeHub });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Both start and target must be provided/);
    });

    it('returns 400 when start coordinate is invalid', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/route')
        .send({
          start: { lat: 'invalid', lng: 77.0 },
          target: storeHub,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('POST /api/delivery-intel/match', () => {
    it('optimally matches orders to riders using Hungarian algorithm', async () => {
      const orders = [
        { id: 'ord-1', lat: 12.936, lng: 77.625 },
        { id: 'ord-2', lat: 12.938, lng: 77.627 },
        { id: 'ord-3', lat: 12.932, lng: 77.621 },
      ];
      const riders = [
        { id: 'rider-A', lat: 12.937, lng: 77.626 },
        { id: 'rider-B', lat: 12.931, lng: 77.62 },
        { id: 'rider-C', lat: 12.939, lng: 77.629 },
      ];

      const res = await request(app).post('/api/delivery-intel/match').send({ orders, riders });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.assignments).toHaveLength(3);
      expect(res.body.data.totalCostKm).toBeGreaterThan(0);
      expect(res.body.data.greedyCostKm).toBeGreaterThanOrEqual(res.body.data.totalCostKm);
      expect(res.body.data.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it('handles empty orders or riders arrays safely', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/match')
        .send({ orders: [], riders: [] });

      expect(res.status).toBe(200);
      expect(res.body.data.assignments).toEqual([]);
      expect(res.body.data.totalCostKm).toBe(0);
    });

    it('returns 400 if orders or riders is not an array', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/match')
        .send({ orders: 'not-an-array', riders: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/must be arrays/);
    });
  });

  describe('POST /api/delivery-intel/batch', () => {
    it('partitions and sequences multi-order batches using Clarke-Wright + TSP', async () => {
      const orders = [
        { id: 'ord-101', lat: 12.936, lng: 77.625 },
        { id: 'ord-102', lat: 12.9362, lng: 77.6252 },
        { id: 'ord-103', lat: 12.9364, lng: 77.6254 },
        { id: 'ord-104', lat: 12.94, lng: 77.63 },
      ];

      const res = await request(app)
        .post('/api/delivery-intel/batch')
        .send({
          depot: storeHub,
          orders,
          options: { maxOrdersPerTrip: 3 },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.trips.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalDistanceKm).toBeGreaterThan(0);
      expect(res.body.data.baselineDistanceKm).toBeGreaterThan(0);
      expect(res.body.data.savingsPercent).toBeGreaterThan(0);
    });

    it('handles empty orders gracefully', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/batch')
        .send({ depot: storeHub, orders: [] });

      expect(res.status).toBe(200);
      expect(res.body.data.trips).toEqual([]);
      expect(res.body.data.totalDistanceKm).toBe(0);
    });

    it('returns 400 when depot is missing or invalid', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/batch')
        .send({ orders: [{ id: 1, lat: 12.9, lng: 77.6 }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Valid depot coordinate required/);
    });
  });

  describe('GET and POST /api/delivery-intel/slots', () => {
    it('retrieves all 24 delivery slots with capacity summary', async () => {
      const res = await request(app).get('/api/delivery-intel/slots');

      expect(res.status).toBe(200);
      expect(res.body.data.slots).toHaveLength(24);
      expect(res.body.data.totalAvailableCapacity).toBeGreaterThan(0);
      expect(res.body.data.minSlotCapacity).toBeGreaterThanOrEqual(0);
    });

    it('reserves a delivery slot and updates available capacity', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/slots/reserve')
        .send({ slotIndex: 14, count: 2 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.slotIndex).toBe(14);
      expect(res.body.data.reservedCount).toBe(2);
    });

    it('returns 400 for invalid slotIndex', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/slots/reserve')
        .send({ slotIndex: 99 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Valid slotIndex/);
    });

    it('returns 409 when slot capacity is exhausted', async () => {
      // Exceed available capacity in slot 14
      const res = await request(app)
        .post('/api/delivery-intel/slots/reserve')
        .send({ slotIndex: 14, count: 1000 });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Insufficient slot capacity/);
    });
  });

  describe('POST /api/delivery-intel/eta and /api/delivery-intel/eta/feedback', () => {
    it('predicts learned delivery ETA and confidence interval', async () => {
      const res = await request(app).post('/api/delivery-intel/eta').send({
        distanceKm: 3.2,
        itemsCount: 4,
        storeQueueLength: 2,
        isRaining: false,
        hourOfDay: 18,
        dayOfWeek: 5,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.predictedEtaMinutes).toBeGreaterThan(0);
      expect(res.body.data.confidenceLower).toBeLessThanOrEqual(res.body.data.predictedEtaMinutes);
      expect(res.body.data.confidenceUpper).toBeGreaterThanOrEqual(
        res.body.data.predictedEtaMinutes
      );
      expect(res.body.data.confidenceRangeText).toMatch(/\d+ - \d+ mins/);
    });

    it('ingests delivery completion observation and updates online regression weights', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/eta/feedback')
        .send({
          context: { distanceKm: 2.0, itemsCount: 1 },
          actualMinutes: 14.5,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.absError).toBeDefined();
      expect(res.body.data.mae).toBeDefined();
    });

    it('returns 400 when actualMinutes is missing or non-positive', async () => {
      const res = await request(app)
        .post('/api/delivery-intel/eta/feedback')
        .send({ context: {}, actualMinutes: -5 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Positive actualMinutes duration required/);
    });
  });

  describe('GET and POST /api/delivery-intel/capacity', () => {
    it('returns dispatch surge capacity gauge and rolling order rate', async () => {
      const res = await request(app).get('/api/delivery-intel/capacity');

      expect(res.status).toBe(200);
      expect(res.body.data.burstCapacity).toBe(30);
      expect(res.body.data.availableTokens).toBeGreaterThanOrEqual(0);
      expect(res.body.data.fillPercent).toBeGreaterThanOrEqual(0);
      expect(res.body.data.isThrottled).toBeDefined();
    });

    it('consumes capacity tokens and throttles with 429 when exhausted', async () => {
      // Consume tokens
      const resAllowed = await request(app)
        .post('/api/delivery-intel/capacity/consume')
        .send({ count: 2 });

      expect(resAllowed.status).toBe(200);
      expect(resAllowed.body.data.allowed).toBe(true);

      // Consume huge burst to exhaust token bucket
      const resBurst = await request(app)
        .post('/api/delivery-intel/capacity/consume')
        .send({ count: 100 });

      expect(resBurst.status).toBe(429);
      expect(resBurst.headers['retry-after']).toBeDefined();
      expect(resBurst.body.data.allowed).toBe(false);
    });
  });
});
