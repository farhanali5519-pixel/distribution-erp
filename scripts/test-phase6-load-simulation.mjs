import pg from 'pg';
import os from 'node:os';

const { Pool } = pg;
const PG_SCALE_DB = 'saleflow_scale_test';
const PG_SCALE_URL = `postgresql://postgres:postgres@localhost:5432/${PG_SCALE_DB}`;

// Configurable DB pool for load testing
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '25', 10);
const pool = new Pool({
  connectionString: PG_SCALE_URL,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const COMPANIES = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005',
];

// Pre-fetch sample IDs for realistic queries
let sampleCustomerIds = [];
let sampleProductIds = [];

async function initSamples() {
  const custRes = await pool.query('SELECT id FROM customers WHERE company_id = $1 LIMIT 50', [COMPANIES[0]]);
  sampleCustomerIds = custRes.rows.map(r => r.id);

  const prodRes = await pool.query('SELECT id, cost_price_paisas, trade_price_paisas FROM products WHERE company_id = $1 LIMIT 50', [COMPANIES[0]]);
  sampleProductIds = prodRes.rows;
}

// Simulated real-world user operations
async function executeOperation(type, client) {
  const companyId = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
  const custId = sampleCustomerIds[Math.floor(Math.random() * sampleCustomerIds.length)] || sampleCustomerIds[0];
  const prod = sampleProductIds[Math.floor(Math.random() * sampleProductIds.length)] || sampleProductIds[0];

  switch (type) {
    case 'ORDER_LIST': {
      // 1. Paginated Orders List
      const res = await client.query(`
        SELECT id, order_number, customer_id, order_date, grand_total, status
        FROM sales_orders
        WHERE company_id = $1
        ORDER BY order_date DESC, created_at DESC
        LIMIT 50;
      `, [companyId]);
      return res.rowCount;
    }

    case 'CUSTOMER_SEARCH': {
      // 2. Customer search by prefix
      const term = 'Customer %-001%';
      const res = await client.query(`
        SELECT id, name, shop_name, phone, city, credit_limit
        FROM customers
        WHERE company_id = $1 AND name LIKE $2
        LIMIT 20;
      `, [companyId, term]);
      return res.rowCount;
    }

    case 'PRODUCT_SEARCH': {
      // 3. Product catalog search
      const term = 'Product %-00%';
      const res = await client.query(`
        SELECT id, sku, name, selling_price, current_stock_base
        FROM products
        WHERE company_id = $1 AND name LIKE $2
        LIMIT 20;
      `, [companyId, term]);
      return res.rowCount;
    }

    case 'STOCK_LOOKUP': {
      // 4. Inventory stock movements lookup
      const res = await client.query(`
        SELECT id, movement_number, movement_date, movement_type, net_quantity_base
        FROM inventory_movements
        WHERE company_id = $1 AND product_id = $2
        ORDER BY movement_date DESC
        LIMIT 20;
      `, [companyId, prod.id]);
      return res.rowCount;
    }

    case 'TRIAL_BALANCE': {
      // 5. Financial reporting: pre-aggregated Trial Balance
      const res = await client.query(`
        SELECT 
          coa.id, coa.code, coa.name, coa.normal_balance,
          COALESCE(sums.total_debit, 0) as debits,
          COALESCE(sums.total_credit, 0) as credits
        FROM chart_of_accounts coa
        LEFT JOIN (
          SELECT jl.account_id, SUM(jl.debit_paisas) as total_debit, SUM(jl.credit_paisas) as total_credit
          FROM journal_lines jl
          JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
          WHERE jl.company_id = $1 AND je.status = 'POSTED'
          GROUP BY jl.account_id
        ) sums ON coa.id = sums.account_id
        WHERE coa.company_id = $1 AND coa.is_active = 1
        ORDER BY coa.code ASC;
      `, [companyId]);
      return res.rowCount;
    }

    case 'CREATE_ORDER': {
      // 6. Transactional Write: Post new sales order + line item
      const orderId = `load-order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const orderNum = `SO-LOAD-${Date.now().toString().slice(-6)}`;
      const itemId = `load-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      await client.query('BEGIN');
      try {
        await client.query(`
          INSERT INTO sales_orders (
            id, company_id, order_number, customer_id, order_date,
            subtotal_paisas, grand_total_paisas, subtotal, grand_total,
            status, payment_status, sync_status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, CURRENT_DATE::text,
            250000, 250000, 2500.00, 2500.00,
            'POSTED', 'UNPAID', 'SYNCED', NOW()::text, NOW()::text
          );
        `, [orderId, companyId, orderNum, custId]);

        await client.query(`
          INSERT INTO sales_order_items (
            id, company_id, order_id, product_id, quantity_base,
            unit_price_paisas, unit_price, line_total_paisas, line_total, created_at
          ) VALUES (
            $1, $2, $3, $4, 12,
            20833, 208.33, 250000, 2500.00, NOW()::text
          );
        `, [itemId, companyId, orderId, prod.id]);

        await client.query('COMMIT');
        return 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    default:
      return 0;
  }
}

// Generate realistic operation mix distribution
function getRandomOperation() {
  const r = Math.random();
  if (r < 0.30) return 'ORDER_LIST';       // 30% Paginated order list
  if (r < 0.45) return 'CUSTOMER_SEARCH';  // 15% Customer search
  if (r < 0.60) return 'PRODUCT_SEARCH';   // 15% Product catalog search
  if (r < 0.75) return 'STOCK_LOOKUP';     // 15% Stock & movement audit
  if (r < 0.90) return 'CREATE_ORDER';     // 15% Transactional writes (Orders + items)
  return 'TRIAL_BALANCE';                  // 10% Financial report / Trial Balance
}

// Percentile helper
function getPercentile(sortedValues, percentile) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

async function runLoadTier(concurrentUsers, totalRequests) {
  console.log(`================================================================`);
  console.log(`   RUNNING LOAD TIER: ${concurrentUsers} CONCURRENT VIRTUAL USERS`);
  console.log(`   Target Requests: ${totalRequests.toLocaleString()}`);
  console.log(`   Database Pool Max: ${POOL_MAX} connections`);
  console.log(`================================================================`);

  let completedRequests = 0;
  let successfulRequests = 0;
  let errorCount = 0;
  const latencies = [];

  const startTime = Date.now();
  const cpuStart = process.cpuUsage();
  const memStart = process.memoryUsage().rss;

  // Track max pool usage
  let maxPoolTotal = pool.totalCount;
  let maxPoolWaiting = pool.waitingCount;

  // Worker task queue
  let requestIndex = 0;
  async function worker() {
    while (true) {
      const idx = requestIndex++;
      if (idx >= totalRequests) break;

      const opType = getRandomOperation();
      const opStart = performance.now();
      try {
        const client = await pool.connect();
        try {
          maxPoolTotal = Math.max(maxPoolTotal, pool.totalCount);
          maxPoolWaiting = Math.max(maxPoolWaiting, pool.waitingCount);
          await executeOperation(opType, client);
          successfulRequests++;
        } finally {
          client.release();
        }
      } catch (err) {
        errorCount++;
      } finally {
        const duration = performance.now() - opStart;
        latencies.push(duration);
        completedRequests++;
      }
    }
  }

  // Spawn concurrent virtual users
  const workers = [];
  for (let i = 0; i < concurrentUsers; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const totalDurationMs = Date.now() - startTime;
  const durationSec = totalDurationMs / 1000;
  const requestsPerSec = totalDurationMs > 0 ? (completedRequests / durationSec) : 0;

  // Latency percentiles
  latencies.sort((a, b) => a - b);
  const p50 = getPercentile(latencies, 50);
  const p95 = getPercentile(latencies, 95);
  const p99 = getPercentile(latencies, 99);
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const errorRate = completedRequests > 0 ? (errorCount / completedRequests) * 100 : 0;

  const cpuEnd = process.cpuUsage(cpuStart);
  const cpuUserMs = (cpuEnd.user / 1000).toFixed(0);
  const cpuSysMs = (cpuEnd.system / 1000).toFixed(0);
  const memEnd = process.memoryUsage().rss;
  const memDeltaMb = ((memEnd - memStart) / (1024 * 1024)).toFixed(1);

  console.log(`\n--- Results for ${concurrentUsers} Concurrent Users ---`);
  console.log(`  Duration:         ${durationSec.toFixed(2)} seconds`);
  console.log(`  Total Requests:   ${completedRequests.toLocaleString()}`);
  console.log(`  Successful:       ${successfulRequests.toLocaleString()}`);
  console.log(`  Errors:           ${errorCount} (${errorRate.toFixed(2)}%)`);
  console.log(`  Throughput:       ${requestsPerSec.toFixed(2)} req/sec`);
  console.log(`  Latency p50:      ${p50.toFixed(2)} ms`);
  console.log(`  Latency p95:      ${p95.toFixed(2)} ms`);
  console.log(`  Latency p99:      ${p99.toFixed(2)} ms`);
  console.log(`  Latency Max:      ${maxLatency.toFixed(2)} ms`);
  console.log(`  Peak DB Pool:     ${maxPoolTotal}/${POOL_MAX} active (peak queued: ${maxPoolWaiting})`);
  console.log(`  Process CPU Time: ${cpuUserMs}ms user, ${cpuSysMs}ms system`);
  console.log(`  Process RSS Mem:  ${(memEnd / (1024 * 1024)).toFixed(1)} MB (delta: ${memDeltaMb} MB)\n`);

  return {
    concurrentUsers,
    totalRequests: completedRequests,
    durationSec: Number(durationSec.toFixed(2)),
    requestsPerSec: Number(requestsPerSec.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    maxLatency: Number(maxLatency.toFixed(2)),
    errorRate: Number(errorRate.toFixed(2)),
    peakPoolUsage: `${maxPoolTotal}/${POOL_MAX}`,
  };
}

async function main() {
  console.log('================================================================');
  console.log('   PHASE 6: CONCURRENT VIRTUAL USER LOAD SIMULATION');
  console.log('================================================================');
  console.log(`Operating System: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU Cores:        ${os.cpus().length} cores (${os.cpus()[0]?.model})`);
  console.log(`Total RAM:        ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`Free RAM:         ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`Database Target:  PostgreSQL (Docker container, 100k+ orders scale)\n`);

  await initSamples();

  const results = [];

  // Tier 1: 100 concurrent virtual users (1,500 operations)
  results.push(await runLoadTier(100, 1500));

  // Tier 2: 250 concurrent virtual users (2,500 operations)
  results.push(await runLoadTier(250, 2500));

  // Tier 3: 500 concurrent virtual users (3,500 operations)
  results.push(await runLoadTier(500, 3500));

  console.log('========================================================================================');
  console.log('                         PHASE 6 LOAD TESTING FINAL SUMMARY TABLE');
  console.log('========================================================================================');
  console.log('Users | Total Req | Duration | Throughput   | p50 Latency | p95 Latency | p99 Latency | Error Rate | Peak Pool');
  console.log('------+-----------+----------+--------------+-------------+-------------+-------------+------------+----------');
  for (const r of results) {
    const u = `${r.concurrentUsers}`.padStart(5, ' ');
    const req = `${r.totalRequests}`.padStart(9, ' ');
    const dur = `${r.durationSec}s`.padStart(8, ' ');
    const tps = `${r.requestsPerSec} r/s`.padStart(12, ' ');
    const p50 = `${r.p50} ms`.padStart(11, ' ');
    const p95 = `${r.p95} ms`.padStart(11, ' ');
    const p99 = `${r.p99} ms`.padStart(11, ' ');
    const err = `${r.errorRate}%`.padStart(10, ' ');
    const poolUse = `${r.peakPoolUsage}`.padStart(9, ' ');
    console.log(`${u} | ${req} | ${dur} | ${tps} | ${p50} | ${p95} | ${p99} | ${err} | ${poolUse}`);
  }
  console.log('========================================================================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('Load testing simulation failed:', err);
  process.exit(1);
});
