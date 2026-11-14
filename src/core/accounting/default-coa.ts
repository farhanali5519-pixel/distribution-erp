import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { AccountType, NormalBalance } from './types';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { appLog } from '@/core/logging/logger';

export interface CanonicalAccountDefinition {
  code: string;
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  is_system: number;
  account_group: string;
  description: string;
}

/**
 * Authoritative Canonical Chart of Accounts Definition
 * Minimum core operational accounts needed for SaleFlow ERP
 */
export const CANONICAL_DEFAULT_COA: CanonicalAccountDefinition[] = [
  // ==========================================
  // ASSETS (1000 - 1999)
  // ==========================================
  {
    code: '1000',
    name: 'Cash & Cash Equivalents',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Current Assets',
    description: 'Master control account for cash and liquid bank balances',
  },
  {
    code: '1010',
    name: 'Cash in Hand',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Current Assets',
    description: 'Petty cash and daily sales register drawer',
  },
  {
    code: '1020',
    name: 'Main Bank Account',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Current Assets',
    description: 'Primary operating bank account',
  },
  {
    code: '1030',
    name: 'Accounts Receivable',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Current Assets',
    description: 'Control account for trade receivables and customer credit ledgers',
  },
  {
    code: '1040',
    name: 'Merchandise Inventory',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Current Assets',
    description: 'Warehouse stock and merchandise at cost baseline',
  },
  {
    code: '1050',
    name: 'Advance to Suppliers',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Current Assets',
    description: 'Advances and security deposits paid to vendors',
  },
  {
    code: '1060',
    name: 'Other Current Assets',
    type: 'ASSET',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Current Assets',
    description: 'Prepayments and miscellaneous short term assets',
  },

  // ==========================================
  // LIABILITIES (2000 - 2999)
  // ==========================================
  {
    code: '2000',
    name: 'Current Liabilities',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Current Liabilities',
    description: 'Master control account for short-term obligations',
  },
  {
    code: '2010',
    name: 'Accounts Payable',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Current Liabilities',
    description: 'Control account for trade payables and vendor credit bills',
  },
  {
    code: '2020',
    name: 'Sales Tax / Output Tax Payable',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Current Liabilities',
    description: 'Collected output sales tax and government tax payable',
  },
  {
    code: '2025',
    name: 'Customer Advances',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 0,
    account_group: 'Current Liabilities',
    description: 'Customer unearned deposits and advance receipts',
  },
  {
    code: '2030',
    name: 'Withholding Tax Payable',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 0,
    account_group: 'Current Liabilities',
    description: 'Withholding income and sales tax deductions payable',
  },
  {
    code: '2040',
    name: 'Other Payables',
    type: 'LIABILITY',
    normal_balance: 'CREDIT',
    is_system: 0,
    account_group: 'Current Liabilities',
    description: 'Accrued expenses and miscellaneous short-term payables',
  },

  // ==========================================
  // EQUITY (3000 - 3999)
  // ==========================================
  {
    code: '3000',
    name: 'Owner Equity & Capital',
    type: 'EQUITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Equity',
    description: 'Master control account for owner equity and capital',
  },
  {
    code: '3010',
    name: "Owner's Capital",
    type: 'EQUITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Equity',
    description: 'Initial owner investment & opening equity balance',
  },
  {
    code: '3020',
    name: 'Retained Earnings / Current Year Profit',
    type: 'EQUITY',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Equity',
    description: 'Accumulated business profits/losses and current year earnings',
  },

  // ==========================================
  // REVENUE (4000 - 4999)
  // ==========================================
  {
    code: '4000',
    name: 'Sales Revenue',
    type: 'REVENUE',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Operating Revenue',
    description: 'General gross revenue from sales of goods and services',
  },
  {
    code: '4010',
    name: 'Wholesale Sales Revenue',
    type: 'REVENUE',
    normal_balance: 'CREDIT',
    is_system: 1,
    account_group: 'Operating Revenue',
    description: 'Wholesale revenue from merchandise distribution orders',
  },
  {
    code: '4020',
    name: 'Other Revenue & Service Charges',
    type: 'REVENUE',
    normal_balance: 'CREDIT',
    is_system: 0,
    account_group: 'Operating Revenue',
    description: 'Logistics delivery fees and incidental services',
  },
  {
    code: '4030',
    name: 'Sales Returns & Allowances',
    type: 'REVENUE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Operating Revenue',
    description: 'Contra-revenue account for customer returned merchandise',
  },

  // ==========================================
  // COST OF SALES (5000 - 5999)
  // ==========================================
  {
    code: '5000',
    name: 'Cost of Sales',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Cost of Goods Sold',
    description: 'Master cost of sales account for invoiced merchandise',
  },
  {
    code: '5010',
    name: 'Cost of Goods Sold (COGS)',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Cost of Goods Sold',
    description: 'Direct unit cost of merchandise invoiced and sold',
  },
  {
    code: '5040',
    name: 'Inward Freight Expense',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Cost of Goods Sold',
    description: 'Inward freight and transportation costs on vendor purchases',
  },
  {
    code: '5060',
    name: 'Sales Promotion & Scheme Expense',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Cost of Goods Sold',
    description: 'Cost of promotional free bonus units issued to retailers',
  },
  {
    code: '5070',
    name: 'Damaged Goods & Expiry Loss',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Cost of Goods Sold',
    description: 'Quarantine inventory losses on expired or damaged merchandise',
  },

  // ==========================================
  // EXPENSES (6000 - 6999)
  // ==========================================
  {
    code: '6000',
    name: 'Operating Expenses',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 1,
    account_group: 'Operating Expenses',
    description: 'Master control account for operating and administrative overheads',
  },
  {
    code: '6010',
    name: 'Salaries & Wages',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Employee compensation, staff salaries and payroll wages',
  },
  {
    code: '6020',
    name: 'Rent Expense',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Office, distribution hub and warehouse rental expenses',
  },
  {
    code: '6030',
    name: 'Utilities Expense',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Electricity, gas, water, internet and phone bills',
  },
  {
    code: '6040',
    name: 'Freight / Carriage Expense',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Outward freight, van delivery fuel, carriage and distribution logistics',
  },
  {
    code: '6050',
    name: 'General & Administrative Expenses',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Office supplies, stationary, printing, and general administration',
  },
  {
    code: '6060',
    name: 'Other Expenses',
    type: 'EXPENSE',
    normal_balance: 'DEBIT',
    is_system: 0,
    account_group: 'Operating Expenses',
    description: 'Miscellaneous operating expenses and petty cash sundries',
  },
];

