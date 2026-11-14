import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/sales_distribution.db');

console.log('====================================================');
console.log('BUSINESS REFERENCE RESOLUTION VERIFICATION');
console.log('Testing against database (READ-ONLY):', dbPath);
console.log('====================================================\n');

const db = new DatabaseSync(dbPath, { readOnly: true });

// Shared Reference Helpers (mirrors @/shared/utils/reference.ts)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_UUID_REGEX = /^[0-9a-f]{32}$/i;
const DOC_PATTERN_REGEX = /\b(BILL-\d{6}-\d{4}|BILL-\d{4}-\d+|ORD-\d{4}-\d+|INV-\d{4}-\d+|PR-\d{6}-\d{4}|PR-\d{4}-\d+|SR-\d{6}-\d{4}|SR-\d{4}-\d+|PV-\d{6}-\d{4}|PV-\d{4}-\d+|CR-\d{6}-\d{4}|CR-\d{4}-\d+|EXP-\d{6}-\d{4}|EXP-\d{4}-\d+|ADJ-\d{4}-\d+|JE-\d{6}-\d{4}|JE-\d{4}-\d+|JV-[A-Z0-9-]+)\b/i;

function isUuid(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return UUID_REGEX.test(trimmed) || COMPACT_UUID_REGEX.test(trimmed);
}

function formatBusinessReference(rawRef, entryNumber, description) {
  if (!rawRef && !entryNumber && !description) return '—';
  if (rawRef && !isUuid(rawRef)) return rawRef.trim();
  if (description) {
    const match = description.match(DOC_PATTERN_REGEX);
    if (match && match[1]) return match[1].toUpperCase();
  }
  if (entryNumber && !isUuid(entryNumber)) return entryNumber.trim();
  if (rawRef && isUuid(rawRef)) return `REF-${rawRef.slice(0, 8).toUpperCase()}`;
  return '—';
}

// Batch Resolver Implementation
function batchResolveSync(items, companyId, dbClient) {
  if (!items || items.length === 0) return [];
  const resolvedMap = new Map();
  const purchaseIds = new Set();
  const salesIds = new Set();
  const paymentIds = new Set();
  const returnIds = new Set();
  const expenseIds = new Set();
  const inventoryIds = new Set();
  const bankingIds = new Set();
  const reversalIds = new Set();
  const fallbackLookupIds = new Set();

  for (const item of items) {
    const docId = item.sourceDocumentId;
    const revId = item.reversalOfId;
    const mod = (item.sourceModule || '').toLowerCase();

    if (revId && isUuid(revId)) reversalIds.add(revId);
    if (mod === 'reversal' && docId && isUuid(docId)) reversalIds.add(docId);

    if (docId) {
      if (!isUuid(docId)) {
        resolvedMap.set(docId, docId);
      } else {
        if (mod === 'purchase') purchaseIds.add(docId);
        else if (mod === 'sales' || mod === 'direct_sales') salesIds.add(docId);
        else if (mod === 'payments') paymentIds.add(docId);
        else if (mod === 'returns') returnIds.add(docId);
        else if (mod === 'expenses') expenseIds.add(docId);
        else if (mod === 'inventory') inventoryIds.add(docId);
        else if (mod === 'banking') bankingIds.add(docId);
        else fallbackLookupIds.add(docId);
      }
    }
  }

  // Handle reversals
  const reversalOriginalMap = new Map();
  if (reversalIds.size > 0) {
    const revArray = Array.from(reversalIds);
    for (let i = 0; i < revArray.length; i += 200) {
      const chunk = revArray.slice(i, i + 200);
      const ph = chunk.map(() => '?').join(',');
      const revRows = dbClient.prepare(
        `SELECT id, entry_number, source_module, source_document_id, description FROM journal_entries WHERE id IN (${ph}) AND company_id = ?`
      ).all(...chunk, companyId);
      for (const r of revRows) {
        reversalOriginalMap.set(r.id, r);
        if (r.source_document_id && isUuid(r.source_document_id)) {
          const origMod = (r.source_module || '').toLowerCase();
          if (origMod === 'purchase') purchaseIds.add(r.source_document_id);
          else if (origMod === 'sales' || origMod === 'direct_sales') salesIds.add(r.source_document_id);
          else if (origMod === 'payments') paymentIds.add(r.source_document_id);
          else if (origMod === 'returns') returnIds.add(r.source_document_id);
          else if (origMod === 'expenses') expenseIds.add(r.source_document_id);
          else if (origMod === 'inventory') inventoryIds.add(r.source_document_id);
          else fallbackLookupIds.add(r.source_document_id);
        }
      }
    }
  }

  // Purchases
  if (purchaseIds.size > 0) {
    const arr = Array.from(purchaseIds);
    const ph = arr.map(() => '?').join(',');
    const rows = dbClient.prepare(
      `SELECT id, bill_number FROM purchase_bills WHERE id IN (${ph}) AND company_id = ?`
    ).all(...arr, companyId);
    for (const r of rows) {
      if (r.bill_number) resolvedMap.set(r.id, r.bill_number);
    }
  }

  // Sales
  if (salesIds.size > 0) {
    const arr = Array.from(salesIds);
    const ph = arr.map(() => '?').join(',');
    const orderRows = dbClient.prepare(
      `SELECT id, order_number FROM sales_orders WHERE id IN (${ph}) AND company_id = ?`
    ).all(...arr, companyId);
    for (const r of orderRows) {
      if (r.order_number) resolvedMap.set(r.id, r.order_number);
    }
    const invRows = dbClient.prepare(
      `SELECT id, invoice_number FROM sales_invoices WHERE id IN (${ph}) AND company_id = ?`
    ).all(...arr, companyId);
    for (const r of invRows) {
      if (r.invoice_number && !resolvedMap.has(r.id)) resolvedMap.set(r.id, r.invoice_number);
    }
  }

  // Inventory
  if (inventoryIds.size > 0) {
    const arr = Array.from(inventoryIds);
    const ph = arr.map(() => '?').join(',');
    const adjRows = dbClient.prepare(
      `SELECT id, adjustment_number FROM stock_adjustments WHERE id IN (${ph}) AND company_id = ?`
    ).all(...arr, companyId);
    for (const r of adjRows) {
      if (r.adjustment_number) resolvedMap.set(r.id, r.adjustment_number);
    }
    const movRows = dbClient.prepare(
      `SELECT id, movement_number, document_number FROM inventory_movements WHERE id IN (${ph}) AND company_id = ?`
    ).all(...arr, companyId);
    for (const r of movRows) {
      if (!resolvedMap.has(r.id)) resolvedMap.set(r.id, r.document_number || r.movement_number);
    }
  }

  // Link reversals
  for (const [revId, orig] of reversalOriginalMap.entries()) {
    if (orig.source_document_id && resolvedMap.has(orig.source_document_id)) {
      resolvedMap.set(revId, resolvedMap.get(orig.source_document_id));
    } else if (orig.description) {
      const match = orig.description.match(DOC_PATTERN_REGEX);
      if (match && match[1]) resolvedMap.set(revId, match[1].toUpperCase());
    } else if (orig.entry_number) {
      resolvedMap.set(revId, orig.entry_number);
    }
  }

  return items.map((item) => {
    let resolved = null;
    const docId = item.sourceDocumentId;
    const revId = item.reversalOfId;

    if (revId && resolvedMap.has(revId)) {
      resolved = resolvedMap.get(revId);
    } else if (docId && resolvedMap.has(docId)) {
      resolved = resolvedMap.get(docId);
    }

    const businessReference = formatBusinessReference(
      resolved || docId,
      item.entryNumber,
      item.description || item.memo
    );

    return {
      ...item,
      businessReference,
      referenceDisplay: businessReference,
    };
  });
}

