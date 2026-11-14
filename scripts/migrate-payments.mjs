import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

console.log('Migrating database at:', dbPath);

// Ensure customer_payments columns
const cpColumns = db.prepare("PRAGMA table_info(customer_payments)").all();
if (!cpColumns.some((col) => col.name === 'account_id')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN account_id TEXT;");
  console.log('Added account_id to customer_payments');
}
if (!cpColumns.some((col) => col.name === 'unallocated_amount_paisas')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  console.log('Added unallocated_amount_paisas to customer_payments');
}
if (!cpColumns.some((col) => col.name === 'unallocated_amount')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN unallocated_amount REAL NOT NULL DEFAULT 0.00;");
  console.log('Added unallocated_amount to customer_payments');
}
if (!cpColumns.some((col) => col.name === 'status')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN status TEXT NOT NULL DEFAULT 'POSTED';");
  console.log('Added status to customer_payments');
}
if (!cpColumns.some((col) => col.name === 'notes')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN notes TEXT;");
  console.log('Added notes to customer_payments');
}
if (!cpColumns.some((col) => col.name === 'updated_at')) {
  db.exec("ALTER TABLE customer_payments ADD COLUMN updated_at TEXT;");
  console.log('Added updated_at to customer_payments');
}

// Ensure customer_payment_allocations table
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_payment_allocations (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      invoice_type TEXT NOT NULL DEFAULT 'ORDER' CHECK (invoice_type IN ('ORDER', 'INVOICE')),
      allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
      allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_payment ON customer_payment_allocations(payment_id);
  CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_invoice ON customer_payment_allocations(invoice_id);
`);
console.log('Ensured customer_payment_allocations');

// Ensure vendor_payments & vendor_payment_allocations tables
db.exec(`
  CREATE TABLE IF NOT EXISTS vendor_payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT UNIQUE NOT NULL,
      payment_date TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE')),
      amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
      amount REAL NOT NULL CHECK (amount > 0),
      unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0,
      unallocated_amount REAL NOT NULL DEFAULT 0.00,
      reference_note TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
      journal_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
      FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
  CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
  CREATE INDEX IF NOT EXISTS idx_vendor_payments_account ON vendor_payments(account_id);

  CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      bill_id TEXT NOT NULL,
      allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
      allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES vendor_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_payment ON vendor_payment_allocations(payment_id);
  CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_bill ON vendor_payment_allocations(bill_id);
`);
console.log('Ensured vendor_payments and vendor_payment_allocations');

// Ensure purchase_bills payment tracking columns
const pbColumns = db.prepare("PRAGMA table_info(purchase_bills)").all();
if (!pbColumns.some((col) => col.name === 'paid_amount_paisas')) {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  console.log('Added paid_amount_paisas to purchase_bills');
}
if (!pbColumns.some((col) => col.name === 'paid_amount')) {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0.00;");
  console.log('Added paid_amount to purchase_bills');
}
if (!pbColumns.some((col) => col.name === 'remaining_balance_paisas')) {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance_paisas INTEGER NOT NULL DEFAULT 0;");
  console.log('Added remaining_balance_paisas to purchase_bills');
}
if (!pbColumns.some((col) => col.name === 'remaining_balance')) {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance REAL NOT NULL DEFAULT 0.00;");
  console.log('Added remaining_balance to purchase_bills');
}
if (!pbColumns.some((col) => col.name === 'payment_status')) {
  db.exec("ALTER TABLE purchase_bills ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';");
  console.log('Added payment_status to purchase_bills');
}

// Populate remaining balance on existing posted bills if needed
db.exec(`
  UPDATE purchase_bills
  SET remaining_balance_paisas = net_amount_paisas,
      remaining_balance = net_amount
  WHERE paid_amount_paisas = 0 
    AND (remaining_balance_paisas = 0 OR remaining_balance_paisas IS NULL)
    AND net_amount_paisas > 0;
`);

// Register payments system module
db.prepare(`
  INSERT OR IGNORE INTO system_modules (id, name, description, version, is_enabled)
  VALUES ('payments', 'Payments & Cash Management', 'Customer payment receipts, vendor payment vouchers, bill/invoice allocations, on-account liquidity.', '1.0.0', 1)
`).run();

console.log('All migrations applied successfully!');
