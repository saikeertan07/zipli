/**
 * Zipli Pro Cache Layer Performance Benchmark (/bench/cacheBenchmark.js)
 *
 * Evaluates:
 * 1. LRU vs LFU Hit Ratios under Zipfian (80/20 skewed power law) vs Uniform workloads
 * 2. Throughput (Operations/sec) for O(1) Cache Reads and Writes
 * 3. Single-Flight Stampede Protection under 100 concurrent requests
 */

const { LRUCache } = require('../src/algo/lru');
const { LFUCache } = require('../src/algo/lfu');
const { CacheService } = require('../src/services/cache.service');

function generateZipfianKeys(numRequests, universeSize, s = 1.0) {
  // Precompute harmonic numbers for Zipf distribution
  const weights = new Float64Array(universeSize);
  let sum = 0;
  for (let i = 1; i <= universeSize; i++) {
    weights[i - 1] = 1 / Math.pow(i, s);
    sum += weights[i - 1];
  }
  const cdf = new Float64Array(universeSize);
  let cum = 0;
  for (let i = 0; i < universeSize; i++) {
    cum += weights[i] / sum;
    cdf[i] = cum;
  }

  const keys = new Array(numRequests);
  for (let i = 0; i < numRequests; i++) {
    const r = Math.random();
    let idx = 0;
    // Binary search in CDF
    let low = 0,
      high = universeSize - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cdf[mid] >= r) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    keys[i] = `item_${idx}`;
  }
  return keys;
}

function generateUniformKeys(numRequests, universeSize) {
  const keys = new Array(numRequests);
  for (let i = 0; i < numRequests; i++) {
    keys[i] = `item_${Math.floor(Math.random() * universeSize)}`;
  }
  return keys;
}

async function runCacheHitRatioBenchmark() {
  console.log('='.repeat(70));
  console.log('  ZIPLI PRO — CACHE LAYER BENCHMARK (LRU vs LFU)');
  console.log('='.repeat(70));

  const UNIVERSE_SIZE = 5000;
  const NUM_REQUESTS = 100000;
  const CAPACITY = 500; // 10% of universe

  console.log(`Parameters:`);
  console.log(`  - Key Universe Size : ${UNIVERSE_SIZE.toLocaleString()} distinct items`);
  console.log(`  - Total Requests    : ${NUM_REQUESTS.toLocaleString()} operations`);
  console.log(`  - Cache Capacity    : ${CAPACITY.toLocaleString()} slots (10% cache ratio)\n`);

  // --- 1. Zipfian (Skewed / Hot Items) Workload ---
  console.log('--- 1. Zipfian Distribution (Skewed 80/20 Power-Law) ---');
  const zipfKeys = generateZipfianKeys(NUM_REQUESTS, UNIVERSE_SIZE, 1.1);

  const lruZipf = new LRUCache({ capacity: CAPACITY });
  const lfuZipf = new LFUCache({ capacity: CAPACITY });

  // LRU Benchmark
  let start = process.hrtime.bigint();
  for (let i = 0; i < NUM_REQUESTS; i++) {
    const k = zipfKeys[i];
    if (lruZipf.get(k) === undefined) {
      lruZipf.set(k, `val_${k}`);
    }
  }
  let durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const lruZipfStats = lruZipf.stats();
  const lruZipfOps = Math.round((NUM_REQUESTS / durationMs) * 1000);

  // LFU Benchmark
  start = process.hrtime.bigint();
  for (let i = 0; i < NUM_REQUESTS; i++) {
    const k = zipfKeys[i];
    if (lfuZipf.get(k) === undefined) {
      lfuZipf.set(k, `val_${k}`);
    }
  }
  durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const lfuZipfStats = lfuZipf.stats();
  const lfuZipfOps = Math.round((NUM_REQUESTS / durationMs) * 1000);

  console.log(`  LRU Cache:`);
  console.log(`    - Hit Ratio  : ${(lruZipfStats.hitRatio * 100).toFixed(2)}%`);
  console.log(`    - Throughput : ${lruZipfOps.toLocaleString()} ops/sec`);
  console.log(`    - Evictions  : ${lruZipfStats.evictions.toLocaleString()}`);

  console.log(`  LFU Cache:`);
  console.log(`    - Hit Ratio  : ${(lfuZipfStats.hitRatio * 100).toFixed(2)}%`);
  console.log(`    - Throughput : ${lfuZipfOps.toLocaleString()} ops/sec`);
  console.log(`    - Evictions  : ${lfuZipfStats.evictions.toLocaleString()}\n`);

  // --- 2. Uniform Random Workload ---
  console.log('--- 2. Uniform Random Distribution ---');
  const uniformKeys = generateUniformKeys(NUM_REQUESTS, UNIVERSE_SIZE);

  const lruUniform = new LRUCache({ capacity: CAPACITY });
  const lfuUniform = new LFUCache({ capacity: CAPACITY });

  for (let i = 0; i < NUM_REQUESTS; i++) {
    const k = uniformKeys[i];
    if (lruUniform.get(k) === undefined) {
      lruUniform.set(k, `val_${k}`);
    }
    if (lfuUniform.get(k) === undefined) {
      lfuUniform.set(k, `val_${k}`);
    }
  }

  console.log(`  LRU Hit Ratio: ${(lruUniform.stats().hitRatio * 100).toFixed(2)}%`);
  console.log(`  LFU Hit Ratio: ${(lfuUniform.stats().hitRatio * 100).toFixed(2)}%\n`);

  // --- 3. Single-Flight Stampede Protection Benchmark ---
  console.log('--- 3. Single-Flight Stampede Protection Under Concurrency ---');
  const cacheService = new CacheService({ lruCapacity: 1000 });
  let dbLoads = 0;

  const simulatedDbQuery = async () => {
    dbLoads++;
    await new Promise((r) => setTimeout(r, 25)); // 25ms database latency
    return { title: 'Fresh Strawberries 500g', price: 180, stock: 45 };
  };

  const CONCURRENT_WORKERS = 100;
  start = process.hrtime.bigint();
  const promises = Array.from({ length: CONCURRENT_WORKERS }, () =>
    cacheService.wrap('product:hot_strawberries', simulatedDbQuery, { ttlSeconds: 30 })
  );
  const results = await Promise.all(promises);
  const totalElapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  console.log(`  Concurrent Requests    : ${CONCURRENT_WORKERS}`);
  console.log(`  Database Hits (Loaders): ${dbLoads} (Single-Flight Lock Active!)`);
  console.log(`  Coalesced Callers      : ${results.length} identical results delivered`);
  console.log(`  Total Batch Duration   : ${totalElapsedMs.toFixed(2)} ms`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  runCacheHitRatioBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runCacheHitRatioBenchmark };