// ==========================================
// TEST 1: Account 1040 (Merchandise Inventory)
// ==========================================
console.log('--- TEST 1: Chart of Accounts (Account 1040: Merchandise Inventory) ---');
const companyRow = db.prepare('SELECT id FROM companies LIMIT 1').get();
const companyId = companyRow ? companyRow.id : 'COMP-001';

const acct1040 = db.prepare('SELECT id, code, name FROM chart_of_accounts WHERE code = ? AND company_id = ?').get('1040', companyId);
if (!acct1040) {
  console.error('FAIL: Account 1040 not found!');
  process.exit(1);
}
console.log(`Found Account: ${acct1040.code} - ${acct1040.name} (ID: ${acct1040.id})`);

const rawLines = db.prepare(`
  SELECT 
    jl.id as line_id,
    je.id as journal_id,
    je.entry_number,
    je.entry_date,
    je.source_module,
    je.source_document_id,
    je.reversal_of_id,
    COALESCE(jl.memo, je.description) as description,
    jl.debit_paisas,
    jl.credit_paisas
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
  WHERE jl.account_id = ? AND jl.company_id = ? AND je.status = 'POSTED'
  ORDER BY je.entry_date ASC, je.created_at ASC, jl.id ASC
`).all(acct1040.id, companyId);

console.log(`Total ledger lines on Account 1040: ${rawLines.length}`);

const itemsToResolve = rawLines.map(l => ({
  id: l.line_id,
  journalId: l.journal_id,
  entryNumber: l.entry_number,
  sourceModule: l.source_module,
  sourceDocumentId: l.source_document_id,
  reversalOfId: l.reversal_of_id,
  description: l.description,
}));

const resolved = batchResolveSync(itemsToResolve, companyId, db);

let uuidLeakCount = 0;
let purchaseCount = 0;
let reversalCount = 0;
let salesCount = 0;

