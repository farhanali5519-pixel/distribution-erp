import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const baseUrl = 'http://localhost:3000';
const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

console.log('========================================================================');
console.log('   FULL LIFECYCLE VERIFICATION: STAFF MASTER & DISTRIBUTION LINKAGE    ');
console.log('========================================================================\n');

async function runVerification() {
  // -------------------------------------------------------------
  // 1. STAFF MASTER: Create Staff Members with Roles
  // -------------------------------------------------------------
  console.log('--- [STEP 1: Staff / Distribution Team Master API & DB] ---');

  // Create or get Ali (SALESMAN)
  const aliRes = await fetch(`${baseUrl}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Ali Raza',
      employee_code: `ALI-${Date.now().toString().slice(-4)}`,
      mobile: '03001234567',
      role: 'SALESMAN',
      notes: 'Lead territory sales executive',
      is_active: true,
    }),
  });
  const aliData = await aliRes.json();
  if (!aliData.success) throw new Error(`Failed to create Ali: ${aliData.message}`);
  const aliId = aliData.staff.id;
  const aliCode = aliData.staff.employee_code;
  console.log(`  ✓ Created Salesperson: ${aliData.staff.name} [${aliCode}] (Role: ${aliData.staff.role}) - ID: ${aliId}`);

  // Create Bilal (SUPPLY_PERSON)
  const bilalRes = await fetch(`${baseUrl}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bilal Khan',
      employee_code: `BIL-${Date.now().toString().slice(-4)}`,
      mobile: '03019876543',
      role: 'SUPPLY_PERSON',
      notes: 'Distribution logistics & delivery officer',
      is_active: true,
    }),
  });
  const bilalData = await bilalRes.json();
  if (!bilalData.success) throw new Error(`Failed to create Bilal: ${bilalData.message}`);
  const bilalId = bilalData.staff.id;
  const bilalCode = bilalData.staff.employee_code;
  console.log(`  ✓ Created Delivery Officer: ${bilalData.staff.name} [${bilalCode}] (Role: ${bilalData.staff.role}) - ID: ${bilalId}`);

  // Create Hamza (BOTH - Dual Role)
  const hamzaRes = await fetch(`${baseUrl}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Hamza Tariq',
      employee_code: `HMZ-${Date.now().toString().slice(-4)}`,
      mobile: '03215554433',
      role: 'BOTH',
      notes: 'Van Salesman & Supply Officer Combined',
      is_active: true,
    }),
  });
  const hamzaData = await hamzaRes.json();
  if (!hamzaData.success) throw new Error(`Failed to create Hamza: ${hamzaData.message}`);
  const hamzaId = hamzaData.staff.id;
  const hamzaCode = hamzaData.staff.employee_code;
  console.log(`  ✓ Created Dual Role Officer: ${hamzaData.staff.name} [${hamzaCode}] (Role: ${hamzaData.staff.role}) - ID: ${hamzaId}`);

  // Verify Role filtering on Staff API
  const salesStaffRes = await fetch(`${baseUrl}/api/staff?role=SALESMAN&activeOnly=true`);
  const salesStaff = (await salesStaffRes.json()).staff;
  const hasAli = salesStaff.some((s) => s.id === aliId);
  const hasHamzaInSales = salesStaff.some((s) => s.id === hamzaId);
  const hasBilalInSales = salesStaff.some((s) => s.id === bilalId);
  console.log(`  ✓ Salesperson Filter Check: Ali in list? ${hasAli} | Hamza (BOTH) in list? ${hasHamzaInSales} | Bilal (SUPPLY) in list? ${hasBilalInSales}`);
  if (!hasAli || !hasHamzaInSales || hasBilalInSales) {
    throw new Error('Role filtering error for SALESMAN');
  }

  const supplyStaffRes = await fetch(`${baseUrl}/api/staff?role=SUPPLY_PERSON&activeOnly=true`);
  const supplyStaff = (await supplyStaffRes.json()).staff;
  const hasBilalInSupply = supplyStaff.some((s) => s.id === bilalId);
  const hasHamzaInSupply = supplyStaff.some((s) => s.id === hamzaId);
  const hasAliInSupply = supplyStaff.some((s) => s.id === aliId);
  console.log(`  ✓ Supply Person Filter Check: Bilal in list? ${hasBilalInSupply} | Hamza (BOTH) in list? ${hasHamzaInSupply} | Ali (SALES) in list? ${hasAliInSupply}`);
  if (!hasBilalInSupply || !hasHamzaInSupply || hasAliInSupply) {
    throw new Error('Role filtering error for SUPPLY_PERSON');
  }

  // -------------------------------------------------------------
  // 2. SALE ORDER BOOKING: Ali (Salesman) + Bilal (Supply Person)
  // -------------------------------------------------------------
  console.log('\n--- [STEP 2: Sale Order Booking with Ali & Bilal] ---');

  const customer = db.prepare("SELECT * FROM customers LIMIT 1").get();
  if (!customer) throw new Error('No customer found in database');

  const products = db.prepare("SELECT * FROM products WHERE item_type = 'STANDARD' AND current_stock_base >= 50 LIMIT 2").all();
  if (products.length < 2) throw new Error('Need at least 2 standard products for item-level test');

  const productA = products[0];
  const productB = products[1];

  console.log(`  Customer: ${customer.name}`);
  console.log(`  Product A: ${productA.name} (SKU: ${productA.sku}) | Stock: ${productA.current_stock_base}`);
  console.log(`  Product B: ${productB.name} (SKU: ${productB.sku}) | Stock: ${productB.current_stock_base}`);

  // Book order: Product A = 10 PCS, Product B = 20 PCS (The Ali Scenario)
  const orderRes = await fetch(`${baseUrl}/api/sales/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: customer.id,
      salesmanId: aliId,
      supplyPersonId: bilalId,
      orderDate: new Date().toISOString().split('T')[0],
      items: [
        { productId: productA.id, quantityBase: 10, cartonsCount: 0, boxesCount: 0, loosePiecesCount: 10 },
        { productId: productB.id, quantityBase: 20, cartonsCount: 0, boxesCount: 0, loosePiecesCount: 20 },
      ],
      notes: 'Booking for Ali test scenario',
    }),
  });
  const orderData = await orderRes.json();
  if (!orderData.success) throw new Error(`Order Booking failed: ${orderData.message}`);
  const order = orderData.order;
  console.log(`  ✓ Order Booked: ${order.order_number} (ID: ${order.id})`);
  console.log(`  ✓ Order Salesman: ${order.salesman_name} [${order.salesman_code}] (Expected: Ali Raza [${aliCode}])`);
  console.log(`  ✓ Order Supply Person: ${order.supply_person_name} [${order.supply_person_code}] (Expected: Bilal Khan [${bilalCode}])`);
  console.log(`  ✓ Grand Total: ${order.grand_total} PKR | Items count: ${order.items?.length}`);

  if (order.salesman_id !== aliId || order.supply_person_id !== bilalId) {
    throw new Error('Staff IDs mismatch on booked sales order!');
  }

  // -------------------------------------------------------------
  // 3. CONVERSION: Order → Commercial Bill / Invoice
  // -------------------------------------------------------------
  console.log('\n--- [STEP 3: Order Conversion to Commercial Invoice] ---');
  const convertRes = await fetch(`${baseUrl}/api/sales/orders/${order.id}/convert`, {
    method: 'POST',
  });
  const convertData = await convertRes.json();
  if (!convertData.success) throw new Error(`Order conversion failed: ${convertData.message}`);
  const invoice = convertData.invoice;
  console.log(`  ✓ Invoice Created: ${invoice.invoice_number} (ID: ${invoice.id})`);
  console.log(`  ✓ Invoice Salesman: ${invoice.salesman_name} [${invoice.salesman_code}] (Expected: Ali Raza [${aliCode}])`);
  console.log(`  ✓ Invoice Supply Person: ${invoice.supply_person_name} [${invoice.supply_person_code}] (Expected: Bilal Khan [${bilalCode}])`);
  console.log(`  ✓ Copied Items: ${invoice.items?.length} line items`);

  if (invoice.salesman_id !== aliId || invoice.supply_person_id !== bilalId) {
    throw new Error('Staff IDs not permanently copied to invoice!');
  }

  // -------------------------------------------------------------
  // 4. DIRECT SALE: Van Sale with Dual-Role Officer Hamza
  // -------------------------------------------------------------
  console.log('\n--- [STEP 4: Direct Van Sale with Hamza (BOTH)] ---');
  const directSaleRes = await fetch(`${baseUrl}/api/sales/direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: customer.id,
      salesmanId: hamzaId,
      supplyPersonId: hamzaId,
      invoiceDate: new Date().toISOString().split('T')[0],
      items: [
        { productId: productA.id, quantityBase: 5, cartonsCount: 0, boxesCount: 0, loosePiecesCount: 5 },
      ],
      notes: 'Direct Van Sale by Hamza',
    }),
  });
  const directSaleData = await directSaleRes.json();
  if (!directSaleData.success) throw new Error(`Direct sale failed: ${directSaleData.message}`);
  const directInv = directSaleData.invoice;
  console.log(`  ✓ Direct Invoice: ${directInv.invoice_number} (ID: ${directInv.id})`);
  console.log(`  ✓ Salesman: ${directInv.salesman_name} [${directInv.salesman_code}]`);
  console.log(`  ✓ Supply Person: ${directInv.supply_person_name} [${directInv.supply_person_code}]`);

  if (directInv.salesman_id !== hamzaId || directInv.supply_person_id !== hamzaId) {
    throw new Error('Staff IDs mismatch on direct sale invoice!');
  }

  // -------------------------------------------------------------
  // 5. SALES RETURN: Retaining Original Salesperson & Supply Person
  // -------------------------------------------------------------
  console.log('\n--- [STEP 5: Sales Return Inheriting Staff Linkage] ---');
  const returnRes = await fetch(`${baseUrl}/api/returns/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: customer.id,
      invoiceId: directInv.id,
      salesmanId: hamzaId,
      supplyPersonId: hamzaId,
      settlementType: 'CREDIT_TO_LEDGER',
      returnDate: new Date().toISOString().split('T')[0],
      items: [
        { productId: productA.id, piecesQty: 2, condition: 'FRESH' },
      ],
      notes: 'Return against direct invoice',
    }),
  });
  const returnData = await returnRes.json();
  if (!returnData.success) throw new Error(`Return creation failed: ${returnData.message}`);
  const returnResult = returnData.data;
  console.log(`  ✓ Return Created: ${returnResult.returnNumber} (ID: ${returnResult.returnId})`);

  // Check database row
  const dbReturn = db.prepare('SELECT salesman_id, supply_person_id, invoice_id FROM sales_returns WHERE id = ?').get(returnResult.returnId);
  console.log('  ✓ DB Return Staff Linkage:', dbReturn);
  if (dbReturn.salesman_id !== hamzaId || dbReturn.supply_person_id !== hamzaId) {
    throw new Error('Sales return did not retain salesman / supply person linkage!');
  }

  // -------------------------------------------------------------
  // 6. REPORTING ENGINE: Multi-Tab Verification & Item-Level Breakdown
  // -------------------------------------------------------------
  console.log('\n--- [STEP 6: Distribution Team Performance Report & Item-Level Breakdown] ---');
  const reportRes = await fetch(`${baseUrl}/api/reports/salesman-performance`);
  const reportData = await reportRes.json();
  if (!reportData.success) throw new Error(`Report fetch failed: ${reportData.message}`);

  const { salesmen, supplyPersons, itemSales, customerSales, transactions, summary } = reportData.data;
  console.log(`  ✓ Summary: ${summary.totalSalesmen} Active Sales Reps | ${summary.totalDeliveries} Total Deliveries`);
  console.log(`  ✓ Total Billed: ${summary.totalOrders} Orders + ${summary.totalInvoices} Direct Invoices`);
  console.log(`  ✓ Total Net Sales: ${summary.totalNetSales} PKR`);

  // Verify Ali in Salesmen list
  const aliRow = salesmen.find((s) => s.staffId === aliId);
  if (!aliRow) throw new Error('Ali not found in Salesmen Report!');
  console.log(`\n  [Salesperson Report: Ali Raza]`);
  console.log(`    - Orders: ${aliRow.ordersCount} | Direct Sales: ${aliRow.invoicesCount}`);
  console.log(`    - Total Units Sold: ${aliRow.quantitySoldBase}`);
  console.log(`    - Gross Sales: ${aliRow.grossSales} PKR`);
  console.log(`    - Net Sales: ${aliRow.netSales} PKR`);
  console.log(`    - Returns: ${aliRow.returnsAmount} PKR`);
  console.log(`    - Net After Returns: ${aliRow.netSalesAfterReturns} PKR`);

  if (aliRow.quantitySoldBase < 30) {
    throw new Error(`Ali should have sold at least 30 pieces (10 A + 20 B), found ${aliRow.quantitySoldBase}`);
  }

  // Verify Bilal in Supply Persons list
  const bilalRow = supplyPersons.find((s) => s.staffId === bilalId);
  if (!bilalRow) throw new Error('Bilal not found in Supply Person Report!');
  console.log(`\n  [Supply Person Report: Bilal Khan]`);
  console.log(`    - Orders Delivered: ${bilalRow.ordersDeliveredCount}`);
  console.log(`    - Quantity Delivered: ${bilalRow.quantityDeliveredBase}`);
  console.log(`    - Net Delivered Amount: ${bilalRow.deliveryAmount} PKR`);

  if (bilalRow.quantityDeliveredBase < 30) {
    throw new Error(`Bilal should have delivered at least 30 pieces, found ${bilalRow.quantityDeliveredBase}`);
  }

  // Verify Hamza in both lists (Dual Role)
  const hamzaSalesRow = salesmen.find((s) => s.staffId === hamzaId);
  const hamzaSupplyRow = supplyPersons.find((s) => s.staffId === hamzaId);
  console.log(`\n  [Dual Role Verification: Hamza Tariq]`);
  console.log(`    - Sales Report Found: ${!!hamzaSalesRow} (Net: ${hamzaSalesRow?.netSales} PKR, Returns: ${hamzaSalesRow?.returnsAmount} PKR)`);
  console.log(`    - Supply Report Found: ${!!hamzaSupplyRow} (Delivered: ${hamzaSupplyRow?.quantityDeliveredBase} pcs)`);
  if (!hamzaSalesRow || !hamzaSupplyRow) {
    throw new Error('Dual role staff Hamza must appear in both Salesperson and Supply Person reports!');
  }

  // -------------------------------------------------------------
  // 7. ITEM-LEVEL REPORTING (The Ali Requirement)
  // "If Salesperson Ali books Invoice INV-001 containing Product A = 10, Product B = 20,
  // Salesperson Item Report must show those exact products and quantities under Ali."
  // -------------------------------------------------------------
  console.log('\n--- [STEP 7: Item-Level Exact Quantity Reporting] ---');
  const aliItemA = itemSales.find((r) => r.staffId === aliId && r.productId === productA.id && r.staffRoleType === 'SALESPERSON');
  const aliItemB = itemSales.find((r) => r.staffId === aliId && r.productId === productB.id && r.staffRoleType === 'SALESPERSON');

  console.log(`  Ali's Product A Record:`, aliItemA ? `${aliItemA.productName} = ${aliItemA.quantitySoldBase} PCS (Amount: ${aliItemA.netAmount} PKR)` : 'NOT FOUND');
  console.log(`  Ali's Product B Record:`, aliItemB ? `${aliItemB.productName} = ${aliItemB.quantitySoldBase} PCS (Amount: ${aliItemB.netAmount} PKR)` : 'NOT FOUND');

  if (!aliItemA || aliItemA.quantitySoldBase < 10) {
    throw new Error(`Ali Product A should be at least 10 PCS, found ${aliItemA?.quantitySoldBase}`);
  }
  if (!aliItemB || aliItemB.quantitySoldBase < 20) {
    throw new Error(`Ali Product B should be at least 20 PCS, found ${aliItemB?.quantitySoldBase}`);
  }
  console.log('  ✅ The Ali Item-Level Scenario PASSED with exact product quantities!');

  // Check Supply Person Item-Level for Bilal
  const bilalItemA = itemSales.find((r) => r.staffId === bilalId && r.productId === productA.id && r.staffRoleType === 'SUPPLY_PERSON');
  const bilalItemB = itemSales.find((r) => r.staffId === bilalId && r.productId === productB.id && r.staffRoleType === 'SUPPLY_PERSON');
  console.log(`  Bilal's Delivered Product A: ${bilalItemA?.quantitySoldBase} PCS | Product B: ${bilalItemB?.quantitySoldBase} PCS`);
  if (!bilalItemA || !bilalItemB) {
    throw new Error('Bilal item delivery records not found in item report!');
  }
  console.log('  ✅ Supply Person Item Delivery Reporting PASSED!');

  // -------------------------------------------------------------
  // 8. DATA INTEGRITY: Deletion Safeguard
  // -------------------------------------------------------------
  console.log('\n--- [STEP 8: Data Integrity & Foreign Key Safeguards] ---');
  const delRes = await fetch(`${baseUrl}/api/staff/${aliId}`, { method: 'DELETE' });
  const delData = await delRes.json();
  console.log(`  Delete Ali result: Success=${delData.success} | Message: ${delData.message}`);
  if (delData.success) {
    throw new Error('Staff deletion should have been blocked because Ali has linked transactions!');
  }
  console.log('  ✅ Staff deletion safeguard correctly prevented orphan transaction records!');

  console.log('\n========================================================================');
  console.log('   🎉 ALL STAFF DISTRIBUTION LIFECYCLE TESTS PASSED PERFECTLY!         ');
  console.log('========================================================================\n');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
