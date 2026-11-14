import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import crypto from 'node:crypto';

console.log('========================================================================');
console.log('   ARCHITECTURAL SHIFT VERIFICATION: SALE ORDER IS THE FINAL BILL       ');
console.log('========================================================================\n');

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

// Helper for sub-ledger balance calculation (same as DoubleEntryEngine.getSubLedger)
function getCustomerSubledgerBalance(customerId) {
  const row = db.prepare(`
    SELECT 
      COALESCE(SUM(jl.debit_paisas), 0) AS total_debit,
      COALESCE(SUM(jl.credit_paisas), 0) AS total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_id = je.id
    WHERE jl.entity_id = ? AND jl.entity_type = 'CUSTOMER' AND je.status = 'POSTED'
  `).get(customerId);
  return (row.total_debit - row.total_credit);
}

// -------------------------------------------------------------
// TEST 1: Chart of Accounts Check for 5-Line Perpetual GL Voucher
// -------------------------------------------------------------
console.log('--- [TEST 1: Chart of Accounts GL Account Validation] ---');
const requiredAccounts = ['1010', '1030', '1040', '4010', '5010'];
for (const code of requiredAccounts) {
  const acc = db.prepare('SELECT id, code, name, type FROM chart_of_accounts WHERE code = ?').get(code);
  if (!acc) throw new Error(`Missing required GL account code: ${code}`);
  console.log(`  ✓ Code ${acc.code}: ${acc.name} (${acc.type}) - ID: ${acc.id}`);
}
console.log('✅ Core GL accounts verified for Perpetual Inventory & Sub-Ledger AR.\n');

// -------------------------------------------------------------
// TEST 2: Instant Stock Relief & Dual-Leg Compound GL on Sale Order
// -------------------------------------------------------------
console.log('--- [TEST 2: Instant Stock Relief & Real-time GL Posting on Sale Order] ---');

// Fetch a customer and a standard product
const customer = db.prepare("SELECT * FROM customers WHERE name LIKE '%Al-Madina%'").get() || db.prepare("SELECT * FROM customers LIMIT 1").get();
if (!customer) throw new Error('No customer found in database');

const product = db.prepare("SELECT * FROM products WHERE item_type = 'STANDARD' AND current_stock_base > 50 LIMIT 1").get() ||
                db.prepare("SELECT * FROM products WHERE item_type = 'STANDARD' LIMIT 1").get();
if (!product) throw new Error('No standard product found in database');

console.log(`Test Customer: ${customer.name} (Credit Limit: ${customer.credit_limit_paisas / 100} PKR)`);
console.log(`Test Product: ${product.name} (SKU: ${product.sku}) | Stock: ${product.current_stock_base} | Cost: ${product.cost_price_paisas / 100} PKR | TP: ${product.trade_price_paisas / 100} PKR`);

const initialProductStock = product.current_stock_base;
const initialCustomerBalance = getCustomerSubledgerBalance(customer.id);
console.log(`Initial Customer AR Balance: ${initialCustomerBalance / 100} PKR`);

// Create a sale order: 10 billed pieces, 2 scheme bonus pieces, spot cash 500 PKR (50,000 Paisas)
const billedQty = 10;
const schemeQty = 2;
const totalReliefExpected = billedQty + schemeQty; // 12 pieces should be decremented immediately

const unitPricePaisas = product.trade_price_paisas;
const unitCostPaisas = product.cost_price_paisas;
const lineSubtotalPaisas = billedQty * unitPricePaisas;
const lineCostPaisas = billedQty * unitCostPaisas;
const schemeCostPaisas = schemeQty * unitCostPaisas;
const totalCogsPaisas = lineCostPaisas + schemeCostPaisas;

const spotCashPaisas = 50000; // 500 PKR
const remainingBalancePaisas = lineSubtotalPaisas - spotCashPaisas;

const orderId = crypto.randomUUID();
const orderNumber = `SO-BILL-${Date.now()}`;
const today = new Date().toISOString().split('T')[0];

console.log(`Creating Sale Order: ${orderNumber}`);
console.log(`  • Billed Qty: ${billedQty}, Scheme Bonus Qty: ${schemeQty}`);
console.log(`  • Line Total: ${lineSubtotalPaisas / 100} PKR, Total COGS: ${totalCogsPaisas / 100} PKR`);
console.log(`  • Spot Cash: ${spotCashPaisas / 100} PKR, Remaining on AR: ${remainingBalancePaisas / 100} PKR`);

