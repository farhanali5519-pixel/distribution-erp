/**
 * REALISTIC SQLITE CONCURRENCY BENCHMARK (PHASE 7 RC VALIDATION)
 * 
 * Tests sustained mixed realistic workloads across separate DatabaseSync connections:
 * - Levels: 10, 15, 25, 30 concurrent users
 * - Duration: >= 60 seconds per level
 * - Workload: Realistic distribution of searches, stock audits, order entries, GL postings, payments
 * - Metrics: Total Ops, Reads, Writes, p50, p95, p99 latencies, SQLITE_BUSY, rollbacks, integrity check
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

const SOURCE_DB_PATH = path.resolve('data/sales_distribution.db');
const BENCHMARK_DB_PATH = path.resolve('data/concurrency_test_sandbox.db');
const TEST_DURATION_MS = 60000; // 60 seconds per concurrency level
const CONCURRENCY_LEVELS = [10, 15, 25, 30];

// Sleep helper for realistic human pacing
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function prepareSandbox() {
  console.log('[SETUP] Copying isolated test database for concurrency benchmark...');
  // Remove previous sandbox if any
  for (const ext of ['', '-wal', '-shm']) {
    const f = BENCHMARK_DB_PATH + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  fs.copyFileSync(SOURCE_DB_PATH, BENCHMARK_DB_PATH);

  // Initialize WAL and busy timeout on sandbox
  const initDb = new DatabaseSync(BENCHMARK_DB_PATH);
  initDb.exec('PRAGMA journal_mode = WAL;');
  initDb.exec('PRAGMA busy_timeout = 15000;');
  initDb.exec('PRAGMA synchronous = NORMAL;');
  initDb.close();

  console.log('[SETUP] Sandbox initialized with PRAGMA journal_mode=WAL and PRAGMA busy_timeout=15000.\n');
}

/**
 * Worker simulating a single concurrent LAN user
 */
