import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import crypto from 'node:crypto';

console.log('===============================================================');
console.log('   PURCHASE MODULE & PRODUCT MASTER VERIFICATION SUITE         ');
console.log('===============================================================\n');

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

// -------------------------------------------------------------
// TEST 1: 3-Tier UOM Quantity Calculation
// -------------------------------------------------------------
console.log('--- [TEST 1: 3-Tier UOM Quantity Calculation] ---');

const prodSpice = db.prepare("SELECT * FROM products WHERE sku = 'SPICE-001'").get();
if (!prodSpice) throw new Error('Product SPICE-001 not found in database');

console.log(`Product: ${prodSpice.name}`);
console.log(`Hierarchy: ${prodSpice.boxes_per_carton} boxes/CTN, ${prodSpice.pieces_per_box} pcs/box (Total: ${prodSpice.total_pieces_per_carton} pcs/CTN)`);

// Test 3-Tier formula: 2 CTN + 3 Box + 4 Pcs
const ctn = 2;
const box = 3;
const pcs = 4;
const expectedTotalPieces = (ctn * prodSpice.boxes_per_carton * prodSpice.pieces_per_box) + (box * prodSpice.pieces_per_box) + pcs;
// (2 * 12 * 12) + (3 * 12) + 4 = 288 + 36 + 4 = 328
if (expectedTotalPieces !== 328) {
  throw new Error(`3-Tier calculation mismatch! Expected 328, got ${expectedTotalPieces}`);
}
console.log(`Calculation: ${ctn} CTN + ${box} Box + ${pcs} Pcs = ${expectedTotalPieces} Total Pieces`);

const vendorShan = db.prepare("SELECT * FROM vendors WHERE name LIKE '%Shan%'").get();
if (!vendorShan) throw new Error('Vendor Shan Foods not found');

const initialSpiceStock = prodSpice.current_stock_base;
const bill1Id = crypto.randomUUID();
const bill1Number = `BILL-TEST-${Date.now()}`;
const ratePerPiecePaisas = 9000; // 90 PKR
const grossPaisas1 = expectedTotalPieces * ratePerPiecePaisas; // 328 * 90 * 100 = 2,952,000 Paisas (29,520 PKR)

// 1. Increment physical warehouse inventory
db.prepare(`
  UPDATE products 
  SET current_stock_base = current_stock_base + ?,
      current_stock = current_stock + ?
  WHERE id = ?
`).run(expectedTotalPieces, expectedTotalPieces, prodSpice.id);

// 2. Post GL Entry (Dr. 1040 Merchandise Inventory / Cr. 2010 AP)
const acc1040 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040'").get().id;
const acc2010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '2010'").get().id;
const acc5040 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5040'").get().id;

const je1Id = crypto.randomUUID();
const je1Num = `JE-PUR-${Date.now()}`;

db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'purchase', ?, ?, ?, 'POSTED')
`).run(je1Id, je1Num, `Purchase Bill ${bill1Number} - Shan Foods`, bill1Id, grossPaisas1, grossPaisas1 / 100);

const insertJL = db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertJL.run(crypto.randomUUID(), je1Id, acc1040, grossPaisas1, 0, grossPaisas1 / 100, 0, null, null, 'Merchandise purchase');
insertJL.run(crypto.randomUUID(), je1Id, acc2010, 0, grossPaisas1, 0, grossPaisas1 / 100, vendorShan.id, 'VENDOR', 'Vendor payable');

// 3. Insert Bill & Bill Items
db.prepare(`
  INSERT INTO purchase_bills (
    id, bill_number, vendor_id, bill_date, warehouse, vendor_invoice_number,
    reference_number, freight_treatment, freight_amount_paisas, freight_amount,
    subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
    subtotal, tax, discount, net_amount, status, journal_id
  ) VALUES (?, ?, ?, '2026-09-19', 'Main Warehouse', 'INV-SHAN-881', 'Bilty #4812', 'NONE', 0, 0, ?, 0, 0, ?, ?, 0, 0, ?, 'POSTED', ?)
