import path from 'node:path';
import fs from 'node:fs';
import { getAppConfig, isOnPremiseMode, isSqliteDriver } from '../src/core/config/env.ts';
import { getDatabaseClient, getDatabase, getDatabasePath } from '../src/core/database/index.ts';
import { PostgresAdapter, translateSqlPlaceholders } from '../src/core/database/adapters/postgres.adapter.ts';

console.log('================================================================');
console.log('   PHASE 2B: DATABASE ABSTRACTION & ENVIRONMENT TEST SUITE       ');
console.log('================================================================\n');

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    allPassed = false;
  }
}

async function runTests() {
  // 1. Environment Configuration
  console.log('--- 1. Testing Environment Configuration ---');
  const config = getAppConfig();
  assert(config.deploymentMode === 'onpremise', `deploymentMode is 'onpremise' (found: ${config.deploymentMode})`);
  assert(config.databaseDriver === 'sqlite', `databaseDriver is 'sqlite' (found: ${config.databaseDriver})`);
  assert(config.sqliteDatabasePath.endsWith(path.join('data', 'sales_distribution.db')), `sqliteDatabasePath correctly resolved: ${config.sqliteDatabasePath}`);
  assert(isOnPremiseMode() === true, 'isOnPremiseMode() helper returns true');
  assert(isSqliteDriver() === true, 'isSqliteDriver() helper returns true');

  // 2. Backward Compatibility with getDatabase()
  console.log('\n--- 2. Testing Synchronous SQLite Backward Compatibility ---');
  const syncDb = getDatabase();
  assert(syncDb !== undefined && typeof syncDb.prepare === 'function', 'getDatabase() returns valid DatabaseSync handle');
  assert(getDatabasePath() === config.sqliteDatabasePath, 'getDatabasePath() returns centralized configured path');

  const company = syncDb.prepare("SELECT * FROM companies WHERE slug='farhan'").get();
  assert(company && company.name === 'Farhan Distribution', `getDatabase() reads Farhan Distribution directly: ${company?.name}`);

  const tenant = syncDb.prepare("SELECT * FROM tenants WHERE slug='farhan'").get();
  assert(tenant && tenant.name === 'Farhan Distribution', `getDatabase() reads tenants compatibility view: ${tenant?.name}`);

  // 3. Database Abstraction Layer (DAL) Factory & Client
  console.log('\n--- 3. Testing DAL Factory & Asynchronous Client ---');
  const client = getDatabaseClient();
  assert(client !== undefined, 'getDatabaseClient() returns a client instance');
  assert(client.driver === 'sqlite', `client.driver is 'sqlite' (found: ${client.driver})`);
  assert(client.isConnected() === true, 'client.isConnected() returns true');

  // Query multiple rows
  const modules = await client.query('SELECT module_id, is_enabled FROM company_modules WHERE company_id = ?', [company.id]);
  assert(Array.isArray(modules) && modules.length === 12, `client.query returns array of 12 company modules (found: ${modules.length})`);

  // Query single row
  const adminUser = await client.queryOne('SELECT username, full_name, role FROM app_users WHERE username = ?', ['admin']);
  assert(adminUser && adminUser.username === 'admin', `client.queryOne finds admin user: ${adminUser?.username} (${adminUser?.role})`);

  // Non-existent row returns null
  const missing = await client.queryOne('SELECT * FROM app_users WHERE username = ?', ['non_existent_user_xyz']);
  assert(missing === null, 'client.queryOne returns null when no row matches');

  // Atomic transaction runner with rollback test
  console.log('\n--- 4. Testing DAL Transaction Support ---');
  let txRan = false;
  try {
    await client.transaction(async (tx) => {
      // Temporary insertion inside transaction
      await tx.execute(
        "INSERT INTO brands (id, company_id, name, description) VALUES (?, ?, ?, ?)",
        ['test-brand-tx', company.id, 'Temporary DAL Brand', 'Testing rollback']
      );
      txRan = true;
      // Intentionally throw to verify transaction rollback
      throw new Error('SIMULATED_ABORT');
    });
  } catch (err) {
    assert(err.message === 'SIMULATED_ABORT', 'Transaction aborted and threw as expected');
  }
  assert(txRan === true, 'Transaction callback executed');

  // Verify rollback was atomic
  const rolledBackBrand = await client.queryOne('SELECT * FROM brands WHERE id = ?', ['test-brand-tx']);
  assert(rolledBackBrand === null, 'Transaction rollback confirmed: temporary brand not persisted');

  // 5. PostgreSQL Adapter Readiness & Translation
  console.log('\n--- 5. Testing PostgreSQL Adapter Readiness ---');
  const translated = translateSqlPlaceholders('SELECT * FROM products WHERE company_id = ? AND sku = ? AND is_active = ?');
  assert(
    translated === 'SELECT * FROM products WHERE company_id = $1 AND sku = $2 AND is_active = $3',
    `translateSqlPlaceholders correctly converts ? to $1, $2, $3: "${translated}"`
  );

  const pgAdapter = new PostgresAdapter('postgresql://user:pass@localhost:5432/test_erp');
  assert(pgAdapter.driver === 'postgres', `pgAdapter.driver is 'postgres'`);
  assert(pgAdapter.isConnected() === false, 'pgAdapter is not connected yet (clean readiness state)');

  // Missing URL guard test
  const emptyPg = new PostgresAdapter('');
  let guardTriggered = false;
  try {
    await emptyPg.query('SELECT 1');
  } catch (e) {
    guardTriggered = e.message.includes('PostgreSQL connection URL is missing');
  }
  assert(guardTriggered === true, 'PostgreSQL adapter cleanly guards against missing DATABASE_URL');

  // 6. Final Baseline Verification
  console.log('\n--- 6. Verifying Financial & Stock Baseline Remains 100% Intact ---');
  const baselinePath = path.join(process.cwd(), 'backups', 'pre_phase2a_baseline_20260928_211955.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const lines = syncDb.prepare(`
    SELECT 
      COUNT(*) as total_lines,
      COALESCE(SUM(jl.debit_paisas), 0) as total_debit,
      COALESCE(SUM(jl.credit_paisas), 0) as total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_id = je.id
    WHERE je.status = 'POSTED'
  `).get();

  const expectedLines = 130;
  const expectedDebits = 79732606;
  const expectedCredits = 80232606;
  assert(lines.total_lines === expectedLines, `Total journal lines unchanged: ${lines.total_lines} == ${expectedLines}`);
  assert(lines.total_debit === expectedDebits, `Total debit paisas unchanged: ${lines.total_debit} == ${expectedDebits}`);
  assert(lines.total_credit === expectedCredits, `Total credit paisas unchanged: ${lines.total_credit} == ${expectedCredits}`);

  for (const p of baseline.products) {
    const stockRow = syncDb.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(p.id);
    assert(stockRow.current_stock_base === p.current_stock_base, `Product stock unchanged: ${p.name} = ${stockRow.current_stock_base} base PCS`);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('   >>> ALL PHASE 2B DAL & ENVIRONMENT CHECKS PASSED! <<<       ');
  } else {
    console.error('   >>> SOME CHECKS FAILED! <<<                                ');
  }
  console.log('================================================================');

  process.exit(allPassed ? 0 : 1);
}

runTests().catch((e) => {
  console.error('Unhandled test failure:', e);
  process.exit(1);
});
