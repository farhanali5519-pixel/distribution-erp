import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);

  // Check columns in journal_lines
  const columns = db.prepare("PRAGMA table_info(journal_lines)").all();
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has('entity_id')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN entity_id TEXT;");
    console.log('Added entity_id column to journal_lines');
  }
  if (!colNames.has('entity_type')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN entity_type TEXT;");
    console.log('Added entity_type column to journal_lines');
  }
  if (!colNames.has('debit_paisas')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN debit_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_lines SET debit_paisas = CAST(ROUND(debit * 100) AS INTEGER);");
    console.log('Added and backfilled debit_paisas column in journal_lines');
  }
  if (!colNames.has('credit_paisas')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN credit_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_lines SET credit_paisas = CAST(ROUND(credit * 100) AS INTEGER);");
    console.log('Added and backfilled credit_paisas column in journal_lines');
  }

  // Check columns in journal_entries
  const jeCols = db.prepare("PRAGMA table_info(journal_entries)").all();
  const jeColNames = new Set(jeCols.map((c) => c.name));

  if (!jeColNames.has('total_amount_paisas')) {
    db.exec("ALTER TABLE journal_entries ADD COLUMN total_amount_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_entries SET total_amount_paisas = CAST(ROUND(total_amount * 100) AS INTEGER);");
    console.log('Added and backfilled total_amount_paisas in journal_entries');
  }
  if (!jeColNames.has('reversal_of_id')) {
    db.exec("ALTER TABLE journal_entries ADD COLUMN reversal_of_id TEXT;");
    console.log('Added reversal_of_id column in journal_entries');
  }
  if (!jeColNames.has('is_reversed')) {
    db.exec("ALTER TABLE journal_entries ADD COLUMN is_reversed INTEGER NOT NULL DEFAULT 0;");
    console.log('Added is_reversed column in journal_entries');
  }

  // Check sales_invoices
  const siCols = db.prepare("PRAGMA table_info(sales_invoices)").all();
  const siColNames = new Set(siCols.map((c) => c.name));
  if (!siColNames.has('cost_of_goods_sold')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN cost_of_goods_sold REAL NOT NULL DEFAULT 0.00;");
    console.log('Added cost_of_goods_sold column in sales_invoices');
  }

  console.log('Database migration completed successfully.');
} else {
  console.log('No local db file found; it will be created with fresh schema.');
}
