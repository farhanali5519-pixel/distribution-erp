// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

console.log('--- STARTING MULTI-SELECT FILTER SYSTEM TEST SUITE ---');

// =========================================================================
// TEST 1: Trigger Label Formatting Rules
// =========================================================================
console.log('\n[TEST 1] Trigger Label Formatting Rules');

function formatTriggerLabel(selectedValues, options, placeholder = 'All Items') {
  if (selectedValues.length === 0) {
    return placeholder;
  }
  const selectedOptions = options.filter((o) => selectedValues.includes(o.value));
  if (selectedOptions.length === 1) {
    return selectedOptions[0].label;
  }
  if (selectedOptions.length === 2) {
    return `${selectedOptions[0].label} + ${selectedOptions[1].label}`;
  }
  const noun = placeholder.replace(/^(All|Select)\s+/i, '').trim() || 'Items';
  return `${selectedValues.length} ${noun} Selected`;
}

const categoryOptions = [
  { value: 'cat-1', label: 'SOAP' },
  { value: 'cat-2', label: 'Beverages' },
  { value: 'cat-3', label: 'Snacks' },
  { value: 'cat-4', label: 'Dairy' },
];

// 0 selected -> All Categories
assert.equal(formatTriggerLabel([], categoryOptions, 'All Categories'), 'All Categories');
console.log('✓ 0 selected: "All Categories"');

// 1 selected -> SOAP
assert.equal(formatTriggerLabel(['cat-1'], categoryOptions, 'All Categories'), 'SOAP');
console.log('✓ 1 selected: "SOAP"');

// 2 selected -> SOAP + Beverages
assert.equal(formatTriggerLabel(['cat-1', 'cat-2'], categoryOptions, 'All Categories'), 'SOAP + Beverages');
console.log('✓ 2 selected: "SOAP + Beverages"');

// 3 selected -> 3 Categories Selected
assert.equal(formatTriggerLabel(['cat-1', 'cat-2', 'cat-3'], categoryOptions, 'All Categories'), '3 Categories Selected');
console.log('✓ 3 selected: "3 Categories Selected"');

// 4 selected -> 4 Categories Selected
assert.equal(formatTriggerLabel(['cat-1', 'cat-2', 'cat-3', 'cat-4'], categoryOptions, 'All Categories'), '4 Categories Selected');
console.log('✓ 4 selected: "4 Categories Selected"');


// =========================================================================
// TEST 2: Filter Logic: OR within group, AND across groups
// =========================================================================
console.log('\n[TEST 2] Filter Logic: OR within group, AND across groups');

const mockProducts = [
  { id: '1', name: 'Lux Soap', category: 'SOAP', brand: 'DUE', status: 'Active' },
  { id: '2', name: 'Pepsi Can', category: 'Beverages', brand: 'ABC', status: 'Active' },
  { id: '3', name: 'Lays Chips', category: 'Snacks', brand: 'DUE', status: 'Active' },
  { id: '4', name: 'Lifebuoy Soap', category: 'SOAP', brand: 'XYZ', status: 'Inactive' },
  { id: '5', name: 'Sprite Can', category: 'Beverages', brand: 'DUE', status: 'Inactive' },
];

function applyFilters(products, { categories = [], brands = [], statuses = [] }) {
  return products.filter((p) => {
    // OR within Category group
    const matchesCategory = categories.length === 0 || categories.includes(p.category);
    // OR within Brand group
    const matchesBrand = brands.length === 0 || brands.includes(p.brand);
    // OR within Status group
    const matchesStatus = statuses.length === 0 || statuses.includes(p.status);

    // AND across groups
    return matchesCategory && matchesBrand && matchesStatus;
  });
}

// Case A: Category = SOAP + Beverages (OR within category)
const resA = applyFilters(mockProducts, { categories: ['SOAP', 'Beverages'] });
assert.equal(resA.length, 4); // Lux, Pepsi, Lifebuoy, Sprite
console.log('✓ Case A: Category = (SOAP OR Beverages) -> 4 products found');

// Case B: Category = SOAP + Beverages AND Brand = DUE OR ABC
const resB = applyFilters(mockProducts, {
  categories: ['SOAP', 'Beverages'],
  brands: ['DUE', 'ABC'],
});
// Lux Soap (SOAP, DUE) -> match
// Pepsi Can (Beverages, ABC) -> match
// Sprite Can (Beverages, DUE) -> match
assert.equal(resB.length, 3);
console.log('✓ Case B: (SOAP OR Beverages) AND (DUE OR ABC) -> 3 products found');

// Case C: Category = SOAP + Beverages AND Brand = DUE OR ABC AND Status = Active
const resC = applyFilters(mockProducts, {
  categories: ['SOAP', 'Beverages'],
  brands: ['DUE', 'ABC'],
  statuses: ['Active'],
});
// Lux Soap (Active) -> match
// Pepsi Can (Active) -> match
// Sprite Can (Inactive) -> rejected
assert.equal(resC.length, 2);
assert.deepEqual(resC.map((p) => p.name).sort(), ['Lux Soap', 'Pepsi Can'].sort());
console.log('✓ Case C: (SOAP OR Beverages) AND (DUE OR ABC) AND (Status = Active) -> 2 products found');


// =========================================================================
// TEST 3: Backend Multi-Select Query Parameterization in Isolated SQLite DB
// =========================================================================
console.log('\n[TEST 3] Backend Multi-Select Query Parameterization in Isolated DB');