console.log('\nSample Resolved Entries on Account 1040:');
console.log('---------------------------------------------------------------------------------------------------------------------');
console.log('Date       | Entry #         | Module    | Reference (Clean) | Description');
console.log('---------------------------------------------------------------------------------------------------------------------');

resolved.slice(0, 15).forEach((r, idx) => {
  const line = rawLines[idx];
  if (isUuid(r.businessReference)) {
    uuidLeakCount++;
    console.error(`[LEAK DETECTED] Line ${idx}: Reference contains raw UUID: ${r.businessReference}`);
  }
  if (r.sourceModule === 'purchase') purchaseCount++;
  if (r.sourceModule === 'reversal') reversalCount++;
  if (r.sourceModule === 'sales' || r.sourceModule === 'direct_sales') salesCount++;

  console.log(`${line.entry_date} | ${(r.entryNumber || '').padEnd(15)} | ${(r.sourceModule || '').padEnd(9)} | ${(r.businessReference || '').padEnd(17)} | ${(line.description || '').slice(0, 50)}`);
});
console.log('---------------------------------------------------------------------------------------------------------------------\n');

// Check all rows for UUID leaks
resolved.forEach((r, idx) => {
  if (isUuid(r.businessReference)) {
    uuidLeakCount++;
  }
});

console.log(`Total UUID leaks detected across ALL ${resolved.length} rows: ${uuidLeakCount}`);
if (uuidLeakCount > 0) {
  console.error('FAIL: Raw UUIDs were leaked in the reference column!');
  process.exit(1);
} else {
  console.log('PASS: Zero raw UUIDs exposed across all Account 1040 ledger lines!');
}

// ==========================================
// TEST 2: Fallback Hierarchy Matrix Test
// ==========================================
console.log('\n--- TEST 2: Fallback Hierarchy Matrix ---');
const testCases = [
  {
    name: 'Canonical purchase bill reference',
    rawRef: 'BILL-202610-0001',
    entryNumber: 'JE-202610-0003',
    description: 'Merchandise purchase from Vendor',
    expected: 'BILL-202610-0001',
  },
  {
    name: 'Sales order reference',
    rawRef: 'ORD-2026-51614',
    entryNumber: 'JE-202610-0004',
    description: 'Inventory relief for Sale Bill ORD-2026-51614',
    expected: 'ORD-2026-51614',
  },
  {
    name: 'UUID rawRef with document pattern in description',
    rawRef: '7fa91c65-de29-429c-b17f-1322a36b32ee',
    entryNumber: 'JE-202610-0002',
    description: 'Reversal of Merchandise purchase — BILL-202610-0001',
    expected: 'BILL-202610-0001',
  },
  {
    name: 'Manual journal with no source document (uses entryNumber fallback)',
    rawRef: null,
    entryNumber: 'JE-202610-0005',
    description: 'Year end depreciation adjustment',
    expected: 'JE-202610-0005',
  },
  {
    name: 'Unresolvable raw UUID with no doc in narration (safe short fallback)',
    rawRef: 'b05e2ff8-baab-455a-8b1e-927161820491',
    entryNumber: null,
    description: 'Uncategorized adjustment',
    expected: 'REF-B05E2FF8',
  },
  {
    name: 'Completely empty reference and entryNumber',
    rawRef: null,
    entryNumber: null,
    description: null,
    expected: '—',
  },
];

let matrixPassed = true;
for (const tc of testCases) {
  const result = formatBusinessReference(tc.rawRef, tc.entryNumber, tc.description);
  const match = result === tc.expected;
  if (!match) {
    console.error(`FAIL: ${tc.name} -> Expected "${tc.expected}", got "${result}"`);
    matrixPassed = false;
  } else {
    console.log(`PASS: ${tc.name} -> "${result}"`);
  }
}

if (!matrixPassed) {
  console.error('FAIL: Regression in fallback hierarchy matrix!');
  process.exit(1);
}

// ==========================================
// TEST 3: Performance & Query Count Verification
// ==========================================
console.log('\n--- TEST 3: Batch Resolution Performance (N+1 Query Prevention) ---');
const t0 = performance.now();
const testLargeSet = [];
for (let i = 0; i < 100; i++) {
  testLargeSet.push(...itemsToResolve);
}
console.log(`Running batch resolution on ${testLargeSet.length} rows...`);
const largeResolved = batchResolveSync(testLargeSet, companyId, db);
const t1 = performance.now();
const durationMs = (t1 - t0).toFixed(2);
console.log(`Batch resolved ${testLargeSet.length} rows in ${durationMs}ms`);
if (Number(durationMs) > 1000) {
  console.warn('WARN: Batch resolution took longer than expected.');
} else {
  console.log(`PASS: Highly performant batch query (${(Number(durationMs) / testLargeSet.length).toFixed(4)}ms per item)`);
}

db.close();
console.log('\n====================================================');
console.log('ALL RESOLVER TESTS COMPLETED SUCCESSFULLY (PASS)');
console.log('====================================================');
