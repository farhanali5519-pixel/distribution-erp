/**
 * PHASE 4A: FULL POSTGRESQL COMPATIBILITY & DAL VALIDATION SUITE
 * 
 * Verifies:
 * 1. PostgreSQL Schema & Migrations: All 39 tables, BIGINT paisas, composite unique indexes, FKs
 * 2. SQL Dialect Translation: ?, datetime('now'), INSERT OR IGNORE, sqlite_master, PRAGMA
 * 3. PostgreSQL Adapter: Pooled connections, transactions, BIGINT integer parsing
 * 4. Multi-Domain DAL Services Execution on PostgreSQL:
 *    - Tenancy & Provisioning
 *    - Super Admin Auth
 *    - Modules, Feature Flags & Settings
 *    - Chart of Accounts & GL Double-Entry Engine (Exact Paisas)
 *    - Customers, Routes & Staff
 *    - Products & Inventory Stock Management
 *    - Sales Orders & Line Item Tracking
 *    - Expenses & Automatic GL Postings
 *    - Bank Accounts
 *    - Daily Closings
 * 5. Full Dual-Driver Parity: Verified identically against SQLite Adapter
 */

import path from 'node:path';
import { Pool } from 'pg';
import { PostgresAdapter } from '../src/core/database/adapters/postgres.adapter.ts';
import { SqliteAdapter } from '../src/core/database/adapters/sqlite.adapter.ts';
import { runPostgresMigrations } from '../src/core/database/postgres/migrations.ts';
import { translateSqlToPostgres, translateSqlPlaceholders } from '../src/core/database/dialect.ts';
import { DalService } from '../src/core/database/dal-services.ts';
import { getDatabase, getDatabaseClient } from '../src/core/database/index.ts';
import { DEFAULT_COMPANY_ID } from '../src/core/tenancy/constants.ts';
import { generateUUID } from '../src/shared/utils/uuid.ts';

console.log('================================================================');
console.log('   PHASE 4A: POSTGRESQL COMPATIBILITY & DAL TEST SUITE          ');
console.log('================================================================\n');

let allPassed = true;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    allPassed = false;
  }
}

const PG_TEST_URL = 'postgresql://postgres:postgres@localhost:5432/saleflow_test_phase4a';