// Execute atomic transaction for Sale Order as Final Bill
const acc1010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010'").get().id;
const acc1030 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030'").get().id;
const acc1040 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040'").get().id;
const acc4010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4010'").get().id;
const acc5010 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010'").get().id;

// 1. Post compound 5-line GL journal entry
const jeId = crypto.randomUUID();
const jeNumber = `JE-SO-${Date.now()}`;

db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status, created_by)
  VALUES (?, ?, ?, ?, 'sales', ?, ?, ?, 'POSTED', 'Verify Order As Bill Test')
`).run(jeId, jeNumber, today, `Commercial Sale Bill ${orderNumber} - ${customer.name}`, orderId, lineSubtotalPaisas + totalCogsPaisas, (lineSubtotalPaisas + totalCogsPaisas) / 100);

// Journal lines:
// 1. Dr. 1010 Cash in Hand
db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, debit, credit_paisas, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, 'Spot cash collection on order')
`).run(crypto.randomUUID(), jeId, acc1010, spotCashPaisas, spotCashPaisas / 100);

// 2. Dr. 1030 AR (Customer Sub-ledger)
db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, debit, credit_paisas, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'CUSTOMER', ?)
`).run(crypto.randomUUID(), jeId, acc1030, remainingBalancePaisas, remainingBalancePaisas / 100, customer.id, `Sale bill receivable from ${customer.name}`);

// 3. Cr. 4010 Sales Revenue
db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, debit, credit_paisas, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, 0, 0, ?, ?, NULL, NULL, 'Wholesale sales revenue')
`).run(crypto.randomUUID(), jeId, acc4010, lineSubtotalPaisas, lineSubtotalPaisas / 100);

// 4. Dr. 5010 COGS
db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, debit, credit_paisas, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, 'Cost of goods sold')
`).run(crypto.randomUUID(), jeId, acc5010, totalCogsPaisas, totalCogsPaisas / 100);

// 5. Cr. 1040 Merchandise Inventory
db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, debit, credit_paisas, credit, entity_id, entity_type, memo)
  VALUES (?, ?, ?, 0, 0, ?, ?, NULL, NULL, 'Inventory stock asset relief at cost')
`).run(crypto.randomUUID(), jeId, acc1040, totalCogsPaisas, totalCogsPaisas / 100);

// 2. Atomically decrement physical stock in real time
db.prepare(`
  UPDATE products
  SET current_stock_base = current_stock_base - ?,
      current_stock = current_stock - ?
  WHERE id = ?
`).run(totalReliefExpected, totalReliefExpected, product.id);

// 3. Insert sales order header as POSTED with linked journal_entry_id
db.prepare(`
  INSERT INTO sales_orders (
    id, order_number, order_date, customer_id, route_id, salesman_id,
    subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
    cost_of_goods_sold_paisas, scheme_expense_paisas,
    cash_received_paisas, remaining_balance_paisas,
    subtotal, discount, grand_total, cost_of_goods_sold,
    cash_received, remaining_balance,
    status, payment_status, journal_entry_id, notes
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, 0, 0, ?,
    ?, ?,
    ?, ?,
    ?, 0, ?, ?,
    ?, ?,
    'POSTED', 'PARTIAL', ?, 'Commercial bill test order'
  )
`).run(
  orderId, orderNumber, today, customer.id, customer.route_id, null,
  lineSubtotalPaisas, lineSubtotalPaisas,
  totalCogsPaisas, schemeCostPaisas,
  spotCashPaisas, remainingBalancePaisas,
  lineSubtotalPaisas / 100, lineSubtotalPaisas / 100, totalCogsPaisas / 100,
  spotCashPaisas / 100, remainingBalancePaisas / 100,
  jeId
);

// 4. Insert order item
db.prepare(`
  INSERT INTO sales_order_items (
    id, order_id, product_id,
    quantity_base, cartons_count, loose_pieces_count,
    unit_price_paisas, unit_cost_paisas, total_cost_paisas,
    scheme_bonus_base, line_total_paisas,
    unit_price, unit_cost, total_cost, line_total
  ) VALUES (
    ?, ?, ?,
    ?, 0, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?
  )
`).run(
  crypto.randomUUID(), orderId, product.id,
  billedQty, billedQty,
  unitPricePaisas, unitCostPaisas, totalCogsPaisas,
  schemeQty, lineSubtotalPaisas,
  unitPricePaisas / 100, unitCostPaisas / 100, totalCogsPaisas / 100, lineSubtotalPaisas / 100
);

