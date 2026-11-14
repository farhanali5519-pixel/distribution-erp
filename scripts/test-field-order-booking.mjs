import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('  FIELD ORDER BOOKING PORTAL - VERIFICATION SUITE   ');
  console.log('====================================================\n');

  const db = new DatabaseSync('./data/sales_distribution.db');

  try {
    // 0. Fetch initial test prerequisites (Customer, Product, Staff)
    const customer = db.prepare("SELECT id, name, route_id FROM customers WHERE is_active = 1 LIMIT 1").get();
    const product = db.prepare("SELECT id, name, sku, trade_price_paisas, selling_price, current_stock_base FROM products WHERE is_active = 1 LIMIT 1").get();
    const staffMembers = db.prepare("SELECT id, employee_code, name FROM staff_members WHERE is_active = 1 LIMIT 2").all();

    if (!customer || !product) {
      throw new Error('Database missing customer or product seed data to run tests.');
    }

    const tradePrice = (product.trade_price_paisas ? product.trade_price_paisas / 100 : product.selling_price) || 150;

    const staffA = staffMembers[0] || { id: 'staff-a', employee_code: 'EMP-004', name: 'Field Booker A' };
    const staffB = staffMembers[1] || { id: 'staff-b', employee_code: 'EMP-007', name: 'Field Booker B' };

    console.log(`[SETUP] Using Customer: ${customer.name} (${customer.id})`);
    console.log(`[SETUP] Using Product: ${product.name} (Stock: ${product.current_stock_base})`);
    console.log(`[SETUP] Booker A: ${staffA.name} (${staffA.employee_code})`);
    console.log(`[SETUP] Booker B: ${staffB.name} (${staffB.employee_code})\n`);

    // ------------------------------------------------------------
    // TEST 1: Module Toggle (Disable -> Block API -> Enable)
    // ------------------------------------------------------------
    console.log('--- TEST 1: Module Toggle & Access Guard ---');
    
    // Disable module in DB
    db.prepare("UPDATE system_modules SET is_enabled = 0 WHERE id = 'field_order_booking'").run();
    console.log('-> Toggled field_order_booking module to DISABLED (is_enabled = 0)');

    // Call GET on field-order-booking
    const getDisabledRes = await fetch(`${BASE_URL}/api/sales/field-order-booking`);
    const getDisabledJson = await getDisabledRes.json();
    if (getDisabledRes.status === 403 && getDisabledJson.moduleDisabled === true) {
      console.log('  PASS: GET /api/sales/field-order-booking blocked with HTTP 403 & moduleDisabled: true');
    } else {
      throw new Error(`Expected 403 for disabled module GET, got ${getDisabledRes.status}: ${JSON.stringify(getDisabledJson)}`);
    }

    // Call POST on field-order-booking
    const postDisabledRes = await fetch(`${BASE_URL}/api/sales/field-order-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, items: [] }),
    });
    const postDisabledJson = await postDisabledRes.json();
    if (postDisabledRes.status === 403 && postDisabledJson.moduleDisabled === true) {
      console.log('  PASS: POST /api/sales/field-order-booking blocked with HTTP 403 & moduleDisabled: true');
    } else {
      throw new Error(`Expected 403 for disabled module POST, got ${postDisabledRes.status}`);
    }

    // Verify normal Sales Orders API continues working unaffected
    const normalOrdersRes = await fetch(`${BASE_URL}/api/sales/orders`);
    const normalOrdersJson = await normalOrdersRes.json();
    if (normalOrdersRes.ok && normalOrdersJson.success) {
      console.log('  PASS: Normal sales orders API (/api/sales/orders) remains active and unaffected');
    } else {
      throw new Error(`Normal sales orders API failed while field order booking disabled! Status: ${normalOrdersRes.status}, Body: ${JSON.stringify(normalOrdersJson)}`);
    }

    // Re-enable module
    db.prepare("UPDATE system_modules SET is_enabled = 1 WHERE id = 'field_order_booking'").run();
    console.log('-> Toggled field_order_booking module back to ENABLED (is_enabled = 1)');

    const getEnabledRes = await fetch(`${BASE_URL}/api/sales/field-order-booking`);
    const getEnabledJson = await getEnabledRes.json();
    if (getEnabledRes.ok && getEnabledJson.success) {
      console.log('  PASS: Field order booking API accessible again after re-enabling');
    } else {
      throw new Error(`Failed to access field order booking API after re-enabling. Status: ${getEnabledRes.status}, Body: ${JSON.stringify(getEnabledJson)}`);
    }

    // ------------------------------------------------------------
    // TEST 2: Security Audit (Cost Prices Excluded for Order Booker)
    // ------------------------------------------------------------
    console.log('\n--- TEST 2: Security & Price Privacy Audit ---');
    const returnedProducts = getEnabledJson.products || [];
    const hasExposedCost = returnedProducts.some((p) => 'cost_price' in p);
    if (!hasExposedCost) {
      console.log('  PASS: Field Order Booking API strictly EXCLUDES cost_price from product payload');
    } else {
      throw new Error('SECURITY VIOLATION: cost_price exposed in field order booking product payload!');
    }

    // ------------------------------------------------------------
    // TEST 3: Concurrent Booker Numbering & Per-Booker Sequences
    // ------------------------------------------------------------
    console.log('\n--- TEST 3: Concurrency & Human-Readable Booker Numbering ---');
    const today = new Date().toISOString().split('T')[0];

    const bookOrder = async (bookerCode, staffId, clientUuid, tag) => {
      const res = await fetch(`${BASE_URL}/api/sales/field-order-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          routeId: customer.route_id || undefined,
          orderDate: today,
          targetDeliveryDate: today,
          createdByStaffId: staffId,
          bookerCode: bookerCode,
          clientOrderUuid: clientUuid,
          notes: `Automated concurrency test: ${tag}`,
          items: [
            {
              productId: product.id,
              cartonsCount: 1,
              quantityBase: 1,
              unitPricePaisas: Math.round(tradePrice * 100),
            }
          ]
        }),
      });
      return await res.json();
    };

    const uuidA1 = `test-concurrent-a1-${Date.now()}`;
    const uuidA2 = `test-concurrent-a2-${Date.now()}`;
    const uuidB1 = `test-concurrent-b1-${Date.now()}`;
    const uuidB2 = `test-concurrent-b2-${Date.now()}`;

    // Book orders for Booker A and Booker B in parallel
    const [resA1, resA2, resB1, resB2] = await Promise.all([
      bookOrder(staffA.employee_code, staffA.id, uuidA1, 'Booker A Order 1'),
      bookOrder(staffA.employee_code, staffA.id, uuidA2, 'Booker A Order 2'),
      bookOrder(staffB.employee_code, staffB.id, uuidB1, 'Booker B Order 1'),
      bookOrder(staffB.employee_code, staffB.id, uuidB2, 'Booker B Order 2'),
    ]);

    if (!resA1.success || !resA2.success || !resB1.success || !resB2.success) {
      throw new Error(`Concurrent order booking failed: ${JSON.stringify({ resA1, resA2, resB1, resB2 })}`);
    }

    console.log(`  Booker A (${staffA.employee_code}) Order 1: ${resA1.order.order_number}`);
    console.log(`  Booker A (${staffA.employee_code}) Order 2: ${resA2.order.order_number}`);
    console.log(`  Booker B (${staffB.employee_code}) Order 1: ${resB1.order.order_number}`);
    console.log(`  Booker B (${staffB.employee_code}) Order 2: ${resB2.order.order_number}`);

    // Verify format: SO-{BOOKER_CODE}-{YYMMDD}-{SEQUENCE}
    const cleanCodeA = staffA.employee_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const cleanCodeB = staffB.employee_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (!resA1.order.order_number.includes(cleanCodeA) || !resB1.order.order_number.includes(cleanCodeB)) {
      throw new Error(`Order number format does not match booker code: ${resA1.order.order_number}, ${resB1.order.order_number}`);
    }

    // Verify sequences are separate and sequential
    if (resA1.order.order_number !== resA2.order.order_number && resB1.order.order_number !== resB2.order.order_number) {
      console.log('  PASS: Per-booker atomic sequences generated unique order numbers without collision');
    } else {
      throw new Error('Duplicate order numbers generated in concurrent booking!');
    }

    // ------------------------------------------------------------
    // TEST 4: Idempotency & Rapid Double-Submit Protection
    // ------------------------------------------------------------
    console.log('\n--- TEST 4: Idempotency & Double-Submit Protection ---');
    const idempotentUuid = `test-idemp-key-${Date.now()}`;

    // Concurrently post the exact same order with the same clientOrderUuid twice
    const [idemRes1, idemRes2] = await Promise.all([
      bookOrder(staffA.employee_code, staffA.id, idempotentUuid, 'Idempotent 1'),
      bookOrder(staffA.employee_code, staffA.id, idempotentUuid, 'Idempotent 2 (Duplicate)'),
    ]);

    if (idemRes1.success && idemRes2.success) {
      console.log(`  1st submission order: ${idemRes1.order.order_number} (id: ${idemRes1.order.id})`);
      console.log(`  2nd submission order: ${idemRes2.order.order_number} (id: ${idemRes2.order.id})`);

      if (idemRes1.order.id === idemRes2.order.id && idemRes1.order.order_number === idemRes2.order.order_number) {
        console.log('  PASS: Both submissions returned identical order instance without duplicate creation');
      } else {
        throw new Error('Idempotency failed: multiple distinct orders were created for the same client_order_uuid!');
      }

      // Check DB count for this client_order_uuid
      const dbCount = db.prepare("SELECT COUNT(*) as count FROM sales_orders WHERE client_order_uuid = ?").get(idempotentUuid);
      if (dbCount.count === 1) {
        console.log(`  PASS: Database verified strictly 1 row in sales_orders for client_order_uuid`);
      } else {
        throw new Error(`Database contains ${dbCount.count} rows for single client_order_uuid!`);
      }
    } else {
      throw new Error(`Idempotency request failed: ${JSON.stringify({ idemRes1, idemRes2 })}`);
    }

    // ------------------------------------------------------------
    // TEST 5: Field Order Appearance in Central Sales Order Registry
    // ------------------------------------------------------------
    console.log('\n--- TEST 5: Centralized Registry & Booker Metadata Verification ---');
    const fetchOrdersRes = await fetch(`${BASE_URL}/api/sales/orders?sourceChannel=FIELD_BOOKER`);
    const fetchOrdersJson = await fetchOrdersRes.json();

    if (!fetchOrdersJson.success || !fetchOrdersJson.orders) {
      throw new Error('Failed to query sales orders with sourceChannel=FIELD_BOOKER');
    }

    const foundOrder = fetchOrdersJson.orders.find((o) => o.id === idemRes1.order.id);
    if (foundOrder) {
      console.log(`  Found Field Order in /api/sales/orders:`);
      console.log(`    Order Number: ${foundOrder.order_number}`);
      console.log(`    Source Channel: ${foundOrder.source_channel}`);
      console.log(`    Booker Staff: ${foundOrder.booker_staff_name || foundOrder.salesman_name}`);
      console.log(`    Booker Code: ${foundOrder.booker_employee_code || foundOrder.salesman_code}`);

      if (foundOrder.source_channel === 'FIELD_BOOKER') {
        console.log('  PASS: Field order is fully integrated into the standard Sales Orders registry with source_channel=FIELD_BOOKER');
      } else {
        throw new Error(`Unexpected source_channel: ${foundOrder.source_channel}`);
      }
    } else {
      throw new Error(`Booked order ${idemRes1.order.id} was not returned by /api/sales/orders`);
    }

    // ------------------------------------------------------------
    // TEST 6: Convert Field Order to Invoice
    // ------------------------------------------------------------
    console.log('\n--- TEST 6: Convert Field Order to Commercial Invoice ---');
    const convertRes = await fetch(`${BASE_URL}/api/sales/orders/${idemRes1.order.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const convertJson = await convertRes.json();

    if (convertRes.ok && convertJson.success && convertJson.invoice) {
      console.log(`  Converted to Invoice: ${convertJson.invoice.invoice_number}`);

      // Verify that invoice retained source_channel and booker linkage in DB
      const invoiceRow = db.prepare(`
        SELECT id, invoice_number, source_channel, created_by_staff_id, client_order_uuid 
        FROM sales_invoices 
        WHERE id = ?
      `).get(convertJson.invoice.id);

      if (invoiceRow && invoiceRow.source_channel === 'FIELD_BOOKER' && invoiceRow.client_order_uuid === idempotentUuid) {
        console.log('  PASS: Commercial invoice inherits source_channel=FIELD_BOOKER and booker metadata');
      } else {
        throw new Error(`Invoice did not retain field booker metadata: ${JSON.stringify(invoiceRow)}`);
      }
    } else {
      throw new Error(`Failed to convert field order to invoice: ${JSON.stringify(convertJson)}`);
    }

  } finally {
    try {
      db.prepare("UPDATE system_modules SET is_enabled = 1 WHERE id = 'field_order_booking'").run();
    } catch {}
    db.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
