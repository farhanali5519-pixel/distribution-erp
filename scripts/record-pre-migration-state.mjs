import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupsDir = path.join(process.cwd(), 'backups');
const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const targetSqlite = path.join(backupsDir, `erp-backup-pre-phase2a-${ts}.sqlite`);
const targetDb = path.join(backupsDir, `erp-backup-pre-phase2a-${ts}.db`);
const baselineJsonPath = path.join(backupsDir, `pre_phase2a_baseline_${ts}.json`);

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// 1. Create atomic backup using VACUUM INTO
const liveDb = new DatabaseSync(dbPath);
liveDb.exec(`VACUUM INTO '${targetSqlite.replace(/\\/g, '/')}'`);
liveDb.close();

// Also copy physical file
fs.copyFileSync(dbPath, targetDb);

console.log(`[Backup] VACUUM snapshot created: ${targetSqlite}`);
console.log(`[Backup] Physical file copy created: ${targetDb}`);

// 2. Verify backup database integrity
const backupDb = new DatabaseSync(targetSqlite);
const integrity = backupDb.prepare('PRAGMA integrity_check').get();
console.log('[Backup Verification] Integrity Check:', integrity);
if (integrity.integrity_check !== 'ok') {
  throw new Error(`Backup integrity check failed: ${JSON.stringify(integrity)}`);
}

// 3. Query all tables and row counts
const allTables = backupDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((t) => t.name);

const rowCounts = {};
for (const table of allTables) {
  const row = backupDb.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get();
  rowCounts[table] = row.cnt;
}

// 4. Query Trial Balance & Journal Debits/Credits
const journalTotals = backupDb.prepare(`
  SELECT 
    COUNT(*) as total_entries,
    COALESCE(SUM(total_amount_paisas), 0) as total_entry_amount_paisas,
    COALESCE(SUM(total_amount), 0) as total_entry_amount
  FROM journal_entries
  WHERE status = 'POSTED'
`).get();

const lineTotals = backupDb.prepare(`
  SELECT 
    COUNT(*) as total_lines,
    COALESCE(SUM(debit_paisas), 0) as total_debit_paisas,
    COALESCE(SUM(credit_paisas), 0) as total_credit_paisas,
    COALESCE(SUM(debit), 0) as total_debit,
    COALESCE(SUM(credit), 0) as total_credit
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_id = je.id
  WHERE je.status = 'POSTED'
`).get();

// 5. Query Customer Balances
const customers = backupDb.prepare(`
  SELECT id, name, shop_name, balance, credit_limit_paisas, credit_limit 
  FROM customers 
  ORDER BY name ASC
`).all();

const customerSubledgers = backupDb.prepare(`
  SELECT 
    c.id, 
    c.name,
    COALESCE(SUM(jl.debit_paisas - jl.credit_paisas), 0) as net_ledger_balance_paisas
  FROM customers c
  LEFT JOIN journal_lines jl ON jl.entity_id = c.id AND jl.entity_type = 'CUSTOMER'
  LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.status = 'POSTED'
  GROUP BY c.id, c.name
  ORDER BY c.name ASC
`).all();

// 6. Query Vendor Balances
const vendors = backupDb.prepare(`
  SELECT id, name, company_name 
  FROM vendors 
  ORDER BY name ASC
`).all();

const vendorSubledgers = backupDb.prepare(`
  SELECT 
    v.id, 
    v.name,
    COALESCE(SUM(jl.credit_paisas - jl.debit_paisas), 0) as net_payable_paisas
  FROM vendors v
  LEFT JOIN journal_lines jl ON jl.entity_id = v.id AND jl.entity_type = 'VENDOR'
  LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.status = 'POSTED'
  GROUP BY v.id, v.name
  ORDER BY v.name ASC
`).all();

// 7. Query Product Stock Quantities (Base Pieces & Formatted)
const products = backupDb.prepare(`
  SELECT 
    id, sku, name, current_stock_base, current_stock, cost_price_paisas, trade_price_paisas
  FROM products 
  ORDER BY sku ASC
`).all();

const productMovementsSummary = backupDb.prepare(`
  SELECT 
    product_id,
    product_name,
    sku,
    COALESCE(SUM(net_quantity_base), 0) as net_movement_stock_base
  FROM inventory_movements
  WHERE status = 'POSTED'
  GROUP BY product_id, product_name, sku
  ORDER BY sku ASC
`).all();

backupDb.close();

const baselineData = {
  timestamp: now.toISOString(),
  sqliteBackupFile: targetSqlite,
  rawBackupFile: targetDb,
  tableCount: allTables.length,
  tables: allTables,
  rowCounts,
  journalTotals,
  lineTotals,
  customers,
  customerSubledgers,
  vendors,
  vendorSubledgers,
  products,
  productMovementsSummary,
};

fs.writeFileSync(baselineJsonPath, JSON.stringify(baselineData, null, 2));
console.log(`[Baseline] Pre-migration state saved to: ${baselineJsonPath}`);
console.log('\n--- BASELINE SNAPSHOT SUMMARY ---');
console.log('Total Tables:', allTables.length);
console.log('Total Journal Lines:', lineTotals.total_lines);
console.log('Total Debit Paisas:', lineTotals.total_debit_paisas);
console.log('Total Credit Paisas:', lineTotals.total_credit_paisas);
console.log('Debit == Credit?', lineTotals.total_debit_paisas === lineTotals.total_credit_paisas);
console.log('Products Count:', products.length);
console.log('Products Stock (Base Pieces):', products.map(p => `${p.sku}: ${p.current_stock_base}`).join(', '));
console.log('Customer Balances:', customers.map(c => `${c.name}: ${c.balance}`).join(', '));