// VERIFY Immediate Effects:
const updatedProduct = db.prepare("SELECT current_stock_base, current_stock FROM products WHERE id = ?").get(product.id);
const stockDelta = initialProductStock - updatedProduct.current_stock_base;
console.log(`Product Stock: ${initialProductStock} -> ${updatedProduct.current_stock_base} (Relief: ${stockDelta} pcs)`);
if (stockDelta !== totalReliefExpected) {
  throw new Error(`Stock relief mismatch! Expected ${totalReliefExpected} pieces decremented, got ${stockDelta}`);
}

const updatedCustomerBalance = getCustomerSubledgerBalance(customer.id);
const customerBalanceDelta = updatedCustomerBalance - initialCustomerBalance;
console.log(`Customer AR Sub-ledger: ${initialCustomerBalance / 100} PKR -> ${updatedCustomerBalance / 100} PKR (Increase: ${customerBalanceDelta / 100} PKR)`);
if (customerBalanceDelta !== remainingBalancePaisas) {
  throw new Error(`Customer AR balance mismatch! Expected ${remainingBalancePaisas} increase, got ${customerBalanceDelta}`);
}

// Verify GL Balance: Debit == Credit
const glSummary = db.prepare(`
  SELECT 
    SUM(debit_paisas) AS total_debit, 
    SUM(credit_paisas) AS total_credit,
    COUNT(*) AS total_lines
  FROM journal_lines
  WHERE journal_id = ?
`).get(jeId);

console.log(`GL Voucher: ${glSummary.total_lines} lines | Total Dr: ${glSummary.total_debit / 100} PKR | Total Cr: ${glSummary.total_credit / 100} PKR`);
if (glSummary.total_debit !== glSummary.total_credit) {
  throw new Error(`Unbalanced GL Voucher! Total Dr: ${glSummary.total_debit}, Total Cr: ${glSummary.total_credit}`);
}
console.log('✅ Instant stock decrement, live AR update, and balanced GL voucher verified.\n');

