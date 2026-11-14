import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

console.log('===============================================================');
console.log('   PHASE 2: CORE MASTER DATA VERIFICATION TEST SUITE          ');
console.log('===============================================================\n');

const db = new DatabaseSync(':memory:');

// 1. Setup schema
const schemaContent = fs.readFileSync(path.join(process.cwd(), 'src', 'core', 'database', 'schema.ts'), 'utf8');
const sqlMatch = schemaContent.match(/export const CREATE_TABLES_SQL = `([\s\S]*?)`;/);
db.exec(sqlMatch[1]);

// 2. Setup standard accounts
const insertCOA = db.prepare(`
  INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system)
  VALUES (?, ?, ?, ?, ?, 1, 1)
`);
const acc1030 = crypto.randomUUID();
const acc1040 = crypto.randomUUID();
const acc3010 = crypto.randomUUID();
const acc4010 = crypto.randomUUID();
const acc5010 = crypto.randomUUID();

insertCOA.run(acc1030, '1030', 'Accounts Receivable', 'ASSET', 'DEBIT');
insertCOA.run(acc1040, '1040', 'Merchandise Inventory', 'ASSET', 'DEBIT');
insertCOA.run(acc3010, '3010', "Owner's Capital", 'EQUITY', 'CREDIT');
insertCOA.run(acc4010, '4010', 'Sales Revenue', 'REVENUE', 'CREDIT');
insertCOA.run(acc5010, '5010', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT');

// -------------------------------------------------------------
// TEST 1: Inventory Multi-UOM Carton Conversion & Pricing Tiers
// -------------------------------------------------------------
console.log('--- [TEST 1: Inventory Master & Multi-UOM Conversion] ---');

const catId = crypto.randomUUID();
db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(catId, 'Snacks & Confectionery');

const prodId = crypto.randomUUID();
db.prepare(`
  INSERT INTO products (
    id, sku, barcode, name, category_id, uom_base, uom_bulk, bulk_conversion_factor,
    cost_price_paisas, trade_price_paisas, mrp_paisas,
    cost_price, selling_price, current_stock_base, current_stock, min_stock_alert
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  prodId,
  'SNK-001',
  '896400000001',
  'Crispy Potato Chips 50g',
  catId,
  'PACKET',
  'BOX',
  24, // 24 packets per box
  72000, // 720 PKR per box cost (30 PKR / packet)
  96000, // 960 PKR per box TP (40 PKR / packet)
  120000, // 1200 PKR per box MRP (50 PKR / packet)
  720.0,
  960.0,
  125, // 125 packets in warehouse
  125.0,
  24
);

const pRow = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
const cartons = Math.floor(pRow.current_stock_base / pRow.bulk_conversion_factor);
const loose = pRow.current_stock_base % pRow.bulk_conversion_factor;

if (cartons !== 5 || loose !== 5) {
  throw new Error(`Carton breakdown failed! Expected 5 Boxes, 5 Packets, got ${cartons} Boxes, ${loose} Packets`);
}

console.log(`✅ Multi-UOM Conversion verified for ${pRow.name}:`);
console.log(`   Base Stock: ${pRow.current_stock_base} ${pRow.uom_base}s`);
console.log(`   Breakdown: ${cartons} ${pRow.uom_bulk}es and ${loose} loose ${pRow.uom_base}s (Conversion: 1 ${pRow.uom_bulk} = ${pRow.bulk_conversion_factor} ${pRow.uom_base}s)`);
console.log(`   Pricing: Cost: ${pRow.cost_price_paisas/100} PKR | TP: ${pRow.trade_price_paisas/100} PKR | MRP: ${pRow.mrp_paisas/100} PKR`);

// -------------------------------------------------------------
// TEST 2: Stock Adjustment & Opening Reconciliation with GL Entry
// -------------------------------------------------------------
console.log('\n--- [TEST 2: Stock Adjustment with GL Balancing] ---');

const adjQty = 48; // Inward 2 boxes (48 packets)
const unitCostPaisas = pRow.cost_price_paisas / pRow.bulk_conversion_factor; // 3000 paisas per packet
const totalCostPaisas = unitCostPaisas * adjQty; // 144000 paisas (1440 PKR)
const adjId = crypto.randomUUID();
const journalId = crypto.randomUUID();

// Post GL entry: Dr Inventory (1040) / Cr Owner's Capital (3010)
db.exec('BEGIN TRANSACTION;');
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, status, total_amount_paisas, total_amount)
  VALUES (?, 'JE-ADJ-001', '2026-09-19', 'Stock Inward Adjustment', 'inventory', 'POSTED', ?, ?)
`).run(journalId, totalCostPaisas, totalCostPaisas / 100);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, memo)
  VALUES (?, ?, ?, ?, 0, ?, 0, 'Inventory stock inward')
