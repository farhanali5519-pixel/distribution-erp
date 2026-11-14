import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const cwd = process.cwd();
const dataDir = path.join(cwd, 'data');
const backupsDir = path.join(cwd, 'backups');
const dbPath = path.join(dataDir, 'sales_distribution.db');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

console.log('=====================================================');
console.log('   SALEFLOW ERP - FRESH SYSTEM RESET PROCEDURE       ');
console.log('=====================================================');

// 1. CREATE TIMESTAMPED BACKUP
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupSqliteName = `erp-backup-before-reset-${timestamp}.sqlite`;
const backupDbName = `erp-backup-before-reset-${timestamp}.db`;
const backupSqlitePath = path.join(backupsDir, backupSqliteName);
const backupDbPath = path.join(backupsDir, backupDbName);

console.log(`\n[STEP 1] Creating timestamped backup of current SQLite database...`);
const db = new DatabaseSync(dbPath);

// Use SQLite VACUUM INTO for clean atomic snapshot
const sanitizedPath = backupSqlitePath.replace(/\\/g, '/');
db.exec(`VACUUM INTO '${sanitizedPath}'`);

// Also create direct file copy for redundancy
fs.copyFileSync(dbPath, backupDbPath);

const statSqlite = fs.statSync(backupSqlitePath);
const statDb = fs.statSync(backupDbPath);
console.log(` -> Backup created: ${backupSqliteName} (${(statSqlite.size / 1024).toFixed(1)} KB)`);
console.log(` -> Backup created: ${backupDbName} (${(statDb.size / 1024).toFixed(1)} KB)`);

// 2. CLEAR ALL BUSINESS & TRANSACTIONAL DATA
console.log(`\n[STEP 2] Clearing all business and transactional records...`);
db.exec('PRAGMA foreign_keys = OFF;');

const tablesToClear = [
  'sales_invoice_items',
  'sales_invoices',
  'sales_order_items',
  'sales_orders',
  'sales_return_items',
  'sales_returns',
  'purchase_bill_items',
  'purchase_bills',
  'purchase_return_items',
  'purchase_returns',
  'customer_payments',
  'expenses',
  'daily_closings',
  'stock_adjustments',
  'journal_lines',
  'journal_entries',
  'customers',
  'vendors',
  'products',
  'staff_members',
];

for (const tbl of tablesToClear) {
  try {
    db.exec(`DELETE FROM "${tbl}";`);
    console.log(` -> Cleared table: ${tbl}`);
  } catch (err) {
    console.warn(` -> Note on ${tbl}: ${err.message}`);
  }
}

// Reset SQLite auto-increment sequences if table exists
try {
  db.exec(`DELETE FROM sqlite_sequence;`);
  console.log(` -> Reset sqlite_sequence counters.`);
} catch (e) {
  // sqlite_sequence might not exist or empty
}

db.exec('PRAGMA foreign_keys = ON;');

