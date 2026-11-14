import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { DataMigrationService, MIGRATION_TABLE_ORDER } from '../src/core/database/postgres/data-migration';

const { Pool } = pg;

function getSqliteHash(filePath: string) {
  const stat = fs.statSync(filePath);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return { hash, size: stat.size, mtime: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
}

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is missing in .env');
    process.exit(1);
  }

  const sqlitePath = path.resolve(process.cwd(), 'data', 'sales_distribution.db');
  const hashBefore = getSqliteHash(sqlitePath);
  console.log('--- Step 1: Pre-Migration SQLite Integrity Check ---');
  console.log(`- Path: ${sqlitePath}`);
  console.log(`- Size: ${hashBefore.size} bytes`);
  console.log(`- Modified: ${hashBefore.mtime}`);
  console.log(`- SHA-256: ${hashBefore.hash}\n`);

  console.log('--- Step 2: Executing Canonical Data Migration ---');
  const migrationResult = await DataMigrationService.migrateSqliteToPostgres({
    sqliteDbPath: sqlitePath,
    postgresUrl: dbUrl,
  });
  console.log('Migration Completed:');
  console.log(`- Tables Migrated: ${migrationResult.tablesMigrated}`);
  console.log(`- Total Records Migrated: ${migrationResult.totalRecordsMigrated}`);
  console.log(`- Duration: ${migrationResult.durationMs}ms\n`);

  const hashAfter = getSqliteHash(sqlitePath);
  const sqliteUntouched = (
    hashBefore.hash === hashAfter.hash &&
    hashBefore.size === hashAfter.size &&
    hashBefore.mtimeMs === hashAfter.mtimeMs
  );
  console.log('--- Step 3: Post-Migration SQLite Integrity Check ---');
  console.log(`- Size: ${hashAfter.size} bytes (Match: ${hashBefore.size === hashAfter.size})`);
  console.log(`- SHA-256: ${hashAfter.hash} (Match: ${hashBefore.hash === hashAfter.hash})`);
  console.log(`- SQLite 100% Untouched: ${sqliteUntouched}\n`);

  if (!sqliteUntouched) {
    throw new Error('CRITICAL: SQLite database was altered during migration!');
  }

  // Connect to PostgreSQL for deep reconciliation
  const isCloudOrSupabase = dbUrl.includes('supabase') || dbUrl.includes('pooler') || dbUrl.includes('sslmode=require');
  const pool = new Pool({
    connectionString: dbUrl,
    max: 2,
    ssl: isCloudOrSupabase ? { rejectUnauthorized: false } : undefined,
  });
  const pgClient = await pool.connect();
  const sqliteDb = new DatabaseSync(sqlitePath, { open: true });

  try {
    console.log('--- Step 4: Table-by-Table Row Count Reconciliation ---');
    const tableReconciliation: any[] = [];
    let allMatches = true;

    for (const t of MIGRATION_TABLE_ORDER) {
      const sCount = (sqliteDb.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get() as any).c;
      const pCount = parseInt((await pgClient.query(`SELECT COUNT(*) as c FROM "${t}"`)).rows[0].c, 10);
      const diff = pCount - sCount;
      const match = sCount === pCount;
      if (!match) allMatches = false;
      tableReconciliation.push({ table: t, sqlite: sCount, postgres: pCount, diff, match });
    }
    console.log(`Reconciled ${tableReconciliation.length} tables. All counts match: ${allMatches}`);

    console.log('\n--- Step 5: Financial Totals Reconciliation ---');
    // 1. Sales Invoices
    const sSales = sqliteDb.prepare(`SELECT COALESCE(SUM(grand_total_paisas), 0) as total FROM sales_invoices`).get() as any;
    const pSales = (await pgClient.query(`SELECT COALESCE(SUM(grand_total_paisas), 0) as total FROM sales_invoices`)).rows[0];

    // 2. Purchase Bills
    const sPurch = sqliteDb.prepare(`SELECT COALESCE(SUM(net_amount_paisas), 0) as total FROM purchase_bills`).get() as any;
    const pPurch = (await pgClient.query(`SELECT COALESCE(SUM(net_amount_paisas), 0) as total FROM purchase_bills`)).rows[0];

    // 3. Customer Payments
    const sCustPay = sqliteDb.prepare(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM customer_payments`).get() as any;
    const pCustPay = (await pgClient.query(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM customer_payments`)).rows[0];

    // 4. Vendor Payments
    const sVendPay = sqliteDb.prepare(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM vendor_payments`).get() as any;
    const pVendPay = (await pgClient.query(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM vendor_payments`)).rows[0];

    // 5. Expenses
    const sExp = sqliteDb.prepare(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM expenses`).get() as any;
    const pExp = (await pgClient.query(`SELECT COALESCE(SUM(amount_paisas), 0) as total FROM expenses`)).rows[0];

    // 6. Journal Debits & Credits
    const sJnl = sqliteDb.prepare(`SELECT COALESCE(SUM(debit_paisas), 0) as debits, COALESCE(SUM(credit_paisas), 0) as credits FROM journal_lines`).get() as any;
    const pJnl = (await pgClient.query(`SELECT COALESCE(SUM(debit_paisas), 0) as debits, COALESCE(SUM(credit_paisas), 0) as credits FROM journal_lines`)).rows[0];

    // 7. Inventory Movement Quantities
    const sInv = sqliteDb.prepare(`SELECT COALESCE(SUM(net_quantity_base), 0) as total_qty FROM inventory_movements`).get() as any;
    const pInv = (await pgClient.query(`SELECT COALESCE(SUM(net_quantity_base), 0) as total_qty FROM inventory_movements`)).rows[0];

    const financialReconciliation = {
      salesInvoiceGrandTotalPaisas: { sqlite: Number(sSales.total), postgres: Number(pSales.total), match: Number(sSales.total) === Number(pSales.total) },
      purchaseBillNetPaisas: { sqlite: Number(sPurch.total), postgres: Number(pPurch.total), match: Number(sPurch.total) === Number(pPurch.total) },
      customerPaymentPaisas: { sqlite: Number(sCustPay.total), postgres: Number(pCustPay.total), match: Number(sCustPay.total) === Number(pCustPay.total) },
      vendorPaymentPaisas: { sqlite: Number(sVendPay.total), postgres: Number(pVendPay.total), match: Number(sVendPay.total) === Number(pVendPay.total) },
      expensePaisas: { sqlite: Number(sExp.total), postgres: Number(pExp.total), match: Number(sExp.total) === Number(pExp.total) },
      journalDebitsPaisas: { sqlite: Number(sJnl.debits), postgres: Number(pJnl.debits), match: Number(sJnl.debits) === Number(pJnl.debits) },
      journalCreditsPaisas: { sqlite: Number(sJnl.credits), postgres: Number(pJnl.credits), match: Number(sJnl.credits) === Number(pJnl.credits) },
      inventoryMovementQty: { sqlite: Number(sInv.total_qty), postgres: Number(pInv.total_qty), match: Number(sInv.total_qty) === Number(pInv.total_qty) },
    };
    console.log(JSON.stringify(financialReconciliation, null, 2));

    console.log('\n--- Step 6: Inventory Reconciliation by Product ---');
    const sProds = sqliteDb.prepare(`SELECT id, name, sku, current_stock_base, current_stock FROM products ORDER BY name`).all() as any[];
    const pProds = (await pgClient.query(`SELECT id, name, sku, current_stock_base, current_stock FROM products ORDER BY name`)).rows;
    let inventoryMatches = true;
    for (let i = 0; i < sProds.length; i++) {
      const sp = sProds[i];
      const pp = pProds[i];
      const match = sp.id === pp.id && Number(sp.current_stock_base) === Number(pp.current_stock_base) && Number(sp.current_stock) === Number(pp.current_stock);
      if (!match) inventoryMatches = false;
      console.log(`Product "${sp.name}": SQLite Stock=${sp.current_stock_base}, Supabase Stock=${pp.current_stock_base} (Match: ${match})`);
    }

    console.log('\n--- Step 7: Referential Integrity & Orphan Checks ---');
    const orphanChecks = [
      { name: 'orphan_sales_order_items', sql: `SELECT COUNT(*) as c FROM sales_order_items WHERE order_id NOT IN (SELECT id FROM sales_orders)` },
      { name: 'orphan_sales_invoice_items', sql: `SELECT COUNT(*) as c FROM sales_invoice_items WHERE invoice_id NOT IN (SELECT id FROM sales_invoices)` },
      { name: 'orphan_purchase_bill_items', sql: `SELECT COUNT(*) as c FROM purchase_bill_items WHERE bill_id NOT IN (SELECT id FROM purchase_bills)` },
      { name: 'orphan_journal_lines', sql: `SELECT COUNT(*) as c FROM journal_lines WHERE journal_id NOT IN (SELECT id FROM journal_entries)` },
      { name: 'orphan_journal_accounts', sql: `SELECT COUNT(*) as c FROM journal_lines WHERE account_id NOT IN (SELECT id FROM chart_of_accounts)` },
      { name: 'orphan_inventory_movements', sql: `SELECT COUNT(*) as c FROM inventory_movements WHERE product_id NOT IN (SELECT id FROM products)` },
      { name: 'orphan_company_records', sql: `SELECT COUNT(*) as c FROM products WHERE company_id NOT IN (SELECT id FROM companies)` },
    ];
    let allOrphansZero = true;
    for (const oc of orphanChecks) {
      const count = parseInt((await pgClient.query(oc.sql)).rows[0].c, 10);
      if (count > 0) allOrphansZero = false;
      console.log(`- ${oc.name}: ${count}`);
    }
    console.log(`All Orphan Checks Passed: ${allOrphansZero}`);

    console.log('\n--- Step 8: Sample Record Verification ---');
    const sampleProduct = (await pgClient.query('SELECT id, name, sku, trade_price_paisas, cost_price_paisas FROM products LIMIT 1')).rows[0];
    const sampleCustomer = (await pgClient.query('SELECT id, name, route_id, balance FROM customers LIMIT 1')).rows[0];
    const sampleOrder = (await pgClient.query('SELECT id, order_number, grand_total_paisas FROM sales_orders LIMIT 1')).rows[0];
    const sampleInvoice = (await pgClient.query('SELECT id, invoice_number, grand_total_paisas FROM sales_invoices LIMIT 1')).rows[0];
    const sampleBill = (await pgClient.query('SELECT id, bill_number, net_amount_paisas FROM purchase_bills LIMIT 1')).rows[0];
    const sampleJournal = (await pgClient.query('SELECT id, entry_number, entry_date, status FROM journal_entries LIMIT 1')).rows[0];
    const sampleInvMov = (await pgClient.query('SELECT id, movement_number, movement_type, net_quantity_base FROM inventory_movements LIMIT 1')).rows[0];

    // Check with SQLite
    const sSampleProduct = sampleProduct ? sqliteDb.prepare('SELECT id, name, sku, trade_price_paisas, cost_price_paisas FROM products WHERE id = ?').get(sampleProduct.id) as any : null;
    const sSampleCustomer = sampleCustomer ? sqliteDb.prepare('SELECT id, name, route_id, balance FROM customers WHERE id = ?').get(sampleCustomer.id) as any : null;
    const sSampleOrder = sampleOrder ? sqliteDb.prepare('SELECT id, order_number, grand_total_paisas FROM sales_orders WHERE id = ?').get(sampleOrder.id) as any : null;
    const sSampleInvoice = sampleInvoice ? sqliteDb.prepare('SELECT id, invoice_number, grand_total_paisas FROM sales_invoices WHERE id = ?').get(sampleInvoice.id) as any : null;
    const sSampleBill = sampleBill ? sqliteDb.prepare('SELECT id, bill_number, net_amount_paisas FROM purchase_bills WHERE id = ?').get(sampleBill.id) as any : null;
    const sSampleJournal = sampleJournal ? sqliteDb.prepare('SELECT id, entry_number, entry_date, status FROM journal_entries WHERE id = ?').get(sampleJournal.id) as any : null;
    const sSampleInvMov = sampleInvMov ? sqliteDb.prepare('SELECT id, movement_number, movement_type, net_quantity_base FROM inventory_movements WHERE id = ?').get(sampleInvMov.id) as any : null;

    console.log('Sample Matches:');
    if (sampleProduct && sSampleProduct) {
      console.log(`- Product: ID match = ${sampleProduct.id === sSampleProduct.id}, SKU match = ${sampleProduct.sku === sSampleProduct.sku}`);
    } else {
      console.log(`- Product: No records found to sample`);
    }
    if (sampleCustomer && sSampleCustomer) {
      console.log(`- Customer: ID match = ${sampleCustomer.id === sSampleCustomer.id}, Balance match = ${Number(sampleCustomer.balance) === Number(sSampleCustomer.balance)}`);
    } else {
      console.log(`- Customer: No records found to sample`);
    }
    if (sampleOrder && sSampleOrder) {
      console.log(`- Sales Order: ID match = ${sampleOrder.id === sSampleOrder.id}, Grand Total match = ${Number(sampleOrder.grand_total_paisas) === Number(sSampleOrder.grand_total_paisas)}`);
    } else {
      console.log(`- Sales Order: No records found to sample (Table is empty)`);
    }
    if (sampleInvoice && sSampleInvoice) {
      console.log(`- Sales Invoice: ID match = ${sampleInvoice.id === sSampleInvoice.id}, Net match = ${Number(sampleInvoice.grand_total_paisas) === Number(sSampleInvoice.grand_total_paisas)}`);
    } else {
      console.log(`- Sales Invoice: No records found to sample`);
    }
    if (sampleBill && sSampleBill) {
      console.log(`- Purchase Bill: ID match = ${sampleBill.id === sSampleBill.id}, Net match = ${Number(sampleBill.net_amount_paisas) === Number(sSampleBill.net_amount_paisas)}`);
    } else {
      console.log(`- Purchase Bill: No records found to sample`);
    }
    if (sampleJournal && sSampleJournal) {
      console.log(`- Journal Entry: ID match = ${sampleJournal.id === sSampleJournal.id}, Status match = ${sampleJournal.status === sSampleJournal.status}`);
    } else {
      console.log(`- Journal Entry: No records found to sample`);
    }
    if (sampleInvMov && sSampleInvMov) {
      console.log(`- Inv Movement: ID match = ${sampleInvMov.id === sSampleInvMov.id}, Qty match = ${Number(sampleInvMov.net_quantity_base) === Number(sSampleInvMov.net_quantity_base)}`);
    } else {
      console.log(`- Inv Movement: No records found to sample`);
    }

    // Output complete summary JSON to file for reporting
    fs.writeFileSync('scripts/migration-summary-report.json', JSON.stringify({
      tableReconciliation,
      financialReconciliation,
      allMatches,
      allOrphansZero,
      inventoryMatches,
      sqliteUntouched,
      hashBefore,
      hashAfter,
    }, null, 2));

  } finally {
    pgClient.release();
    await pool.end();
    sqliteDb.close();
  }
}

main().catch(err => {
  const safeErr = (err.message || String(err)).replace(/password=[^&\s]+/gi, 'password=***');
  console.error('Migration execution failed:', safeErr);
  if (err.stack) console.error(err.stack.replace(/password=[^&\s]+/gi, 'password=***'));
  process.exit(1);
});
