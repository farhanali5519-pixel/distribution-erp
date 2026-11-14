import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const BASELINE_PATH = path.join(process.cwd(), 'backups', 'pre_phase2a_baseline_20260928_211955.json');
const DB_PATH = path.join(process.cwd(), 'data', 'sales_distribution.db');
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

console.log('================================================================');
console.log('   PHASE 2A POST-MIGRATION COMPREHENSIVE VERIFICATION SUITE     ');
console.log('================================================================\n');

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const db = new DatabaseSync(DB_PATH);

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    allPassed = false;
  }
}

// 1. Database Integrity & Foreign Keys
const integrity = db.prepare('PRAGMA integrity_check').all();
assert(integrity.length === 1 && integrity[0].integrity_check === 'ok', 'PRAGMA integrity_check is ok');

const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
assert(fkErrors.length === 0, `PRAGMA foreign_key_check has 0 errors (found ${fkErrors.length})`);

// 2. Master Company & Tenant View
const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(DEFAULT_COMPANY_ID);
assert(company && company.name === 'Farhan Distribution' && company.slug === 'farhan', 'Default company exists: Farhan Distribution (farhan)');

const tenantView = db.prepare('SELECT * FROM tenants WHERE id = ?').get(DEFAULT_COMPANY_ID);
assert(tenantView && tenantView.name === 'Farhan Distribution', 'tenants view resolves default company');

// 3. Module Registry & Company Modules
const systemModulesCount = db.prepare('SELECT COUNT(*) as c FROM system_modules').get().c;
assert(systemModulesCount === 12, `system_modules has all 12 global modules (found ${systemModulesCount})`);

const companyModulesCount = db.prepare('SELECT COUNT(*) as c FROM company_modules WHERE company_id = ?').get(DEFAULT_COMPANY_ID).c;
assert(companyModulesCount === 12, `company_modules has all 12 modules mapped to default company (found ${companyModulesCount})`);

// 4. Row counts comparison against pre-migration baseline
console.log('\n--- Checking Row Counts Against Pre-Migration Baseline ---');
let rowCountMismatches = 0;
for (const [table, expectedCount] of Object.entries(baseline.rowCounts)) {
  const actualCount = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
  if (actualCount !== expectedCount) {
    console.error(`  Mismatch on ${table}: expected ${expectedCount}, got ${actualCount}`);
    rowCountMismatches++;
  }
}
assert(rowCountMismatches === 0, `All 36 original tables row counts match baseline 100%`);

// 5. Check 100% backfill of company_id on all tenant tables (no nulls or unexpected ids)
console.log('\n--- Checking 100% Backfill of company_id ---');
const tenantTables = [
  'app_settings', 'app_users', 'audit_logs', 'bank_accounts', 'brands', 'categories',
  'chart_of_accounts', 'company_profile', 'customer_payment_allocations', 'customer_payments',
  'customers', 'daily_closings', 'expenses', 'feature_flags', 'inventory_movements',
  'journal_entries', 'journal_lines', 'order_booker_sequences', 'products', 'purchase_bill_items',
  'purchase_bills', 'purchase_return_items', 'purchase_returns', 'routes', 'sales_invoice_items',
  'sales_invoices', 'sales_order_items', 'sales_orders', 'sales_return_items', 'sales_returns',
  'staff_members', 'stock_adjustments', 'vendor_payment_allocations', 'vendor_payments', 'vendors'
];