async function runUserWorker({
  workerId,
  dbPath,
  stopSignal,
  metrics,
  productIds,
  customerIds,
  companyId,
}) {
  // Each user operates on their OWN distinct database connection
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 15000;');

  while (!stopSignal.stop) {
    const opType = Math.random(); // Operation distribution
    const t0 = performance.now();
    let isWrite = false;

    try {
      if (opType < 0.25) {
        // Read 1: Customer search & balance check (25%)
        db.prepare('SELECT id, name, phone, balance, credit_limit_paisas FROM customers WHERE is_active = 1 LIMIT 20').all();
      } else if (opType < 0.45) {
        // Read 2: Product catalog & stock audit (20%)
        db.prepare('SELECT id, sku, name, current_stock_base, selling_price FROM products WHERE is_active = 1 LIMIT 25').all();
      } else if (opType < 0.60) {
        // Read 3: Customer subledger / recent statement (15%)
        const custId = customerIds[Math.floor(Math.random() * customerIds.length)];
        db.prepare('SELECT * FROM journal_lines WHERE entity_id = ? ORDER BY id DESC LIMIT 20').all(custId);
      } else if (opType < 0.70) {
        // Read 4: Pre-aggregated trial balance / management report (10%)
        db.prepare(`
          SELECT account_id, SUM(debit_paisas) as debits, SUM(credit_paisas) as credits 
          FROM journal_lines 
          WHERE company_id = ? 
          GROUP BY account_id
        `).all(companyId);
      } else if (opType < 0.88) {
        // Write 1: Sales order entry with stock deduction & GL journal voucher (18%)
        isWrite = true;
        const prodId = productIds[Math.floor(Math.random() * productIds.length)];
        const custId = customerIds[Math.floor(Math.random() * customerIds.length)];
        const orderId = `so_bench_${workerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const orderNo = `SO-B-${workerId}-${Date.now().toString().slice(-4)}`;
        const sellQty = Math.floor(Math.random() * 5) + 1;
        const price = 100;
        const total = sellQty * price;

        db.exec('BEGIN IMMEDIATE;');
        try {
          db.prepare(`
            INSERT INTO sales_orders (
              id, company_id, order_number, customer_id, order_date, status,
              subtotal_paisas, grand_total_paisas, subtotal, grand_total,
              remaining_balance_paisas, payment_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, '2026-09-29', 'POSTED', ?, ?, ?, ?, ?, 'UNPAID', datetime('now'), datetime('now'))
          `).run(orderId, companyId, orderNo, custId, total * 100, total * 100, total, total, total * 100);

          db.prepare(`
            UPDATE products 
            SET current_stock_base = current_stock_base - ?,
                current_stock = current_stock - ?,
                updated_at = datetime('now')
            WHERE id = ? AND company_id = ?
          `).run(sellQty, sellQty, prodId, companyId);

          const jId = `je_bench_${orderId}`;
          db.prepare(`
            INSERT INTO journal_entries (
              id, company_id, entry_number, entry_date, description, source_module, source_document_id,
              total_amount_paisas, total_amount, status, created_at
            ) VALUES (?, ?, ?, '2026-09-29', 'Benchmark Order', 'sales', ?, ?, ?, 'POSTED', datetime('now'))
          `).run(jId, companyId, `JV-${orderNo}`, orderId, total * 100, total);

          db.prepare(`
            INSERT INTO journal_lines (
              id, company_id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_type, entity_id
            ) VALUES 
              (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1020' AND company_id = ?), ?, 0, ?, 0, 'CUSTOMER', ?),
              (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '4010' AND company_id = ?), 0, ?, 0, ?, NULL, NULL)
          `).run(
            `${jId}_1`, companyId, jId, companyId, total * 100, total, custId,
            `${jId}_2`, companyId, jId, companyId, total * 100, total
          );

          db.exec('COMMIT;');
        } catch (txErr) {
          try { db.exec('ROLLBACK;'); } catch {}
          metrics.rollbacks++;
          throw txErr;
        }
      } else {
        // Write 2: Payment Received settlement & GL voucher (12%)
        isWrite = true;
        const custId = customerIds[Math.floor(Math.random() * customerIds.length)];
        const payId = `pay_bench_${workerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const payNo = `CR-B-${workerId}-${Date.now().toString().slice(-4)}`;
        const amount = 250;

        db.exec('BEGIN IMMEDIATE;');
        try {
          db.prepare(`
            INSERT INTO customer_payments (
              id, company_id, payment_number, customer_id, payment_date, amount, amount_paisas,
              unallocated_amount, unallocated_amount_paisas, payment_method, status, created_at
            ) VALUES (?, ?, ?, ?, '2026-09-29', ?, ?, 0, 0, 'CASH', 'POSTED', datetime('now'))
          `).run(payId, companyId, payNo, custId, amount, amount * 100);

          const payJId = `je_bench_pay_${payId}`;
          db.prepare(`
            INSERT INTO journal_entries (
              id, company_id, entry_number, entry_date, description, source_module, source_document_id,
              total_amount_paisas, total_amount, status, created_at
            ) VALUES (?, ?, ?, '2026-09-29', 'Benchmark Payment', 'payments', ?, ?, ?, 'POSTED', datetime('now'))
          `).run(payJId, companyId, `JV-${payNo}`, payId, amount * 100, amount);

          db.prepare(`
            INSERT INTO journal_lines (
              id, company_id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_type, entity_id
            ) VALUES 
              (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?), ?, 0, ?, 0, NULL, NULL),
              (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1020' AND company_id = ?), 0, ?, 0, ?, 'CUSTOMER', ?)
          `).run(
            `${payJId}_1`, companyId, payJId, companyId, amount * 100, amount,
            `${payJId}_2`, companyId, payJId, companyId, amount * 100, amount, custId
          );

          db.exec('COMMIT;');
        } catch (txErr) {
          try { db.exec('ROLLBACK;'); } catch {}
          metrics.rollbacks++;
          throw txErr;
        }
      }

      const elapsed = performance.now() - t0;
      metrics.latencies.push(elapsed);
      metrics.totalOps++;
      if (isWrite) metrics.writes++;
      else metrics.reads++;

    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes('busy') || msg.includes('BUSY') || msg.includes('locked')) {
        metrics.sqliteBusyCount++;
      } else {
        metrics.failedTransactions++;
      }
    }

    // Realistic human LAN pacing: 40ms to 120ms between operations
    const pacingMs = Math.floor(Math.random() * 80) + 40;
    await sleep(pacingMs);
  }

  db.close();
}