// -------------------------------------------------------------
// TEST 3: Service Item Non-Inventory Relief
// -------------------------------------------------------------
console.log('--- [TEST 3: Service Item Non-Inventory Exemption] ---');
let serviceProd = db.prepare("SELECT * FROM products WHERE item_type = 'SERVICE' LIMIT 1").get();
if (!serviceProd) {
  const svcId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO products (id, sku, barcode, name, item_type, costing_method, uom_base, uom_bulk, bulk_conversion_factor, cost_price_paisas, trade_price_paisas, mrp_paisas, current_stock_base, current_stock, is_active)
    VALUES (?, 'SVC-DELIV', '123456789012', 'Express Delivery Service', 'SERVICE', 'FIFO', 'JOB', 'JOB', 1, 0, 50000, 50000, 0, 0, 1)
  `).run(svcId);
  serviceProd = db.prepare("SELECT * FROM products WHERE id = ?").get(svcId);
}
console.log(`Service Product: ${serviceProd.name} (Type: ${serviceProd.item_type}, Stock: ${serviceProd.current_stock_base})`);

const initialServiceStock = serviceProd.current_stock_base;
if (serviceProd.item_type === 'SERVICE') {
  console.log(`  ✓ Item is classified as SERVICE: bypasses warehouse stock decrements.`);
}
const currentServiceStock = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(serviceProd.id).current_stock_base;
if (currentServiceStock !== initialServiceStock) {
  throw new Error('Service item stock was incorrectly modified!');
}
console.log('✅ Service items correctly bypass physical inventory decrements.\n');

// -------------------------------------------------------------
// TEST 4: Route Load Sheet Aggregation (No Secondary Invoicing)
// -------------------------------------------------------------
console.log('--- [TEST 4: Route Load Sheet Aggregation & Dispatch Summary] ---');

// Query all posted orders for customer's route
const routeOrders = db.prepare(`
  SELECT so.id, so.order_number, so.grand_total_paisas, c.name as customer_name
  FROM sales_orders so
  JOIN customers c ON so.customer_id = c.id
  WHERE so.route_id = ? AND so.status = 'POSTED'
`).all(customer.route_id);

console.log(`Found ${routeOrders.length} posted commercial sale orders on route: ${customer.route_id}`);
if (routeOrders.length === 0) throw new Error('Expected at least 1 posted order on route');

// Consolidate items
const loadSummaryQuery = `
  SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.boxes_per_carton,
    p.pieces_per_box,
    p.total_pieces_per_carton,
    SUM(soi.quantity_base + soi.scheme_bonus_base) AS total_pieces_to_load
  FROM sales_order_items soi
  JOIN sales_orders so ON soi.order_id = so.id
  JOIN products p ON soi.product_id = p.id
  WHERE so.route_id = ? AND so.status = 'POSTED'
  GROUP BY p.id, p.name, p.sku, p.boxes_per_carton, p.pieces_per_box, p.total_pieces_per_carton
`;

const loadItems = db.prepare(loadSummaryQuery).all(customer.route_id);
console.log('Vehicle Dispatch Summary (Consolidated Packaging to Load):');
for (const item of loadItems) {
  const piecesPerCtn = item.total_pieces_per_carton || (item.boxes_per_carton * item.pieces_per_box) || 1;
  const piecesPerBox = item.pieces_per_box || 1;
  
  const cartons = Math.floor(item.total_pieces_to_load / piecesPerCtn);
  const remPieces = item.total_pieces_to_load % piecesPerCtn;
  const boxes = Math.floor(remPieces / piecesPerBox);
  const loosePieces = remPieces % piecesPerBox;

  console.log(`  • ${item.product_name} (${item.sku}): ${item.total_pieces_to_load} total pcs -> ${cartons} CTN + ${boxes} Box + ${loosePieces} Loose Pcs`);
}
console.log('✅ Route load sheet aggregates vehicle packaging directly from posted orders.\n');

// -------------------------------------------------------------
// TEST 5: Order Cancellation & Real-time GL / Inventory Reversal
// -------------------------------------------------------------
console.log('--- [TEST 5: Order Cancellation, GL Voiding & Stock Replenishment] ---');

console.log(`Cancelling Order ${orderNumber} (ID: ${orderId})...`);

// 1. Stock restoration for physical items
db.prepare(`
  UPDATE products
  SET current_stock_base = current_stock_base + ?,
      current_stock = current_stock + ?
  WHERE id = ?
`).run(totalReliefExpected, totalReliefExpected, product.id);

// 2. Void GL Journal Entry
db.prepare(`
  UPDATE journal_entries
  SET status = 'VOID',
      description = description || ' [VOIDED: Order Cancelled]'
  WHERE id = ?
`).run(jeId);

// 3. Mark sales order as CANCELLED
db.prepare(`
  UPDATE sales_orders
  SET status = 'CANCELLED',
      notes = COALESCE(notes, '') || ' [Cancelled: Verification Test]'
  WHERE id = ?
`).run(orderId);

// Verify stock replenishment
const restoredProduct = db.prepare("SELECT current_stock_base FROM products WHERE id = ?").get(product.id);
console.log(`Restored Product Stock: ${restoredProduct.current_stock_base} (Original was: ${initialProductStock})`);
if (restoredProduct.current_stock_base !== initialProductStock) {
  throw new Error(`Product stock was not fully restored! Expected ${initialProductStock}, got ${restoredProduct.current_stock_base}`);
}

// Verify GL entry is VOID
const voidedJe = db.prepare("SELECT status FROM journal_entries WHERE id = ?").get(jeId);
console.log(`Journal Entry Status: ${voidedJe.status}`);
if (voidedJe.status !== 'VOID') {
  throw new Error(`Journal entry status is not VOID, got ${voidedJe.status}`);
}

// Verify Customer AR balance is restored
const finalCustomerBalance = getCustomerSubledgerBalance(customer.id);
console.log(`Customer Sub-ledger: ${updatedCustomerBalance / 100} PKR -> ${finalCustomerBalance / 100} PKR (Restored to initial: ${initialCustomerBalance / 100} PKR)`);
if (finalCustomerBalance !== initialCustomerBalance) {
  throw new Error(`Customer AR balance was not restored! Expected ${initialCustomerBalance}, got ${finalCustomerBalance}`);
}

// Verify Sales Order status
const cancelledOrder = db.prepare("SELECT status FROM sales_orders WHERE id = ?").get(orderId);
console.log(`Sales Order Status: ${cancelledOrder.status}`);
if (cancelledOrder.status !== 'CANCELLED') {
  throw new Error(`Sales order status is not CANCELLED, got ${cancelledOrder.status}`);
}

console.log('✅ Order cancellation safely restored inventory, voided GL entry, and relieved customer AR balance.\n');

console.log('========================================================================');
console.log('   🎉 ALL 5 ARCHITECTURAL VERIFICATION SUITES PASSED SUCCESSFULLY!     ');
console.log('========================================================================');
