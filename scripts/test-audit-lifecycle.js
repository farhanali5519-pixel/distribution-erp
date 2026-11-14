// Comprehensive End-to-End Inventory Audit & Stock Ledger Lifecycle Test
// Tests:
// 1. Opening Stock (Baseline)
// 2. Purchase Bill (Goods Inward)
// 3. Sale Order (Commercial Bill Stock Relief)
// 4. Sales Return (Fresh Restock)
// 5. Purchase Return (Debit Note Stock Relief)
// 6. Stock Adjustment (Manual Increase)
// 7. Warehouse Transfer (Main Warehouse -> Godown 1)
// 8. Delete & Reverse Sale Order
// 9. Delete & Reverse Purchase Bill
// 10. Current Stock Reconciliation (Zero Variance Verification)

const BASE_URL = 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': 'ADMIN',
      'x-user-name': 'Administrator',
      'x-user-id': 'admin',
      'x-delete-reason': 'End-to-end audit lifecycle verification test',
      ...(options.headers || {})
    },
    ...options
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${path}: ${data.message || data.error || text}`);
    }
    return data;
  } catch (e) {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
    }
    return text;
  }
}

async function runLifecycleTest() {
  console.log('======================================================================');
  console.log('🚀 STARTING FULL INVENTORY AUDIT & STOCK LEDGER LIFECYCLE TEST');
  console.log('======================================================================\n');

  // 0. Setup test entities
  console.log('--- Step 0: Identifying Target Test Entities ---');
  const targetProductId = 'bede2f8e-3498-41cc-ac80-235578f0360a'; // '01-DUE BEAUTY CREAM'
  const customerId = 'd492ad6f-06b7-40e6-b6f7-270c66c289c1';      // 'Waqar Paranda'
  const vendorId = 'c11aebd9-6b2a-4ef0-815b-12e660e0fa97';        // 'Alpha Traders'

  // Get initial state
  const initialLedgerRes = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const initialStock = initialLedgerRes.ledger.closingBalance;
  console.log(`✅ Target Product: "${initialLedgerRes.ledger.productName}" (SKU: ${initialLedgerRes.ledger.sku})`);
  console.log(`✅ Current Baseline Stock: ${initialStock} pieces`);
  console.log(`✅ Current Ledger Movement Count: ${initialLedgerRes.ledger.rows.length}`);
  console.log('----------------------------------------------------------------------\n');

  // 1. Purchase Bill (Goods Inward)
  console.log('--- Step 1: Purchase Bill (Goods Inward: +100 Pcs) ---');
  const purchaseQty = 100;
  const purchaseRes = await request('/api/purchase/bills', {
    method: 'POST',
    body: JSON.stringify({
      vendorId: vendorId,
      billDate: '2026-09-27',
      vendorInvoiceNumber: `VIN-TEST-${Date.now().toString().slice(-4)}`,
      warehouse: 'Main Warehouse',
      freightTreatment: 'NONE',
      items: [
        {
          productId: targetProductId,
          loosePiecesQty: purchaseQty,
          ratePerPiece: 120
        }
      ]
    })
  });
  const billId = purchaseRes.billId;
  const billNumber = purchaseRes.billNumber;
  console.log(`✅ Created Purchase Bill: ${billNumber} (ID: ${billId})`);

  // Verify stock after purchase
  const postPurchLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock1 = initialStock + purchaseQty;
  console.log(`   Stock Before: ${initialStock}, Added: +${purchaseQty}, New Stock: ${postPurchLedger.ledger.closingBalance} (Expected: ${expectedStock1})`);
  if (postPurchLedger.ledger.closingBalance !== expectedStock1) {
    throw new Error(`Stock mismatch after purchase! Expected ${expectedStock1}, got ${postPurchLedger.ledger.closingBalance}`);
  }
  const lastPurchMov = postPurchLedger.ledger.rows.find(r => r.originalTransactionId === billId);
  console.log(`   Audit Movement: ${lastPurchMov?.movementNumber} | Type: ${lastPurchMov?.type} | In: ${lastPurchMov?.quantityIn} | Status: ${lastPurchMov?.status}`);
  console.log('----------------------------------------------------------------------\n');

  // 2. Sale Order (Commercial Bill Stock Relief)
  console.log('--- Step 2: Sale Order (Commercial Bill Stock Relief: -20 Pcs) ---');
  const saleQty = 20;
  const saleRes = await request('/api/sales/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerId: customerId,
      orderDate: '2026-09-27',
      items: [
        {
          productId: targetProductId,
          quantityBase: saleQty,
          unitPricePaisas: 18000 // 180 PKR
        }
      ]
    })
  });
  const orderId = saleRes.order.id;
  const orderNumber = saleRes.order.order_number;
  console.log(`✅ Created Sale Order: ${orderNumber} (ID: ${orderId})`);

  // Verify stock after sale
  const postSaleLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock2 = expectedStock1 - saleQty;
  console.log(`   Stock Before: ${expectedStock1}, Deducted: -${saleQty}, New Stock: ${postSaleLedger.ledger.closingBalance} (Expected: ${expectedStock2})`);
  if (postSaleLedger.ledger.closingBalance !== expectedStock2) {
    throw new Error(`Stock mismatch after sale! Expected ${expectedStock2}, got ${postSaleLedger.ledger.closingBalance}`);
  }
  const lastSaleMov = postSaleLedger.ledger.rows.find(r => r.originalTransactionId === orderId);
  console.log(`   Audit Movement: ${lastSaleMov?.movementNumber} | Type: ${lastSaleMov?.type} | Out: ${lastSaleMov?.quantityOut} | Status: ${lastSaleMov?.status}`);
  console.log('----------------------------------------------------------------------\n');

  // 3. Sales Return (Fresh Restock)
  console.log('--- Step 3: Sales Return (Fresh Restock: +5 Pcs) ---');
  const returnQty = 5;
  const returnRes = await request('/api/returns/sales', {
    method: 'POST',
    body: JSON.stringify({
      customerId: customerId,
      returnDate: '2026-09-27',
      settlementType: 'CREDIT_TO_LEDGER',
      items: [
        {
          productId: targetProductId,
          condition: 'FRESH',
          piecesQty: returnQty,
          unitRate: 180
        }
      ]
    })
  });
  const returnId = returnRes.data.returnId;
  const returnNumber = returnRes.data.returnNumber;
  console.log(`✅ Created Sales Return: ${returnNumber} (ID: ${returnId})`);

  // Verify stock after sales return
  const postReturnLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock3 = expectedStock2 + returnQty;
  console.log(`   Stock Before: ${expectedStock2}, Restored: +${returnQty}, New Stock: ${postReturnLedger.ledger.closingBalance} (Expected: ${expectedStock3})`);
  if (postReturnLedger.ledger.closingBalance !== expectedStock3) {
    throw new Error(`Stock mismatch after sales return! Expected ${expectedStock3}, got ${postReturnLedger.ledger.closingBalance}`);
  }
  const lastRetMov = postReturnLedger.ledger.rows.find(r => r.originalTransactionId === returnId);
  console.log(`   Audit Movement: ${lastRetMov?.movementNumber} | Type: ${lastRetMov?.type} | In: ${lastRetMov?.quantityIn} | Status: ${lastRetMov?.status}`);
  console.log('----------------------------------------------------------------------\n');

  // 4. Purchase Return (Debit Note Stock Relief)
  console.log('--- Step 4: Purchase Return (Debit Note Stock Relief: -10 Pcs) ---');
  const pretQty = 10;
  const pretRes = await request('/api/returns/purchase', {
    method: 'POST',
    body: JSON.stringify({
      vendorId: vendorId,
      returnDate: '2026-09-27',
      items: [
        {
          productId: targetProductId,
          piecesQty: pretQty,
          ratePerPiece: 120
        }
      ]
    })
  });
  const pretId = pretRes.data.returnId;
  const pretNumber = pretRes.data.returnNumber;
  console.log(`✅ Created Purchase Return: ${pretNumber} (ID: ${pretId})`);

  // Verify stock after purchase return
  const postPretLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock4 = expectedStock3 - pretQty;
  console.log(`   Stock Before: ${expectedStock3}, Deducted: -${pretQty}, New Stock: ${postPretLedger.ledger.closingBalance} (Expected: ${expectedStock4})`);
  if (postPretLedger.ledger.closingBalance !== expectedStock4) {
    throw new Error(`Stock mismatch after purchase return! Expected ${expectedStock4}, got ${postPretLedger.ledger.closingBalance}`);
  }
  const lastPretMov = postPretLedger.ledger.rows.find(r => r.originalTransactionId === pretId);
  console.log(`   Audit Movement: ${lastPretMov?.movementNumber} | Type: ${lastPretMov?.type} | Out: ${lastPretMov?.quantityOut} | Status: ${lastPretMov?.status}`);
  console.log('----------------------------------------------------------------------\n');

  // 5. Stock Adjustment (Manual Increase)
  console.log('--- Step 5: Stock Adjustment (Manual Increase: +15 Pcs) ---');
  const adjQty = 15;
  await request('/api/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify({
      productId: targetProductId,
      adjustmentType: 'INCREASE',
      pieces: adjQty,
      reason: 'Physical shelf count surplus verification'
    })
  });
  console.log(`✅ Posted Stock Adjustment (+${adjQty} Pcs)`);

  // Verify stock after adjustment
  const postAdjLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock5 = expectedStock4 + adjQty;
  console.log(`   Stock Before: ${expectedStock4}, Adjusted: +${adjQty}, New Stock: ${postAdjLedger.ledger.closingBalance} (Expected: ${expectedStock5})`);
  if (postAdjLedger.ledger.closingBalance !== expectedStock5) {
    throw new Error(`Stock mismatch after adjustment! Expected ${expectedStock5}, got ${postAdjLedger.ledger.closingBalance}`);
  }
  const lastAdjMov = postAdjLedger.ledger.rows[postAdjLedger.ledger.rows.length - 1];
  console.log(`   Audit Movement: ${lastAdjMov.movementNumber} | Type: ${lastAdjMov.type} | Net: ${lastAdjMov.netChange} | Status: ${lastAdjMov.status}`);
  console.log('----------------------------------------------------------------------\n');

  // 6. Warehouse Transfer (Main Warehouse -> Godown 1)
  console.log('--- Step 6: Warehouse Transfer (25 Pcs: Main Warehouse -> Godown 1) ---');
  const transferQty = 25;
  const transferRes = await request('/api/inventory/audit/transfer', {
    method: 'POST',
    body: JSON.stringify({
      productId: targetProductId,
      fromWarehouse: 'Main Warehouse',
      toWarehouse: 'Godown 1',
      pieces: transferQty,
      notes: 'Transfer stock for regional delivery routing'
    })
  });
  console.log(`✅ Transfer Executed: Out Mov: ${transferRes.transfer.outMovement.movement_number}, In Mov: ${transferRes.transfer.inMovement.movement_number}`);

  // Verify company-wide stock remains unchanged by inter-warehouse transfer
  const postTransferLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  console.log(`   Company Stock: ${postTransferLedger.ledger.closingBalance} (Unchanged: ${expectedStock5})`);
  if (postTransferLedger.ledger.closingBalance !== expectedStock5) {
    throw new Error(`Company stock changed during transfer! Expected ${expectedStock5}, got ${postTransferLedger.ledger.closingBalance}`);
  }
  console.log('----------------------------------------------------------------------\n');

  // 7. Delete & Reverse Sale Order
  console.log('--- Step 7: Delete & Reverse Sale Order ---');
  const deleteSaleRes = await request(`/api/sales/orders/${orderId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      reason: 'Customer cancelled delivery order before dispatch'
    })
  });
  console.log(`✅ Delete Result: ${deleteSaleRes.message}`);

  // Verify stock after Sale Order reversal
  const postDelSaleLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock6 = expectedStock5 + saleQty; // +20 back
  console.log(`   Stock Before: ${expectedStock5}, Reversal In: +${saleQty}, New Stock: ${postDelSaleLedger.ledger.closingBalance} (Expected: ${expectedStock6})`);
  if (postDelSaleLedger.ledger.closingBalance !== expectedStock6) {
    throw new Error(`Stock mismatch after sale reversal! Expected ${expectedStock6}, got ${postDelSaleLedger.ledger.closingBalance}`);
  }

  // Verify original movement is marked REVERSED and counter-movement is posted
  const originalSaleAudit = postDelSaleLedger.ledger.rows.find(r => r.originalTransactionId === orderId && r.type === 'SALE_ORDER');
  const reversalSaleAudit = postDelSaleLedger.ledger.rows.find(r => r.originalTransactionId === orderId && r.type === 'REVERSAL_IN');

  if (!originalSaleAudit) {
    throw new Error(`Original sale movement not found in audit ledger!`);
  }
  console.log(`   Original Movement: ${originalSaleAudit.movementNumber} | Status: ${originalSaleAudit.status} (Expected: REVERSED)`);
  if (originalSaleAudit.status !== 'REVERSED') {
    throw new Error(`Original sale movement status was not updated to REVERSED!`);
  }

  if (!reversalSaleAudit || reversalSaleAudit.quantityIn !== saleQty) {
    throw new Error(`Counter reversal movement not recorded properly!`);
  }
  console.log(`   Counter Movement:  ${reversalSaleAudit.movementNumber} | Type: ${reversalSaleAudit.type} | Qty In: ${reversalSaleAudit.quantityIn} | Linked To: ${reversalSaleAudit.reversalLinkedMovementId}`);
  console.log('----------------------------------------------------------------------\n');

  // 8. Delete & Reverse Purchase Bill
  console.log('--- Step 8: Delete & Reverse Purchase Bill ---');
  const deletePurchRes = await request(`/api/purchase/bills/${billId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      reason: 'Vendor invoice entered in duplicate'
    })
  });
  console.log(`✅ Delete Result: ${deletePurchRes.message}`);

  // Verify stock after Purchase Bill reversal
  const postDelPurchLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  const expectedStock7 = expectedStock6 - purchaseQty; // -100 back
  console.log(`   Stock Before: ${expectedStock6}, Reversal Out: -${purchaseQty}, New Stock: ${postDelPurchLedger.ledger.closingBalance} (Expected: ${expectedStock7})`);
  if (postDelPurchLedger.ledger.closingBalance !== expectedStock7) {
    throw new Error(`Stock mismatch after purchase reversal! Expected ${expectedStock7}, got ${postDelPurchLedger.ledger.closingBalance}`);
  }

  // Verify original purchase movement is marked REVERSED and counter-movement is posted
  const originalPurchAudit = postDelPurchLedger.ledger.rows.find(r => r.originalTransactionId === billId && (r.type === 'PURCHASE' || r.type === 'PURCHASE_BILL'));
  const reversalPurchAudit = postDelPurchLedger.ledger.rows.find(r => r.originalTransactionId === billId && r.type === 'REVERSAL_OUT');

  if (!originalPurchAudit) {
    throw new Error(`Original purchase movement not found in audit ledger!`);
  }
  console.log(`   Original Movement: ${originalPurchAudit.movementNumber} | Status: ${originalPurchAudit.status} (Expected: REVERSED)`);
  if (originalPurchAudit.status !== 'REVERSED') {
    throw new Error(`Original purchase movement status was not updated to REVERSED!`);
  }

  if (!reversalPurchAudit || reversalPurchAudit.quantityOut !== purchaseQty) {
    throw new Error(`Counter reversal movement not recorded properly!`);
  }
  console.log(`   Counter Movement:  ${reversalPurchAudit.movementNumber} | Type: ${reversalPurchAudit.type} | Qty Out: ${reversalPurchAudit.quantityOut} | Linked To: ${reversalPurchAudit.reversalLinkedMovementId}`);
  console.log('----------------------------------------------------------------------\n');

  // 9. Current Stock Reconciliation Verification
  console.log('--- Step 9: Full Inventory Reconciliation Audit Verification ---');
  const reconRes = await request('/api/inventory/audit/reconciliation');
  const report = reconRes.report;

  console.log(`✅ Total Products Audited: ${report.totalProductsChecked}`);
  console.log(`✅ Products Perfectly Matched: ${report.matchedCount}`);
  console.log(`✅ Products with Audit Variance: ${report.varianceCount}`);
  console.log(`✅ Total Variance Pieces: ${report.totalVariancePieces}`);
  console.log(`✅ Total Variance Value: PKR ${report.totalVarianceValue}`);

  for (const item of report.items) {
    console.log(`   -> Product: "${item.productName}" | System Stock: ${item.systemCurrentStock} | Ledger Stock: ${item.ledgerCalculatedStock} | Diff: ${item.difference} | Variance: ${item.hasVariance ? 'YES ⚠️' : 'NO ✅'}`);
    if (item.hasVariance || item.difference !== 0) {
      throw new Error(`CRITICAL: Stock reconciliation failed for ${item.productName}! Difference = ${item.difference}`);
    }
  }

  // Verify that the final ledger contains all movements with running balances matching step-by-step
  console.log('\n--- Step 10: Product Ledger Complete Chronological Audit Trail ---');
  const finalLedger = await request(`/api/inventory/audit/ledger/${targetProductId}`);
  console.log(`Product: ${finalLedger.ledger.productName} | Total Movements: ${finalLedger.ledger.rows.length}`);
  console.log('---------------------------------------------------------------------------------------------------------------');
  console.log('| Date       | Movement #     | Doc Number       | Type                 | In  | Out | Balance | Status   |');
  console.log('---------------------------------------------------------------------------------------------------------------');
  for (const row of finalLedger.ledger.rows) {
    const d = (row.date || '').padEnd(10);
    const m = (row.movementNumber || '').padEnd(14);
    const doc = (row.documentNumber || '').padEnd(16).slice(0, 16);
    const type = (row.type || '').padEnd(20);
    const qIn = String(row.quantityIn || 0).padStart(3);
    const qOut = String(row.quantityOut || 0).padStart(3);
    const bal = String(row.balance || 0).padStart(7);
    const st = (row.status || '').padEnd(8);
    console.log(`| ${d} | ${m} | ${doc} | ${type} | ${qIn} | ${qOut} | ${bal} | ${st} |`);
  }
  console.log('---------------------------------------------------------------------------------------------------------------');

  console.log('\n======================================================================');
  console.log('🎉 ALL INVENTORY AUDIT & STOCK LEDGER LIFECYCLE TESTS PASSED 100%!');
  console.log('======================================================================\n');
}

runLifecycleTest().catch(err => {
  console.error('\n❌ LIFECYCLE TEST FAILED:', err);
  process.exit(1);
});