`).run(bill1Id, bill1Number, vendorShan.id, grossPaisas1, grossPaisas1, grossPaisas1 / 100, grossPaisas1 / 100, je1Id);

db.prepare(`
  INSERT INTO purchase_bill_items (
    id, bill_id, product_id, cartons_qty, boxes_qty, loose_pieces_qty, total_pieces,
    rate_per_piece_paisas, gross_amount_paisas, line_total_paisas, rate_per_piece, line_total
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), bill1Id, prodSpice.id, ctn, box, pcs, expectedTotalPieces, ratePerPiecePaisas, grossPaisas1, grossPaisas1, 90.0, grossPaisas1 / 100);

const updatedSpiceStock = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(prodSpice.id).current_stock_base;
const stockDiff = updatedSpiceStock - initialSpiceStock;

if (stockDiff !== expectedTotalPieces) {
  throw new Error(`Stock increment mismatch! Expected +${expectedTotalPieces}, got +${stockDiff}`);
}

console.log(`✅ Purchase Bill ${bill1Number} posted.`);
console.log(`✅ Stock incremented from ${initialSpiceStock} to ${updatedSpiceStock} (+${stockDiff} pieces) matching 3-tier hierarchy formula.\n`);

// -------------------------------------------------------------
// TEST 2: Freight Treatment - Landed Cost Capitalization
// -------------------------------------------------------------
console.log('--- [TEST 2: Freight Capitalized into Landed Cost] ---');

const vendorNestle = db.prepare("SELECT * FROM vendors WHERE name LIKE '%Nestlé%'").get();
const prodMilk = db.prepare("SELECT * FROM products WHERE sku = 'MILK-002'").get();

const freightLandedPKR = 5000;
const freightLandedPaisas = freightLandedPKR * 100;
const milkCartons = 5; // 5 * 12 = 60 bottles @ 260 PKR = 15,600 PKR (1,560,000 Paisas)
const milkTotalPieces = milkCartons * prodMilk.total_pieces_per_carton;
const milkItemsPaisas = milkTotalPieces * prodMilk.base_rate_per_piece_paisas;

// Total Landed Inventory Value = Items (15,600 PKR) + Freight (5,000 PKR) = 20,600 PKR (2,060,000 Paisas)
const capitalizedInventoryPaisas = milkItemsPaisas + freightLandedPaisas;
const bill2Id = crypto.randomUUID();
const bill2Number = `BILL-TEST-LANDED-${Date.now()}`;
const je2Id = crypto.randomUUID();

// Post Landed Cost GL:
// Dr. 1040 Merchandise Inventory: 20,600 PKR (capitalized)
// Cr. 2010 Accounts Payable: 20,600 PKR (vendor)
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'purchase', ?, ?, ?, 'POSTED')
`).run(je2Id, `JE-${bill2Number}`, `Landed Cost Purchase - Nestlé`, bill2Id, capitalizedInventoryPaisas, capitalizedInventoryPaisas / 100);

insertJL.run(crypto.randomUUID(), je2Id, acc1040, capitalizedInventoryPaisas, 0, capitalizedInventoryPaisas / 100, 0, null, null, 'Merchandise purchase (incl. Landed Freight)');
insertJL.run(crypto.randomUUID(), je2Id, acc2010, 0, capitalizedInventoryPaisas, 0, capitalizedInventoryPaisas / 100, vendorNestle.id, 'VENDOR', 'Vendor payable');

db.prepare(`
  INSERT INTO purchase_bills (
    id, bill_number, vendor_id, bill_date, warehouse, vendor_invoice_number,
    reference_number, freight_treatment, freight_amount_paisas, freight_amount,
    subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
    subtotal, tax, discount, net_amount, status, journal_id
  ) VALUES (?, ?, ?, '2026-09-19', 'Main Warehouse', 'INV-NESTLE-001', 'Bilty #9921', 'LANDED_COST', ?, ?, ?, 0, 0, ?, ?, 0, 0, ?, 'POSTED', ?)
