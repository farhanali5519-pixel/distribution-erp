import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function convertGlobalUniquesToCompanyScoped(db) {
  console.log('[Phase 2A] Checking for legacy global column UNIQUE constraints to convert to company-scoped...');

  const tablesToConvert = [
    { table: 'app_users', col: 'username', regex: /username\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'username TEXT NOT NULL' },
    { table: 'brands', col: 'name', regex: /name\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'name TEXT NOT NULL' },
    { table: 'categories', col: 'name', regex: /name\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'name TEXT NOT NULL' },
    { table: 'chart_of_accounts', col: 'code', regex: /code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'code TEXT NOT NULL' },
    { table: 'customer_payments', col: 'payment_number', regex: /payment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'payment_number TEXT NOT NULL' },
    { table: 'daily_closings', col: 'closing_date', regex: /closing_date\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'closing_date TEXT NOT NULL' },
    { table: 'expenses', col: 'voucher_number', regex: /voucher_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'voucher_number TEXT NOT NULL' },
    { table: 'inventory_movements', col: 'movement_number', regex: /movement_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'movement_number TEXT NOT NULL' },
    { table: 'journal_entries', col: 'entry_number', regex: /entry_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'entry_number TEXT NOT NULL' },
    { table: 'products', col: 'sku', regex: /sku\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'sku TEXT NOT NULL' },
    { table: 'purchase_bills', col: 'bill_number', regex: /bill_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'bill_number TEXT NOT NULL' },
    { table: 'purchase_returns', col: 'return_number', regex: /return_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'return_number TEXT NOT NULL' },
    { table: 'routes', col: 'code', regex: /code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'code TEXT NOT NULL' },
    { table: 'sales_invoices', col: 'invoice_number', regex: /invoice_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'invoice_number TEXT NOT NULL' },
    { table: 'sales_orders', col: 'order_number', regex: /order_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'order_number TEXT NOT NULL' },
    { table: 'sales_returns', col: 'return_number', regex: /return_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'return_number TEXT NOT NULL' },
    { table: 'staff_members', col: 'employee_code', regex: /employee_code\s+TEXT\s+UNIQUE/i, replace: 'employee_code TEXT' },
    { table: 'stock_adjustments', col: 'adjustment_number', regex: /adjustment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'adjustment_number TEXT NOT NULL' },
    { table: 'vendor_payments', col: 'payment_number', regex: /payment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'payment_number TEXT NOT NULL' },
  ];

  let convertedCount = 0;

  for (const item of tablesToConvert) {
    const tableIndexes = db.prepare(`PRAGMA index_list('${item.table}')`).all();
    const hasLegacyUnique = tableIndexes.some(idx => idx.unique === 1 && idx.origin === 'u');

    if (!hasLegacyUnique) {
      continue; // Already converted or doesn't have legacy column UNIQUE
    }

    console.log(`[Phase 2A] Converting global unique constraint on ${item.table}(${item.col}) to company-scoped...`);

    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(item.table);
    if (!tableSqlRow) continue;

    const origSql = tableSqlRow.sql;
    const newSql = origSql.replace(item.regex, item.replace);

    const tempTable = `_conv_${item.table}`;
    const createTempSql = newSql.replace(new RegExp(`CREATE TABLE (IF NOT EXISTS )?"?${item.table}"?`, 'i'), `CREATE TABLE "${tempTable}"`);

    // Capture custom index definitions before dropping
    const customIndexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(item.table).map(r => r.sql);

    // Get column list
    const cols = db.prepare(`PRAGMA table_info("${item.table}")`).all().map(c => `"${c.name}"`).join(', ');

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(createTempSql);
      db.exec(`INSERT INTO "${tempTable}" (${cols}) SELECT ${cols} FROM "${item.table}";`);
      db.exec(`DROP TABLE "${item.table}";`);
      db.exec(`ALTER TABLE "${tempTable}" RENAME TO "${item.table}";`);

      for (const idxSql of customIndexes) {
        db.exec(idxSql);
      }

      db.exec('COMMIT;');
      convertedCount++;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  console.log(`[Phase 2A] Converted ${convertedCount} tables to company-scoped uniqueness.`);
}

if (process.argv[1] && process.argv[1].endsWith('convert-uniques-phase2a.mjs')) {
  const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);
  try {
    convertGlobalUniquesToCompanyScoped(db);
    const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
    console.log('FK Check Errors:', fkErrors.length);
    const integrity = db.prepare('PRAGMA integrity_check').all();
    console.log('Integrity check:', integrity);
  } finally {
    db.close();
  }
}
