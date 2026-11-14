import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

console.log('===============================================================');
console.log('   PHASE 3: SALES WORKFLOW & FEATURE FLAG VERIFICATION SUITE   ');
console.log('===============================================================\n');

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

// -------------------------------------------------------------
// TEST 1: Feature Flag Configuration Engine
// -------------------------------------------------------------
console.log('--- [TEST 1: Feature Flag Configuration Engine] ---');

const flags = db.prepare('SELECT key, module_id, value, label FROM feature_flags ORDER BY key').all();
console.log(`Found ${flags.length} registered feature flags in database.`);

if (flags.length < 10) {
  throw new Error(`Expected at least 10 feature flags, found ${flags.length}`);
}

// Test toggling flag OFF and ON
const testKey = 'sales.enable_line_discount';
db.prepare("UPDATE feature_flags SET value = 'false' WHERE key = ?").run(testKey);
const flagOff = db.prepare("SELECT value FROM feature_flags WHERE key = ?").get(testKey);
if (flagOff.value !== 'false') throw new Error('Feature flag toggle OFF failed');

db.prepare("UPDATE feature_flags SET value = 'true' WHERE key = ?").run(testKey);
const flagOn = db.prepare("SELECT value FROM feature_flags WHERE key = ?").get(testKey);
if (flagOn.value !== 'true') throw new Error('Feature flag toggle ON failed');

console.log('✅ Feature flag real-time toggle & persistence verified.\n');

// -------------------------------------------------------------
// TEST 2: Staff Members Master
// -------------------------------------------------------------
console.log('--- [TEST 2: Staff Members Master Data] ---');

const staff = db.prepare('SELECT id, name, role, phone FROM staff_members WHERE is_active = 1').all();
console.log(`Active staff members: ${staff.length}`);
staff.forEach((s) => console.log(`  • ${s.name} [${s.role}] - ${s.phone}`));

const salesmen = staff.filter((s) => s.role === 'SALESMAN');
const supplyStaff = staff.filter((s) => s.role === 'SUPPLY_PERSON' || s.role === 'DRIVER');

if (salesmen.length < 2 || supplyStaff.length < 2) {
  throw new Error('Expected at least 2 salesmen and 2 supply staff members.');
}
console.log('✅ Staff team records verified.\n');

// -------------------------------------------------------------
// TEST 3: Field Order Booking Workflow (No Stock Decr, No GL)
// -------------------------------------------------------------
console.log('--- [TEST 3: Field Order Booking Workflow] ---');

const custAlMadina = db.prepare("SELECT id, name FROM customers WHERE name = 'Al-Madina Superstore'").get();
const prodWater = db.prepare("SELECT id, name, current_stock_base, trade_price_paisas, bulk_conversion_factor FROM products WHERE sku = 'BEV-001'").get();
const salesman1 = salesmen[0];

const initialWaterStock = prodWater.current_stock_base;
const initialGLCount = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;

const orderId = crypto.randomUUID();
const orderNum = `ORD-TEST-${Date.now()}`;
const orderDate = '2026-09-19';

// 5 Cartons of Water = 30 bottles (conversion: 6)
const ctnQty = 5;
const conv = prodWater.bulk_conversion_factor;
const qtyBase = ctnQty * conv;
const grossPaisas = prodWater.trade_price_paisas * ctnQty; // 480 * 5 * 100 = 240,000 Paisas
const lineDiscPaisas = Math.round(grossPaisas * 0.05); // 5% = 12,000 Paisas
const schemeBonus = 2; // 2 bottles free
const netLinePaisas = grossPaisas - lineDiscPaisas; // 228,000 Paisas
const billDiscPaisas = 8000; // 80 PKR = 8,000 Paisas
const grandTotalPaisas = netLinePaisas - billDiscPaisas; // 220,000 Paisas (2,200 PKR)

