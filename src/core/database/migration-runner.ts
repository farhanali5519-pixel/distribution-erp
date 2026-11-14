import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './db';
import { generateUUID } from '@/shared/utils/uuid';
import { AuditLogService } from '@/core/audit/audit-log.service';
import { appLog } from '@/core/logging/logger';
import { isCloudMode, isPostgresDriver } from '@/core/config/env';
import { repairAllCompaniesChartOfAccounts } from '@/core/accounting/default-coa';

export interface MigrationDefinition {
  version: string;
  name: string;
  up: (db: DatabaseSync) => void;
}

/**
 * Ordered list of official application database migrations
 */
export const APPLICATION_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '1.0.0',
    name: 'initial_multi_tenant_foundation',
    up: (db) => {
      // Baseline migration marker for initial ERP multi-tenant tables
    },
  },
  {
    version: '1.0.1',
    name: 'commercial_licensing_and_audit',
    up: (db) => {
      // Ensure system_license and schema_migrations tables exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            batch INTEGER NOT NULL DEFAULT 1,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS system_license (
            id TEXT PRIMARY KEY,
            company_id TEXT,
            license_key TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            signature TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'VALID',
            installed_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_verified_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        );
      `);
    },
  },
  {
    version: '1.1.0',
    name: 'commercial_onpremise_hardening',
    up: (db) => {
      // Ensure index on audit_logs created_at and company_id if not present
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs(company_id, created_at);`);
      } catch {}
    },
  },
  {
    version: '1.1.1',
    name: 'purchase_bills_schema_parity',
    up: (db) => {
      // Ensure purchase_bills table exists
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_bills'").get();
      if (!tableCheck) return;

      const pbCols = db.prepare("PRAGMA table_info(purchase_bills)").all() as { name: string }[];
      const pbColNames = new Set(pbCols.map((c) => c.name));

      if (!pbColNames.has('subtotal')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN subtotal REAL NOT NULL DEFAULT 0.00;");
      }
      if (!pbColNames.has('tax')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN tax REAL NOT NULL DEFAULT 0.00;");
      }
      if (!pbColNames.has('discount')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN discount REAL NOT NULL DEFAULT 0.00;");
      }
      if (!pbColNames.has('subtotal_paisas')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN subtotal_paisas INTEGER NOT NULL DEFAULT 0;");
      }
      if (!pbColNames.has('tax_amount_paisas')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN tax_amount_paisas INTEGER NOT NULL DEFAULT 0;");
      }
      if (!pbColNames.has('discount_amount_paisas')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN discount_amount_paisas INTEGER NOT NULL DEFAULT 0;");
      }
      if (!pbColNames.has('paid_amount_paisas')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount_paisas INTEGER NOT NULL DEFAULT 0;");
      }
      if (!pbColNames.has('paid_amount')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0.00;");
      }
      if (!pbColNames.has('remaining_balance_paisas')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance_paisas INTEGER NOT NULL DEFAULT 0;");
      }
      if (!pbColNames.has('remaining_balance')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance REAL NOT NULL DEFAULT 0.00;");
      }
      if (!pbColNames.has('payment_status')) {
        db.exec("ALTER TABLE purchase_bills ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';");
      }

      // Backfill from reliable existing line-item data or cross-convert if values are zero
      db.exec(`
        UPDATE purchase_bills 
        SET subtotal_paisas = (
          SELECT COALESCE(SUM(gross_amount_paisas), 0) 
          FROM purchase_bill_items 
          WHERE bill_id = purchase_bills.id
        )
        WHERE subtotal_paisas = 0 
          AND (SELECT COUNT(*) FROM purchase_bill_items WHERE bill_id = purchase_bills.id) > 0;

        UPDATE purchase_bills 
        SET subtotal = ROUND(subtotal_paisas / 100.0, 2) 
        WHERE (subtotal = 0.00 OR subtotal IS NULL) AND subtotal_paisas > 0;

        UPDATE purchase_bills 
        SET tax_amount_paisas = (
          SELECT COALESCE(SUM(tax_paisas), 0) 
          FROM purchase_bill_items 
          WHERE bill_id = purchase_bills.id
        )
        WHERE tax_amount_paisas = 0 
          AND (SELECT COUNT(*) FROM purchase_bill_items WHERE bill_id = purchase_bills.id) > 0;

        UPDATE purchase_bills 
        SET tax = ROUND(tax_amount_paisas / 100.0, 2) 
        WHERE (tax = 0.00 OR tax IS NULL) AND tax_amount_paisas > 0;

        UPDATE purchase_bills 
        SET discount_amount_paisas = (
          SELECT COALESCE(SUM(discount_paisas), 0) 
          FROM purchase_bill_items 
          WHERE bill_id = purchase_bills.id
        )
        WHERE discount_amount_paisas = 0 
          AND (SELECT COUNT(*) FROM purchase_bill_items WHERE bill_id = purchase_bills.id) > 0;

        UPDATE purchase_bills 
        SET discount = ROUND(discount_amount_paisas / 100.0, 2) 
        WHERE (discount = 0.00 OR discount IS NULL) AND discount_amount_paisas > 0;

        UPDATE purchase_bills 
        SET remaining_balance_paisas = net_amount_paisas, 
            remaining_balance = net_amount 
        WHERE (remaining_balance_paisas = 0 OR remaining_balance = 0.00) 
          AND paid_amount_paisas = 0 
          AND net_amount_paisas > 0;
      `);
    },
  },
  {
    version: '1.2.0',
    name: 'vendor_superadmin_and_2fa_parity',
    up: (db) => {
      // 1. Ensure companies table has comprehensive customer profile fields
      const companyCols = db.prepare("PRAGMA table_info(companies)").all() as { name: string }[];
      const compColNames = new Set(companyCols.map((c) => c.name));

      if (!compColNames.has('legal_name')) {
        db.exec("ALTER TABLE companies ADD COLUMN legal_name TEXT;");
      }
      if (!compColNames.has('tenant_code')) {
        db.exec("ALTER TABLE companies ADD COLUMN tenant_code TEXT;");
      }
      if (!compColNames.has('primary_contact_name')) {
        db.exec("ALTER TABLE companies ADD COLUMN primary_contact_name TEXT;");
      }
      if (!compColNames.has('email')) {
        db.exec("ALTER TABLE companies ADD COLUMN email TEXT;");
      }
      if (!compColNames.has('phone')) {
        db.exec("ALTER TABLE companies ADD COLUMN phone TEXT;");
      }
      if (!compColNames.has('address')) {
        db.exec("ALTER TABLE companies ADD COLUMN address TEXT;");
      }
      if (!compColNames.has('city')) {
        db.exec("ALTER TABLE companies ADD COLUMN city TEXT;");
      }
      if (!compColNames.has('country')) {
        db.exec("ALTER TABLE companies ADD COLUMN country TEXT;");
      }
      if (!compColNames.has('notes')) {
        db.exec("ALTER TABLE companies ADD COLUMN notes TEXT;");
      }

      // 2. Ensure platform_users table exists and has 2FA / security fields
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      const puCols = db.prepare("PRAGMA table_info(platform_users)").all() as { name: string }[];
      const puColNames = new Set(puCols.map((c) => c.name));

      if (!puColNames.has('totp_secret')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN totp_secret TEXT;");
      }
      if (!puColNames.has('totp_enabled')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;");
      }
      if (!puColNames.has('email_otp_enabled')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN email_otp_enabled INTEGER NOT NULL DEFAULT 0;");
      }
      if (!puColNames.has('recovery_codes_hash')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN recovery_codes_hash TEXT;");
      }
      if (!puColNames.has('two_factor_policy')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN two_factor_policy TEXT NOT NULL DEFAULT 'OPTIONAL';");
      }
      if (!puColNames.has('last_2fa_at')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN last_2fa_at TEXT;");
      }
      if (!puColNames.has('phone')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN phone TEXT;");
      }
      if (!puColNames.has('failed_login_attempts')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;");
      }
      if (!puColNames.has('locked_until')) {
        db.exec("ALTER TABLE platform_users ADD COLUMN locked_until TEXT;");
      }

      // 3. Create platform OTP tokens table for email 2FA
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_otp_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_platform_otp_tokens_user_purpose ON platform_otp_tokens(user_id, purpose);
      `);

      // 4. Ensure app_users has email and phone columns for tenant user management
      const auCols = db.prepare("PRAGMA table_info(app_users)").all() as { name: string }[];
      const auColNames = new Set(auCols.map((c) => c.name));
      if (!auColNames.has('email')) {
        db.exec("ALTER TABLE app_users ADD COLUMN email TEXT;");
      }
      if (!auColNames.has('phone')) {
        db.exec("ALTER TABLE app_users ADD COLUMN phone TEXT;");
      }

      // 5. Ensure all available platform modules exist in system_modules
      const systemModulesToRegister = [
        { id: 'sales', name: 'Sales & Distribution', desc: 'Orders, Invoices, Delivery Challans, Gate Pass' },
        { id: 'customers', name: 'Customer Management', desc: 'Customer Directory, Area Routes, Ledgers' },
        { id: 'inventory', name: 'Stock & Inventory', desc: 'Warehouse Balances, Batches, Adjustments' },
        { id: 'expenses', name: 'Expense Management', desc: 'Operating Expense Tracking & Categories' },
        { id: 'purchase', name: 'Purchase & Bills', desc: 'Supplier Orders, Inward Bills, Purchase Returns' },
        { id: 'closing', name: 'Daily Closing / Roznamcha', desc: 'Daily Cash Drawers & Revenue Settlement' },
        { id: 'returns', name: 'Returns Engine', desc: 'Customer Returns, Credit Notes, Restocking' },
        { id: 'reports', name: 'Reports & Analytics', desc: 'Sales, Profit, Tax, Aging, Inventory Reports' },
        { id: 'payments', name: 'Payments & Cash Mgmt', desc: 'Cash, Cheque, Bank Collection Receipts' },
        { id: 'field_order_booking', name: 'Field Order Booking', desc: 'Mobile DSR & Order Booker Sync Engine' },
        { id: 'banking', name: 'Banking & Accounts', desc: 'Bank Accounts, Cheque Clearance, Reconciliations' },
        { id: 'accounts', name: 'General Ledger', desc: 'Double-entry Chart of Accounts & Trial Balance' },
        { id: 'auth', name: 'User & Access Security', desc: 'User Roles, Multi-level Permission Management' },
        { id: 'settings', name: 'System Settings', desc: 'Company Profiles, Print Templates, Features' },
      ];

      const modStmt = db.prepare(`
        INSERT OR IGNORE INTO system_modules (id, name, description, version, is_enabled, dependencies, settings, installed_at, updated_at)
        VALUES (?, ?, ?, '1.0.0', 1, '[]', '{}', datetime('now'), datetime('now'))
      `);
      for (const m of systemModulesToRegister) {
        modStmt.run(m.id, m.name, m.desc);
      }
    },
  },
  {
    version: '1.3.0',
    name: 'auto_provision_default_chart_of_accounts',
    up: (db) => {
      // Ensure all tenant companies have the minimum required default Chart of Accounts
      try {
        repairAllCompaniesChartOfAccounts({ db });
      } catch (err: any) {
        appLog.error('MIGRATION', 'Failed auto-provisioning default chart of accounts', err);
      }
    },
  },
];

export class MigrationRunner {
  /**
   * Ensures the schema_migrations tracking table exists
   */
  public static ensureMigrationTable(db?: DatabaseSync): void {
    const targetDb = db || getDatabase();
    targetDb.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          version TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          batch INTEGER NOT NULL DEFAULT 1,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  /**
   * Returns a list of all applied migration versions
   */
  public static getAppliedMigrations(db?: DatabaseSync): string[] {
    const targetDb = db || getDatabase();
    this.ensureMigrationTable(targetDb);
    const rows = targetDb.prepare('SELECT version FROM schema_migrations ORDER BY applied_at ASC').all() as { version: string }[];
    return rows.map(r => r.version);
  }

  /**
   * Returns list of migrations that have not yet been executed
   */
  public static getPendingMigrations(db?: DatabaseSync): MigrationDefinition[] {
    const targetDb = db || getDatabase();
    const applied = new Set(this.getAppliedMigrations(targetDb));
    return APPLICATION_MIGRATIONS.filter(m => !applied.has(m.version));
  }

  /**
   * Executes all pending migrations atomically
   */
  public static runPendingMigrations(db?: DatabaseSync): { appliedCount: number; appliedVersions: string[] } {
    const targetDb = db || getDatabase();
    this.ensureMigrationTable(targetDb);

    const pending = this.getPendingMigrations(targetDb);
    if (pending.length === 0) {
      return { appliedCount: 0, appliedVersions: [] };
    }

    // Determine current batch number
    const lastBatchRow = targetDb.prepare('SELECT MAX(batch) as max_batch FROM schema_migrations').get() as { max_batch: number | null };
    const currentBatch = (lastBatchRow?.max_batch || 0) + 1;

    const appliedVersions: string[] = [];

    for (const migration of pending) {
      appLog.info('MIGRATION', `Applying database migration ${migration.version} - ${migration.name}`);
      
      try {
        // Execute migration
        migration.up(targetDb);

        // Record in tracking table (idempotent with INSERT OR IGNORE)
        const id = generateUUID();
        targetDb.prepare(`
          INSERT OR IGNORE INTO schema_migrations (id, version, name, batch, applied_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(id, migration.version, migration.name, currentBatch);

        appliedVersions.push(migration.version);

        try {
          AuditLogService.logAction({
            action: 'SYSTEM_MIGRATION',
            transactionType: 'DATABASE_MIGRATION',
            transactionNumber: migration.version,
            reason: `Applied schema migration ${migration.version}: ${migration.name}`,
            details: { version: migration.version, name: migration.name, batch: currentBatch },
          });
        } catch {}
      } catch (err: any) {
        appLog.error('MIGRATION', `Failed applying migration ${migration.version}: ${err.message}`, err);
        throw err;
      }
    }

    return { appliedCount: appliedVersions.length, appliedVersions };
  }

  /**
   * Returns the latest migration version applied to the database
   */
  public static getLatestAppliedVersion(db?: DatabaseSync): string {
    if (isCloudMode() || isPostgresDriver()) {
      return '1.1.0';
    }
    const targetDb = db || getDatabase();
    this.ensureMigrationTable(targetDb);
    const row = targetDb.prepare('SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1').get() as { version: string } | undefined;
    return row?.version || '1.0.0';
  }
}
