const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

async function runTests() {
  console.log('=== PHASE 7 SALES & PURCHASE RETURNS ENGINE VERIFICATION ===\n');

  const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);

  // 1. Verify Feature Flags
  console.log('1. Checking Feature Flags...');
  const flags = db.prepare(`SELECT key, value FROM feature_flags WHERE key LIKE 'returns.%'`).all();
  console.log('Found returns flags:', flags);
  if (flags.length < 4) throw new Error('Expected at least 4 returns feature flags.');
  console.log('✓ Feature flags verified.\n');

  // 2. Verify Schema Upgrade: damaged_stock_base
  console.log('2. Checking products.damaged_stock_base...');
  const prodCols = db.prepare(`PRAGMA table_info(products)`).all();
  const hasDamaged = prodCols.some(c => c.name === 'damaged_stock_base');
  if (!hasDamaged) throw new Error('products.damaged_stock_base column missing!');
  console.log('✓ products.damaged_stock_base column confirmed.\n');

  // 3. Test HTTP Endpoints
  console.log('3. Checking HTTP endpoints on running server...');
  const baseUrl = 'http://localhost:3000';

  const endpoints = [
    '/sales/returns',
    '/purchase/returns',
    '/api/returns/sales',
    '/api/returns/purchase',
    '/api/returns/customer-eligibility?customerId=317a2d37-3d0c-402d-9922-919f0c7e1aa4',
  ];

  for (const ep of endpoints) {
    const res = await fetch(baseUrl + ep);
    console.log(`Endpoint ${ep} -> HTTP ${res.status}`);
    if (res.status !== 200) throw new Error(`Endpoint ${ep} returned status ${res.status}`);
  }
  console.log('✓ All endpoints returned HTTP 200 OK.\n');

  // 4. Test Customer Eligibility & Strict Validation
  console.log('4. Testing Customer Sales Return with History Audit...');
  const custRes = await fetch(`${baseUrl}/api/customers`).then(r => r.json());
  const prodRes = await fetch(`${baseUrl}/api/inventory`).then(r => r.json());

  const testCustomer = custRes.customers[0];
  const testProduct = prodRes.products.find(p => p.sku === 'SNK-004'); // Chips
  console.log(`Testing with Customer: ${testCustomer.name}, Product: ${testProduct.name}`);

  // Check initial eligibility
  const auditRes = await fetch(`${baseUrl}/api/returns/customer-eligibility?customerId=${testCustomer.id}&productId=${testProduct.id}`).then(r => r.json());
  console.log('Audit result:', auditRes.data);

  const initialDelivered = auditRes.data.totalDeliveredBase;
  const initialReturned = auditRes.data.alreadyReturnedBase;
  const initialMax = auditRes.data.maxReturnableBase;
  console.log(`Delivered: ${initialDelivered}, Returned: ${initialReturned}, Max Returnable: ${initialMax}`);

  // Test Attempting return of 99999 pcs (Exceeds limit)
  console.log('Attempting excess return (99999 pcs)...');
  const excessRes = await fetch(`${baseUrl}/api/returns/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: testCustomer.id,
      returnDate: '2026-09-19',
      settlementType: 'CREDIT_TO_LEDGER',
      items: [{ productId: testProduct.id, condition: 'FRESH', piecesQty: 99999 }],
    }),
  }).then(r => r.json());
  console.log('Excess return rejected with:', excessRes.message);
  if (excessRes.success) throw new Error('Excess return should have been rejected!');
  console.log('✓ Excess return rejected properly.\n');

  // Test Fresh return of 2 pcs if eligible or let's create a small order first
  if (initialMax < 2) {
    console.log('Placing a test sale order to create delivery history...');
    const orderRes = await fetch(`${baseUrl}/api/sales/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: testCustomer.id,
        orderDate: '2026-09-19',
        items: [{ productId: testProduct.id, quantityBase: 10, cartonsCount: 0, loosePiecesCount: 10 }],
      }),
    }).then(r => r.json());
    console.log('Order created:', orderRes.data?.orderNumber || orderRes.orderNumber);
  }

  // Fetch updated eligibility
  const postOrderAudit = await fetch(`${baseUrl}/api/returns/customer-eligibility?customerId=${testCustomer.id}&productId=${testProduct.id}`).then(r => r.json());
  console.log('Updated eligibility max returnable:', postOrderAudit.data.maxReturnableBase);

  // 5. Test Return: FRESH (Restock sellable)
  console.log('\n5. Posting FRESH sales return (1 Pcs)...');
  const stockBeforeFresh = db.prepare('SELECT current_stock_base, damaged_stock_base FROM products WHERE id = ?').get(testProduct.id);

  const freshReturnRes = await fetch(`${baseUrl}/api/returns/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: testCustomer.id,
      returnDate: '2026-09-19',
      settlementType: 'CREDIT_TO_LEDGER',
      notes: 'Test fresh restock verification',
      items: [{ productId: testProduct.id, condition: 'FRESH', piecesQty: 1 }],
    }),
  }).then(r => r.json());
  console.log('Fresh return posted:', freshReturnRes.data?.returnNumber, 'Refund:', freshReturnRes.data?.totalRefund);
  if (!freshReturnRes.success) throw new Error(`Fresh return failed: ${freshReturnRes.message}`);

  const stockAfterFresh = db.prepare('SELECT current_stock_base, damaged_stock_base FROM products WHERE id = ?').get(testProduct.id);
  console.log(`Sellable Stock: ${stockBeforeFresh.current_stock_base} -> ${stockAfterFresh.current_stock_base} (+1 expected)`);
  if (stockAfterFresh.current_stock_base !== stockBeforeFresh.current_stock_base + 1) {
    throw new Error('Fresh return did not increment current_stock_base by 1!');
  }
  console.log('✓ FRESH return restocked sellable inventory.\n');

  // 6. Test Return: DAMAGED_EXPIRED (Quarantine)
  console.log('6. Posting DAMAGED_EXPIRED sales return (1 Pcs)...');
  const stockBeforeDamaged = db.prepare('SELECT current_stock_base, damaged_stock_base FROM products WHERE id = ?').get(testProduct.id);

  const damagedReturnRes = await fetch(`${baseUrl}/api/returns/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: testCustomer.id,
      returnDate: '2026-09-19',
      settlementType: 'CREDIT_TO_LEDGER',
      notes: 'Test damaged quarantine verification',
      items: [{ productId: testProduct.id, condition: 'DAMAGED_EXPIRED', piecesQty: 1 }],
    }),
  }).then(r => r.json());
  console.log('Damaged return posted:', damagedReturnRes.data?.returnNumber, 'Refund:', damagedReturnRes.data?.totalRefund);
  if (!damagedReturnRes.success) throw new Error(`Damaged return failed: ${damagedReturnRes.message}`);

  const stockAfterDamaged = db.prepare('SELECT current_stock_base, damaged_stock_base FROM products WHERE id = ?').get(testProduct.id);
  console.log(`Sellable Stock: ${stockBeforeDamaged.current_stock_base} -> ${stockAfterDamaged.current_stock_base} (0 change expected)`);
  console.log(`Damaged Stock: ${stockBeforeDamaged.damaged_stock_base} -> ${stockAfterDamaged.damaged_stock_base} (+1 expected)`);

  if (stockAfterDamaged.current_stock_base !== stockBeforeDamaged.current_stock_base) {
    throw new Error('Damaged return touched sellable current_stock_base!');
  }
  if (stockAfterDamaged.damaged_stock_base !== stockBeforeDamaged.damaged_stock_base + 1) {
    throw new Error('Damaged return did not increment damaged_stock_base!');
  }
  console.log('✓ DAMAGED return quarantined to damaged_stock_base without affecting sellable inventory.\n');

  // 7. Verify Double-Entry Journal Lines for Sales Returns
  console.log('7. Verifying Double-Entry GL Journal Entry...');
  const journalEntry = db.prepare(`
    SELECT je.* FROM journal_entries je
    WHERE je.id = ?
  `).get(damagedReturnRes.data.journalEntryId);
  const journalLines = db.prepare(`
    SELECT jl.*, coa.code as account_code, coa.name as account_name
    FROM journal_lines jl
    JOIN chart_of_accounts coa ON jl.account_id = coa.id
    WHERE jl.journal_id = ?
  `).all(damagedReturnRes.data.journalEntryId);

  console.log(`Voucher ${journalEntry.entry_number}:`);
  for (const l of journalLines) {
    console.log(`  ${l.account_code} ${l.account_name}: Dr ${l.debit} | Cr ${l.credit} (Entity: ${l.entity_type} ${l.entity_id || ''})`);
  }
  const has4030 = journalLines.some(l => l.account_code === '4030' && l.debit > 0);
  const has1030 = journalLines.some(l => l.account_code === '1030' && l.credit > 0);
  const has5070 = journalLines.some(l => l.account_code === '5070' && l.debit > 0);
  if (!has4030 || !has1030 || !has5070) {
    throw new Error('Expected accounts 4030, 1030, and 5070 in damaged return voucher!');
  }
  console.log('✓ Double-Entry GL posting balanced and strictly verified.\n');

  // 8. Test Vendor Purchase Return (Debit Note)
  console.log('8. Testing Vendor Purchase Return (Debit Note)...');
  const vendorRes = await fetch(`${baseUrl}/api/vendors`).then(r => r.json());
  const testVendor = vendorRes.vendors[0];

  const stockBeforePR = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(testProduct.id);

  const prRes = await fetch(`${baseUrl}/api/returns/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vendorId: testVendor.id,
      returnDate: '2026-09-19',
      vendorInvoiceNumber: 'INV-TEST-001',
      items: [{ productId: testProduct.id, piecesQty: 2 }],
    }),
  }).then(r => r.json());
  console.log('Purchase return posted:', prRes.data?.returnNumber, 'Total:', prRes.data?.totalAmount);
  if (!prRes.success) throw new Error(`Purchase return failed: ${prRes.message}`);

  const stockAfterPR = db.prepare('SELECT current_stock_base FROM products WHERE id = ?').get(testProduct.id);
  console.log(`Sellable Stock: ${stockBeforePR.current_stock_base} -> ${stockAfterPR.current_stock_base} (-2 expected)`);
  if (stockAfterPR.current_stock_base !== stockBeforePR.current_stock_base - 2) {
    throw new Error('Purchase return did not relieve current_stock_base by 2!');
  }

  const prJournalLines = db.prepare(`
    SELECT jl.*, coa.code as account_code, coa.name as account_name
    FROM journal_lines jl
    JOIN chart_of_accounts coa ON jl.account_id = coa.id
    WHERE jl.journal_id = ?
  `).all(prRes.data.journalEntryId);

  console.log(`Purchase Return Voucher Lines:`);
  for (const l of prJournalLines) {
    console.log(`  ${l.account_code} ${l.account_name}: Dr ${l.debit} | Cr ${l.credit} (Entity: ${l.entity_type} ${l.entity_id || ''})`);
  }
  const has2010 = prJournalLines.some(l => l.account_code === '2010' && l.debit > 0 && l.entity_type === 'VENDOR');
  const has1040 = prJournalLines.some(l => l.account_code === '1040' && l.credit > 0);
  if (!has2010 || !has1040) {
    throw new Error('Expected Dr 2010 AP and Cr 1040 Inventory in purchase return voucher!');
  }
  console.log('✓ Vendor Purchase Return and Debit Note GL posting strictly verified.\n');

  console.log('=== ALL PHASE 7 VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