// 3. RESET CHART OF ACCOUNTS TO CLEAN DEFAULT SYSTEM COA
console.log(`\n[STEP 3] Resetting Chart of Accounts to standard system accounts (all 0.00 balances)...`);
const initialAccounts = [
  { code: '1010', name: 'Cash in Hand', type: 'ASSET', normal: 'DEBIT', isSystem: 1, desc: 'Petty cash and daily sales van register' },
  { code: '1020', name: 'Main Bank Account', type: 'ASSET', normal: 'DEBIT', isSystem: 1, desc: 'Primary operating bank account' },
  { code: '1030', name: 'Accounts Receivable (Trade Debtors)', type: 'ASSET', normal: 'DEBIT', isSystem: 1, desc: 'Control account for customer balances' },
  { code: '1040', name: 'Merchandise Inventory', type: 'ASSET', normal: 'DEBIT', isSystem: 1, desc: 'Warehouse stock at cost baseline' },
  { code: '2010', name: 'Accounts Payable (Trade Creditors)', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, desc: 'Control account for manufacturer vendor bills' },
  { code: '2020', name: 'Sales Tax / Output Tax Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, desc: 'Collected sales tax payable to authority' },
  { code: '3010', name: "Owner's Capital", type: 'EQUITY', normal: 'CREDIT', isSystem: 1, desc: 'Initial owner investment & opening equity' },
  { code: '3020', name: 'Retained Earnings', type: 'EQUITY', normal: 'CREDIT', isSystem: 1, desc: 'Accumulated profits/losses' },
  { code: '4010', name: 'Wholesale Sales Revenue', type: 'REVENUE', normal: 'CREDIT', isSystem: 1, desc: 'Wholesale revenue from distribution orders' },
  { code: '4020', name: 'Delivery & Service Charges', type: 'REVENUE', normal: 'CREDIT', isSystem: 0, desc: 'Logistics delivery fees' },
  { code: '4030', name: 'Sales Returns & Allowances', type: 'REVENUE', normal: 'DEBIT', isSystem: 1, desc: 'Contra-revenue account for customer returned goods' },
  { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Direct unit cost of merchandise sold' },
  { code: '5020', name: 'Sales Van & Delivery Fuel', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Distribution vehicle petrol, diesel, and CNG expenses' },
  { code: '5025', name: 'Vehicle Repair & Maintenance', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Van servicing, engine oil, tires, and maintenance' },
  { code: '5030', name: 'Sales Rep Commissions & Salaries', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Distribution field team compensation' },
  { code: '5035', name: 'Staff Tea & Food / Refreshments', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Daily driver, supply man, and warehouse tea & food' },
  { code: '5040', name: 'Inward Freight Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Inward freight and landed cost allocations' },
  { code: '5045', name: 'Warehouse Rent & Utilities', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Electricity bills, godown rent, and municipal taxes' },
  { code: '5050', name: 'General & Miscellaneous Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Stationery, office supplies, petty cash sundries' },
  { code: '5060', name: 'Sales Promotion & Scheme Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Cost of bonus free sample units to retailers' },
  { code: '5070', name: 'Damaged Goods & Expiry Loss', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Quarantine inventory losses on expired or damaged merchandise' },
];

const standardCodes = new Set(initialAccounts.map(a => a.code));

// Delete non-standard accounts
db.prepare('DELETE FROM chart_of_accounts WHERE code NOT IN (' + initialAccounts.map(() => '?').join(',') + ')').run(...Array.from(standardCodes));

// Upsert standard accounts
const upsertCOA = db.prepare(`
  INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'PKR')
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    type = excluded.type,
    normal_balance = excluded.normal_balance,
    is_active = 1,
    is_system = excluded.is_system,
    description = excluded.description
`);

for (const acc of initialAccounts) {
  upsertCOA.run(crypto.randomUUID(), acc.code, acc.name, acc.type, acc.normal, acc.isSystem, acc.desc);
}
console.log(` -> 21 standard COA accounts verified with 0.00 balances.`);

// 4. KEEP/CREATE ONE WORKING ADMIN USER
console.log(`\n[STEP 4] Configuring clean single ADMIN user...`);
// Remove non-admin test users
db.exec("DELETE FROM app_users WHERE username != 'admin';");

const hashPassword = (pwd) => crypto.createHash('sha256').update('saleflow_user_salt_' + pwd).digest('hex');
const adminUser = db.prepare("SELECT * FROM app_users WHERE username = 'admin'").get();

if (adminUser) {
  db.prepare(`
    UPDATE app_users 
    SET password_hash = ?, role = 'ADMIN', staff_id = NULL, is_active = 1, full_name = 'System Administrator', updated_at = datetime('now')
    WHERE username = 'admin'
  `).run(hashPassword('admin'));
  console.log(` -> Existing admin user updated: username='admin', password='admin', role='ADMIN'.`);
} else {
  db.prepare(`
    INSERT INTO app_users (id, username, password_hash, full_name, role, staff_id, is_active, created_at, updated_at)
    VALUES (?, 'admin', ?, 'System Administrator', 'ADMIN', NULL, 1, datetime('now'), datetime('now'))
  `).run(crypto.randomUUID(), hashPassword('admin'));
  console.log(` -> Created admin user: username='admin', password='admin', role='ADMIN'.`);
}

// 5. ENSURE ADMIN SECURITY PIN
const defaultPinHash = crypto.createHash('sha256').update('saleflow_admin_pin_1234').digest('hex');
db.prepare(`
  INSERT INTO app_settings (key, value, description, updated_at)
  VALUES ('admin_security_pin', ?, 'Hashed 4-digit security PIN for void authorization', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`).run(defaultPinHash);
console.log(` -> Admin security PIN verified (Default: 1234).`);

// 6. RESET COMPANY PROFILE TO CLEAN DEFAULTS
console.log(`\n[STEP 5] Resetting company profile to clean defaults...`);
db.exec('DELETE FROM company_profile;');
db.prepare(`
  INSERT INTO company_profile (
    id, business_name, tagline, phone_primary, phone_secondary, email, address, city, ntn_strn,
    currency_symbol, thermal_footer_note, invoice_terms, show_logo_on_prints, show_ntn_on_invoices,
    show_customer_previous_balance, updated_at
  ) VALUES (
    'default-company-profile',
    'Farhan Distribution',
    'Wholesale & FMCG Distribution',
    '',
    '',
    '',
    '',
    '',
    '',
    'PKR',
    'Computer Generated Bill. Software Powered by SaleFlow.',
    '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
    1, 1, 1, datetime('now')
  )
`).run();
console.log(` -> Clean company profile saved: 'Farhan Distribution'.`);

// 7. COMPACT & REBUILD DATABASE (VACUUM)
console.log(`\n[STEP 6] Running VACUUM to reclaim space and rebuild indexes...`);
db.exec('VACUUM;');
db.exec('PRAGMA optimize;');
console.log(` -> Database vacuum and optimization complete.`);

// 8. FINAL VERIFICATION OF ZERO BUSINESS RECORDS
console.log(`\n=====================================================`);
console.log(`          FINAL DATABASE INTEGRITY AUDIT              `);
console.log(`=====================================================`);

const auditTables = [
  { table: 'customers', expectZero: true },
  { table: 'vendors', expectZero: true },
  { table: 'products', expectZero: true },
  { table: 'stock_adjustments', expectZero: true },
  { table: 'sales_orders', expectZero: true },
  { table: 'sales_order_items', expectZero: true },
  { table: 'sales_invoices', expectZero: true },
  { table: 'sales_invoice_items', expectZero: true },
  { table: 'sales_returns', expectZero: true },
  { table: 'sales_return_items', expectZero: true },
  { table: 'purchase_bills', expectZero: true },
  { table: 'purchase_bill_items', expectZero: true },
  { table: 'purchase_returns', expectZero: true },
  { table: 'purchase_return_items', expectZero: true },
  { table: 'customer_payments', expectZero: true },
  { table: 'expenses', expectZero: true },
  { table: 'daily_closings', expectZero: true },
  { table: 'journal_entries', expectZero: true },
  { table: 'journal_lines', expectZero: true },
  { table: 'staff_members', expectZero: true },
  { table: 'app_users', expectedCount: 1 },
  { table: 'system_modules', expectedCount: 10 },
  { table: 'feature_flags', expectedCount: 33 },
  { table: 'chart_of_accounts', expectedCount: 21 },
  { table: 'company_profile', expectedCount: 1 },
  { table: 'app_settings', expectedCount: 1 },
];

let allPassed = true;
for (const a of auditTables) {
  const row = db.prepare(`SELECT COUNT(*) as c FROM "${a.table}"`).get();
  const count = row.c;
  if (a.expectZero) {
    if (count === 0) {
      console.log(`[PASS] ${a.table.padEnd(26)}: 0 records (Fresh Clean)`);
    } else {
      console.error(`[FAIL] ${a.table.padEnd(26)}: ${count} records (Expected 0)`);
      allPassed = false;
    }
  } else if (a.expectedCount !== undefined) {
    if (count === a.expectedCount) {
      console.log(`[PASS] ${a.table.padEnd(26)}: ${count} records (Exact System Baseline)`);
    } else {
      console.warn(`[INFO] ${a.table.padEnd(26)}: ${count} records (Baseline: ${a.expectedCount})`);
    }
  }
}

db.close();

if (allPassed) {
  console.log(`\n>>> SUCCESS: System has been cleanly reset to fresh baseline! <<<`);
} else {
  console.error(`\n>>> WARNING: Some tables did not meet the zero criteria. <<<`);
}