const scratchDir = path.resolve('scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
const testDbPath = path.join(scratchDir, 'test-multi-select.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = new DatabaseSync(testDbPath);

db.exec(`
  CREATE TABLE purchase_bills (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    bill_number TEXT NOT NULL,
    status TEXT NOT NULL,
    net_amount_paisas INTEGER NOT NULL
  );
  INSERT INTO purchase_bills VALUES ('b1', 'comp1', 'PB-001', 'POSTED', 100000);
  INSERT INTO purchase_bills VALUES ('b2', 'comp1', 'PB-002', 'DRAFT', 50000);
  INSERT INTO purchase_bills VALUES ('b3', 'comp1', 'PB-003', 'VOID', 25000);
  INSERT INTO purchase_bills VALUES ('b4', 'comp1', 'PB-004', 'POSTED', 75000);
`);

function queryBills(statusFilter) {
  let baseQuery = 'FROM purchase_bills WHERE company_id = ?';
  const params = ['comp1'];

  if (statusFilter) {
    const statuses = (Array.isArray(statusFilter) ? statusFilter : statusFilter.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 1) {
      baseQuery += ' AND status = ?';
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      baseQuery += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }
  }

  const count = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params).count;
  const rows = db.prepare(`SELECT * ${baseQuery} ORDER BY bill_number ASC`).all(...params);
  return { count, rows };
}

// 1. Single status
const q1 = queryBills('POSTED');
assert.equal(q1.count, 2);
assert.equal(q1.rows.length, 2);
console.log('✓ Backend query: single status "POSTED" returns 2 bills, count=2');

// 2. Multi-status array: POSTED + DRAFT
const q2 = queryBills(['POSTED', 'DRAFT']);
assert.equal(q2.count, 3);
assert.equal(q2.rows.length, 3);
assert.deepEqual(q2.rows.map((r) => r.bill_number), ['PB-001', 'PB-002', 'PB-004']);
console.log('✓ Backend query: array ["POSTED", "DRAFT"] returns 3 bills, count=3');

// 3. Multi-status comma-separated: 'POSTED,VOID'
const q3 = queryBills('POSTED,VOID');
assert.equal(q3.count, 3);
assert.equal(q3.rows.length, 3);
assert.deepEqual(q3.rows.map((r) => r.bill_number), ['PB-001', 'PB-003', 'PB-004']);
console.log('✓ Backend query: comma string "POSTED,VOID" returns 3 bills, count=3');

// 4. SQL Injection safety check
const qSqlInj = queryBills(["POSTED', 'VOID'; DROP TABLE purchase_bills; --"]);
assert.equal(qSqlInj.count, 0); // Param properly escaped, table remains intact
const checkTable = db.prepare('SELECT count(*) as c FROM purchase_bills').get().c;
assert.equal(checkTable, 4);
console.log('✓ SQL Injection attempt safely parameterized, table intact');

db.close();
fs.unlinkSync(testDbPath);


// =========================================================================
// TEST 4: Audit Transactional Single-Select Integrity
// =========================================================================
console.log('\n[TEST 4] Audit Transactional Single-Select Integrity');

// We must verify that transactional fields remain single-select:
// - Vendor on Purchase (src/app/(dashboard)/purchase/new-bill/page.tsx)
// - Line item product selection (new-bill/page.tsx)
// - Category in Product Master form (inventory/page.tsx)
// - Brand in Product Master form (inventory/page.tsx)

const newBillContent = fs.readFileSync('src/app/(dashboard)/purchase/new-bill/page.tsx', 'utf-8');

// Check all SearchableSelect usages in new-bill
const matches = [...newBillContent.matchAll(/<SearchableSelect\b([\s\S]*?)\/>/g)];
const vendorSelect = matches.find((m) => m[1].includes('vendorOptions'));
const productSelect = matches.find((m) => m[1].includes('productOptions'));

assert.ok(vendorSelect, 'Vendor SearchableSelect found in new-bill');
assert.ok(!vendorSelect[1].includes('mode="multiple"'), 'Vendor select is NOT multi-select');
console.log('✓ Transactional: Vendor on Purchase remains single-select');

assert.ok(productSelect, 'Product line SearchableSelect found in new-bill');
assert.ok(!productSelect[1].includes('mode="multiple"'), 'Product on line item is NOT multi-select');
console.log('✓ Transactional: Product on line item remains single-select');

// Product Category in Product Master form must NOT have mode="multiple"
const invPageContent = fs.readFileSync('src/app/(dashboard)/inventory/page.tsx', 'utf-8');
const invMatches = [...invPageContent.matchAll(/<SearchableSelect\b([\s\S]*?)\/>/g)];
const catForm = invMatches.find((m) => m[1].includes('categorySelectOptions'));
const brandForm = invMatches.find((m) => m[1].includes('brandSelectOptions'));

assert.ok(catForm, 'Category form SearchableSelect found in inventory');
assert.ok(!catForm[1].includes('mode="multiple"'), 'Category in product form is NOT multi-select');
console.log('✓ Transactional: Product Category in Product Master form remains single-select');

assert.ok(brandForm, 'Brand form SearchableSelect found in inventory');
assert.ok(!brandForm[1].includes('mode="multiple"'), 'Brand in product form is NOT multi-select');
console.log('✓ Transactional: Product Brand in Product Master form remains single-select');

console.log('\n--- ALL MULTI-SELECT FILTER TESTS PASSED SUCCESSFULLY! ---');