let orphanRows = 0;
for (const table of tenantTables) {
  const nonDefaultCount = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE company_id IS NULL OR company_id != ?`).get(DEFAULT_COMPANY_ID).c;
  if (nonDefaultCount > 0) {
    console.error(`  Orphan / Unassigned rows in ${table}: ${nonDefaultCount}`);
    orphanRows += nonDefaultCount;
  }
}
assert(orphanRows === 0, `All rows across all 35 tenant tables are backfilled to Farhan Distribution (${DEFAULT_COMPANY_ID})`);

// 6. Trial Balance & Journal Line Totals
console.log('\n--- Checking General Ledger & Trial Balance ---');
const postedLines = db.prepare(`
  SELECT 
    COUNT(*) as total_lines,
    COALESCE(SUM(jl.debit_paisas), 0) as total_debit_paisas,
    COALESCE(SUM(jl.credit_paisas), 0) as total_credit_paisas
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_id = je.id
  WHERE je.status = 'POSTED'
`).get();

assert(postedLines.total_lines === baseline.lineTotals.total_lines, `Posted journal lines match: ${postedLines.total_lines} == ${baseline.lineTotals.total_lines}`);
assert(postedLines.total_debit_paisas === baseline.lineTotals.total_debit_paisas, `Total debit paisas match: ${postedLines.total_debit_paisas} == ${baseline.lineTotals.total_debit_paisas}`);
assert(postedLines.total_credit_paisas === baseline.lineTotals.total_credit_paisas, `Total credit paisas match: ${postedLines.total_credit_paisas} == ${baseline.lineTotals.total_credit_paisas}`);

// 7. Customer & Vendor Balances
console.log('\n--- Checking Customer & Vendor Balances ---');
for (const cust of baseline.customerSubledgers) {
  const actualBal = db.prepare(`
    SELECT COALESCE(SUM(jl.debit_paisas - jl.credit_paisas), 0) as bal
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_id = je.id
    WHERE jl.entity_id = ? AND jl.entity_type = 'CUSTOMER' AND je.status = 'POSTED'
  `).get(cust.id).bal;
  assert(actualBal === cust.net_ledger_balance_paisas, `Customer "${cust.name}" subledger balance identical: ${actualBal} paisas`);
}

for (const vend of baseline.vendorSubledgers) {
  const actualBal = db.prepare(`
    SELECT COALESCE(SUM(jl.credit_paisas - jl.debit_paisas), 0) as bal
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_id = je.id
    WHERE jl.entity_id = ? AND jl.entity_type = 'VENDOR' AND je.status = 'POSTED'
  `).get(vend.id).bal;
  assert(actualBal === vend.net_payable_paisas, `Vendor "${vend.name}" subledger payable identical: ${actualBal} paisas`);
}

// 8. Product Stocks in Exact Base Pieces
console.log('\n--- Checking Product Stocks in Exact Base Units ---');
for (const prod of baseline.products) {
  const row = db.prepare('SELECT current_stock_base, cost_price_paisas, trade_price_paisas FROM products WHERE id = ?').get(prod.id);
  assert(row.current_stock_base === prod.current_stock_base, `Product "${prod.name}" stock matches: ${row.current_stock_base} base PCS`);
  assert(row.cost_price_paisas === prod.cost_price_paisas, `Product "${prod.name}" cost price matches: ${row.cost_price_paisas} paisas`);
  assert(row.trade_price_paisas === prod.trade_price_paisas, `Product "${prod.name}" trade price matches: ${row.trade_price_paisas} paisas`);
}

// 9. Check Composite Unique Indexes Exist
console.log('\n--- Checking Company-Scoped Composite Unique Indexes ---');
const expectedIndexes = [
  { table: 'app_users', name: 'uq_app_users_company_username' },
  { table: 'products', name: 'uq_products_company_sku' },
  { table: 'routes', name: 'uq_routes_company_code' },
  { table: 'chart_of_accounts', name: 'uq_coa_company_code' },
  { table: 'sales_orders', name: 'uq_sales_orders_company_number' },
  { table: 'sales_invoices', name: 'uq_sales_invoices_company_number' },
  { table: 'purchase_bills', name: 'uq_purchase_bills_company_number' },
  { table: 'customer_payments', name: 'uq_customer_payments_company_number' },
  { table: 'vendor_payments', name: 'uq_vendor_payments_company_number' },
  { table: 'expenses', name: 'uq_expenses_company_voucher' },
  { table: 'daily_closings', name: 'uq_daily_closings_company_date' },
  { table: 'sales_returns', name: 'uq_sales_returns_company_number' },
  { table: 'purchase_returns', name: 'uq_purchase_returns_company_number' },
  { table: 'stock_adjustments', name: 'uq_stock_adj_company_number' },
  { table: 'inventory_movements', name: 'uq_inv_mov_company_number' },
  { table: 'journal_entries', name: 'uq_journal_entries_company_number' },
  { table: 'categories', name: 'uq_categories_company_name' },
  { table: 'brands', name: 'uq_brands_company_name' },
  { table: 'staff_members', name: 'uq_staff_company_code' }
];

for (const idx of expectedIndexes) {
  const indexRow = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name=?`).get(idx.table, idx.name);
  assert(indexRow !== undefined, `Composite unique index exists: ${idx.name} on ${idx.table}`);
}

// 10. Verify order_booker_sequences has company_id in composite PK
console.log('\n--- Checking order_booker_sequences Structure ---');
const seqCols = db.prepare('PRAGMA table_info(order_booker_sequences)').all();
const pkCols = seqCols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
assert(pkCols.includes('company_id') && pkCols.includes('booker_code') && pkCols.includes('date_code'), `order_booker_sequences composite PK includes company_id: (${pkCols.join(', ')})`);

console.log('\n================================================================');
if (allPassed) {
  console.log('   >>> ALL PHASE 2A VALIDATION CHECKS PASSED PERFECTLY! <<<    ');
} else {
  console.error('   >>> SOME VALIDATION CHECKS FAILED! <<<                      ');
}
console.log('================================================================');

db.close();
process.exit(allPassed ? 0 : 1);