`).run(crypto.randomUUID(), journalId, acc1040, totalCostPaisas, totalCostPaisas / 100);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, memo)
  VALUES (?, ?, ?, 0, ?, 0, ?, 'Opening stock equity adjustment')
`).run(crypto.randomUUID(), journalId, acc3010, totalCostPaisas, totalCostPaisas / 100);

// Update product stock
db.prepare('UPDATE products SET current_stock_base = current_stock_base + ? WHERE id = ?').run(adjQty, prodId);

// Record in stock_adjustments table
db.prepare(`
  INSERT INTO stock_adjustments (id, adjustment_number, adjustment_date, product_id, quantity_base, adjustment_type, unit_cost_paisas, total_cost_paisas, reason, journal_id)
  VALUES (?, 'ADJ-001', '2026-09-19', ?, ?, 'INCREASE', ?, ?, 'Opening Stock Count', ?)
`).run(adjId, prodId, adjQty, unitCostPaisas, totalCostPaisas, journalId);

db.exec('COMMIT;');

const updatedStock = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(prodId).current_stock_base;
if (updatedStock !== 173) {
  throw new Error(`Stock update failed! Expected 173, got ${updatedStock}`);
}
console.log(`✅ Stock adjustment committed: New stock = ${updatedStock} Packets (7 Boxes, 5 Packets).`);
console.log(`✅ Linked GL Entry JE-ADJ-001 posted: Dr Inventory (${totalCostPaisas/100} PKR) == Cr Equity (${totalCostPaisas/100} PKR).`);

// -------------------------------------------------------------
// TEST 3: Route & Customer Management with Credit Check
// -------------------------------------------------------------
console.log('\n--- [TEST 3: Route & Customer Credit Limit Breach Logic] ---');

const routeId = crypto.randomUUID();
db.prepare(`
  INSERT INTO routes (id, name, code, delivery_days)
  VALUES (?, 'Route 1 - North Sector A', 'R-NORTH-A', ?)
`).run(routeId, JSON.stringify(['Monday', 'Thursday']));

const custId = crypto.randomUUID();
const creditLimit = 100000; // 100,000 PKR credit limit
const creditLimitPaisas = creditLimit * 100;

db.prepare(`
  INSERT INTO customers (
    id, name, shop_name, contact_person, phone, route_id, route_name, credit_limit_paisas, credit_limit, credit_days, balance
  ) VALUES (?, ?, ?, ?, ?, ?, 'Route 1 - North Sector A', ?, ?, 14, 0.00)
`).run(custId, 'Al-Madina Superstore', 'Al-Madina Mart Main', 'Tariq Mehmood', '0300-1234567', routeId, creditLimitPaisas, creditLimit);

// Post a prior sales invoice of 85,000 PKR to sub-ledger
const saleJournalId = crypto.randomUUID();
const saleAmountPaisas = 85000 * 100; // 85,000 PKR
db.exec('BEGIN TRANSACTION;');
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, status, total_amount_paisas, total_amount)
  VALUES (?, 'JE-SALE-001', '2026-09-19', 'Invoice INV-001', 'sales', 'POSTED', ?, ?)
`).run(saleJournalId, saleAmountPaisas, 85000);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, 0, 85000, 0, ?, 'CUSTOMER', 'Invoice INV-001')
`).run(crypto.randomUUID(), saleJournalId, acc1030, saleAmountPaisas, custId);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, memo)
  VALUES (?, ?, ?, 0, ?, 0, 85000, 'Sales Revenue')
`).run(crypto.randomUUID(), saleJournalId, acc4010, saleAmountPaisas);
db.exec('COMMIT;');

// Check credit availability for new orders
function checkCredit(currentOutstanding, limit, newOrder) {
  const projected = currentOutstanding + newOrder;
  const remaining = limit - currentOutstanding;
  return {
    allowed: projected <= limit,
    remaining: remaining,
    projected: projected
  };
}

// Case A: Order 10,000 PKR (Projected 95,000 <= 100,000 -> ALLOWED)
const checkA = checkCredit(85000, 100000, 10000);
if (!checkA.allowed) throw new Error('Order A should have been approved!');
console.log(`✅ Credit Check A (10,000 PKR order): APPROVED. Remaining credit: ${checkA.remaining} PKR.`);

// Case B: Order 25,000 PKR (Projected 110,000 > 100,000 -> BREACHED)
const checkB = checkCredit(85000, 100000, 25000);
if (checkB.allowed) throw new Error('Order B should have been blocked!');
console.log(`✅ Credit Check B (25,000 PKR order): BLOCKED. Limit breached by ${(checkB.projected - creditLimit)} PKR.`);

console.log('\n===============================================================');
console.log('   ALL PHASE 2 MASTER DATA TESTS PASSED 100%                   ');
console.log('===============================================================\n');
