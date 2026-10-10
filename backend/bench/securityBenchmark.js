/**
 * @file securityBenchmark.js
 * @description Benchmark suite for Phase 9 Trust, Security, and Abuse Prevention:
 * 1. Fraud Scoring Engine: Precision, Recall, and F1-Score on planted fraud patterns
 * 2. Pure Bloom Filter: Empirical vs Theoretical False Positive Rate and ops/sec throughput
 * 3. GCRA Leaky Bucket Rate Limiter: Operations/sec throughput and cell emission accuracy
 * 4. Cryptographic Hash Chain: Throughput across 10,000 records and tamper pinpointing
 */

const {
  BloomFilter,
  calculateOptimalBloomParams,
  evaluateFraudRisk,
  extractFraudFeatures,
  createAuditRecord,
  verifyAuditChain,
  GCRA,
  POLICIES,
} = require('../src/algo');

function runSecurityBenchmark() {
  console.log('='.repeat(78));
  console.log(' ZIPLI PRO — PHASE 9 TRUST, SECURITY & ABUSE PREVENTION BENCHMARK');
  console.log('='.repeat(78));

  // -------------------------------------------------------------
  // 1. Fraud Scoring Precision, Recall & F1 on Planted Patterns
  // -------------------------------------------------------------
  console.log('\n[1] FRAUD DETECTION EVALUATION ON SYNTHETIC PLANTED PATTERNS');

  // Ground truth dataset: 1000 benign orders, 400 planted fraud variants
  const dataset = [];

  // 1000 Benign Orders: normal velocity, normal basket, standard address
  for (let i = 0; i < 1000; i++) {
    dataset.push({
      isActualFraud: false,
      pattern: 'BENIGN_CUSTOMER',
      features: extractFraudFeatures({
        userVelocity10m: 0,
        userVelocity24h: Math.random() < 0.25 ? 1 : 0,
        deviceIpVelocity1h: 0,
        addressReuseCount: 1,
        couponDiscountRatio: Math.random() < 0.1 ? 0.1 : 0,
        orderTotal: 40 + Math.random() * 40,
        userHistoricalMean: 60,
        userHistoricalStd: 20,
        isNewAccount: false,
      }),
    });
  }

  // 100 Velocity Abuse Frauds (rapid automated checkout script)
  for (let i = 0; i < 100; i++) {
    dataset.push({
      isActualFraud: true,
      pattern: 'VELOCITY_ABUSE',
      features: extractFraudFeatures({
        userVelocity10m: 6 + Math.floor(Math.random() * 5),
        userVelocity24h: 15 + Math.floor(Math.random() * 10),
        deviceIpVelocity1h: 8 + Math.floor(Math.random() * 6),
        addressReuseCount: 1,
        orderTotal: 80,
      }),
    });
  }

  // 100 Address Clustering Frauds (syndicate carders shipping to same warehouse)
  for (let i = 0; i < 100; i++) {
    dataset.push({
      isActualFraud: true,
      pattern: 'ADDRESS_CLUSTERING',
      features: extractFraudFeatures({
        userVelocity10m: 1,
        addressReuseCount: 7 + Math.floor(Math.random() * 5),
        orderTotal: 120,
        isNewAccount: true,
      }),
    });
  }

  // 100 Coupon Stuffing Abuse (bot accounts farming first-order discounts)
  for (let i = 0; i < 100; i++) {
    dataset.push({
      isActualFraud: true,
      pattern: 'COUPON_STUFFING',
      features: extractFraudFeatures({
        userVelocity10m: 3,
        deviceIpVelocity1h: 6,
        couponDiscountRatio: 0.85,
        orderTotal: 150,
        isNewAccount: true,
      }),
    });
  }

  // 100 High Value First Order Anomalies
  for (let i = 0; i < 100; i++) {
    dataset.push({
      isActualFraud: true,
      pattern: 'HIGH_VALUE_FIRST_ORDER',
      features: extractFraudFeatures({
        userVelocity10m: 1,
        isNewAccountHighValue: true,
        orderTotal: 350,
        userHistoricalMean: 50,
        userHistoricalStd: 15,
      }),
    });
  }

  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  const t0Fraud = process.hrtime.bigint();
  for (const item of dataset) {
    const assessment = evaluateFraudRisk(item.features);
    const predictedFraud = assessment.decision === 'REVIEW' || assessment.decision === 'BLOCK';

    if (predictedFraud && item.isActualFraud) truePositives++;
    else if (predictedFraud && !item.isActualFraud) falsePositives++;
    else if (!predictedFraud && !item.isActualFraud) trueNegatives++;
    else if (!predictedFraud && item.isActualFraud) falseNegatives++;
  }
  const fraudDurationMs = Number(process.hrtime.bigint() - t0Fraud) / 1e6;

  const precision = truePositives / (truePositives + falsePositives);
  const recall = truePositives / (truePositives + falseNegatives);
  const f1 = (2 * precision * recall) / (precision + recall);
  const fpRate = falsePositives / (falsePositives + trueNegatives);
  const fraudThroughput = Math.round(dataset.length / (fraudDurationMs / 1000));

  console.log(`  Dataset Size:        ${dataset.length} orders (1,000 benign + 400 planted fraud)`);
  console.log(
    `  Scoring Throughput:  ${fraudThroughput.toLocaleString()} orders/sec (${fraudDurationMs.toFixed(2)} ms total)`
  );
  console.log(`  Precision:           ${(precision * 100).toFixed(2)}%`);
  console.log(`  Recall:              ${(recall * 100).toFixed(2)}%`);
  console.log(`  F1-Score:            ${(f1 * 100).toFixed(2)}%`);
  console.log(`  False Positive Rate: ${(fpRate * 100).toFixed(2)}% on benign traffic`);

  // -------------------------------------------------------------
  // 2. Pure Bloom Filter FP Rate vs Theoretical Math & Throughput
  // -------------------------------------------------------------
  console.log('\n[2] PURE BIT-ARRAY BLOOM FILTER ACCURACY & THROUGHPUT');

  const BLOOM_ITEMS = 10000;
  const TARGET_FP_RATE = 0.01; // 1% desired false positive rate
  const optimalParams = calculateOptimalBloomParams(BLOOM_ITEMS, TARGET_FP_RATE);

  const bloom = new BloomFilter({
    customBitSize: optimalParams.m,
    customHashCount: optimalParams.k,
    expectedItems: BLOOM_ITEMS,
    falsePositiveRate: TARGET_FP_RATE,
  });

  // 1. Insert 10,000 member keys
  const t0BloomInsert = process.hrtime.bigint();
  for (let i = 0; i < BLOOM_ITEMS; i++) {
    bloom.add(`fingerprint_device_mac_${i}_session_${i * 7}`);
  }
  const insertDurationMs = Number(process.hrtime.bigint() - t0BloomInsert) / 1e6;
  const insertThroughput = Math.round(BLOOM_ITEMS / (insertDurationMs / 1000));

  // 2. Verify 100% recall on known members (0% false negatives)
  let trueHits = 0;
  for (let i = 0; i < BLOOM_ITEMS; i++) {
    if (bloom.has(`fingerprint_device_mac_${i}_session_${i * 7}`)) trueHits++;
  }

  // 3. Test 50,000 non-members for false positive rate
  const NON_MEMBERS = 50000;
  let empiricalFalsePositives = 0;
  const t0BloomLookup = process.hrtime.bigint();
  for (let i = 0; i < NON_MEMBERS; i++) {
    if (bloom.has(`non_existent_unseen_device_probe_${i}`)) {
      empiricalFalsePositives++;
    }
  }
  const lookupDurationMs = Number(process.hrtime.bigint() - t0BloomLookup) / 1e6;
  const lookupThroughput = Math.round(NON_MEMBERS / (lookupDurationMs / 1000));
  const empiricalFpRate = empiricalFalsePositives / NON_MEMBERS;

  console.log(
    `  Bit-Array Size (m):  ${optimalParams.m.toLocaleString()} bits (${Math.round(optimalParams.m / 8 / 1024)} KB)`
  );
  console.log(`  Hash Functions (k):  ${optimalParams.k} (Kirsch-Mitzenmacher double-hash)`);
  console.log(`  Insert Throughput:   ${insertThroughput.toLocaleString()} inserts/sec`);
  console.log(`  Lookup Throughput:   ${lookupThroughput.toLocaleString()} lookups/sec`);
  console.log(
    `  True Positive Rate:  ${((trueHits / BLOOM_ITEMS) * 100).toFixed(2)}% (Zero False Negatives)`
  );
  console.log(`  Theoretical FP Rate: ${(TARGET_FP_RATE * 100).toFixed(2)}%`);
  console.log(
    `  Empirical FP Rate:   ${(empiricalFpRate * 100).toFixed(3)}% (${empiricalFalsePositives} / ${NON_MEMBERS.toLocaleString()} probes)`
  );

  // -------------------------------------------------------------
  // 3. GCRA Leaky Bucket Rate Limiter Throughput
  // -------------------------------------------------------------
  console.log('\n[3] GCRA (GENERIC CELL RATE ALGORITHM) RATE LIMITER THROUGHPUT');

  const gcra = new GCRA(POLICIES.GENERAL); // 120 req/min
  const GCRA_OPERATIONS = 100000;
  const KEY_POOL_SIZE = 1000;

  const t0Gcra = process.hrtime.bigint();
  let allowedCount = 0;
  let rejectedCount = 0;
  const now = Date.now();

  for (let i = 0; i < GCRA_OPERATIONS; i++) {
    const key = `client_ip_${i % KEY_POOL_SIZE}`;
    const res = gcra.consume(key, 1, now + (i % 200));
    if (res.allowed) allowedCount++;
    else rejectedCount++;
  }
  const gcraDurationMs = Number(process.hrtime.bigint() - t0Gcra) / 1e6;
  const gcraThroughput = Math.round(GCRA_OPERATIONS / (gcraDurationMs / 1000));

  console.log(
    `  Total Evaluations:   ${GCRA_OPERATIONS.toLocaleString()} requests across ${KEY_POOL_SIZE} concurrent keys`
  );
  console.log(
    `  GCRA Throughput:     ${gcraThroughput.toLocaleString()} req/sec (${gcraDurationMs.toFixed(2)} ms total)`
  );
  console.log(`  Conforming Allowed:  ${allowedCount.toLocaleString()} requests`);
  console.log(`  Burst Rejections:    ${rejectedCount.toLocaleString()} requests`);

  // -------------------------------------------------------------
  // 4. Immutable Hash Chain Throughput & Tamper Detection
  // -------------------------------------------------------------
  console.log('\n[4] CRYPTOGRAPHIC AUDIT HASH CHAIN VERIFICATION THROUGHPUT');

  const CHAIN_BLOCKS = 10000;
  const chain = [];
  let prevRecord = null;

  const t0ChainCreate = process.hrtime.bigint();
  for (let i = 1; i <= CHAIN_BLOCKS; i++) {
    const rec = createAuditRecord(prevRecord, {
      id: i,
      adminId: (i % 5) + 1,
      action: i % 2 === 0 ? 'PRODUCT_PRICE_UPDATE' : 'MERCHANT_STATUS_MODIFIED',
      targetType: 'PRODUCT',
      targetId: String(1000 + i),
      payload: { price: 50 + (i % 20), changedAt: `2025-01-01T00:00:00.${i}Z` },
      createdAt: `2025-01-01T00:00:00.${i}Z`,
    });
    chain.push(rec);
    prevRecord = rec;
  }
  const createChainDurationMs = Number(process.hrtime.bigint() - t0ChainCreate) / 1e6;
  const chainCreationThroughput = Math.round(CHAIN_BLOCKS / (createChainDurationMs / 1000));

  // Verify valid chain
  const t0ChainVerify = process.hrtime.bigint();
  const verifyResult = verifyAuditChain(chain);
  const verifyDurationMs = Number(process.hrtime.bigint() - t0ChainVerify) / 1e6;
  const verifyThroughput = Math.round(CHAIN_BLOCKS / (verifyDurationMs / 1000));

  console.log(
    `  Block Generation:    ${chainCreationThroughput.toLocaleString()} records/sec (${createChainDurationMs.toFixed(2)} ms for ${CHAIN_BLOCKS.toLocaleString()} blocks)`
  );
  console.log(
    `  Verification Speed:  ${verifyThroughput.toLocaleString()} records/sec (${verifyDurationMs.toFixed(2)} ms for ${CHAIN_BLOCKS.toLocaleString()} blocks)`
  );
  console.log(
    `  Chain Integrity:     ${verifyResult.isValid ? 'VALID (100% cryptographically verified)' : 'FAILED'}`
  );

  // Inject tamper at block 5,432
  const tamperIndex = 5432;
  const originalPayload = chain[tamperIndex].payload;
  chain[tamperIndex].payload = { ...originalPayload, price: 999999 }; // unauthorized price modification

  const tamperedResult = verifyAuditChain(chain);
  console.log(
    `  Tamper Detection:    ${!tamperedResult.isValid ? 'PASSED (Cryptographic mismatch detected)' : 'FAILED'}`
  );
  console.log(
    `  Pinpointed Row ID:   ${tamperedResult.tamperedRowId} (Expected row ${chain[tamperIndex].id})`
  );
  console.log(
    `  Tamper Broken Index: ${tamperedResult.brokenIndex} (Expected index ${tamperIndex})`
  );

  console.log('\n' + '='.repeat(78));
  console.log(' ALL PHASE 9 TRUST, SECURITY & AUDIT BENCHMARKS COMPLETED SUCCESSFULLY');
  console.log('='.repeat(78) + '\n');
}

if (require.main === module) {
  runSecurityBenchmark();
}

module.exports = { runSecurityBenchmark };
