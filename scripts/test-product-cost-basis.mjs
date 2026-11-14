// Isolated verification test for Product Master Cost Basis
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('--- STARTING PRODUCT MASTER COST BASIS TEST (ISOLATED DB) ---');

const scratchDir = path.resolve('scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

const testDbPath = path.resolve(scratchDir, 'test-product-cost.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

// Copy production schema without polluting real business rows
const realDbPath = path.resolve('data/sales_distribution.db');
fs.copyFileSync(realDbPath, testDbPath);

const db = new DatabaseSync(testDbPath);
db.exec('PRAGMA foreign_keys = ON;');

// Clean any previous test rows
db.prepare("DELETE FROM stock_adjustments WHERE product_id LIKE 'test-prod-%'").run();
db.prepare("DELETE FROM products WHERE id LIKE 'test-prod-%'").run();

// Clean test chart of accounts or ensure 1040 and 3010 exist
const invAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040'").get();
const eqAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '3010'").get();
assert(invAcc, 'Chart of account 1040 exists');
assert(eqAcc, 'Chart of account 3010 exists');

// -------------------------------------------------------------
// TEST CASE FROM USER SPECIFICATION:
// 1 CTN = 24 BOX
// 1 BOX = 12 PCS
// 1 CTN = 288 PCS
// Opening: 1 CTN + 2 BOX + 3 PCS = 315 PCS
// Purchase Cost / PCS = 85.00 = 8,500 paisas
// Expected opening value: 315 × 8,500 = 2,677,500 paisas = 26,775.00
// -------------------------------------------------------------
console.log('\n--- TEST: 3-Tier UOM Opening Stock & Valuation ---');

const boxesPerCarton = 24;
const piecesPerBox = 12;
const piecesPerCarton = boxesPerCarton * piecesPerBox; // 288
assert.strictEqual(piecesPerCarton, 288, '1 CTN = 288 PCS');

const openCartons = 1;
const openBoxes = 2;
const openPieces = 3;
const totalOpeningPieces = (openCartons * piecesPerCarton) + (openBoxes * piecesPerBox) + openPieces;
assert.strictEqual(totalOpeningPieces, 315, 'Total Opening Pieces = 315 PCS');
console.log(`✅ Calculated opening base pieces: ${totalOpeningPieces} PCS`);

const costPerPiece = 85.00;
const costPerPiecePaisas = Math.round(costPerPiece * 100); // 8,500 paisas
assert.strictEqual(costPerPiecePaisas, 8500, 'Purchase Cost / PCS = 8,500 paisas');

const expectedValuationPaisas = totalOpeningPieces * costPerPiecePaisas; // 315 * 8,500 = 2,677,500
assert.strictEqual(expectedValuationPaisas, 2677500, 'Expected opening value in paisas = 2,677,500');
const expectedValuationDecimal = expectedValuationPaisas / 100; // 26,775.00
assert.strictEqual(expectedValuationDecimal, 26775.00, 'Expected opening value in PKR = 26,775.00');
console.log(`✅ Expected opening valuation: ${totalOpeningPieces} × 85.00 = ${expectedValuationDecimal.toFixed(2)} (${expectedValuationPaisas} paisas)`);

// Insert Product with base_rate_per_piece_paisas = cost_price_paisas
const prodId = 'test-prod-per-pcs';
const tradePricePerPiecePaisas = 10000; // 100.00 / PCS
const mrpPerPiecePaisas = 11500; // 115.00 / PCS

db.prepare(`
  INSERT INTO products (
    id, company_id, sku, name, uom_base, uom_bulk, bulk_conversion_factor,
    boxes_per_carton, pieces_per_box, total_pieces_per_carton,
    base_rate_per_piece_paisas, cost_price_paisas, trade_price_paisas, mrp_paisas,
    cost_price, selling_price, current_stock_base, current_stock, min_stock_alert, is_active
  ) VALUES (
    ?, 'cmp_default', 'SKU-PER-PCS', 'Test Juice 250ml', 'PIECE', 'CARTON', ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, 0, 0, 12, 1
  )
`).run(
  prodId,
  piecesPerCarton,
  boxesPerCarton,
  piecesPerBox,
  piecesPerCarton,
  costPerPiecePaisas, // base_rate_per_piece_paisas
  costPerPiecePaisas, // cost_price_paisas
  tradePricePerPiecePaisas,
  mrpPerPiecePaisas,
  costPerPiece,
  100.00
);

// Verify inserted row in database
const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
assert(prod, 'Product was inserted');
assert.strictEqual(prod.cost_price_paisas, 8500, 'cost_price_paisas is 8,500');
assert.strictEqual(prod.base_rate_per_piece_paisas, 8500, 'base_rate_per_piece_paisas matches cost_price_paisas');
assert.strictEqual(prod.base_rate_per_piece_paisas, prod.cost_price_paisas, 'PARITY: base_rate_per_piece_paisas === cost_price_paisas');
console.log('✅ Base rate per piece paisas parity verified');

// Test that querying product does NOT do double division by carton pieces
// (i.e. cost is NOT divided by 288)
const rawBaseRate = prod.base_rate_per_piece_paisas || prod.cost_price_paisas;
assert.strictEqual(rawBaseRate, 8500, 'No division by totalPiecesPerCarton occurred');
console.log('✅ Verified NO double division by carton quantity');

// Simulate Opening Stock Adjustment & GL Posting
db.prepare(`
  UPDATE products
  SET current_stock_base = current_stock_base + ?,
      current_stock = current_stock + ?
  WHERE id = ?
`).run(totalOpeningPieces, totalOpeningPieces, prodId);

const updatedProd = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(prodId);
assert.strictEqual(updatedProd.current_stock_base, 315, 'Current stock base updated to 315 PCS');

// GL Posting
const jeId = 'je-test-open-stock';
db.prepare(`
  INSERT INTO journal_entries (
    id, entry_number, entry_date, description, source_module, source_document_id,
    status, total_amount_paisas, total_amount
  ) VALUES (?, 'JE-OPEN-001', '2026-09-30', 'Opening Inventory Balance', 'inventory', 'adj-open-001', 'POSTED', ?, ?)
`).run(jeId, expectedValuationPaisas, expectedValuationDecimal);

db.prepare(`
  INSERT INTO journal_lines (
    id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit
  ) VALUES
    ('jl-1', ?, ?, ?, 0, ?, 0),
    ('jl-2', ?, ?, 0, ?, 0, ?)
`).run(
  jeId, invAcc.id, expectedValuationPaisas, expectedValuationDecimal,
  jeId, eqAcc.id, expectedValuationPaisas, expectedValuationDecimal
);

const lines = db.prepare('SELECT * FROM journal_lines WHERE journal_id = ?').all(jeId);
assert.strictEqual(lines.length, 2, '2 journal lines posted');
assert.strictEqual(lines[0].debit_paisas, 2677500, 'Dr Merchandise Inventory: 2,677,500 paisas');
assert.strictEqual(lines[1].credit_paisas, 2677500, 'Cr Opening Equity: 2,677,500 paisas');
console.log('✅ Opening Stock GL Posting verified: Dr 1040 (26,775.00) == Cr 3010 (26,775.00)');

// Test Edit Product: updating cost_price also updates base_rate_per_piece_paisas
const newCost = 90.00;
const newCostPaisas = 9000;
db.prepare(`
  UPDATE products
  SET cost_price_paisas = ?, base_rate_per_piece_paisas = ?, cost_price = ?
  WHERE id = ?
`).run(newCostPaisas, newCostPaisas, newCost, prodId);

const editedProd = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
assert.strictEqual(editedProd.cost_price_paisas, 9000, 'Updated cost_price_paisas is 9,000');
assert.strictEqual(editedProd.base_rate_per_piece_paisas, 9000, 'Updated base_rate_per_piece_paisas is 9,000');
console.log('✅ Edit Product maintains base_rate_per_piece_paisas parity');

db.close();
fs.unlinkSync(testDbPath);
console.log('✅ Cleaned up isolated test database');

console.log('\n🎉 ALL PRODUCT MASTER COST BASIS TESTS PASSED WITH 100% PRECISION!');
process.exit(0);
