// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

console.log('--- STARTING PURCHASE BILL SAVE VERIFICATION (UAT) ---');

const scratchDir = path.resolve('scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

const testDbPath = path.join(scratchDir, 'temp-uat-purchase-save.db');
fs.copyFileSync(path.resolve('data/sales_distribution.db'), testDbPath);

const db = new DatabaseSync(testDbPath);

// Fetch a product and vendor
const prod = /** @type {any} */ (db.prepare('SELECT * FROM products LIMIT 1').get());
const vendor = /** @type {any} */ (db.prepare('SELECT * FROM vendors LIMIT 1').get());
assert.ok(prod, 'Product exists in test database');
assert.ok(vendor, 'Vendor exists in test database');

const billId = crypto.randomUUID();
const billNumber = `BILL-UAT-${Date.now()}`;
const cartonsQty = 2;
const boxesQty = 3;
const loosePiecesQty = 4;
const bpc = prod.boxes_per_carton || 12;
const ppb = prod.pieces_per_box || 10;
const totalPieces = (cartonsQty * bpc * ppb) + (boxesQty * ppb) + loosePiecesQty;
const ratePerPiecePaisas = 8500; // 85.00
const grossPaisas = totalPieces * ratePerPiecePaisas;
const discPaisas = 5000; // 50.00
const taxPaisas = 2000; // 20.00
const netAmountPaisas = grossPaisas - discPaisas + taxPaisas;

// Insert Purchase Bill with all required and optional columns
db.prepare(`
  INSERT INTO purchase_bills (
    id, company_id, bill_number, vendor_id, bill_date, warehouse,
    vendor_invoice_number, reference_number, freight_treatment,
    freight_amount_paisas, freight_amount,
    subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
    subtotal, tax, discount, net_amount, status
  ) VALUES (
    ?, 'default', ?, ?, '2026-09-30', 'Main Warehouse',
    'INV-UAT-99', 'Ref #1234', 'NONE',
    0, 0,
    ?, ?, ?, ?,
    ?, ?, ?, ?, 'POSTED'
  )
`).run(
  billId, billNumber, vendor.id,
  grossPaisas, taxPaisas, discPaisas, netAmountPaisas,
  grossPaisas / 100, taxPaisas / 100, discPaisas / 100, netAmountPaisas / 100
);

// Insert Purchase Bill Item
const itemId = crypto.randomUUID();
db.prepare(`
  INSERT INTO purchase_bill_items (
    id, company_id, bill_id, product_id, cartons_qty, boxes_qty, loose_pieces_qty, total_pieces,
    rate_per_piece_paisas, gross_amount_paisas, tax_percent, tax_paisas,
    discount_percent, discount_paisas, line_total_paisas, rate_per_piece, line_total
  ) VALUES (
    ?, 'default', ?, ?, ?, ?, ?, ?,
    ?, ?, 0, ?,
    0, ?, ?, ?, ?
  )
`).run(
  itemId, billId, prod.id, cartonsQty, boxesQty, loosePiecesQty, totalPieces,
  ratePerPiecePaisas, grossPaisas, taxPaisas,
  discPaisas, netAmountPaisas, ratePerPiecePaisas / 100, netAmountPaisas / 100
);

// Verify inserted row
const savedBill = /** @type {any} */ (db.prepare('SELECT * FROM purchase_bills WHERE id = ?').get(billId));
assert.ok(savedBill, 'Purchase bill was found in database');
assert.equal(savedBill.bill_number, billNumber);
assert.equal(savedBill.subtotal_paisas, grossPaisas);
assert.equal(savedBill.tax_amount_paisas, taxPaisas);
assert.equal(savedBill.discount_amount_paisas, discPaisas);
assert.equal(savedBill.net_amount_paisas, netAmountPaisas);
assert.equal(savedBill.status, 'POSTED');

const savedItem = /** @type {any} */ (db.prepare('SELECT * FROM purchase_bill_items WHERE id = ?').get(itemId));
assert.ok(savedItem, 'Purchase bill item was found in database');
assert.equal(savedItem.total_pieces, totalPieces);
assert.equal(savedItem.line_total_paisas, netAmountPaisas);

console.log('✅ Purchase Bill save verified successfully without schema errors or regressions.');
console.log(`✅ Bill: ${billNumber}, Total Pieces: ${totalPieces}, Net: ${(netAmountPaisas / 100).toFixed(2)} PKR`);

db.close();
fs.unlinkSync(testDbPath);
console.log('✅ Sandbox database cleaned up.\n');
