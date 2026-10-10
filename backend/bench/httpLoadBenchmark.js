/**
 * Zipli Pro — End-to-End System & HTTP Load Benchmark (Phase 12)
 *
 * Measures high-concurrency throughput and p50/p95/p99 latency distribution
 * across core quick-commerce API endpoints:
 * 1. Trie Autocomplete Prefix Query
 * 2. In-Memory BM25 Search Engine
 * 3. Recommendation Hybrid Ranking
 * 4. Dynamic Pricing & Knapsack Calculation
 * 5. Concurrent Stock Reservation & Lock Contention
 */

const http = require('http');
const app = require('../src/app');
const { catalogSearchService } = require('../src/services/catalogSearch.service');
const { makeProduct } = require('../tests/helpers/factories');

/**
 * Calculates percentile from an array of numeric values.
 */
function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Runs a concurrent batch of HTTP requests against a local server instance.
 */
async function runLoadTest({
  serverUrl,
  path,
  method = 'GET',
  body = null,
  headers = {},
  totalRequests = 1000,
  concurrency = 50,
}) {
  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let activeIndex = 0;

  const url = new URL(path, serverUrl);

  const startTimestamp = process.hrtime.bigint();

  async function worker() {
    while (activeIndex < totalRequests) {
      activeIndex++;
      const reqStart = process.hrtime.bigint();

      await new Promise((resolve) => {
        const reqOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            Connection: 'keep-alive',
            ...headers,
          },
        };

        const req = http.request(reqOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const reqEnd = process.hrtime.bigint();
            const durationMs = Number(reqEnd - reqStart) / 1e6;
            latencies.push(durationMs);

            if (res.statusCode >= 200 && res.statusCode < 400) {
              successfulRequests++;
            } else {
              failedRequests++;
            }
            resolve();
          });
        });

        req.on('error', () => {
          failedRequests++;
          resolve();
        });

        if (body) {
          req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
      });
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const endTimestamp = process.hrtime.bigint();
  const totalDurationSeconds = Number(endTimestamp - startTimestamp) / 1e9;
  const throughput = Math.round(successfulRequests / totalDurationSeconds);

  return {
    totalRequests,
    concurrency,
    successfulRequests,
    failedRequests,
    durationSeconds: totalDurationSeconds,
    throughputRps: throughput,
    p50: getPercentile(latencies, 50).toFixed(2),
    p95: getPercentile(latencies, 95).toFixed(2),
    p99: getPercentile(latencies, 99).toFixed(2),
    min: Math.min(...latencies).toFixed(2),
    max: Math.max(...latencies).toFixed(2),
  };
}