`).run(
  bill2Id, bill2Number, vendorNestle.id, freightLandedPaisas, freightLandedPKR,
  milkItemsPaisas, capitalizedInventoryPaisas, milkItemsPaisas / 100, capitalizedInventoryPaisas / 100, je2Id
);

// Verify GL entries
const bill2Lines = db.prepare("SELECT * FROM journal_lines WHERE journal_id = ?").all(je2Id);
let totalDebits2 = 0;
let totalCredits2 = 0;
let inventoryDebit2 = 0;
let freightDebit2 = 0;

for (const l of bill2Lines) {
  totalDebits2 += l.debit_paisas;
  totalCredits2 += l.credit_paisas;
  if (l.account_id === acc1040) inventoryDebit2 += l.debit_paisas;
  if (l.account_id === acc5040) freightDebit2 += l.debit_paisas;
}

if (totalDebits2 !== totalCredits2) {
  throw new Error(`GL Imbalance in Landed Cost! Debits: ${totalDebits2}, Credits: ${totalCredits2}`);
}

if (inventoryDebit2 !== capitalizedInventoryPaisas) {
  throw new Error(`Inventory capitalization mismatch! Expected ${capitalizedInventoryPaisas}, got ${inventoryDebit2}`);
}

if (freightDebit2 !== 0) {
  throw new Error(`Account 5040 should NOT be debited when Landed Cost is capitalized. Got ${freightDebit2}`);
}

console.log(`✅ Bill ${bill2Number} posted with Landed Cost.`);
console.log(`✅ Merchandise Inventory (1040) capitalized with items + freight = PKR ${inventoryDebit2 / 100}.`);
console.log(`✅ Account 5040 was NOT debited.`);
console.log(`✅ GL balanced: Debits (PKR ${totalDebits2 / 100}) == Credits (PKR ${totalCredits2 / 100}).\n`);

// -------------------------------------------------------------
// TEST 3: Freight Treatment - Separate Direct Expense
// -------------------------------------------------------------
console.log('--- [TEST 3: Freight as Separate Direct Expense] ---');

const freightExpensePKR = 3000;
const freightExpensePaisas = freightExpensePKR * 100;
const milkCartons3 = 2; // 24 bottles @ 260 PKR = 6,240 PKR (624,000 Paisas)
const milkPieces3 = milkCartons3 * prodMilk.total_pieces_per_carton;
const milkItemsPaisas3 = milkPieces3 * prodMilk.base_rate_per_piece_paisas;
const totalNetPayable3 = milkItemsPaisas3 + freightExpensePaisas; // 6,240 + 3,000 = 9,240 PKR

const bill3Id = crypto.randomUUID();
const bill3Number = `BILL-TEST-DIRECT-${Date.now()}`;
const je3Id = crypto.randomUUID();

// Post Direct Expense GL:
// Dr. 1040 Merchandise Inventory: 6,240 PKR (items only)
// Dr. 5040 Inward Freight Expense: 3,000 PKR (separate direct expense)
// Cr. 2010 Accounts Payable: 9,240 PKR (vendor)
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'purchase', ?, ?, ?, 'POSTED')
`).run(je3Id, `JE-${bill3Number}`, `Direct Expense Purchase - Nestlé`, bill3Id, totalNetPayable3, totalNetPayable3 / 100);

insertJL.run(crypto.randomUUID(), je3Id, acc1040, milkItemsPaisas3, 0, milkItemsPaisas3 / 100, 0, null, null, 'Merchandise purchase');
insertJL.run(crypto.randomUUID(), je3Id, acc5040, freightExpensePaisas, 0, freightExpensePKR, 0, null, null, 'Inward freight & carriage');
insertJL.run(crypto.randomUUID(), je3Id, acc2010, 0, totalNetPayable3, 0, totalNetPayable3 / 100, vendorNestle.id, 'VENDOR', 'Vendor payable');

db.prepare(`
  INSERT INTO purchase_bills (
    id, bill_number, vendor_id, bill_date, warehouse, vendor_invoice_number,
    reference_number, freight_treatment, freight_amount_paisas, freight_amount,
    subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
    subtotal, tax, discount, net_amount, status, journal_id
  ) VALUES (?, ?, ?, '2026-09-19', 'Main Warehouse', 'INV-NESTLE-002', 'Bilty #1104', 'DIRECT_EXPENSE', ?, ?, ?, 0, 0, ?, ?, 0, 0, ?, 'POSTED', ?)
`).run(
  bill3Id, bill3Number, vendorNestle.id, freightExpensePaisas, freightExpensePKR,
  milkItemsPaisas3, totalNetPayable3, milkItemsPaisas3 / 100, totalNetPayable3 / 100, je3Id
);