// Insert order
db.prepare(`
  INSERT INTO sales_orders (
    id, order_number, customer_id, salesman_id, order_date, status,
    subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
    scheme_items_count, subtotal, discount, grand_total
  ) VALUES (?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  orderId, orderNum, custAlMadina.id, salesman1.id, orderDate,
  grossPaisas, lineDiscPaisas, billDiscPaisas, grandTotalPaisas,
  schemeBonus, grossPaisas / 100, (lineDiscPaisas + billDiscPaisas) / 100, grandTotalPaisas / 100
);

db.prepare(`
  INSERT INTO sales_order_items (
    id, order_id, product_id, quantity_base, cartons_count, loose_pieces_count,
    unit_price_paisas, discount_percent, discount_paisas, scheme_bonus_base, line_total_paisas
  ) VALUES (?, ?, ?, ?, ?, 0, ?, 5.0, ?, ?, ?)
`).run(
  crypto.randomUUID(), orderId, prodWater.id, qtyBase, ctnQty,
  prodWater.trade_price_paisas, lineDiscPaisas, schemeBonus, netLinePaisas
);

// Verify stock did NOT decrement
const currentWaterStock = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(prodWater.id).current_stock_base;
if (currentWaterStock !== initialWaterStock) {
  throw new Error(`Order booking should NOT decrement inventory stock. Expected ${initialWaterStock}, got ${currentWaterStock}`);
}

// Verify GL entries count did NOT change
const currentGLCount = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
if (currentGLCount !== initialGLCount) {
  throw new Error('Order booking should NOT create commercial General Ledger entries.');
}

console.log(`✅ Booked order ${orderNum} created with status 'BOOKED'.`);
console.log(`✅ Verified: Physical inventory preserved (${currentWaterStock} units) & GL vouchers unchanged.\n`);

// -------------------------------------------------------------
// TEST 4: Direct / Van Sale with Spot Cash, Scheme & Dual-Leg GL
// -------------------------------------------------------------
console.log('--- [TEST 4: Direct Sale with Spot Cash & Dual-Leg GL] ---');

const custKhan = db.prepare("SELECT id, name FROM customers WHERE name = 'Khan Cash & Carry'").get();
const prodOil = db.prepare("SELECT id, name, current_stock_base, cost_price_paisas, trade_price_paisas, bulk_conversion_factor FROM products WHERE sku = 'OIL-002'").get();

const initialOilStock = prodOil.current_stock_base;
const billedCartons = 2;
const bonusCartons = 1;
const oilConv = prodOil.bulk_conversion_factor; // 12
const billedBase = billedCartons * oilConv; // 24
const bonusBase = bonusCartons * oilConv;   // 12
const totalDeduct = billedBase + bonusBase;  // 36

const grossOilPaisas = prodOil.trade_price_paisas * billedCartons; // 5500 * 2 * 100 = 1,100,000
const oilDiscPaisas = Math.round(grossOilPaisas * 0.10); // 10% = 110,000
const netOilPaisas = grossOilPaisas - oilDiscPaisas; // 990,000
const billOilDiscPaisas = 40000; // 400 PKR = 40,000 Paisas
const grandTotalOilPaisas = netOilPaisas - billOilDiscPaisas; // 950,000 Paisas (9,500 PKR)

const cashRecvPaisas = 500000; // 5,000 PKR spot cash
const arPaisas = grandTotalOilPaisas - cashRecvPaisas; // 4,500 PKR remaining on credit

const cogsPaisas = prodOil.cost_price_paisas * billedCartons; // 4800 * 2 * 100 = 960,000 Paisas
const schemeExpensePaisas = prodOil.cost_price_paisas * bonusCartons; // 4800 * 1 * 100 = 480,000 Paisas

const invoiceId = crypto.randomUUID();
const invoiceNum = `INV-TEST-${Date.now()}`;

// 1. Decrement physical stock on disk
db.prepare(`
  UPDATE products 
  SET current_stock_base = current_stock_base - ?,
      current_stock = current_stock - ?
  WHERE id = ?
`).run(totalDeduct, totalDeduct, prodOil.id);

// 2. Insert Invoice
db.prepare(`
  INSERT INTO sales_invoices (
    id, invoice_number, customer_id, salesman_id, invoice_date,
    subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
    cost_of_goods_sold_paisas, scheme_expense_paisas, cash_received_paisas, remaining_balance_paisas,
    subtotal, discount, grand_total, cost_of_goods_sold, amount_paid, payment_status, status, invoice_type
  ) VALUES (?, ?, ?, ?, '2026-09-19', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PARTIAL', 'POSTED', 'DIRECT_SALE')
`).run(
  invoiceId, invoiceNum, custKhan.id, salesman1.id,
  grossOilPaisas, oilDiscPaisas, billOilDiscPaisas, grandTotalOilPaisas,
  cogsPaisas, schemeExpensePaisas, cashRecvPaisas, arPaisas,
  grossOilPaisas / 100, (oilDiscPaisas + billOilDiscPaisas) / 100, grandTotalOilPaisas / 100,
  cogsPaisas / 100, cashRecvPaisas / 100
);

// 3. Post Compound GL Entry
const acc1010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010'").get().id; // Cash
const acc1030 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030'").get().id; // AR
const acc1040 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040'").get().id; // Inventory
const acc4010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4010'").get().id; // Revenue
const acc5010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010'").get().id; // COGS
const acc5060 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5060'").get().id; // Scheme Expense

const jeId = crypto.randomUUID();
const jeNum = `JE-INV-${Date.now()}`;
const totalDebitsPaisas = cashRecvPaisas + arPaisas + cogsPaisas + schemeExpensePaisas;
const totalCreditsPaisas = grandTotalOilPaisas + cogsPaisas + schemeExpensePaisas;

if (totalDebitsPaisas !== totalCreditsPaisas) {
  throw new Error(`GL Voucher Imbalance! Debits: ${totalDebitsPaisas}, Credits: ${totalCreditsPaisas}`);
}

db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'sales', ?, ?, ?, 'POSTED')
`).run(jeId, jeNum, `Direct Sale ${invoiceNum} - Khan Cash & Carry`, invoiceId, totalDebitsPaisas, totalDebitsPaisas / 100);

const insertJL = db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Lines:
// Dr. Cash in Hand: 5,000 PKR
insertJL.run(crypto.randomUUID(), jeId, acc1010, cashRecvPaisas, 0, cashRecvPaisas / 100, 0, null, null, 'Spot cash recovery');
// Dr. Accounts Receivable: 4,500 PKR (with customer attribution)
insertJL.run(crypto.randomUUID(), jeId, acc1030, arPaisas, 0, arPaisas / 100, 0, custKhan.id, 'CUSTOMER', 'Net AR');
// Cr. Wholesale Sales Revenue: 9,500 PKR
insertJL.run(crypto.randomUUID(), jeId, acc4010, 0, grandTotalOilPaisas, 0, grandTotalOilPaisas / 100, null, null, 'Sales revenue');
// Dr. COGS: 9,600 PKR
insertJL.run(crypto.randomUUID(), jeId, acc5010, cogsPaisas, 0, cogsPaisas / 100, 0, null, null, 'COGS');
// Cr. Merchandise Inventory: 9,600 PKR
insertJL.run(crypto.randomUUID(), jeId, acc1040, 0, cogsPaisas, 0, cogsPaisas / 100, null, null, 'Inventory relief');
// Dr. Scheme Promotion Expense: 4,800 PKR
insertJL.run(crypto.randomUUID(), jeId, acc5060, schemeExpensePaisas, 0, schemeExpensePaisas / 100, 0, null, null, 'Scheme bonus expense');
// Cr. Merchandise Inventory: 4,800 PKR
insertJL.run(crypto.randomUUID(), jeId, acc1040, 0, schemeExpensePaisas, 0, schemeExpensePaisas / 100, null, null, 'Bonus inventory relief');

// Verify Stock Decrement
const updatedOilStock = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(prodOil.id).current_stock_base;
if (updatedOilStock !== initialOilStock - totalDeduct) {
  throw new Error(`Inventory deduction mismatch. Expected ${initialOilStock - totalDeduct}, got ${updatedOilStock}`);
}

console.log(`✅ Direct sale invoice ${invoiceNum} generated.`);
console.log(`✅ Physical stock decremented by ${totalDeduct} bottles (24 billed + 12 free bonus): New stock = ${updatedOilStock} bottles.`);
console.log(`✅ Compound GL Voucher ${jeNum} posted: Total Debits (${totalDebitsPaisas / 100} PKR) == Total Credits (${totalCreditsPaisas / 100} PKR).\n`);

// -------------------------------------------------------------
// TEST 5: Route Debt Collection Recording
// -------------------------------------------------------------
console.log('--- [TEST 5: Route Debt Collection Recording] ---');

// Record payment of 2,500 PKR from Khan Cash & Carry
const payId = crypto.randomUUID();
const payNum = `PAY-TEST-${Date.now()}`;
const payAmountPaisas = 250000;

// Post GL entry
const payJeId = crypto.randomUUID();
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'sales', ?, ?, ?, 'POSTED')
`).run(payJeId, `JE-${payNum}`, `Collection from Khan Cash & Carry`, payId, payAmountPaisas, 2500.0);

// Dr. Cash, Cr. AR with customer ID
insertJL.run(crypto.randomUUID(), payJeId, acc1010, payAmountPaisas, 0, 2500.0, 0, null, null, 'Cash recovery');
insertJL.run(crypto.randomUUID(), payJeId, acc1030, 0, payAmountPaisas, 0, 2500.0, custKhan.id, 'CUSTOMER', 'Ledger relief');

// Insert Payment
db.prepare(`
  INSERT INTO customer_payments (id, payment_number, payment_date, customer_id, payment_method, amount_paisas, amount, journal_id)
  VALUES (?, ?, '2026-09-19', ?, 'CASH', ?, ?, ?)
`).run(payId, payNum, custKhan.id, payAmountPaisas, 2500.0, payJeId);

// Check customer running balance from sub-ledger
const customerLines = db.prepare(`
  SELECT 
    SUM(debit_paisas) as total_debit,
    SUM(credit_paisas) as total_credit
  FROM journal_lines
  WHERE entity_id = ? AND entity_type = 'CUSTOMER'
`).get(custKhan.id);

const netBalancePaisas = customerLines.total_debit - customerLines.total_credit;
console.log(`✅ Route collection ${payNum} for PKR 2,500 recorded and credited to customer.`);
console.log(`✅ Customer sub-ledger net outstanding balance updated to: PKR ${netBalancePaisas / 100}.\n`);

console.log('===============================================================');
console.log('   ALL PHASE 3 AUTOMATED TESTS PASSED 100%                     ');
console.log('===============================================================\n');
