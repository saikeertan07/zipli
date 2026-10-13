/**
 * @file dispatch.test.js
 * @description Integration tests for driver dispatch REST APIs and WebSocket real-time tracking gateway.
 */

const http = require('http');
const request = require('supertest');
const { WebSocket } = require('ws');
const app = require('../../src/app');
const { wsGateway } = require('../../src/websocket/wsServer');
const { truncateTables } = require('../setup');
const { makeUser, makeOrderFor, makeDriver } = require('../helpers/factories');

describe('Real-Time Dispatch & WebSocket Tracking Integration', () => {
  let server;
  let wsUrl;
  let port;

  beforeAll(async () => {
    // Start test HTTP + WebSocket server on ephemeral port
    server = http.createServer(app);
    wsGateway.init(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await wsGateway.close();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    await truncateTables([
      'driver_location_logs',
      'delivery_assignments',
      'order_items',
      'orders',
      'drivers',
      'users',
    ]);
  });

  describe('WebSocket Gateway Protocol', () => {
    it('connects, receives CONNECTED, replies to PING, and subscribes to rooms', async () => {
      const client = new WebSocket(wsUrl);
      const messages = [];

      client.on('message', (raw) => {
        messages.push(JSON.parse(raw.toString()));
      });

      await new Promise((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
      });

      // Wait for CONNECTED greeting
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'CONNECTED')).toBe(true);

      // Send PING
      client.send(JSON.stringify({ type: 'PING' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'PONG')).toBe(true);

      // Send SUBSCRIBE to order room
      client.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'order:55' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'SUBSCRIBED' && m.room === 'order:55')).toBe(true);

      // Send UNSUBSCRIBE
      client.send(JSON.stringify({ type: 'UNSUBSCRIBE', room: 'order:55' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'UNSUBSCRIBED' && m.room === 'order:55')).toBe(true);

      // Test invalid JSON
      client.send('invalid json string');
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'ERROR' && m.message === 'Invalid JSON payload')).toBe(
        true
      );

      // Test unknown command
      client.send(JSON.stringify({ type: 'NON_EXISTENT_CMD' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(messages.some((m) => m.type === 'UNKNOWN_COMMAND')).toBe(true);

      client.close();
    });

    it('authenticates socket via AUTH message and query string token', async () => {
      const { user, token } = await makeUser();

      // Test 1: Query string token
      const queryClient = new WebSocket(`${wsUrl}?token=${token}&orderId=99`);
      const queryMsgs = [];
      queryClient.on('message', (raw) => queryMsgs.push(JSON.parse(raw.toString())));

      await new Promise((resolve, reject) => {
        queryClient.on('open', resolve);
        queryClient.on('error', reject);
      });

      await new Promise((r) => setTimeout(r, 100));

      const greeting = queryMsgs.find((m) => m.type === 'CONNECTED');
      expect(greeting).toBeDefined();
      expect(greeting.authenticated).toBe(true);
      queryClient.close();

      // Test 2: In-band AUTH message
      const authClient = new WebSocket(wsUrl);
      const authMsgs = [];
      authClient.on('message', (raw) => authMsgs.push(JSON.parse(raw.toString())));

      await new Promise((resolve) => authClient.on('open', resolve));

      authClient.send(JSON.stringify({ type: 'AUTH', token }));
      await new Promise((r) => setTimeout(r, 100));

      const authResp = authMsgs.find((m) => m.type === 'AUTHENTICATED');
      expect(authResp).toBeDefined();

      expect(authResp.userId).toBe(user.id);

      // Invalid token auth
      authClient.send(JSON.stringify({ type: 'AUTH', token: 'invalid_token' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(authMsgs.some((m) => m.type === 'AUTH_ERROR')).toBe(true);

      // Missing token auth
      authClient.send(JSON.stringify({ type: 'AUTH' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(
        authMsgs.some((m) => m.type === 'AUTH_ERROR' && m.message === 'Token is required')
      ).toBe(true);

      authClient.close();
    });
  });

  describe('REST Endpoints & Live Push Updates', () => {
    it('queries nearby available drivers with distance calculation', async () => {
      await makeDriver({
        name: 'Nearby Driver',
        current_lat: 12.936,
        current_lng: 77.625,
        status: 'IDLE',
      });
      await makeDriver({
        name: 'Far Driver',
        current_lat: 13.5, // > 50km
        current_lng: 77.6,
        status: 'IDLE',
      });

      const res = await request(app)
        .get('/api/delivery/drivers/nearby')
        .query({ lat: 12.93524, lng: 77.62448, radiusKm: 5 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Nearby Driver');
      expect(res.body.data[0].distance_km).toBeLessThan(1.0);
    });

    it('validates coordinates on nearby drivers lookup', async () => {
      const res = await request(app).get('/api/delivery/drivers/nearby');
      expect(res.status).toBe(400);
    });

    it('assigns driver to order and pushes live GPS updates over WebSocket', async () => {
      const { user } = await makeUser();
      const driver = await makeDriver({
        name: 'Quick Rider',
        current_lat: 12.93524,
        current_lng: 77.62448,
        status: 'IDLE',
        rating: 4.95,
      });

      const { order } = await makeOrderFor(user.id, [], {
        status: 'confirmed',
        delivery_address: '100 Feet Rd, Indiranagar',
      });

      // Connect WebSocket client to track this order
      const client = new WebSocket(wsUrl);
      await new Promise((resolve) => client.on('open', resolve));

      const receivedPushEvents = [];
      client.on('message', (raw) => receivedPushEvents.push(JSON.parse(raw.toString())));

      // Subscribe to order room
      client.send(JSON.stringify({ type: 'SUBSCRIBE', room: `order:${order.id}` }));
      await new Promise((r) => setTimeout(r, 100));

      // 1. Assign driver
      const assignRes = await request(app)
        .post(`/api/delivery/assign/${order.id}`)
        .send({ driverId: driver.id });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.status).toBe('success');
      expect(assignRes.body.data.driver.id).toBe(driver.id);
      expect(assignRes.body.data.eta).toBeDefined();

      // Check if client received ORDER_ASSIGNED push event
      await new Promise((r) => setTimeout(r, 150));
      expect(receivedPushEvents.some((e) => e.type === 'ORDER_ASSIGNED')).toBe(true);

      // 2. Query tracking snapshot
      const trackRes = await request(app).get(`/api/delivery/order/${order.id}/track`);
      expect(trackRes.status).toBe(200);
      expect(trackRes.body.status).toBe('success');
      expect(trackRes.body.data.assignment).toBeDefined();
      expect(trackRes.body.data.assignment.driver.id).toBe(driver.id);
      expect(trackRes.body.data.polyline.length).toBeGreaterThan(0);

      // 3. Driver ingests GPS ping
      const pingRes = await request(app).post('/api/delivery/driver/location').send({
        driverId: driver.id,
        orderId: order.id,
        lat: 12.94,
        lng: 77.63,
        speedKmh: 24.5,
      });

      expect(pingRes.status).toBe(200);
      expect(pingRes.body.data.distanceRemainingKm).toBeDefined();
      expect(pingRes.body.data.estimatedDurationMin).toBeDefined();

      // Verify WebSocket client got real-time DRIVER_LOCATION_UPDATE
      await new Promise((r) => setTimeout(r, 150));
      const locEvent = receivedPushEvents.find((e) => e.type === 'DRIVER_LOCATION_UPDATE');
      expect(locEvent).toBeDefined();
      expect(locEvent.lat).toBe(12.94);
      expect(locEvent.lng).toBe(77.63);

      client.close();
    });

    it('runs and stops simulated route for an order', async () => {
      const { user } = await makeUser();
      await makeDriver({
        current_lat: 12.93524,
        current_lng: 77.62448,
        status: 'IDLE',
      });

      const { order } = await makeOrderFor(user.id, [], {
        status: 'confirmed',
      });

      // Start simulation
      const startRes = await request(app)
        .post(`/api/delivery/simulate/${order.id}`)
        .send({ intervalMs: 200 });

      expect(startRes.status).toBe(200);
      expect(startRes.body.status).toBe('success');
      expect(startRes.body.data.started).toBe(true);

      // Stop simulation
      const stopRes = await request(app).post(`/api/delivery/simulate/${order.id}/stop`);
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.message).toBe('Simulation stopped');
    });

    it('returns error when tracking non-existent order or invalid parameters', async () => {
      const notFound = await request(app).get('/api/delivery/order/999999/track');
      expect(notFound.status).toBe(404);

      const invalidId = await request(app).get('/api/delivery/order/abc/track');
      expect(invalidId.status).toBe(400);

      const missingDriverId = await request(app)
        .post('/api/delivery/driver/location')
        .send({ lat: 12.9, lng: 77.6 });
      expect(missingDriverId.status).toBe(400);

      const missingCoords = await request(app)
        .post('/api/delivery/driver/location')
        .send({ driverId: 1 });
      expect(missingCoords.status).toBe(400);
    });

    it('verifies delivery completion SLA geofence (150m)', async () => {
      const { user } = await makeUser();
      const { order } = await makeOrderFor(user.id, [], {
        status: 'out_for_delivery',
        delivery_address: '100 Feet Rd, Indiranagar',
      });

      const trackRes = await request(app).get(`/api/delivery/order/${order.id}/track`);
      const dest = trackRes.body.data.destination;

      // 1. Within 150m (approx 44m offset)
      const nearRes = await request(app)
        .post(`/api/delivery/order/${order.id}/verify-geofence`)
        .send({
          driverLat: dest.lat + 0.0004,
          driverLng: dest.lng,
        });

      expect(nearRes.status).toBe(200);
      expect(nearRes.body.status).toBe('success');
      expect(nearRes.body.data.isWithinGeofence).toBe(true);
      expect(nearRes.body.data.maxAllowedMeters).toBe(150);

      // 2. Far away (> 150m)
      const farRes = await request(app)
        .post(`/api/delivery/order/${order.id}/verify-geofence`)
        .send({
          driverLat: dest.lat + 0.05,
          driverLng: dest.lng + 0.05,
        });

      expect(farRes.status).toBe(200);
      expect(farRes.body.data.isWithinGeofence).toBe(false);
      expect(farRes.body.data.distanceMeters).toBeGreaterThan(150);
    });
  });
});
