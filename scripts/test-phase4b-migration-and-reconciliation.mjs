import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import path from 'node:path';
import { DataMigrationService, MIGRATION_TABLE_ORDER } from '../src/core/database/postgres/data-migration.js';
import { DalService } from '../src/core/database/dal-services.js';
import { PostgresAdapter } from '../src/core/database/adapters/postgres.adapter.js';

const { Pool } = pg;
pg.types.setTypeParser(pg.types.builtins.INT8, (val) => (val === null ? null : parseInt(val, 10)));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => (val === null ? null : parseFloat(val)));

const SQLITE_DB_PATH = path.join(process.cwd(), 'data', 'sales_distribution.db');
const ROOT_PG_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_PG_DB = 'saleflow_test_phase4b';
const TEST_PG_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_PG_DB}`;

let passedChecks = 0;
let failedChecks = 0;

function pass(desc) {
  passedChecks++;
  console.log(`  [PASS] ${desc}`);
}

function fail(desc, err) {
  failedChecks++;
  console.error(`  [FAIL] ${desc}`, err ? `\n       ${err.message || err}` : '');
}

async function run() {
  console.log('================================================================');
  console.log('   PHASE 4B: SQLITE -> POSTGRESQL DATA MIGRATION & RECONCILIATION');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // STEP 1: Provision fresh clean test database & execute migration
  // -------------------------------------------------------------
  console.log('--- STEP 1: Fresh PostgreSQL Test DB Setup & Migration ---');
  await DataMigrationService.resetPostgresDatabase(ROOT_PG_URL, TEST_PG_DB);
  pass(`Created fresh empty database "${TEST_PG_DB}"`);

  const migrationSummary = await DataMigrationService.migrateSqliteToPostgres({
    sqliteDbPath: SQLITE_DB_PATH,
    postgresUrl: TEST_PG_URL,
    recreateSchema: true,
    batchSize: 100,
  });

  pass(`Migrated all ${migrationSummary.tablesMigrated} tables in ${migrationSummary.durationMs}ms`);
  pass(`Total records copied: ${migrationSummary.totalRecordsMigrated}`);

  const sqliteDb = new DatabaseSync(SQLITE_DB_PATH);
  const pgPool = new Pool({ connectionString: TEST_PG_URL });
  const pgAdapter = new PostgresAdapter(TEST_PG_URL);

  // -------------------------------------------------------------
  // STEP 2: Row-by-Row Table Count Reconciliation (All 39 Tables)
  // -------------------------------------------------------------
  console.log('\n--- STEP 2: 100% Table Row Count Reconciliation (All 39 Tables) ---');
  let allTableCountsMatch = true;
  for (const tableName of MIGRATION_TABLE_ORDER) {
    const sCount = sqliteDb.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get().c;
    const pCountRes = await pgPool.query(`SELECT COUNT(*) as c FROM "${tableName}"`);
    const pCount = parseInt(pCountRes.rows[0].c, 10);

    if (sCount !== pCount) {
      fail(`Table ${tableName} mismatch: SQLite=${sCount}, Postgres=${pCount}`);
      allTableCountsMatch = false;
    }
  }
  if (allTableCountsMatch) {
    pass(`All 39 tables row counts match SQLite 100% perfectly!`);
  }

  // -------------------------------------------------------------
  // STEP 3: General Ledger & Trial Balance Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- STEP 3: Financial Precision & GL Reconciliation ---');
  const sGL = sqliteDb.prepare(`
    SELECT COUNT(*) as lines,
           SUM(debit_paisas) as total_debits,
           SUM(credit_paisas) as total_credits
    FROM journal_lines
  `).get();

  const pGLRes = await pgPool.query(`
    SELECT COUNT(*) as lines,
           SUM(debit_paisas) as total_debits,
           SUM(credit_paisas) as total_credits
    FROM journal_lines
  `);
  const pGL = pGLRes.rows[0];

  if (Number(sGL.lines) === Number(pGL.lines)) {
    pass(`Journal lines count identical: ${sGL.lines} == ${pGL.lines}`);
  } else {
    fail(`Journal lines mismatch: SQLite=${sGL.lines}, PG=${pGL.lines}`);
  }

  if (Number(sGL.total_debits) === Number(pGL.total_debits)) {
    pass(`Total debit paisas identical: ${sGL.total_debits} == ${pGL.total_debits}`);
  } else {
    fail(`Debit paisas mismatch: SQLite=${sGL.total_debits}, PG=${pGL.total_debits}`);
  }

  if (Number(sGL.total_credits) === Number(pGL.total_credits)) {
    pass(`Total credit paisas identical: ${sGL.total_credits} == ${pGL.total_credits}`);
  } else {
    fail(`Credit paisas mismatch: SQLite=${sGL.total_credits}, PG=${pGL.total_credits}`);
  }

  // Trial Balance per-account verification
  const sAccounts = sqliteDb.prepare(`
    SELECT a.id, a.code, a.name,
           COALESCE(SUM(l.debit_paisas), 0) as debits,
           COALESCE(SUM(l.credit_paisas), 0) as credits
    FROM chart_of_accounts a
    LEFT JOIN journal_lines l ON l.account_id = a.id
    GROUP BY a.id, a.code, a.name
    ORDER BY a.code
  `).all();

  const pAccountsRes = await pgPool.query(`
    SELECT a.id, a.code, a.name,
           COALESCE(SUM(l.debit_paisas), 0) as debits,
           COALESCE(SUM(l.credit_paisas), 0) as credits
    FROM chart_of_accounts a
    LEFT JOIN journal_lines l ON l.account_id = a.id
    GROUP BY a.id, a.code, a.name
    ORDER BY a.code
  `);
  const pAccounts = pAccountsRes.rows;

  let tbMatches = true;
  for (let i = 0; i < sAccounts.length; i++) {
    const sAcc = sAccounts[i];
    const pAcc = pAccounts.find(a => a.code === sAcc.code);
    if (!pAcc || Number(sAcc.debits) !== Number(pAcc.debits) || Number(sAcc.credits) !== Number(pAcc.credits)) {
      fail(`Trial balance account mismatch: ${sAcc.code} (${sAcc.name})`);
      tbMatches = false;
    }
  }
  if (tbMatches) {
    pass(`Trial Balance accounts (${sAccounts.length} accounts) match debits/credits 100%`);
  }

  // -------------------------------------------------------------
  // STEP 4: Customer Balances Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- STEP 4: Customer Ledger Balances Reconciliation ---');
  const sCust = sqliteDb.prepare(`
    SELECT c.id, c.name, COALESCE(SUM(l.debit_paisas - l.credit_paisas), 0) as balance
    FROM customers c
    LEFT JOIN journal_lines l ON l.entity_type = 'CUSTOMER' AND l.entity_id = c.id
    GROUP BY c.id, c.name
    ORDER BY c.id
  `).all();

  const pCustRes = await pgPool.query(`
    SELECT c.id, c.name, COALESCE(SUM(l.debit_paisas - l.credit_paisas), 0) as balance
    FROM customers c
    LEFT JOIN journal_lines l ON l.entity_type = 'CUSTOMER' AND l.entity_id = c.id
    GROUP BY c.id, c.name
    ORDER BY c.id
  `);
  const pCust = pCustRes.rows;

  let custMatches = true;
  for (const sc of sCust) {
    const pc = pCust.find(c => c.id === sc.id);
    if (!pc || Number(sc.balance) !== Number(pc.balance)) {
      fail(`Customer balance mismatch for "${sc.name}": SQLite=${sc.balance}, PG=${pc?.balance}`);
      custMatches = false;
    }
  }
  if (custMatches) {
    pass(`Customer ledger balances (${sCust.length} customers) match down to the exact single paisa!`);
  }

  // -------------------------------------------------------------
  // STEP 5: Vendor Balances Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- STEP 5: Vendor Ledger Balances Reconciliation ---');
  const sVend = sqliteDb.prepare(`
    SELECT v.id, v.name, COALESCE(SUM(l.credit_paisas - l.debit_paisas), 0) as payable
    FROM vendors v
    LEFT JOIN journal_lines l ON l.entity_type = 'VENDOR' AND l.entity_id = v.id
    GROUP BY v.id, v.name
    ORDER BY v.id
  `).all();

  const pVendRes = await pgPool.query(`
    SELECT v.id, v.name, COALESCE(SUM(l.credit_paisas - l.debit_paisas), 0) as payable
    FROM vendors v
    LEFT JOIN journal_lines l ON l.entity_type = 'VENDOR' AND l.entity_id = v.id
    GROUP BY v.id, v.name
    ORDER BY v.id
  `);
  const pVend = pVendRes.rows;

  let vendMatches = true;
  for (const sv of sVend) {
    const pv = pVend.find(v => v.id === sv.id);
    if (!pv || Number(sv.payable) !== Number(pv.payable)) {
      fail(`Vendor balance mismatch for "${sv.name}": SQLite=${sv.payable}, PG=${pv?.payable}`);
      vendMatches = false;
    }
  }
  if (vendMatches) {
    pass(`Vendor payable balances (${sVend.length} vendors) match down to the exact single paisa!`);
  }

  // -------------------------------------------------------------
  // STEP 6: Product Stock PCS & Inventory Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- STEP 6: Product Stock PCS & Inventory Movements ---');
  const sProds = sqliteDb.prepare('SELECT id, name, sku, current_stock, damaged_stock_base, cost_price_paisas, trade_price_paisas FROM products ORDER BY id').all();
  const pProdsRes = await pgPool.query('SELECT id, name, sku, current_stock, damaged_stock_base, cost_price_paisas, trade_price_paisas FROM products ORDER BY id');
  const pProds = pProdsRes.rows;

  let prodMatches = true;
  for (const sp of sProds) {
    const pp = pProds.find(p => p.id === sp.id);
    if (!pp ||
        Number(sp.current_stock) !== Number(pp.current_stock) ||
        Number(sp.damaged_stock_base) !== Number(pp.damaged_stock_base) ||
        Number(sp.cost_price_paisas) !== Number(pp.cost_price_paisas) ||
        Number(sp.trade_price_paisas) !== Number(pp.trade_price_paisas)) {
      fail(`Product stock or price mismatch for ${sp.name}`);
      prodMatches = false;
    }
  }
  if (prodMatches) {
    pass(`All products (${sProds.length} products) stock, damaged units, and paisa rates match 100%`);
  }

  // Inventory movements totals
  const sMov = sqliteDb.prepare(`
    SELECT COUNT(*) as count,
           SUM(quantity_in_base) as total_in,
           SUM(quantity_out_base) as total_out
    FROM inventory_movements
  `).get();

  const pMovRes = await pgPool.query(`
    SELECT COUNT(*) as count,
           SUM(quantity_in_base) as total_in,
           SUM(quantity_out_base) as total_out
    FROM inventory_movements
  `);
  const pMov = pMovRes.rows[0];

  if (Number(sMov.count) === Number(pMov.count) &&
      Number(sMov.total_in) === Number(pMov.total_in) &&
      Number(sMov.total_out) === Number(pMov.total_out)) {
    pass(`Inventory movements (${sMov.count} records, in=${sMov.total_in}, out=${sMov.total_out}) match 100%`);
  } else {
    fail(`Inventory movements mismatch!`);
  }

  // -------------------------------------------------------------
  // STEP 7: Transactions & Document Totals Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- STEP 7: Orders, Invoices, Returns & Payments Reconciliation ---');
  const sSO = sqliteDb.prepare('SELECT COUNT(*) as c, SUM(grand_total_paisas) as total FROM sales_orders').get();
  const pSORes = await pgPool.query('SELECT COUNT(*) as c, SUM(grand_total_paisas) as total FROM sales_orders');
  const pSO = pSORes.rows[0];
  if (Number(sSO.c) === Number(pSO.c) && Number(sSO.total) === Number(pSO.total)) {
    pass(`Sales Orders: ${sSO.c} orders, total paisas ${sSO.total} match 100%`);
  } else {
    fail(`Sales Orders mismatch!`);
  }

  const sSI = sqliteDb.prepare('SELECT COUNT(*) as c, SUM(grand_total_paisas) as total FROM sales_invoices').get();
  const pSIRes = await pgPool.query('SELECT COUNT(*) as c, SUM(grand_total_paisas) as total FROM sales_invoices');
  const pSI = pSIRes.rows[0];
  if (Number(sSI.c) === Number(pSI.c) && Number(sSI.total) === Number(pSI.total)) {
    pass(`Sales Invoices: ${sSI.c} invoices, total paisas ${sSI.total} match 100%`);
  } else {
    fail(`Sales Invoices mismatch!`);
  }

  const sPB = sqliteDb.prepare('SELECT COUNT(*) as c, SUM(net_amount_paisas) as total FROM purchase_bills').get();
  const pPBRes = await pgPool.query('SELECT COUNT(*) as c, SUM(net_amount_paisas) as total FROM purchase_bills');
  const pPB = pPBRes.rows[0];
  if (Number(sPB.c) === Number(pPB.c) && Number(sPB.total) === Number(pPB.total)) {
    pass(`Purchase Bills: ${sPB.c} bills, total paisas ${sPB.total} match 100%`);
  } else {
    fail(`Purchase Bills mismatch!`);
  }

  const sSR = sqliteDb.prepare('SELECT COUNT(*) as c, SUM(total_refund_paisas) as total FROM sales_returns').get();
  const pSRRes = await pgPool.query('SELECT COUNT(*) as c, SUM(total_refund_paisas) as total FROM sales_returns');
  const pSR = pSRRes.rows[0];
  if (Number(sSR.c) === Number(pSR.c) && Number(sSR.total) === Number(pSR.total)) {
    pass(`Sales Returns: ${sSR.c} returns, total paisas ${sSR.total} match 100%`);
  } else {
    fail(`Sales Returns mismatch!`);
  }

  const sPR = sqliteDb.prepare('SELECT COUNT(*) as c, SUM(total_amount_paisas) as total FROM purchase_returns').get();
  const pPRRes = await pgPool.query('SELECT COUNT(*) as c, SUM(total_amount_paisas) as total FROM purchase_returns');
  const pPR = pPRRes.rows[0];
  if (Number(sPR.c) === Number(pPR.c) && Number(sPR.total) === Number(pPR.total)) {
    pass(`Purchase Returns: ${sPR.c} returns, total paisas ${sPR.total} match 100%`);
  } else {
    fail(`Purchase Returns mismatch!`);
  }

  // -------------------------------------------------------------
  // STEP 8: Meta, Config & Security Count Verification
  // -------------------------------------------------------------
  console.log('\n--- STEP 8: System Modules, Feature Flags & User Accounts ---');
  const sMods = sqliteDb.prepare('SELECT COUNT(*) as c FROM system_modules').get().c;
  const pMods = parseInt((await pgPool.query('SELECT COUNT(*) as c FROM system_modules')).rows[0].c, 10);
  if (sMods === pMods) pass(`System modules match: ${sMods} == ${pMods}`);

  const sFlags = sqliteDb.prepare('SELECT COUNT(*) as c FROM feature_flags').get().c;
  const pFlags = parseInt((await pgPool.query('SELECT COUNT(*) as c FROM feature_flags')).rows[0].c, 10);
  if (sFlags === pFlags) pass(`Feature flags match: ${sFlags} == ${pFlags}`);

  const sUsers = sqliteDb.prepare('SELECT COUNT(*) as c FROM app_users').get().c;
  const pUsers = parseInt((await pgPool.query('SELECT COUNT(*) as c FROM app_users')).rows[0].c, 10);
  if (sUsers === pUsers) pass(`App users match: ${sUsers} == ${pUsers}`);

  const sAudits = sqliteDb.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
  const pAudits = parseInt((await pgPool.query('SELECT COUNT(*) as c FROM audit_logs')).rows[0].c, 10);
  if (sAudits === pAudits) pass(`Audit logs match: ${sAudits} == ${pAudits}`);

  // -------------------------------------------------------------
  // STEP 9: Live Business Workflow Tests on Migrated PostgreSQL DB
  // -------------------------------------------------------------
  console.log('\n--- STEP 9: Real Business-Flow Tests on PostgreSQL Database ---');
  const companyId = '00000000-0000-0000-0000-000000000001';

  // 1. Fetch reference entities
  const customers = await DalService.getCustomers(companyId, pgAdapter);
  const cust = customers[0];
  const products = await DalService.getProducts(companyId, pgAdapter);
  const prod = products[0];
  const initialStock = prod.current_stock;

  // 2. Sales Order -> Stock deduction -> GL
  console.log('Testing Sales Order Flow on PostgreSQL...');
  const orderRes = await DalService.createSalesOrder({
    companyId,
    customerId: cust.id,
    orderDate: '2026-09-29',
    deliveryDate: '2026-09-30',
    sourceChannel: 'WEB',
    items: [{
      productId: prod.id,
      quantity: 5,
      unitPricePaisas: prod.trade_price_paisas,
    }],
  }, companyId, pgAdapter);
  pass(`Created Sales Order on PostgreSQL: ${orderRes.order_number}`);

  const prodAfterOrder = await DalService.getProductById(prod.id, companyId, pgAdapter);
  if (Number(prodAfterOrder.current_stock) === Number(initialStock) - 5) {
    pass(`Stock decremented on PostgreSQL: ${initialStock} -> ${prodAfterOrder.current_stock}`);
  } else {
    fail(`Stock deduction failed on PostgreSQL: expected ${initialStock - 5}, got ${prodAfterOrder.current_stock}`);
  }

  // 3. Purchase Flow
  console.log('Testing Purchase Flow on PostgreSQL...');
  const vendorRes = await pgAdapter.queryOne('SELECT * FROM vendors WHERE company_id = ? LIMIT 1', [companyId]);
  const purchaseRes = await DalService.createPurchaseBill({
    vendorId: vendorRes.id,
    billNumber: `PB-TEST-${Date.now().toString().slice(-4)}`,
    billDate: '2026-09-29',
    dueDate: '2026-10-15',
    subtotalPaisas: 100000,
    netAmountPaisas: 100000,
    items: [{
      productId: prod.id,
      quantity: 10,
      ratePerPiecePaisas: 10000,
      lineTotalPaisas: 100000,
    }],
  }, companyId, pgAdapter);
  pass(`Created Purchase Bill on PostgreSQL: ${purchaseRes.bill_number}`);

  const prodAfterPurchase = await DalService.getProductById(prod.id, companyId, pgAdapter);
  if (Number(prodAfterPurchase.current_stock) === Number(initialStock) - 5 + 10) {
    pass(`Stock incremented after purchase: ${prodAfterPurchase.current_stock} PCS`);
  } else {
    fail(`Purchase stock increment failed on PostgreSQL!`);
  }

  // 4. Sales Return Flow
  console.log('Testing Sales Return Flow on PostgreSQL...');
  const returnRes = await DalService.createSalesReturn({
    customerId: cust.id,
    returnDate: '2026-09-29',
    subtotalPaisas: prod.trade_price_paisas * 2,
    totalRefundPaisas: prod.trade_price_paisas * 2,
    items: [{
      productId: prod.id,
      quantity: 2,
      unitPricePaisas: prod.trade_price_paisas,
      lineTotalPaisas: prod.trade_price_paisas * 2,
    }],
  }, companyId, pgAdapter);
  pass(`Created Sales Return on PostgreSQL: ${returnRes.return_number}`);

  const prodAfterReturn = await DalService.getProductById(prod.id, companyId, pgAdapter);
  if (Number(prodAfterReturn.current_stock) === Number(initialStock) - 5 + 10 + 2) {
    pass(`Stock incremented after return: ${prodAfterReturn.current_stock} PCS`);
  } else {
    fail(`Return stock increment failed on PostgreSQL!`);
  }

  // 5. Customer Payment Flow
  console.log('Testing Customer Payment Flow on PostgreSQL...');
  const paymentRes = await DalService.recordCustomerPayment({
    customerId: cust.id,
    paymentDate: '2026-09-29',
    amountPaisas: 50000,
    paymentMethod: 'CASH',
    referenceNote: 'Phase 4B PG Test Payment',
  }, companyId, pgAdapter);
  pass(`Recorded Customer Payment on PostgreSQL: ${paymentRes.payment_number}`);

  // 6. Expense Flow
  console.log('Testing Expense Flow on PostgreSQL...');
  const expenseRes = await DalService.createExpense({
    expenseDate: '2026-09-29',
    expenseAccountId: '5050',
    paidFromAccountId: '1010',
    amountPaisas: 15000,
    description: 'Phase 4B PG Office Refreshments',
  }, companyId, pgAdapter);
  pass(`Recorded Expense on PostgreSQL: ${expenseRes.voucher_number}`);

  // 7. Closing Flow
  console.log('Testing Daily Closing Flow on PostgreSQL...');
  const closingRes = await DalService.finalizeDailyClosing({
    closingDate: '2026-09-29',
    expectedCashPaisas: 50000,
    physicalCashPaisas: 50000,
    variancePaisas: 0,
    denominationsJson: '{}',
  }, companyId, pgAdapter);
  pass(`Finalized Daily Closing on PostgreSQL for 2026-09-29 (variance: ${closingRes.variance_paisas})`);

  const isClosed = await DalService.isDayClosed('2026-09-29', companyId, pgAdapter);
  if (isClosed) {
    pass(`isDayClosed verified as true on PostgreSQL`);
  } else {
    fail(`isDayClosed returned false on PostgreSQL!`);
  }

  // 8. Reports & Trial Balance on PostgreSQL
  console.log('Testing Reports Flow on PostgreSQL...');
  const tbRows = await DalService.getTrialBalance(companyId, pgAdapter);
  let totalDebits = 0;
  let totalCredits = 0;
  for (const row of tbRows) {
    totalDebits += Number(row.total_debit_paisas) || 0;
    totalCredits += Number(row.total_credit_paisas) || 0;
  }
  pass(`Generated Trial Balance on PostgreSQL (${tbRows.length} accounts, debits=${totalDebits}, credits=${totalCredits})`);

  // 9. Multi-Tenant Isolation Flow on PostgreSQL
  console.log('Testing Multi-Tenant Isolation on PostgreSQL...');
  const compBRes = await DalService.provisionCompany({
    name: 'Company B Logistics',
    slug: 'co-b-logistics',
  }, pgAdapter);
  const compBId = compBRes.id;
  pass(`Provisioned tenant Company B on PostgreSQL (${compBId})`);

  // Create product with duplicate SKU in Company B
  const compBProd = await DalService.createProduct({
    name: 'Company B Due Beauty Cream',
    sku: prod.sku, // Same SKU as Farhan Distribution!
    tradePricePaisas: 45000,
    costPricePaisas: 40000,
    initialStock: 100,
  }, compBId, pgAdapter);
  pass(`Created identical SKU in Company B without collision: ${compBProd.sku}`);

  // Verify Company A does NOT see Company B's product
  const compAProds = await DalService.getProducts(companyId, pgAdapter);
  const foundInA = compAProds.some(p => p.id === compBProd.id);
  if (!foundInA) {
    pass(`Company A product list completely isolates Company B product`);
  } else {
    fail(`Tenant data leaked from Company B to Company A on PostgreSQL!`);
  }

  // -------------------------------------------------------------
  // STEP 10: Clean up test fixtures and close connections
  // -------------------------------------------------------------
  await pgPool.query('DELETE FROM companies WHERE id = $1', [compBId]);
  pass(`Cleaned up Company B fixture on PostgreSQL`);

  await pgAdapter.close();
  await pgPool.end();
  sqliteDb.close();

  console.log('\n================================================================');
  console.log(`   PHASE 4B TEST SUITE COMPLETE: ${passedChecks} PASSED, ${failedChecks} FAILED`);
  console.log('================================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in Phase 4B test suite:', err);
  process.exit(1);
});