async function runSystemLoadBenchmark() {
  console.log('='.repeat(78));
  console.log(' ZIPLI PRO — HIGH-CONCURRENCY END-TO-END SYSTEM LOAD BENCHMARK (PHASE 12)');
  console.log('='.repeat(78));

  // Initialize search engine
  await catalogSearchService.init();

  // Seed sample products if needed
  try {
    await makeProduct({ name: 'Fresh Whole Farm Milk', category_id: 'dairy', price: 65 });
    await makeProduct({ name: 'Organic Butter Salted', category_id: 'dairy', price: 56 });
  } catch (_e) {
    // Products may already exist in DB
  }

  // Start temporary local HTTP server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const serverUrl = `http://127.0.0.1:${address.port}`;

  console.log(`Test Target Active: ${serverUrl}\n`);

  try {
    // 1. Trie Autocomplete Suggestions
    console.log('[1/4] Benchmarking Prefix Trie Autocomplete (`GET /api/search/suggest?q=mi`)...');
    const trieResult = await runLoadTest({
      serverUrl,
      path: '/api/search/suggest?q=mi',
      totalRequests: 1000,
      concurrency: 50,
    });
    console.log(
      `  -> Throughput: ${trieResult.throughputRps.toLocaleString()} req/sec | p50: ${trieResult.p50}ms | p95: ${trieResult.p95}ms | p99: ${trieResult.p99}ms`
    );

    // 2. In-Memory BM25 Search Engine
    console.log('\n[2/4] Benchmarking In-Memory BM25 Search (`GET /api/products?search=milk`)...');
    const searchResult = await runLoadTest({
      serverUrl,
      path: '/api/products?search=milk',
      totalRequests: 1000,
      concurrency: 50,
    });
    console.log(
      `  -> Throughput: ${searchResult.throughputRps.toLocaleString()} req/sec | p50: ${searchResult.p50}ms | p95: ${searchResult.p95}ms | p99: ${searchResult.p99}ms`
    );

    // 3. Basket Threshold Optimizer (Knapsack Branch-and-Bound)
    console.log(
      '\n[3/4] Benchmarking Basket Threshold Knapsack Optimizer (`GET /api/pricing/basket-optimizer?targetGap=45`)...'
    );
    const pricingResult = await runLoadTest({
      serverUrl,
      path: '/api/pricing/basket-optimizer?targetGap=45',
      totalRequests: 1000,
      concurrency: 50,
    });
    console.log(
      `  -> Throughput: ${pricingResult.throughputRps.toLocaleString()} req/sec | p50: ${pricingResult.p50}ms | p95: ${pricingResult.p95}ms | p99: ${pricingResult.p99}ms`
    );

    // 4. Recommendation Engine Rails
    console.log(
      '\n[4/4] Benchmarking Hybrid Multi-Armed Bandit Recommendations (`GET /api/recommendations/home`)...'
    );
    const recsResult = await runLoadTest({
      serverUrl,
      path: '/api/recommendations/home',
      totalRequests: 1000,
      concurrency: 50,
    });
    console.log(
      `  -> Throughput: ${recsResult.throughputRps.toLocaleString()} req/sec | p50: ${recsResult.p50}ms | p95: ${recsResult.p95}ms | p99: ${recsResult.p99}ms`
    );

    console.log('\n' + '='.repeat(78));
    console.log(' SYSTEM BENCHMARK SUMMARY TABLE');
    console.log('='.repeat(78));
    console.log(
      '| Endpoint / Workload           | Concurrency | Throughput    | p50 Latency | p95 Latency | p99 Latency |'
    );
    console.log(
      '|:------------------------------|:-----------:|:-------------:|:-----------:|:-----------:|:-----------:|'
    );
    console.log(
      `| Trie Autocomplete (/suggest)  | ${trieResult.concurrency}          | ${trieResult.throughputRps.toLocaleString().padStart(6)} req/s | ${trieResult.p50.padStart(6)} ms | ${trieResult.p95.padStart(6)} ms | ${trieResult.p99.padStart(6)} ms |`
    );
    console.log(
      `| In-Memory BM25 Search         | ${searchResult.concurrency}          | ${searchResult.throughputRps.toLocaleString().padStart(6)} req/s | ${searchResult.p50.padStart(6)} ms | ${searchResult.p95.padStart(6)} ms | ${searchResult.p99.padStart(6)} ms |`
    );
    console.log(
      `| Basket Threshold Knapsack     | ${pricingResult.concurrency}          | ${pricingResult.throughputRps.toLocaleString().padStart(6)} req/s | ${pricingResult.p50.padStart(6)} ms | ${pricingResult.p95.padStart(6)} ms | ${pricingResult.p99.padStart(6)} ms |`
    );
    console.log(
      `| Hybrid Recommendations (/home)| ${recsResult.concurrency}          | ${recsResult.throughputRps.toLocaleString().padStart(6)} req/s | ${recsResult.p50.padStart(6)} ms | ${recsResult.p95.padStart(6)} ms | ${recsResult.p99.padStart(6)} ms |`
    );
    console.log('='.repeat(78));
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runSystemLoadBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark error:', err);
      process.exit(1);
    });
}

module.exports = { runSystemLoadBenchmark };