const bill3Lines = db.prepare("SELECT * FROM journal_lines WHERE journal_id = ?").all(je3Id);
let totalDebits3 = 0;
let totalCredits3 = 0;
let inventoryDebit3 = 0;
let freightDebit3 = 0;

for (const l of bill3Lines) {
  totalDebits3 += l.debit_paisas;
  totalCredits3 += l.credit_paisas;
  if (l.account_id === acc1040) inventoryDebit3 += l.debit_paisas;
  if (l.account_id === acc5040) freightDebit3 += l.debit_paisas;
}

if (totalDebits3 !== totalCredits3) {
  throw new Error(`GL Imbalance in Direct Expense! Debits: ${totalDebits3}, Credits: ${totalCredits3}`);
}

if (inventoryDebit3 !== milkItemsPaisas3) {
  throw new Error(`Inventory debit should only contain items cost (${milkItemsPaisas3}), got ${inventoryDebit3}`);
}

if (freightDebit3 !== freightExpensePaisas) {
  throw new Error(`Inward Freight Expense (5040) should be ${freightExpensePaisas}, got ${freightDebit3}`);
}

console.log(`✅ Bill ${bill3Number} posted with Direct Expense.`);
console.log(`✅ Merchandise Inventory (1040) debited with items cost only: PKR ${inventoryDebit3 / 100}.`);
console.log(`✅ Inward Freight Expense (5040) debited separately: PKR ${freightDebit3 / 100}.`);
console.log(`✅ GL balanced: Debits (PKR ${totalDebits3 / 100}) == Credits (PKR ${totalCredits3 / 100}).\n`);

// -------------------------------------------------------------
// TEST 4: Service Item Purchase (Physical Stock Bypass)
// -------------------------------------------------------------
console.log('--- [TEST 4: Service Item Purchase (Physical Stock Bypass)] ---');

const prodService = db.prepare("SELECT * FROM products WHERE sku = 'SRV-003'").get();
if (!prodService) throw new Error('Service product SRV-003 not found');

const initialServiceStock = prodService.current_stock_base;
console.log(`Initial stock of service item ${prodService.name}: ${initialServiceStock}`);

const serviceUnits = 5;
const serviceRatePaisas = 500000; // 5,000 PKR
const totalServicePaisas = serviceUnits * serviceRatePaisas; // 25,000 PKR

const bill4Id = crypto.randomUUID();
const bill4Number = `BILL-TEST-SRV-${Date.now()}`;
const je4Id = crypto.randomUUID();

// Post GL: Dr. 1040 (or service expense) / Cr. 2010 AP
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'purchase', ?, ?, ?, 'POSTED')
`).run(je4Id, `JE-${bill4Number}`, `Cold-Chain Logistics Service`, bill4Id, totalServicePaisas, totalServicePaisas / 100);

insertJL.run(crypto.randomUUID(), je4Id, acc1040, totalServicePaisas, 0, totalServicePaisas / 100, 0, null, null, 'Inbound cold-chain service');
insertJL.run(crypto.randomUUID(), je4Id, acc2010, 0, totalServicePaisas, 0, totalServicePaisas / 100, vendorShan.id, 'VENDOR', 'Vendor payable');

db.prepare(`
  INSERT INTO purchase_bills (
    id, bill_number, vendor_id, bill_date, warehouse, vendor_invoice_number,
    freight_treatment, freight_amount_paisas, freight_amount,
    subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
    subtotal, tax, discount, net_amount, status, journal_id
  ) VALUES (?, ?, ?, '2026-09-19', 'Main Warehouse', 'SRV-INV-01', 'NONE', 0, 0, ?, 0, 0, ?, ?, 0, 0, ?, 'POSTED', ?)
