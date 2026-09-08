#!/usr/bin/env node
/**
 * @file reconcile-payments.js
 * @description Standalone CLI runner for payment reconciliation job.
 */

const { reconcileStuckPayments } = require('../src/services/paymentReconcile.service');
const { pool } = require('../src/config/db');

async function main() {
  console.log('🔄 Running payment reconciliation job...');
  const threshold = parseInt(process.env.RECONCILE_THRESHOLD_MINUTES, 10) || 15;
  try {
    const result = await reconcileStuckPayments({ stuckThresholdMinutes: threshold });
    console.log(`✅ Reconciliation finished: Checked ${result.checked}, Confirmed ${result.confirmed}, Cancelled ${result.cancelled}`);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Reconciliation failed:', err);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
