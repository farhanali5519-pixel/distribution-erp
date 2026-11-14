import crypto from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { generateUUID } from '../../../shared/utils/uuid';
import { 
  DEFAULT_COMPANY_ID, 
  DEFAULT_COMPANY_NAME, 
  DEFAULT_COMPANY_SLUG, 
  DEFAULT_COMPANY_PLAN 
} from '../../tenancy/constants';
import { IDatabaseClient, ITransactionClient } from '../types';

const PASSWORD_SALT = 'saleflow_user_salt_';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(PASSWORD_SALT + password).digest('hex');
}

/**
 * Seeds baseline data into PostgreSQL matching default on-premise SQLite state:
 * - Default Company (Farhan Distribution)
 * - Platform SuperAdmin
 * - 12 System Modules & Company Modules
 * - 21 Chart of Accounts
 * - 35 Feature Flags
 * - Default Admin User
 * - Default Categories & Routes
 */
export async function seedPostgresInitialData(client: IDatabaseClient | ITransactionClient | PoolClient | Pool): Promise<void> {
  const queryFn = async (sql: string, params: any[] = []): Promise<any[]> => {
    if ('query' in client) {
      const res = await (client as any).query(sql, params);
      return Array.isArray(res) ? res : res.rows || [];
    }
    throw new Error('Invalid client passed to seedPostgresInitialData');
  };

  // 1. Seed Default Company
  await queryFn(`
    INSERT INTO companies (id, name, slug, is_active, status, plan, max_users, max_warehouses)
    VALUES ($1, $2, $3, 1, 'ACTIVE', $4, 5, 1)
    ON CONFLICT (id) DO NOTHING
  `, [DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_PLAN]);

  // 2. Seed Initial Platform Super Admin
  const adminHash = hashPassword('SuperAdmin@2026');
  await queryFn(`
    INSERT INTO platform_users (id, username, password_hash, full_name, email, role, is_active)
    VALUES ($1, 'superadmin', $2, 'Platform Super Administrator', 'admin@saleflow.app', 'SUPER_ADMIN', 1)
    ON CONFLICT (username) DO NOTHING
  `, [generateUUID(), adminHash]);

  // 3. Seed System Modules
  const modules = [
    { id: 'sales', name: 'Sales & Distribution', desc: 'Order booking, van distribution, delivery invoicing, sub-ledger customer tracking, and perpetual inventory.', ver: '1.1.0', deps: ['customers', 'inventory'] },
    { id: 'customers', name: 'Customer & Route Management', desc: 'Retail stores, credit limits, distribution routes, and real-time sub-ledger statements.', ver: '1.1.0', deps: [] },
    { id: 'inventory', name: 'Stock & Inventory Master', desc: 'SKU tracking, bulk cartons + loose piece conversion, TP/MRP pricing, and opening stock reconciliations.', ver: '1.1.0', deps: [] },
    { id: 'expenses', name: 'Expense Management', desc: 'Distribution van fuel, driver per diem, rent, and utility vouchers.', ver: '1.2.0', deps: [] },
    { id: 'purchase', name: 'Purchase & Vendor Bills', desc: 'Manufacturer POs, vendor bills, and supplier ledger payments.', ver: '1.1.0', deps: ['inventory'] },
    { id: 'closing', name: 'Daily Cash Closing & Roznamcha', desc: 'Daily cash reconciliation, Pakistani currency denomination counter, and day-end audit locking.', ver: '1.0.0', deps: ['sales', 'expenses'] },
    { id: 'returns', name: 'Sales & Purchase Returns', desc: 'Customer credit notes with sales history audit, damage quarantine, and supplier debit notes.', ver: '1.0.0', deps: ['sales', 'purchase', 'inventory', 'customers'] },
    { id: 'reports', name: 'Reports & Business Intelligence', desc: 'Customer & vendor party ledgers, Profit & Loss (Munaffa), stock valuation, and salesman recovery metrics.', ver: '1.0.0', deps: ['sales', 'purchase', 'inventory', 'expenses'] },
    { id: 'auth', name: 'Users, Roles & Security Access', desc: 'Multi-user role-based access control, route guards, and admin PIN verification.', ver: '1.0.0', deps: [] },
    { id: 'settings', name: 'System Settings & Company Branding', desc: 'Manage company profile, business branding, print preferences, and dynamic feature toggles.', ver: '1.0.0', deps: [] },
    { id: 'banking', name: 'Bank Accounts & Liquidity', desc: 'Bank account registration, deposits, withdrawals, and bank ledger management.', ver: '1.0.0', deps: ['accounting'] },
    { id: 'field_order_booking', name: 'Field Order Booking', desc: 'Mobile-first field booker interface for route sales reps with PIN authentication.', ver: '1.0.0', deps: ['sales', 'customers'] },
  ];

  for (const m of modules) {
    await queryFn(`
      INSERT INTO system_modules (id, name, description, version, is_enabled, dependencies, settings)
      VALUES ($1, $2, $3, $4, 1, $5, '{}')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        dependencies = EXCLUDED.dependencies
    `, [m.id, m.name, m.desc, m.ver, JSON.stringify(m.deps)]);

    // Link to default company
    await queryFn(`
      INSERT INTO company_modules (company_id, module_id, is_enabled, dependencies, settings)
      VALUES ($1, $2, 1, $3, '{}')
      ON CONFLICT (company_id, module_id) DO NOTHING
    `, [DEFAULT_COMPANY_ID, m.id, JSON.stringify(m.deps)]);
  }

  // 4. Seed Chart of Accounts for Default Company
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
    { code: '5020', name: 'Sales Van & Delivery Fuel', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Fuel and vehicle maintenance' },
    { code: '5025', name: 'Vehicle Repair & Maintenance', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Van servicing, engine oil, tires, and maintenance' },
    { code: '5030', name: 'Sales Rep Commissions & Salaries', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Distribution field team compensation' },
    { code: '5035', name: 'Staff Tea & Food / Refreshments', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Daily driver, supply man, and warehouse tea & food' },
    { code: '5040', name: 'Inward Freight Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Inward freight and transportation costs' },
    { code: '5045', name: 'Warehouse Rent & Utilities', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Warehouse operating expenses' },
    { code: '5050', name: 'General & Miscellaneous Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, desc: 'Office supplies, petty cash sundries' },
    { code: '5060', name: 'Sales Promotion & Scheme Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Cost of bonus free sample units to retailers' },
    { code: '5070', name: 'Damaged Goods & Expiry Loss', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, desc: 'Quarantine inventory losses on expired or damaged merchandise' },
  ];

  for (const acc of initialAccounts) {
    await queryFn(`
      INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, 'PKR')
      ON CONFLICT (company_id, code) DO NOTHING
    `, [generateUUID(), DEFAULT_COMPANY_ID, acc.code, acc.name, acc.type, acc.normal, acc.isSystem, acc.desc]);
  }

  // 5. Seed Default Admin User
  const defaultAdminPass = hashPassword('admin123');
  await queryFn(`
    INSERT INTO app_users (id, company_id, username, password_hash, full_name, role, is_active)
    VALUES ($1, $2, 'admin', $3, 'System Administrator', 'ADMIN', 1)
    ON CONFLICT (company_id, username) DO NOTHING
  `, [generateUUID(), DEFAULT_COMPANY_ID, defaultAdminPass]);

  // 6. Seed Default Company Profile
  await queryFn(`
    INSERT INTO company_profile (id, company_id, business_name, tagline, phone_primary, address, city, thermal_footer_note)
    VALUES ($1, $2, $3, 'Reliable Wholesale Partner', '0300-1234567', 'Main Bazaar Wholesale Market', 'Lahore', 'Thank you for your business!')
    ON CONFLICT (id) DO NOTHING
  `, [generateUUID(), DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME]);
}
