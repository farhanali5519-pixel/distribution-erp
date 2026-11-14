import pg from 'pg';

const { Pool } = pg;
const PG_SCALE_DB = 'saleflow_scale_test';
const PG_SCALE_URL = `postgresql://postgres:postgres@localhost:5432/${PG_SCALE_DB}`;

const pool = new Pool({ connectionString: PG_SCALE_URL });

async function runExplainAnalyze() {
  console.log('================================================================');
  console.log('   PHASE 6: POSTGRESQL EXPLAIN (ANALYZE, BUFFERS) BENCHMARKS');
  console.log('================================================================\n');

  const companyId = '00000000-0000-0000-0000-000000000001';

  // Get a real customer ID from the test database
  const custRes = await pool.query('SELECT id FROM customers WHERE company_id = $1 LIMIT 1', [companyId]);
  const sampleCustomerId = custRes.rows[0]?.id;

  // Get 5 real order IDs from the test database
  const ordRes = await pool.query('SELECT id FROM sales_orders WHERE company_id = $1 LIMIT 5', [companyId]);
  const sampleOrderIds = ordRes.rows.map(r => r.id);

  const benchmarks = [
    {
      name: '1. Tenant-Filtered Sales Orders Paginated List',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT id, order_number, customer_id, order_date, grand_total, status
            FROM sales_orders
            WHERE company_id = $1
            ORDER BY order_date DESC, created_at DESC
            LIMIT 50;`,
      params: [companyId],
    },
    {
      name: '2. Customer-Specific Sales Orders History',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT id, order_number, order_date, grand_total, status
            FROM sales_orders
            WHERE company_id = $1 AND customer_id = $2
            ORDER BY order_date DESC
            LIMIT 50;`,
      params: [companyId, sampleCustomerId],
    },
    {
      name: '3. Batched Sales Order Items for 5 Orders (N+1 Elimination)',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT id, order_id, product_id, quantity_base, unit_price, line_total
            FROM sales_order_items
            WHERE company_id = $1 AND order_id = ANY($2::text[]);`,
      params: [companyId, sampleOrderIds],
    },
    {
      name: '4. Batch Customer Sub-Ledger Balances (N+1 Elimination over 200,000 Lines)',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT 
              jl.entity_id,
              SUM(jl.debit_paisas - jl.credit_paisas) as balance_paisas
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
            WHERE jl.company_id = $1 AND jl.entity_type = 'CUSTOMER' AND je.status = 'POSTED'
            GROUP BY jl.entity_id;`,
      params: [companyId],
    },
    {
      name: '5. Pre-Aggregated Trial Balance Calculation',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT 
              coa.id as account_id,
              coa.code,
              coa.name,
              coa.type,
              coa.normal_balance,
              COALESCE(sums.total_debit, 0) as total_debit_paisas,
              COALESCE(sums.total_credit, 0) as total_credit_paisas
            FROM chart_of_accounts coa
            LEFT JOIN (
              SELECT 
                jl.account_id,
                SUM(jl.debit_paisas) as total_debit,
                SUM(jl.credit_paisas) as total_credit
              FROM journal_lines jl
              JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
              WHERE jl.company_id = $1 AND je.status = 'POSTED'
              GROUP BY jl.account_id
            ) sums ON coa.id = sums.account_id
            WHERE coa.company_id = $1 AND coa.is_active = 1
            ORDER BY coa.code ASC;`,
      params: [companyId],
    },
    {
      name: '6. Batch Inventory Stock Reconciliation Aggregation (200,000 Movements)',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT 
              product_id,
              COALESCE(SUM(net_quantity_base), 0) as calc_stock,
              MAX(movement_date) as last_date,
              COUNT(*) as mov_count
            FROM inventory_movements 
            WHERE company_id = $1
            GROUP BY product_id;`,
      params: [companyId],
    },
    {
      name: '7. Inventory Movements Paginated Date Range Filter',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT id, movement_number, movement_date, movement_type, product_id, quantity_in_base, quantity_out_base
            FROM inventory_movements
            WHERE company_id = $1 AND movement_date >= '2026-06-01' AND movement_date <= '2026-09-30'
            ORDER BY movement_date DESC, created_at DESC
            LIMIT 50;`,
      params: [companyId],
    },
    {
      name: '8. Audit Logs Server-Side Paginated Query',
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM audit_logs
            WHERE company_id = $1
            ORDER BY created_at DESC
            LIMIT 50 OFFSET 0;`,
      params: [companyId],
    },
  ];

  const results = [];

  for (const b of benchmarks) {
    console.log(`--- Running: ${b.name} ---`);
    const res = await pool.query(b.sql, b.params);
    const planLines = res.rows.map(r => r['QUERY PLAN']);
    const fullPlan = planLines.join('\n');

    // Extract execution time
    const execTimeMatch = fullPlan.match(/Execution Time: ([\d.]+) ms/);
    const planningTimeMatch = fullPlan.match(/Planning Time: ([\d.]+) ms/);
    const execTimeMs = execTimeMatch ? parseFloat(execTimeMatch[1]) : null;
    const planTimeMs = planningTimeMatch ? parseFloat(planningTimeMatch[1]) : null;

    // Detect scan types
    const hasIndexScan = /Index (Scan|Only Scan|Cond)/.test(fullPlan);
    const hasSeqScan = /Seq Scan/.test(fullPlan);
    const isBitmapScan = /Bitmap Index Scan/.test(fullPlan);

    const scanType = hasIndexScan ? 'Index Scan' : isBitmapScan ? 'Bitmap Scan' : hasSeqScan ? 'Seq Scan' : 'Optimized';

    console.log(`  Scan Type:      ${scanType}`);
    console.log(`  Planning Time:  ${planTimeMs} ms`);
    console.log(`  Execution Time: ${execTimeMs} ms`);
    console.log(`  Top Plan Node:  ${planLines[0]}`);
    console.log('');

    results.push({
      name: b.name,
      scanType,
      planTimeMs,
      execTimeMs,
      topNode: planLines[0],
      fullPlan,
    });
  }

  console.log('================================================================');
  console.log('   EXPLAIN (ANALYZE, BUFFERS) SUMMARY TABLE');
  console.log('================================================================');
  console.log('Query Benchmark                                           | Scan Type  | Exec Time');
  console.log('----------------------------------------------------------+------------+----------');
  for (const r of results) {
    const padName = r.name.padEnd(58, ' ');
    const padScan = r.scanType.padEnd(10, ' ');
    const padTime = `${r.execTimeMs?.toFixed(2)} ms`.padStart(9, ' ');
    console.log(`${padName} | ${padScan} | ${padTime}`);
  }
  console.log('');

  await pool.end();
}

runExplainAnalyze().catch(err => {
  console.error('EXPLAIN ANALYZE failed:', err);
  process.exit(1);
});
