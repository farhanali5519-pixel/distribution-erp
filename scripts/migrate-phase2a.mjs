import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_COMPANY_NAME = 'Farhan Distribution';
const DEFAULT_COMPANY_SLUG = 'farhan';
const DEFAULT_COMPANY_PLAN = 'COMMERCIAL';

export function runPhase2aMigration(db) {
  console.log('[Phase 2A] Running Safe Tenant/Company Schema Migration...');

  // 1. Create companies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      plan TEXT NOT NULL DEFAULT 'COMMERCIAL',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Insert default company
  const compRow = db.prepare('SELECT id FROM companies WHERE id = ?').get(DEFAULT_COMPANY_ID);
  if (!compRow) {
    db.prepare(`
      INSERT INTO companies (id, name, slug, is_active, plan, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_PLAN);
    console.log(`[Phase 2A] Seeded default company: ${DEFAULT_COMPANY_NAME} (${DEFAULT_COMPANY_ID})`);
  }

  // Create tenants view for compatibility
  db.exec(`CREATE VIEW IF NOT EXISTS tenants AS SELECT * FROM companies;`);

  // 2. Create company_modules table and seed from system_modules
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_modules (
      company_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      dependencies TEXT DEFAULT '[]',
      settings TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, module_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES system_modules(id) ON DELETE CASCADE
    );
  `);

  // Seed company_modules for default company from existing system_modules
  const compModCount = db.prepare('SELECT COUNT(*) as cnt FROM company_modules WHERE company_id = ?').get(DEFAULT_COMPANY_ID);
  if (!compModCount || compModCount.cnt === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO company_modules (company_id, module_id, is_enabled, dependencies, settings, updated_at)
      SELECT 
        ?,
        id,
        is_enabled,
        dependencies,
        settings,
        datetime('now')
      FROM system_modules
    `).run(DEFAULT_COMPANY_ID);
    console.log('[Phase 2A] Seeded company_modules for default company from system_modules');
  }

  // 3. Add company_id column to all tenant-owned tables
  const tenantTables = [
    'company_profile',
    'chart_of_accounts',
    'bank_accounts',
    'routes',
    'customers',
    'categories',
    'brands',
    'products',
    'staff_members',
    'vendors',
    'journal_entries',
    'journal_lines',
    'stock_adjustments',
    'inventory_movements',
    'sales_orders',
    'sales_order_items',
    'sales_invoices',
    'sales_invoice_items',
    'customer_payments',
    'customer_payment_allocations',
    'purchase_bills',
    'purchase_bill_items',
    'vendor_payments',
    'vendor_payment_allocations',
    'expenses',
    'daily_closings',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items',
    'audit_logs',
    'app_users',
    'app_settings',
    'feature_flags'
  ];

  for (const table of tenantTables) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('company_id')) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}';`);
      console.log(`[Phase 2A] Added company_id to table: ${table}`);
    } else {
      // Ensure any rows with null company_id get backfilled
      db.prepare(`UPDATE "${table}" SET company_id = ? WHERE company_id IS NULL OR company_id = ''`).run(DEFAULT_COMPANY_ID);
    }
  }

  // 4. Migrate order_booker_sequences to composite PK (company_id, booker_code, date_code)
  const obsCols = db.prepare('PRAGMA table_info(order_booker_sequences)').all();
  const obsColNames = new Set(obsCols.map((c) => c.name));
  if (!obsColNames.has('company_id')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_booker_sequences_migrated (
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        booker_code TEXT NOT NULL,
        date_code TEXT NOT NULL,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (company_id, booker_code, date_code)
      );

      INSERT INTO order_booker_sequences_migrated (company_id, booker_code, date_code, last_sequence, created_at, updated_at)
      SELECT '${DEFAULT_COMPANY_ID}', booker_code, date_code, last_sequence, created_at, updated_at
      FROM order_booker_sequences;

      DROP TABLE order_booker_sequences;
      ALTER TABLE order_booker_sequences_migrated RENAME TO order_booker_sequences;
    `);
    console.log('[Phase 2A] Migrated order_booker_sequences to composite PK (company_id, booker_code, date_code)');
  }

  // 5. Create company-scoped unique composite indexes
  const compositeUniqueIndexes = [
    { name: 'uq_app_users_company_username', table: 'app_users', cols: 'company_id, username' },
    { name: 'uq_products_company_sku', table: 'products', cols: 'company_id, sku' },
    { name: 'uq_routes_company_code', table: 'routes', cols: 'company_id, code' },
    { name: 'uq_coa_company_code', table: 'chart_of_accounts', cols: 'company_id, code' },
    { name: 'uq_sales_orders_company_number', table: 'sales_orders', cols: 'company_id, order_number' },
    { name: 'uq_sales_invoices_company_number', table: 'sales_invoices', cols: 'company_id, invoice_number' },
    { name: 'uq_purchase_bills_company_number', table: 'purchase_bills', cols: 'company_id, bill_number' },
    { name: 'uq_customer_payments_company_number', table: 'customer_payments', cols: 'company_id, payment_number' },
    { name: 'uq_vendor_payments_company_number', table: 'vendor_payments', cols: 'company_id, payment_number' },
    { name: 'uq_expenses_company_voucher', table: 'expenses', cols: 'company_id, voucher_number' },
    { name: 'uq_daily_closings_company_date', table: 'daily_closings', cols: 'company_id, closing_date' },
    { name: 'uq_sales_returns_company_number', table: 'sales_returns', cols: 'company_id, return_number' },
    { name: 'uq_purchase_returns_company_number', table: 'purchase_returns', cols: 'company_id, return_number' },
    { name: 'uq_stock_adj_company_number', table: 'stock_adjustments', cols: 'company_id, adjustment_number' },
    { name: 'uq_inv_mov_company_number', table: 'inventory_movements', cols: 'company_id, movement_number' },
    { name: 'uq_journal_entries_company_number', table: 'journal_entries', cols: 'company_id, entry_number' },
    { name: 'uq_categories_company_name', table: 'categories', cols: 'company_id, name' },
    { name: 'uq_brands_company_name', table: 'brands', cols: 'company_id, name' },
  ];

  for (const idx of compositeUniqueIndexes) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (${idx.cols});`);
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_company_code" ON "staff_members" (company_id, employee_code) WHERE employee_code IS NOT NULL;`);
  console.log('[Phase 2A] Created all company-scoped composite unique indexes');

  // 6. Create performance indexes on company_id
  const performanceIndexes = [
    { name: 'idx_customers_company_id', table: 'customers' },
    { name: 'idx_vendors_company_id', table: 'vendors' },
    { name: 'idx_journal_lines_company_id', table: 'journal_lines' },
    { name: 'idx_sales_order_items_company_id', table: 'sales_order_items' },
    { name: 'idx_sales_invoice_items_company_id', table: 'sales_invoice_items' },
    { name: 'idx_purchase_bill_items_company_id', table: 'purchase_bill_items' },
    { name: 'idx_sales_return_items_company_id', table: 'sales_return_items' },
    { name: 'idx_purchase_return_items_company_id', table: 'purchase_return_items' },
    { name: 'idx_bank_accounts_company_id', table: 'bank_accounts' },
    { name: 'idx_audit_logs_company_id', table: 'audit_logs' },
    { name: 'idx_feature_flags_company_id', table: 'feature_flags' },
    { name: 'idx_app_settings_company_id', table: 'app_settings' },
  ];

  for (const idx of performanceIndexes) {
    db.exec(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (company_id);`);
  }
  console.log('[Phase 2A] Created company_id performance indexes');

  console.log('[Phase 2A] Schema migration finished successfully!');
}

// If executed directly via node scripts/migrate-phase2a.mjs
if (process.argv[1] && process.argv[1].endsWith('migrate-phase2a.mjs')) {
  const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);
  try {
    runPhase2aMigration(db);
    const integrity = db.prepare('PRAGMA integrity_check').get();
    console.log('[Integrity Check]:', integrity);
  } finally {
    db.close();
  }
}