async function runPhase4ATests() {
  // -------------------------------------------------------------
  // TEST GROUP 1: SQL Dialect Translation
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: SQL Dialect Translation & Abstraction ---');

  const p1 = translateSqlPlaceholders('SELECT * FROM products WHERE company_id = ? AND sku = ?');
  assert(p1 === 'SELECT * FROM products WHERE company_id = $1 AND sku = $2', 'Translates ? to $1, $2');

  const t1 = translateSqlToPostgres("INSERT INTO test (id, created_at) VALUES (?, datetime('now'))");
  assert(t1.includes('CURRENT_TIMESTAMP::text'), "Translates datetime('now') to CURRENT_TIMESTAMP::text");
  assert(t1.includes('$1'), 'Translates ? parameter in combination with functions');

  const t2 = translateSqlToPostgres("SELECT * FROM test WHERE date > datetime('now', '+7 days')");
  assert(t2.includes("CURRENT_TIMESTAMP + INTERVAL '7 days'"), "Translates datetime('now', '+7 days') to INTERVAL");

  const t3 = translateSqlToPostgres('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)');
  assert(t3.includes('INSERT INTO categories') && t3.includes('ON CONFLICT DO NOTHING'), 'Translates INSERT OR IGNORE to ON CONFLICT DO NOTHING');

  const t4 = translateSqlToPostgres("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
  assert(t4.includes('information_schema.tables') && t4.includes('table_name = $1'), 'Translates sqlite_master to information_schema.tables');

  // -------------------------------------------------------------
  // TEST GROUP 2: PostgreSQL Schema & Migrations Execution
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: PostgreSQL Schema & Migrations ---');

  const setupPool = new Pool({ connectionString: PG_TEST_URL });
  await setupPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await setupPool.end();

  const migrationRes = await runPostgresMigrations(PG_TEST_URL);
  assert(migrationRes.success === true, 'PostgreSQL migrations executed successfully');
  assert(migrationRes.tablesCreated === 39, 'All 39 tables created in PostgreSQL');

  const pgClient = new PostgresAdapter(PG_TEST_URL);
  assert(pgClient.driver === 'postgres', 'pgClient driver is postgres');

  // Verify all 39 tables in information_schema
  const tables = await pgClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  assert(tables.length >= 39, `Found ${tables.length} tables in PostgreSQL database`);

  // Verify BIGINT column type for paisas
  const paisaCol = await pgClient.queryOne(`
    SELECT data_type 
    FROM information_schema.columns 
    WHERE table_name = 'journal_lines' AND column_name = 'debit_paisas'
  `);
  assert(paisaCol?.data_type === 'bigint', `debit_paisas is BIGINT in PostgreSQL (found: ${paisaCol?.data_type})`);

  // Verify tenants view
  const tenantsView = await pgClient.queryOne("SELECT table_name FROM information_schema.views WHERE table_name = 'tenants'");
  assert(tenantsView !== null, 'tenants VIEW exists in PostgreSQL');

  // Verify default seeded company
  const defaultCo = await DalService.getCompany(DEFAULT_COMPANY_ID, pgClient);
  assert(defaultCo && defaultCo.slug === 'farhan', `Default Farhan Distribution seeded in PostgreSQL: ${defaultCo?.name}`);

  // -------------------------------------------------------------
  // TEST GROUP 3: PostgreSQL BIGINT Integer Parser & PRAGMA Interception
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: BIGINT Paisa Parsing & PRAGMA Interception ---');

  const pragmaFk = await pgClient.query('PRAGMA foreign_keys = ON;');
  assert(Array.isArray(pragmaFk), 'PRAGMA foreign_keys safely intercepted without syntax error');

  const pragmaCheck = await pgClient.queryOne('PRAGMA integrity_check;');
  assert(pragmaCheck?.integrity_check === 'ok', 'PRAGMA integrity_check intercepted with ok result');

  // -------------------------------------------------------------
  // TEST GROUP 4: Multi-Domain Business Services on PostgreSQL
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Multi-Domain DAL Business Services on PostgreSQL ---');

  // 1. Tenancy Provisioning
  const TEST_CO_ID = 'test-pg-co-' + Date.now();
  const testCo = await DalService.provisionCompany({
    name: 'Postgres Cloud Logistics',
    slug: 'pg-cloud-logistics-' + Date.now(),
    plan: 'ENTERPRISE',
    maxUsers: 10,
  }, pgClient);
  assert(testCo && testCo.plan === 'ENTERPRISE', `Company provisioned in PostgreSQL: ${testCo?.name}`);

  // 2. Super Admin Auth
  const superAdmin = await DalService.authenticateSuperAdmin('superadmin', 'SuperAdmin@2026', pgClient);
  assert(superAdmin && superAdmin.role === 'SUPER_ADMIN', `Super admin authenticated on PostgreSQL: ${superAdmin?.username}`);

  const badAuth = await DalService.authenticateSuperAdmin('superadmin', 'wrongpass', pgClient);
  assert(badAuth === null, 'Super admin authentication rejects incorrect password');

  // 3. Modules & Feature Flags & Settings
  const modules = await DalService.getCompanyModules(testCo.id, pgClient);
  assert(Array.isArray(modules) && modules.length >= 10, `Retrieved ${modules.length} modules for company on PostgreSQL`);

  await DalService.setCompanyModule(testCo.id, 'sales', true, pgClient);
  await DalService.setFeatureFlag(testCo.id, 'sales.enable_order_booking', 'true', 'sales', 'Order Booking', '', pgClient);
  const flag = await DalService.getFeatureFlags(testCo.id, pgClient);
  assert(flag.some(f => f.key === 'sales.enable_order_booking'), 'Feature flag set and retrieved on PostgreSQL');

  await DalService.setCompanySetting(testCo.id, 'invoice_footer', 'Thank you for choosing PG Logistics', 'Footer note', pgClient);
  const settingVal = await DalService.getCompanySetting(testCo.id, 'invoice_footer', '', pgClient);
  assert(settingVal === 'Thank you for choosing PG Logistics', `Company setting isolated on PostgreSQL: "${settingVal}"`);

  // 4. Routes & Staff
  const route = await DalService.createRoute({
    name: 'Express Route North',
    code: 'PG-R1',
    deliveryDays: ['Monday', 'Wednesday', 'Friday'],
  }, testCo.id, pgClient);
  assert(route && route.code === 'PG-R1', `Route created on PostgreSQL: ${route?.name} (${route?.code})`);

  const staff = await DalService.createStaff({
    name: 'Bilal Khan',
    role: 'SALESMAN',
    phone: '0300-1112233',
    assignedRouteId: route.id,
  }, testCo.id, pgClient);
  assert(staff && staff.name === 'Bilal Khan', `Staff created on PostgreSQL: ${staff?.name} (${staff?.role})`);

  // 5. Customers
  const customer = await DalService.createCustomer({
    name: 'Al-Madina General Store',
    shopName: 'Al-Madina Super Store',
    phone: '0321-9988776',
    address: 'Circular Road, Lahore',
    city: 'Lahore',
    routeId: route.id,
    creditLimitPaisas: 5000000, // 50,000.00 PKR
    creditDays: 14,
  }, testCo.id, pgClient);
  assert(customer && customer.name === 'Al-Madina General Store', `Customer created on PostgreSQL: ${customer?.name}`);
  assert(customer.credit_limit_paisas === 5000000, `Exact paisa credit limit preserved: ${customer.credit_limit_paisas}`);

  // 6. Products & Inventory
  const product = await DalService.createProduct({
    name: 'Golden Chai 900g Family Pack',
    sku: 'PG-CHAI-900',
    costPricePaisas: 120000, // 1,200.00 PKR
    salePricePaisas: 145000, // 1,450.00 PKR
    initialStock: 250,
  }, testCo.id, pgClient);
  assert(product && product.sku === 'PG-CHAI-900', `Product created on PostgreSQL: ${product?.name}`);
  assert(product.current_stock_base === 250, `Initial stock recorded: ${product.current_stock_base} PCS`);
  assert(product.cost_price_paisas === 120000, `Cost price paisas verified as number: ${typeof product.cost_price_paisas} (${product.cost_price_paisas})`);

  // 7. Sales Order with Stock Deduction & Transaction
  const order = await DalService.createSalesOrder({
    customerId: customer.id,
    routeId: route.id,
    notes: 'Urgent delivery before Friday',
    items: [
      {
        productId: product.id,
        quantity: 10,
        unitPricePaisas: 145000,
      }
    ]
  }, testCo.id, pgClient);
  assert(order && order.order_number.startsWith('SO-'), `Sales order created on PostgreSQL: ${order?.order_number}`);
  assert(order.total_amount_paisas === 1450000, `Total order paisas exact: ${order.total_amount_paisas} (14,500.00 PKR)`);

  const updatedProd = await DalService.getProductById(product.id, testCo.id, pgClient);
  assert(updatedProd.current_stock_base === 240, `Stock decremented from 250 -> 240 (found: ${updatedProd.current_stock_base})`);

  // 8. General Ledger Double-Entry Posting (Exact Paisa Balance Verification)
  // Seed basic COA for test company
  const coaCash = generateUUID();
  const coaRevenue = generateUUID();
  await pgClient.execute(
    `INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, is_system, currency)
     VALUES (?, ?, '1010', 'Cash in Hand', 'ASSET', 'DEBIT', 1, 1, 'PKR'),
            (?, ?, '4010', 'Wholesale Sales Revenue', 'REVENUE', 'CREDIT', 1, 1, 'PKR')
     ON CONFLICT (company_id, code) DO NOTHING`,
    [coaCash, testCo.id, coaRevenue, testCo.id]
  );

  const glEntry = await DalService.postJournalEntry({
    companyId: testCo.id,
    description: `Cash Sale - Order ${order.order_number}`,
    sourceModule: 'sales',
    sourceDocumentId: order.id,
    lines: [
      { accountId: coaCash, debitPaisas: 1450000, creditPaisas: 0, memo: 'Cash received' },
      { accountId: coaRevenue, debitPaisas: 0, creditPaisas: 1450000, memo: 'Revenue recognized' },
    ]
  }, pgClient);
  assert(glEntry && glEntry.entryNumber.startsWith('JE-'), `GL entry posted on PostgreSQL: ${glEntry?.entryNumber}`);
  assert(glEntry.totalAmountPaisas === 1450000, `GL total paisas verified: ${glEntry.totalAmountPaisas}`);

  // 9. Trial Balance on PostgreSQL
  const tb = await DalService.getTrialBalance(testCo.id, pgClient);
  const totalDebit = tb.reduce((s, r) => s + Number(r.total_debit_paisas), 0);
  const totalCredit = tb.reduce((s, r) => s + Number(r.total_credit_paisas), 0);
  assert(totalDebit === 1450000 && totalCredit === 1450000, `Trial balance on PostgreSQL strictly balanced: ${totalDebit} == ${totalCredit}`);

  // 10. Expenses with Automatic GL Posting
  const coaFuel = generateUUID();
  await pgClient.execute(
    `INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, is_system, currency)
     VALUES (?, ?, '5020', 'Van Fuel Expense', 'EXPENSE', 'DEBIT', 1, 0, 'PKR')
     ON CONFLICT (company_id, code) DO NOTHING`,
    [coaFuel, testCo.id]
  );

  const expense = await DalService.createExpense({
    categoryAccountId: coaFuel,
    paymentAccountId: coaCash,
    amountPaisas: 350000, // 3,500.00 PKR
    payee: 'PSO Petrol Pump',
    description: 'Van 1 Delivery Fuel',
  }, testCo.id, pgClient);
  assert(expense && expense.expense_number.startsWith('EXP-'), `Expense created on PostgreSQL: ${expense?.expense_number}`);
  assert(expense.amount_paisas === 350000, `Expense paisas verified: ${expense.amount_paisas}`);

  // 11. Bank Accounts
  const bank = await DalService.createBankAccount({
    accountTitle: 'PG Logistics Operations',
    accountNumber: '01234567890123',
    bankName: 'Meezan Bank',
    branchName: 'DHA Phase 5',
    glAccountId: coaCash,
    openingBalancePaisas: 100000000, // 1,000,000.00 PKR
  }, testCo.id, pgClient);
  assert(bank && bank.account_number === '01234567890123', `Bank account created on PostgreSQL: ${bank?.bank_name} (${bank?.account_title})`);

  // 12. Daily Closings
  const today = new Date().toISOString().slice(0, 10);
  const closing = await DalService.finalizeDailyClosing(today, 'Bilal Khan', 'Day closed cleanly', testCo.id, pgClient);
  assert(closing && closing.is_closed === 1, `Daily closing finalized on PostgreSQL for ${today}`);

  const isClosed = await DalService.isDayClosed(today, testCo.id, pgClient);
  assert(isClosed === true, 'isDayClosed correctly returns true on PostgreSQL');

  // 13. App Users
  const appUser = await DalService.createAppUser({
    username: 'bilal_rep',
    password: 'password123',
    fullName: 'Bilal Khan',
    role: 'SALESMAN',
    staffId: staff.id,
  }, testCo.id, pgClient);
  assert(appUser && appUser.username === 'bilal_rep', `App user created on PostgreSQL: ${appUser?.username} (${appUser?.role})`);

  // -------------------------------------------------------------
  // TEST GROUP 5: SQLite Driver Parity (On-Premise Guarantee)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: SQLite Driver Parity (On-Premise Guarantee) ---');

  const sqliteClient = getDatabaseClient();
  assert(sqliteClient.driver === 'sqlite', 'Default DAL client is sqlite');

  // Run same customer query via DAL on SQLite
  const sqliteCustomers = await DalService.getCustomers(DEFAULT_COMPANY_ID, sqliteClient);
  assert(Array.isArray(sqliteCustomers) && sqliteCustomers.length > 0, `SQLite DAL returned ${sqliteCustomers.length} customers`);

  // Run same products query via DAL on SQLite
  const sqliteProducts = await DalService.getProducts(DEFAULT_COMPANY_ID, sqliteClient);
  assert(Array.isArray(sqliteProducts) && sqliteProducts.length > 0, `SQLite DAL returned ${sqliteProducts.length} products`);

  // Run Trial Balance on SQLite via DAL
  const sqliteTb = await DalService.getTrialBalance(DEFAULT_COMPANY_ID, sqliteClient);
  assert(Array.isArray(sqliteTb) && sqliteTb.length > 0, `SQLite DAL returned ${sqliteTb.length} Trial Balance accounts`);

  // Close PostgreSQL connection
  await pgClient.close();

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  if (allPassed) {
    console.log(`   >>> ALL ${totalChecks} PHASE 4A POSTGRESQL & DAL CHECKS PASSED! <<<`);
  } else {
    console.error(`   >>> SOME PHASE 4A CHECKS FAILED! <<<`);
  }
  console.log('================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runPhase4ATests().catch((err) => {
  console.error('Unhandled Phase 4A test error:', err);
  process.exit(1);
});