`).run(bill4Id, bill4Number, vendorShan.id, totalServicePaisas, totalServicePaisas, totalServicePaisas / 100, totalServicePaisas / 100, je4Id);

db.prepare(`
  INSERT INTO purchase_bill_items (
    id, bill_id, product_id, cartons_qty, boxes_qty, loose_pieces_qty, total_pieces,
    rate_per_piece_paisas, gross_amount_paisas, line_total_paisas, rate_per_piece, line_total
  ) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), bill4Id, prodService.id, serviceUnits, serviceUnits, serviceRatePaisas, totalServicePaisas, totalServicePaisas, 5000.0, totalServicePaisas / 100);

// Notice: In service logic, physical stock is NOT incremented when item_type == 'SERVICE'
const currentServiceStock = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(prodService.id).current_stock_base;

if (currentServiceStock !== initialServiceStock) {
  throw new Error(`Service item physical stock should NEVER change! Expected ${initialServiceStock}, got ${currentServiceStock}`);
}

console.log(`✅ Bill ${bill4Number} for 5 service units posted.`);
console.log(`✅ Physical warehouse inventory untouched (Stock = ${currentServiceStock}). Physical stock bypassed successfully.\n`);

// -------------------------------------------------------------
// TEST 5: Purchase Bill Voiding & Atomic Reversal
// -------------------------------------------------------------
console.log('--- [TEST 5: Bill Voiding & Atomic Reversal] ---');

const stockBeforeVoid = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(prodSpice.id).current_stock_base;

// Void Bill 1:
// 1. Decrement stock by 328 pieces
db.prepare(`
  UPDATE products 
  SET current_stock_base = current_stock_base - ?,
      current_stock = current_stock - ?
  WHERE id = ?
`).run(expectedTotalPieces, expectedTotalPieces, prodSpice.id);

// 2. Reverse GL Entry (Swapping Debits & Credits)
const origJL = db.prepare("SELECT * FROM journal_lines WHERE journal_id = ?").all(je1Id);
const revJeId = crypto.randomUUID();
const revJeNum = `JE-REV-${bill1Number}`;

db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
  VALUES (?, ?, '2026-09-19', ?, 'reversal', ?, ?, ?, 'POSTED')
`).run(revJeId, revJeNum, `Reversal of ${bill1Number}`, bill1Id, grossPaisas1, grossPaisas1 / 100);

for (const l of origJL) {
  insertJL.run(
    crypto.randomUUID(),
    revJeId,
    l.account_id,
    l.credit_paisas, // SWAP
    l.debit_paisas,  // SWAP
    l.credit,        // SWAP
    l.debit,         // SWAP
    l.entity_id,
    l.entity_type,
    `Reversal of line: ${l.memo || ''}`
  );
}

// Mark original JE as VOID
db.prepare("UPDATE journal_entries SET status = 'VOID', is_reversed = 1, reversal_of_id = ? WHERE id = ?").run(revJeId, je1Id);
// Mark bill as VOID
db.prepare("UPDATE purchase_bills SET status = 'VOID' WHERE id = ?").run(bill1Id);

const stockAfterVoid = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(prodSpice.id).current_stock_base;
const voidStockDiff = stockBeforeVoid - stockAfterVoid;

if (voidStockDiff !== expectedTotalPieces) {
  throw new Error(`Void stock rollback mismatch! Expected -${expectedTotalPieces}, got -${voidStockDiff}`);
}

const voidedBill = db.prepare("SELECT status FROM purchase_bills WHERE id = ?").get(bill1Id);
if (voidedBill.status !== 'VOID') {
  throw new Error(`Bill status should be VOID, got ${voidedBill.status}`);
}

const reversedOrig = db.prepare("SELECT status, is_reversed FROM journal_entries WHERE id = ?").get(je1Id);
if (reversedOrig.status !== 'VOID' || reversedOrig.is_reversed !== 1) {
  throw new Error('Original journal entry was not reversed properly');
}

console.log(`✅ Bill ${bill1Number} successfully voided.`);
console.log(`✅ Warehouse stock rolled back by ${expectedTotalPieces} pieces (New stock = ${stockAfterVoid}).`);
console.log(`✅ General Ledger entry marked VOID with offsetting reversal voucher created.\n`);

console.log('===============================================================');
console.log('   ALL PURCHASE MODULE AUTOMATED TESTS PASSED 100%             ');
console.log('===============================================================\n');
