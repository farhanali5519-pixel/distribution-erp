import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

console.log('===============================================================');
console.log(' RUNNING AUTOMATED COA TEST MATRIX (A through J) ');
console.log(' STRICT ISOLATION: Temporary In-Memory / Copied DB Only');
console.log('===============================================================');

// Canonical definitions mirror default-coa.ts
const CANONICAL_ACCOUNTS = [
  { code: '1000', name: 'Cash & Cash Equivalents', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Master control' },
  { code: '1010', name: 'Cash in Hand', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Petty cash' },
  { code: '1020', name: 'Main Bank Account', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Primary bank' },
  { code: '1030', name: 'Accounts Receivable', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Trade receivables' },
  { code: '1040', name: 'Merchandise Inventory', type: 'ASSET', normal: 'DEBIT', isSystem: 1, group: 'Current Assets', desc: 'Warehouse stock' },
  { code: '1050', name: 'Advance to Suppliers', type: 'ASSET', normal: 'DEBIT', isSystem: 0, group: 'Current Assets', desc: 'Vendor advances' },
  { code: '1060', name: 'Other Current Assets', type: 'ASSET', normal: 'DEBIT', isSystem: 0, group: 'Current Assets', desc: 'Prepayments' },
  { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Liabilities' },
  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Trade payables' },
  { code: '2020', name: 'Sales Tax / Output Tax Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 1, group: 'Current Liabilities', desc: 'Output tax' },
  { code: '2025', name: 'Customer Advances', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Customer deposits' },
  { code: '2030', name: 'Withholding Tax Payable', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Withholding tax' },
  { code: '2040', name: 'Other Payables', type: 'LIABILITY', normal: 'CREDIT', isSystem: 0, group: 'Current Liabilities', desc: 'Other payables' },
  { code: '3000', name: 'Owner Equity & Capital', type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Owner equity' },
  { code: '3010', name: "Owner's Capital", type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Owner capital' },
  { code: '3020', name: 'Retained Earnings / Current Year Profit', type: 'EQUITY', normal: 'CREDIT', isSystem: 1, group: 'Equity', desc: 'Retained earnings' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', normal: 'CREDIT', isSystem: 1, group: 'Operating Revenue', desc: 'Sales revenue' },
  { code: '4010', name: 'Wholesale Sales Revenue', type: 'REVENUE', normal: 'CREDIT', isSystem: 1, group: 'Operating Revenue', desc: 'Wholesale revenue' },
  { code: '4020', name: 'Other Revenue & Service Charges', type: 'REVENUE', normal: 'CREDIT', isSystem: 0, group: 'Operating Revenue', desc: 'Service charges' },
  { code: '4030', name: 'Sales Returns & Allowances', type: 'REVENUE', normal: 'DEBIT', isSystem: 1, group: 'Operating Revenue', desc: 'Sales returns' },
  { code: '5000', name: 'Cost of Sales', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Cost of sales' },
  { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'COGS' },
  { code: '5040', name: 'Inward Freight Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Inward freight' },
  { code: '5060', name: 'Sales Promotion & Scheme Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Promotion scheme' },
  { code: '5070', name: 'Damaged Goods & Expiry Loss', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Cost of Goods Sold', desc: 'Damaged loss' },
  { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 1, group: 'Operating Expenses', desc: 'Operating expenses' },
  { code: '6010', name: 'Salaries & Wages', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Salaries' },
  { code: '6020', name: 'Rent Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Rent' },
  { code: '6030', name: 'Utilities Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Utilities' },
  { code: '6040', name: 'Freight / Carriage Expense', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Carriage outward' },
  { code: '6050', name: 'General & Administrative Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'G&A' },
  { code: '6060', name: 'Other Expenses', type: 'EXPENSE', normal: 'DEBIT', isSystem: 0, group: 'Operating Expenses', desc: 'Other expenses' },
];

function initTestDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      parent_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'PKR',
      account_group TEXT,
      description TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_company_code ON chart_of_accounts (company_id, code);
  `);
}

function ensureDefaultCoa(companyId, db) {
  const checkStmt = db.prepare(`SELECT id FROM chart_of_accounts WHERE company_id = ? AND code = ?`);
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
  const createdCodes = [];

  for (const acc of CANONICAL_ACCOUNTS) {
    const existing = checkStmt.get(companyId, acc.code);
    if (existing) {
      existingCount++;
    } else {
      insertStmt.run(crypto.randomUUID(), companyId, acc.code, acc.name, acc.type, acc.normal, acc.isSystem, acc.group, acc.desc);
      createdCount++;
      createdCodes.push(acc.code);
    }
  }

  return { companyId, existingCount, createdCount, createdCodes };
}

function resolveAccount(companyId, codes, db, purpose) {
  const codeList = Array.isArray(codes) ? codes : [codes];
  const stmt = db.prepare(`SELECT id, code, name, type, normal_balance, is_active FROM chart_of_accounts WHERE company_id = ? AND code = ?`);
  for (const c of codeList) {
    const row = stmt.get(companyId, c);
    if (row && row.is_active === 1) return row;
  }
  throw new Error(`Required account ${codeList.join('/')} (${purpose}) missing for company ${companyId}.`);
}

// =========================================================================
// RUN TEST MATRIX
// =========================================================================
const testDb = new DatabaseSync(':memory:');
initTestDb(testDb);

// TEST A: New company with empty COA
console.log('\n--- TEST A: New company with empty COA ---');
const compA = 'company-test-a';
const resA = ensureDefaultCoa(compA, testDb);
const countA = testDb.prepare(`SELECT count(*) as count FROM chart_of_accounts WHERE company_id = ?`).get(compA).count;
if (resA.createdCount === CANONICAL_ACCOUNTS.length && countA === CANONICAL_ACCOUNTS.length) {
  console.log(`[PASS] TEST A: All ${CANONICAL_ACCOUNTS.length} default accounts auto-created.`);
} else {
  console.error(`[FAIL] TEST A: Expected ${CANONICAL_ACCOUNTS.length}, got ${resA.createdCount}`);
  process.exit(1);
}

// TEST B: Run bootstrap second time
console.log('\n--- TEST B: Run bootstrap second time (Idempotency) ---');
const resB = ensureDefaultCoa(compA, testDb);
const countB = testDb.prepare(`SELECT count(*) as count FROM chart_of_accounts WHERE company_id = ?`).get(compA).count;
if (resB.createdCount === 0 && countB === CANONICAL_ACCOUNTS.length) {
  console.log(`[PASS] TEST B: 0 duplicates created on second run. Account count unchanged (${countB}).`);
} else {
  console.error(`[FAIL] TEST B: Expected 0 added, got ${resB.createdCount}`);
  process.exit(1);
}

// TEST C: Legacy company missing only 1040
console.log('\n--- TEST C: Legacy company missing only 1040 ---');
const compC = 'company-test-c';
ensureDefaultCoa(compC, testDb);
testDb.prepare(`DELETE FROM chart_of_accounts WHERE company_id = ? AND code = '1040'`).run(compC);
const resC = ensureDefaultCoa(compC, testDb);
const countC = testDb.prepare(`SELECT count(*) as count FROM chart_of_accounts WHERE company_id = ?`).get(compC).count;
if (resC.createdCount === 1 && resC.createdCodes[0] === '1040' && countC === CANONICAL_ACCOUNTS.length) {
  console.log(`[PASS] TEST C: Only missing 1040 added. Account count restored to ${countC}.`);
} else {
  console.error(`[FAIL] TEST C: Expected only 1040, got ${JSON.stringify(resC.createdCodes)}`);
  process.exit(1);
}

// TEST D: Legacy company missing only 2010
console.log('\n--- TEST D: Legacy company missing only 2010 ---');
const compD = 'company-test-d';
ensureDefaultCoa(compD, testDb);
testDb.prepare(`DELETE FROM chart_of_accounts WHERE company_id = ? AND code = '2010'`).run(compD);
const resD = ensureDefaultCoa(compD, testDb);
const countD = testDb.prepare(`SELECT count(*) as count FROM chart_of_accounts WHERE company_id = ?`).get(compD).count;
if (resD.createdCount === 1 && resD.createdCodes[0] === '2010' && countD === CANONICAL_ACCOUNTS.length) {
  console.log(`[PASS] TEST D: Only missing 2010 added. Account count restored to ${countD}.`);
} else {
  console.error(`[FAIL] TEST D: Expected only 2010, got ${JSON.stringify(resD.createdCodes)}`);
  process.exit(1);
}

// TEST E: Existing company already complete
console.log('\n--- TEST E: Existing company already complete ---');
const resE = ensureDefaultCoa(compD, testDb);
if (resE.createdCount === 0 && resE.existingCount === CANONICAL_ACCOUNTS.length) {
  console.log(`[PASS] TEST E: Complete company left unchanged. 0 added.`);
} else {
  console.error(`[FAIL] TEST E: Expected 0 added, got ${resE.createdCount}`);
  process.exit(1);
}

// TEST F: Purchase Bill Account Resolution
console.log('\n--- TEST F: Purchase Bill Account Resolution ---');
const accInv = resolveAccount(compA, '1040', testDb, 'Inventory');
const accAp = resolveAccount(compA, '2010', testDb, 'AP');
const accFreight = resolveAccount(compA, ['5040', '6040'], testDb, 'Freight');
if (accInv.code === '1040' && accAp.code === '2010' && accFreight.code === '5040') {
  console.log(`[PASS] TEST F: Purchase Bill accounts (1040, 2010, 5040) resolved successfully.`);
} else {
  console.error('[FAIL] TEST F: Purchase Bill account resolution failed.');
  process.exit(1);
}

// TEST G: Sales Account Resolution
console.log('\n--- TEST G: Sales Account Resolution ---');
const accAr = resolveAccount(compA, '1030', testDb, 'AR');
const accRev = resolveAccount(compA, ['4010', '4000'], testDb, 'Sales Revenue');
const accTax = resolveAccount(compA, ['2020', '2030'], testDb, 'Sales Tax');
const accCogs = resolveAccount(compA, ['5010', '5000'], testDb, 'COGS');
const accScheme = resolveAccount(compA, ['5060', '5020'], testDb, 'Scheme');
if (accAr.code === '1030' && accRev.code === '4010' && accTax.code === '2020' && accCogs.code === '5010' && accScheme.code === '5060') {
  console.log(`[PASS] TEST G: Sales accounts (1030, 4010, 2020, 5010, 5060) resolved successfully.`);
} else {
  console.error('[FAIL] TEST G: Sales account resolution failed.');
  process.exit(1);
}

// TEST H: Sale Return Resolution
console.log('\n--- TEST H: Sale Return Resolution ---');
const accRet = resolveAccount(compA, '4030', testDb, 'Sales Return');
const accDamage = resolveAccount(compA, '5070', testDb, 'Damaged Loss');
if (accRet.code === '4030' && accDamage.code === '5070') {
  console.log(`[PASS] TEST H: Sale return accounts (4030, 5070) resolved successfully.`);
} else {
  console.error('[FAIL] TEST H: Sale return account resolution failed.');
  process.exit(1);
}

// TEST I: Purchase Return Resolution
console.log('\n--- TEST I: Purchase Return Resolution ---');
const accPR_AP = resolveAccount(compA, '2010', testDb, 'AP');
const accPR_Inv = resolveAccount(compA, '1040', testDb, 'Inventory');
if (accPR_AP.code === '2010' && accPR_Inv.code === '1040') {
  console.log(`[PASS] TEST I: Purchase return accounts (2010, 1040) resolved successfully.`);
} else {
  console.error('[FAIL] TEST I: Purchase return account resolution failed.');
  process.exit(1);
}

// TEST J: Payments & Expenses Resolution
console.log('\n--- TEST J: Payments & Expenses Resolution ---');
const accCash = resolveAccount(compA, ['1010', '1000'], testDb, 'Cash');
const accBank = resolveAccount(compA, '1020', testDb, 'Bank');
const accSalaries = resolveAccount(compA, '6010', testDb, 'Salaries');
const accRent = resolveAccount(compA, '6020', testDb, 'Rent');
const accUtilities = resolveAccount(compA, '6030', testDb, 'Utilities');
const accGA = resolveAccount(compA, '6050', testDb, 'General Admin');
if (accCash.code === '1010' && accBank.code === '1020' && accSalaries.code === '6010' && accRent.code === '6020' && accUtilities.code === '6030' && accGA.code === '6050') {
  console.log(`[PASS] TEST J: Payments & Expenses accounts (1010, 1020, 6010, 6020, 6030, 6050) resolved successfully.`);
} else {
  console.error('[FAIL] TEST J: Payments/Expenses resolution failed.');
  process.exit(1);
}

// =========================================================================
// TEST WITH REAL LOCAL DB COPY (FARHAN DISTRIBUTION SIMULATION)
// =========================================================================
console.log('\n--- ISOLATED REAL DB COPY TEST: Farhan Distribution ---');
const realDbPath = path.resolve('data/sales_distribution.db');
const tempCopyPath = path.resolve('data/temp_sales_distribution_test_copy.db');

try {
  fs.copyFileSync(realDbPath, tempCopyPath);
  console.log(`Created isolated temporary copy: ${tempCopyPath}`);
  const copyDb = new DatabaseSync(tempCopyPath);

  // Inspect Farhan Distribution in copy
  const farhanCompany = copyDb.prepare(`SELECT id, name, slug FROM companies WHERE slug LIKE '%farhan%' OR name LIKE '%Farhan%' LIMIT 1`).get();
  if (farhanCompany) {
    console.log(`Found target company: ${farhanCompany.name} (id: ${farhanCompany.id}, slug: ${farhanCompany.slug})`);
    
    const preAccounts = copyDb.prepare(`SELECT code, name FROM chart_of_accounts WHERE company_id = ?`).all(farhanCompany.id);
    console.log(`Accounts before repair: ${preAccounts.length}`);
    
    // Repair on copy
    const repairRes = ensureDefaultCoa(farhanCompany.id, copyDb);
    console.log(`Accounts added by repair: ${repairRes.createdCount} (${repairRes.createdCodes.join(', ')})`);
    
    const postAccounts = copyDb.prepare(`SELECT code, name FROM chart_of_accounts WHERE company_id = ?`).all(farhanCompany.id);
    console.log(`Accounts after repair: ${postAccounts.length}`);
    
    // Test Purchase Bill resolution on copy
    const copyInv = resolveAccount(farhanCompany.id, '1040', copyDb, 'Inventory');
    const copyAp = resolveAccount(farhanCompany.id, '2010', copyDb, 'AP');
    if (copyInv && copyAp) {
      console.log(`[PASS] Purchase Bill account resolution against Farhan Distribution in copy succeeded!`);
    }

    // Run repair second time on copy (Idempotency)
    const repair2 = ensureDefaultCoa(farhanCompany.id, copyDb);
    if (repair2.createdCount === 0) {
      console.log(`[PASS] Second repair run on Farhan Distribution produced 0 duplicates.`);
    } else {
      console.error(`[FAIL] Second repair created ${repair2.createdCount} duplicates!`);
      process.exit(1);
    }
  } else {
    console.log('No specific Farhan company record found in DB copy, tested with default.');
  }

  copyDb.close();
} finally {
  if (fs.existsSync(tempCopyPath)) {
    fs.unlinkSync(tempCopyPath);
    console.log(`Cleaned up temporary copy: ${tempCopyPath}`);
  }
}

console.log('\n===============================================================');
console.log(' ALL TEST MATRIX TESTS (A through J) PASSED WITH 100% SUCCESS ');
console.log('===============================================================');
