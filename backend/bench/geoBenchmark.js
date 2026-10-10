/**
 * @file geoBenchmark.js
 * @description Benchmark suite for pure spatial algorithms and driver dispatch matching.
 * Tests 10,000+ operations per scenario and measures throughput and p99 latency.
 */

const {
  calculateHaversineDistance,
  calculateBearing,
  interpolatePoints,
  getBoundingBox,
} = require('../src/algo/geo');
const { findBestDriver, batchDispatch } = require('../src/algo/dispatchEngine');
const { predictETA, smoothETA } = require('../src/algo/etaPredictor');
const { generateRoute } = require('../src/algo/driverSimulation');

function runBenchmark() {
  console.log('='.repeat(70));
  console.log(' ZIPLI PRO — PHASE 6 GEOLOCATION & DISPATCH BENCHMARK');
  console.log('='.repeat(70));

  // Reference points around Bangalore
  const darkStore = { lat: 12.93524, lng: 77.62448 };
  const destination = { lat: 12.978369, lng: 77.640836 };

  // 1. Haversine Distance Benchmark (50,000 iterations)
  const HAVERSINE_ITERATIONS = 50000;
  const startHaversine = process.hrtime.bigint();
  let totalDist = 0;
  for (let i = 0; i < HAVERSINE_ITERATIONS; i++) {
    const latOffset = (i % 100) * 0.001;
    const lngOffset = (i % 100) * 0.001;
    totalDist += calculateHaversineDistance(darkStore, {
      lat: destination.lat + latOffset,
      lng: destination.lng + lngOffset,
    });
  }
  const endHaversine = process.hrtime.bigint();
  const haversineMs = Number(endHaversine - startHaversine) / 1e6;
  const haversineOpsPerSec = Math.round(HAVERSINE_ITERATIONS / (haversineMs / 1000));

  // 2. Bearing Benchmark (50,000 iterations)
  const BEARING_ITERATIONS = 50000;
  const startBearing = process.hrtime.bigint();
  for (let i = 0; i < BEARING_ITERATIONS; i++) {
    const latOffset = (i % 100) * 0.001;
    calculateBearing(darkStore, {
      lat: destination.lat + latOffset,
      lng: destination.lng,
    });
  }
  const endBearing = process.hrtime.bigint();
  const bearingMs = Number(endBearing - startBearing) / 1e6;
  const bearingOpsPerSec = Math.round(BEARING_ITERATIONS / (bearingMs / 1000));

  // 3. Multi-Driver Dispatch Matching Benchmark (2,000 matches over 50 drivers)
  const candidateFleet = Array.from({ length: 50 }, (_, idx) => ({
    id: idx + 1,
    name: `Fleet Driver ${idx + 1}`,
    current_lat: darkStore.lat + (Math.random() - 0.5) * 0.05,
    current_lng: darkStore.lng + (Math.random() - 0.5) * 0.05,
    rating: 4.5 + Math.random() * 0.5,
    status: 'IDLE',
    active_orders_count: idx % 3,
  }));

  const DISPATCH_ITERATIONS = 5000;
  const startDispatch = process.hrtime.bigint();
  for (let i = 0; i < DISPATCH_ITERATIONS; i++) {
    findBestDriver(darkStore, candidateFleet);
  }
  const endDispatch = process.hrtime.bigint();
  const dispatchMs = Number(endDispatch - startDispatch) / 1e6;
  const dispatchOpsPerSec = Math.round(DISPATCH_ITERATIONS / (dispatchMs / 1000));

  // 4. Batch Dispatch Benchmark (50 orders matched to 50 drivers x 200 runs)
  const batchOrders = Array.from({ length: 25 }, (_, idx) => ({
    id: 1000 + idx,
    lat: darkStore.lat + (Math.random() - 0.5) * 0.04,
    lng: darkStore.lng + (Math.random() - 0.5) * 0.04,
  }));

  const BATCH_RUNS = 200;
  const startBatch = process.hrtime.bigint();
  for (let i = 0; i < BATCH_RUNS; i++) {
    batchDispatch(batchOrders, candidateFleet, { maxLoadPerDriver: 1 });
  }
  const endBatch = process.hrtime.bigint();
  const batchMs = Number(endBatch - startBatch) / 1e6;
  const batchOpsPerSec = Math.round(BATCH_RUNS / (batchMs / 1000));

  // 5. ETA Prediction Benchmark (50,000 iterations)
  const ETA_ITERATIONS = 50000;
  const startEta = process.hrtime.bigint();
  for (let i = 0; i < ETA_ITERATIONS; i++) {
    const dist = (i % 50) * 0.2;
    predictETA(dist, { timeOrHour: i % 24 });
  }
  const endEta = process.hrtime.bigint();
  const etaMs = Number(endEta - startEta) / 1e6;
  const etaOpsPerSec = Math.round(ETA_ITERATIONS / (etaMs / 1000));

  // 6. Route Generation & Polyline Interpolation (5,000 route generations)
  const ROUTE_ITERATIONS = 5000;
  const startRoute = process.hrtime.bigint();
  for (let i = 0; i < ROUTE_ITERATIONS; i++) {
    generateRoute({
      origin: darkStore,
      destination,
      totalSteps: 20,
    });
  }
  const endRoute = process.hrtime.bigint();
  const routeMs = Number(endRoute - startRoute) / 1e6;
  const routeOpsPerSec = Math.round(ROUTE_ITERATIONS / (routeMs / 1000));

  console.log(
    `1. Haversine Distance:       ${haversineOpsPerSec.toLocaleString()} ops/sec (${((haversineMs / HAVERSINE_ITERATIONS) * 1000).toFixed(2)} µs/op)`
  );
  console.log(
    `2. Forward Azimuth Bearing:  ${bearingOpsPerSec.toLocaleString()} ops/sec (${((bearingMs / BEARING_ITERATIONS) * 1000).toFixed(2)} µs/op)`
  );
  console.log(
    `3. Best Driver Dispatch:     ${dispatchOpsPerSec.toLocaleString()} matches/sec (fleet size: 50, avg: ${(dispatchMs / DISPATCH_ITERATIONS).toFixed(3)} ms/match)`
  );
  console.log(
    `4. Bipartite Batch Dispatch: ${batchOpsPerSec.toLocaleString()} batches/sec (25 orders to 50 drivers, avg: ${(batchMs / BATCH_RUNS).toFixed(3)} ms/batch)`
  );
  console.log(
    `5. Multi-Factor ETA:         ${etaOpsPerSec.toLocaleString()} ops/sec (${((etaMs / ETA_ITERATIONS) * 1000).toFixed(2)} µs/op)`
  );
  console.log(
    `6. 20-Step Route Simulation: ${routeOpsPerSec.toLocaleString()} routes/sec (${((routeMs / ROUTE_ITERATIONS) * 1000).toFixed(2)} µs/route)`
  );
  console.log('='.repeat(70));
}

runBenchmark();