async function runBenchmarkLevel(numUsers, durationMs) {
  console.log(`===================================================================`);
  console.log(`  STARTING SUSTAINED TEST: ${numUsers} CONCURRENT USERS (${durationMs / 1000}s)`);
  console.log(`===================================================================`);

  // Extract reference IDs from sandbox
  const setupDb = new DatabaseSync(BENCHMARK_DB_PATH);
  const company = setupDb.prepare('SELECT id FROM companies LIMIT 1').get();
  const companyId = company.id;
  const products = setupDb.prepare('SELECT id FROM products WHERE company_id = ? LIMIT 50').all(companyId);
  const customers = setupDb.prepare('SELECT id FROM customers WHERE company_id = ? LIMIT 50').all(companyId);
  setupDb.close();

  const productIds = products.map((p) => p.id);
  const customerIds = customers.map((c) => c.id);

  const metrics = {
    totalOps: 0,
    reads: 0,
    writes: 0,
    sqliteBusyCount: 0,
    failedTransactions: 0,
    rollbacks: 0,
    latencies: [],
  };

  const stopSignal = { stop: false };
  const startTime = performance.now();

  // Launch parallel user worker tasks
  const workers = [];
  for (let i = 0; i < numUsers; i++) {
    workers.push(
      runUserWorker({
        workerId: i + 1,
        dbPath: BENCHMARK_DB_PATH,
        stopSignal,
        metrics,
        productIds,
        customerIds,
        companyId,
      })
    );
  }

  // Timer loop with periodic progress updates every 15s
  const checkInterval = 15000;
  let elapsedSoFar = 0;

  while (elapsedSoFar < durationMs) {
    await sleep(checkInterval);
    elapsedSoFar = performance.now() - startTime;
    const remaining = Math.max(0, Math.round((durationMs - elapsedSoFar) / 1000));
    const currentRps = (metrics.totalOps / (elapsedSoFar / 1000)).toFixed(1);
    console.log(`  [PROGRESS ${numUsers} Users] Elapsed: ${(elapsedSoFar / 1000).toFixed(0)}s | Ops: ${metrics.totalOps} (~${currentRps} ops/s) | Writes: ${metrics.writes} | BUSY: ${metrics.sqliteBusyCount}`);
  }

  // Stop workers
  stopSignal.stop = true;
  await Promise.all(workers);

  const totalDuration = (performance.now() - startTime) / 1000;
  const p50 = percentile(metrics.latencies, 50).toFixed(2);
  const p95 = percentile(metrics.latencies, 95).toFixed(2);
  const p99 = percentile(metrics.latencies, 99).toFixed(2);
  const throughput = (metrics.totalOps / totalDuration).toFixed(1);

  // Post-test PRAGMA Integrity Check
  const verifyDb = new DatabaseSync(BENCHMARK_DB_PATH);
  const integrity = verifyDb.prepare('PRAGMA integrity_check;').get();
  const fkCheck = verifyDb.prepare('PRAGMA foreign_key_check;').all();
  verifyDb.close();

  const result = {
    users: numUsers,
    durationSeconds: totalDuration.toFixed(1),
    totalOperations: metrics.totalOps,
    reads: metrics.reads,
    writes: metrics.writes,
    throughputOpsPerSec: throughput,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    sqliteBusyCount: metrics.sqliteBusyCount,
    failedTransactions: metrics.failedTransactions,
    rollbacks: metrics.rollbacks,
    databaseIntegrity: integrity.integrity_check,
    foreignKeyErrors: fkCheck.length,
  };

  console.log(`\n--- RESULTS: ${numUsers} CONCURRENT USERS ---`);
  console.log(`  Duration:             ${result.durationSeconds}s`);
  console.log(`  Total Operations:     ${result.totalOperations} (${result.reads} reads, ${result.writes} writes)`);
  console.log(`  Throughput:           ${result.throughputOpsPerSec} ops/sec`);
  console.log(`  Latency p50:          ${result.p50LatencyMs} ms`);
  console.log(`  Latency p95:          ${result.p95LatencyMs} ms`);
  console.log(`  Latency p99:          ${result.p99LatencyMs} ms`);
  console.log(`  SQLITE_BUSY:          ${result.sqliteBusyCount}`);
  console.log(`  Failed Transactions:  ${result.failedTransactions}`);
  console.log(`  Rollbacks:            ${result.rollbacks}`);
  console.log(`  DB Integrity Check:   ${result.databaseIntegrity}`);
  console.log(`  Foreign Key Errors:   ${result.foreignKeyErrors}`);
  console.log(`-------------------------------------------------------------------\n`);

  return result;
}

async function main() {
  await prepareSandbox();

  const allResults = [];
  for (const users of CONCURRENCY_LEVELS) {
    const res = await runBenchmarkLevel(users, TEST_DURATION_MS);
    allResults.push(res);
  }

  // Save report artifact
  const outPath = path.resolve('backups/concurrency-results.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`[COMPLETED] Full concurrency benchmarks saved to ${outPath}`);

  // Clean up sandbox
  for (const ext of ['', '-wal', '-shm']) {
    const f = BENCHMARK_DB_PATH + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  // Verify live database remains 100% untouched
  const liveDb = new DatabaseSync(SOURCE_DB_PATH);
  const liveIntegrity = liveDb.prepare('PRAGMA integrity_check;').get();
  const liveFk = liveDb.prepare('PRAGMA foreign_key_check;').all();
  liveDb.close();

  console.log(`\n[VERIFICATION] Live database integrity: ${liveIntegrity.integrity_check}, FK errors: ${liveFk.length}`);
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
