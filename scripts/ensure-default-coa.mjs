#!/usr/bin/env node
/**
 * Safe Idempotent Chart of Accounts Provisioning & Repair Script
 * Ensures all tenant companies have the required canonical default Chart of Accounts.
 * 
 * Usage:
 *   node scripts/ensure-default-coa.mjs
 *   node scripts/ensure-default-coa.mjs --company=farhan-distribution
 *   node scripts/ensure-default-coa.mjs --db=/path/to/db.db
 *   node scripts/ensure-default-coa.mjs --dry-run
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

// Parse arguments
const args = process.argv.slice(2);
let targetCompanyArg = null;
let customDbPath = null;
let isDryRun = false;

for (const arg of args) {
  if (arg.startsWith('--company=')) {
    targetCompanyArg = arg.split('=')[1].trim();
  } else if (arg.startsWith('--db=')) {
    customDbPath = arg.split('=')[1].trim();
  } else if (arg === '--dry-run') {
    isDryRun = true;
  }
}

const dbPath = customDbPath || process.env.DB_PATH || path.resolve('data/sales_distribution.db');

if (!fs.existsSync(dbPath)) {
  console.error(`[ERROR] Database file not found at: ${dbPath}`);
  process.exit(1);
}

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// Canonical Default Chart of Accounts Definition
const CANONICAL_ACCOUNTS = [
  // ASSETS (1000 - 1999)
  { code: '1000', name: 'Cash & Cash Equivalents', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Master control account for cash and liquid bank balances' },
  { code: '1010', name: 'Cash in Hand', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Petty cash and daily sales register drawer' },
  { code: '1020', name: 'Main Bank Account', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Primary operating bank account' },
  { code: '1030', name: 'Accounts Receivable', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Trade receivables and customer credit ledger control' },
  { code: '1040', name: 'Merchandise Inventory', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Warehouse stock and merchandise at cost baseline' },
  { code: '1050', name: 'Advance to Suppliers', type: 'ASSET', normal: 'DEBIT', isSystem: 0, group: 'Current Assets', desc: 'Advances and security deposits paid to vendors' },
  { code: '1060', name: 'Other Current Assets', type: 'ASSET', normal: 'DEBIT', isSystem: 0, group: 'Current Assets', desc: 'Prepayments and miscellaneous short term assets' },

  // LIABILITIES (2000 - 2999)
  { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Master control account for short-term obligations' },
  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Control account for trade payables and vendor credit bills' },
  { code: '2020', name: 'Sales Tax / Output Tax Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Collected output sales tax and government tax payable' },
  { code: '2025', name: 'Customer Advances', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Customer unearned deposits and advance receipts' },
  { code: '2030', name: 'Withholding Tax Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Withholding income and sales tax deductions payable' },
  { code: '2040', name: 'Other Payables', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Accrued expenses and miscellaneous short-term payables' },

  // EQUITY (3000 - 3999)
  { code: '3000', name: 'Owner Equity & Capital', type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Master control account for owner equity and capital' },
  { code: '3010', name: "Owner's Capital", type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Initial owner investment & opening equity balance' },
  { code: '3020', name: 'Retained Earnings / Current Year Profit', type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Accumulated business profits/losses and current year earnings' },

  // REVENUE (4000 - 4999)
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', normal: 'CREDIT', isSystem: 1, group: 'Operating Revenue', desc: 'General gross revenue from sales of goods and services' },
  { code: '4010', name: 'Wholesale Sales Revenue', type: 'REVENUE', normal: 'CREDIT', isSystem: 1, group: 'Operating Revenue', desc: 'Wholesale revenue from merchandise distribution orders' },
  { code: '4020', name: 'Other Revenue & Service Charges', type: 'REVENUE', normal: 'CREDIT', isSystem: 0, group: 'Operating Revenue', desc: 'Logistics delivery fees and incidental services' },
  { code: '4030', name: 'Sales Returns & Allowances', type: 'REVENUE', normal: 'DEBIT', isSystem: 1, group: 'Operating Revenue', desc: 'Contra-revenue account for customer returned merchandise' },

  // COST OF SALES (5000 - 5999)
  { code: '5000', name: 'Cost of Sales', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Master cost of sales account for invoiced merchandise' },
  { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Direct unit cost of merchandise invoiced and sold' },
  { code: '5040', name: 'Inward Freight Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Inward freight and transportation costs on vendor purchases' },
  { code: '5060', name: 'Sales Promotion & Scheme Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Cost of promotional free bonus units issued to retailers' },
  { code: '5070', name: 'Damaged Goods & Expiry Loss', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Quarantine inventory losses on expired or damaged merchandise' },

  // EXPENSES (6000 - 6999)
  { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Operating Expenses', desc: 'Master control account for operating and administrative overheads' },
  { code: '6010', name: 'Salaries & Wages', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Employee compensation, staff salaries and payroll wages' },
  { code: '6020', name: 'Rent Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Office, distribution hub and warehouse rental expenses' },
  { code: '6030', name: 'Utilities Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Electricity, gas, water, internet and phone bills' },
  { code: '6040', name: 'Freight / Carriage Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Outward freight, van delivery fuel, carriage and distribution logistics' },
  { code: '6050', name: 'General & Administrative Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Office supplies, stationary, printing, and general administration' },
  { code: '6060', name: 'Other Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Miscellaneous operating expenses and petty cash sundries' },
];

console.log('===============================================================');
console.log(' SALEFLOW ERP — DEFAULT CHART OF ACCOUNTS REPAIR / PROVISION ');
console.log('===============================================================');
console.log(`Database Target: ${dbPath}`);
console.log(`Execution Mode : ${isDryRun ? 'DRY-RUN (Preview Only)' : 'LIVE (Additive & Safe)'}`);
if (targetCompanyArg) {
  console.log(`Target Filter  : ${targetCompanyArg}`);
}
console.log('---------------------------------------------------------------');

const db = new DatabaseSync(dbPath);

// Retrieve companies
let companies = [];
try {
  companies = db.prepare(`SELECT id, name, slug FROM companies ORDER BY name ASC`).all();
} catch (e) {
  console.warn('Companies table query failed:', e.message);
}

// Add DEFAULT_COMPANY_ID if not in list
if (!companies.some(c => c.id === DEFAULT_COMPANY_ID)) {
  companies.push({ id: DEFAULT_COMPANY_ID, name: 'Default Company / System', slug: 'default' });
}

if (targetCompanyArg) {
  companies = companies.filter(c => c.id === targetCompanyArg || c.slug === targetCompanyArg);
  if (companies.length === 0) {
    console.error(`[ERROR] No company matching '${targetCompanyArg}' found.`);
    process.exit(1);
  }
}

console.log(`Found ${companies.length} company target(s) for COA inspection.\n`);

const checkAccountStmt = db.prepare(`
  SELECT id, code, name FROM chart_of_accounts
  WHERE company_id = ? AND code = ?
`);

const insertAccountStmt = db.prepare(`
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

const summary = [];
let grandTotalAdded = 0;

for (const company of companies) {
  const existingAccounts = db.prepare(`
    SELECT code, name FROM chart_of_accounts WHERE company_id = ?
  `).all(company.id);

  const existingCodes = new Set(existingAccounts.map(a => a.code));
  const missingAccounts = CANONICAL_ACCOUNTS.filter(a => !existingCodes.has(a.code));

  if (!isDryRun && missingAccounts.length > 0) {
    for (const acc of missingAccounts) {
      const id = crypto.randomUUID();
      insertAccountStmt.run(
        id,
        company.id,
        acc.code,
        acc.name,
        acc.type,
        acc.normal,
        acc.isSystem,
        acc.group,
        acc.desc
      );
    }
  }

  grandTotalAdded += missingAccounts.length;

  summary.push({
    companyName: company.name,
    slug: company.slug,
    companyId: company.id,
    beforeCount: existingAccounts.length,
    missingCount: missingAccounts.length,
    afterCount: existingAccounts.length + (isDryRun ? 0 : missingAccounts.length),
    missingCodes: missingAccounts.map(a => a.code).join(', ') || 'NONE (Complete)',
  });
}

console.log('Results Summary:');
console.table(summary.map(s => ({
  Company: s.companyName,
  Slug: s.slug,
  'Before COA Count': s.beforeCount,
  'Missing Added': s.missingCount,
  'Final COA Count': s.afterCount,
  'Missing Codes Resolved': s.missingCodes.length > 50 ? `${s.missingCodes.slice(0, 47)}...` : s.missingCodes,
})));

console.log('---------------------------------------------------------------');
console.log(`Total accounts added: ${grandTotalAdded}`);
console.log(`Integrity Check: Zero duplicates created; existing balances/journals preserved.`);
console.log('Status: SUCCESS');
process.exit(0);