export interface EnsureDefaultCoaResult {
  companyId: string;
  totalChecked: number;
  existingCount: number;
  createdCount: number;
  createdCodes: string[];
}

/**
 * Ensures the company has the canonical default Chart of Accounts.
 * Completely idempotent:
 * - If an account with the canonical code exists for this company, it is left untouched.
 * - Only missing accounts are inserted.
 * - Zero duplicates are ever created.
 * - Balances and transaction history are completely untouched.
 */
export function ensureDefaultChartOfAccounts(
  companyId: string,
  options?: { db?: DatabaseSync }
): EnsureDefaultCoaResult {
  const db = options?.db || getDatabase();
  const cleanCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;

  const checkStmt = db.prepare(`
    SELECT id, code, name FROM chart_of_accounts
    WHERE company_id = ? AND code = ?
  `);

  const insertStmt = db.prepare(`
    INSERT INTO chart_of_accounts (
      id, company_id, code, name, type, normal_balance, parent_id,
      is_active, is_system, currency, account_group, description,
      sync_status, version, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, NULL,
      1, ?, 'PKR', ?, ?,
      'synced', 1, datetime('now'), datetime('now')
    )
  `);

  let existingCount = 0;
  let createdCount = 0;
  const createdCodes: string[] = [];

  for (const account of CANONICAL_DEFAULT_COA) {
    const existing = checkStmt.get(cleanCompanyId, account.code) as { id: string } | undefined;
    if (existing) {
      existingCount++;
      continue;
    }

    const newId = generateUUID();
    insertStmt.run(
      newId,
      cleanCompanyId,
      account.code,
      account.name,
      account.type,
      account.normal_balance,
      account.is_system,
      account.account_group,
      account.description
    );
    createdCount++;
    createdCodes.push(account.code);
  }

  return {
    companyId: cleanCompanyId,
    totalChecked: CANONICAL_DEFAULT_COA.length,
    existingCount,
    createdCount,
    createdCodes,
  };
}

/**
 * Repairs all existing companies in the database by provisioning any missing default accounts.
 * Safe, additive, idempotent.
 */
export function repairAllCompaniesChartOfAccounts(options?: { db?: DatabaseSync }): {
  companiesChecked: number;
  totalCreated: number;
  details: Array<{ companyId: string; name: string; createdCount: number }>;
} {
  const db = options?.db || getDatabase();

  // Find all companies
  const companies = db.prepare(`SELECT id, name FROM companies`).all() as Array<{ id: string; name: string }>;

  const targetCompanies = new Map<string, string>();
  for (const c of companies) {
    targetCompanies.set(c.id, c.name);
  }

  // Also include DEFAULT_COMPANY_ID
  if (!targetCompanies.has(DEFAULT_COMPANY_ID)) {
    targetCompanies.set(DEFAULT_COMPANY_ID, 'Default Company / System');
  }

  const details: Array<{ companyId: string; name: string; createdCount: number }> = [];
  let totalCreated = 0;

  for (const [cId, cName] of targetCompanies.entries()) {
    const res = ensureDefaultChartOfAccounts(cId, { db });
    totalCreated += res.createdCount;
    details.push({
      companyId: cId,
      name: cName,
      createdCount: res.createdCount,
    });
  }

  return {
    companiesChecked: targetCompanies.size,
    totalCreated,
    details,
  };
}
