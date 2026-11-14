import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex').toUpperCase();
}

const originalDbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const initialHash = getFileHash(originalDbPath);
console.log('Original DB Initial Hash:', initialHash);

const tempDbPath = path.join(process.cwd(), 'data', `test_party_ledger_${Date.now()}.db`);
fs.copyFileSync(originalDbPath, tempDbPath);
process.env.SQLITE_DATABASE_PATH = tempDbPath;

let allPassed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    allPassed = false;
    throw new Error(message);
  } else {
    console.log(`PASS: ${message}`);
  }
}

async function runTests() {
  try {
    const { ReportsService } = await import('../src/modules/reports/service.ts');
    const { SalesService } = await import('../src/modules/sales/service.ts');
    const { PaymentsReceivedService } = await import('../src/modules/payments/service.ts');
    const { ReturnsService } = await import('../src/modules/returns/service.ts');
    const { getDatabase } = await import('../src/core/database/db.ts');

    const db = getDatabase();
    const companyId = '00000000-0000-0000-0000-000000000001';

    // Create a dedicated test customer: RAHEEL STORE
    const testCustomerId = `test-raheel-${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, company_id, name, shop_name, phone, address, city, cnic_or_ntn, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(testCustomerId, companyId, 'RAHEEL STORE', 'Raheel General Store', '03001234567', 'Main Market', 'Lahore', '35201-1234567-1');

    // Get an existing active product
    const product = db.prepare(`SELECT * FROM products WHERE company_id = ? AND is_active = 1 LIMIT 1`).get(companyId);
    if (!product) throw new Error('No active product found for testing');

    console.log('\n--- TEST 1: LIVE SCENARIO — RAHEEL STORE PARTIAL CASH SALE (3,990 Bill, 990 Spot Cash, 3,000 Credit) ---');
    const order1 = SalesService.createOrder({
      companyId,
      customerId: testCustomerId,
      orderDate: '2026-10-20',
      items: [
        {
          productId: product.id,
          loosePiecesCount: 1,
          quantityBase: 1,
          unitPricePaisas: 399000,
        }
      ],
      cashReceivedPaisas: 99000,
      sourceChannel: 'OFFICE',
    });

    const stmt1 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    console.log('Stmt 1 Lines:', stmt1.lines.map(l => ({ type: l.transactionType, desc: l.description, dr: l.debit, cr: l.credit, bal: l.runningBalance })));
    console.log('Stmt 1 Totals:', { open: stmt1.openingBalance, dr: stmt1.totalDebits, cr: stmt1.totalCredits, close: stmt1.closingBalance });

    assert(stmt1.lines.length === 2, 'Must have exactly 2 rows for partial cash sale');
    assert(stmt1.lines[0].transactionType === 'Sale Invoice', 'Row 1 type must be Sale Invoice');
    assert(stmt1.lines[0].debit === 3990, 'Row 1 debit must be 3,990.00');
    assert(stmt1.lines[0].debit !== 3000, 'Row 1 debit must NOT be 3,000.00 (gross bill, not net)');
    assert(stmt1.lines[0].credit === 0, 'Row 1 credit must be 0');
    assert(stmt1.lines[0].runningBalance === 3990, 'Row 1 running balance must be 3,990.00');

    assert(stmt1.lines[1].transactionType === 'Spot Cash', 'Row 2 type must be Spot Cash');
    assert(stmt1.lines[1].debit === 0, 'Row 2 debit must be 0');
    assert(stmt1.lines[1].credit === 990, 'Row 2 credit must be 990.00');
    assert(stmt1.lines[1].runningBalance === 3000, 'Row 2 running balance must be 3,000.00');

    assert(stmt1.openingBalance === 0, 'Opening balance must be 0.00');
    assert(stmt1.totalDebits === 3990, 'Total debits must be 3,990.00');
    assert(stmt1.totalCredits === 990, 'Total credits must be 990.00');
    assert(stmt1.closingBalance === 3000, 'Closing balance must be 3,000.00');

    console.log('\n--- TEST 2: 100% CREDIT SALE (5,000 Bill, 0 Cash) ---');
    const order2 = SalesService.createOrder({
      companyId,
      customerId: testCustomerId,
      orderDate: '2026-10-21',
      items: [
        {
          productId: product.id,
          loosePiecesCount: 1,
          quantityBase: 1,
          unitPricePaisas: 500000,
        }
      ],
      cashReceivedPaisas: 0,
      sourceChannel: 'OFFICE',
    });

    const stmt2 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    assert(stmt2.lines.length === 3, 'Must have 3 rows total (2 from order1 + 1 from order2)');
    const order2Line = stmt2.lines[2];
    assert(order2Line.transactionType === 'Sale Invoice', 'Order 2 row type must be Sale Invoice');
    assert(order2Line.debit === 5000, 'Order 2 debit must be 5000.00');
    assert(order2Line.credit === 0, 'Order 2 credit must be 0');
    assert(order2Line.runningBalance === 8000, 'Running balance after credit sale must be 8000.00 (3000 + 5000)');

    console.log('\n--- TEST 3: 100% CASH SALE (5,000 Bill, 5,000 Spot Cash) ---');
    const order3 = SalesService.createOrder({
      companyId,
      customerId: testCustomerId,
      orderDate: '2026-10-22',
      items: [
        {
          productId: product.id,
          loosePiecesCount: 1,
          quantityBase: 1,
          unitPricePaisas: 500000,
        }
      ],
      cashReceivedPaisas: 500000,
      sourceChannel: 'OFFICE',
    });

    const stmt3 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    assert(stmt3.lines.length === 5, 'Must have 5 rows total (order 3 adds 2 rows)');
    const rowGross3 = stmt3.lines[3];
    const rowCash3 = stmt3.lines[4];

    assert(rowGross3.transactionType === 'Sale Invoice', '100% cash sale gross row must be Sale Invoice');
    assert(rowGross3.debit === 5000, '100% cash sale gross debit must be 5000.00');
    assert(rowGross3.debit !== 0, '100% cash sale invoice debit must NOT be 0');
    assert(rowGross3.credit === 0, '100% cash sale gross credit must be 0');
    assert(rowGross3.runningBalance === 13000, 'Running balance after 100% cash sale bill must be 13000.00');

    assert(rowCash3.transactionType === 'Spot Cash', '100% cash sale settlement row must be Spot Cash');
    assert(rowCash3.debit === 0, 'Spot Cash debit must be 0');
    assert(rowCash3.credit === 5000, 'Spot Cash credit must be 5000.00');
    assert(rowCash3.runningBalance === 8000, 'Running balance after Spot Cash must return to 8000.00');

    console.log('\n--- TEST 4: LATER PAYMENT RECEIPT (Customer pays 1,000 later) ---');
    const cashAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(companyId);
    PaymentsReceivedService.recordPayment({
      companyId,
      customerId: testCustomerId,
      paymentDate: '2026-10-23',
      accountId: cashAccount.id,
      paymentMethod: 'CASH',
      amount: 1000,
      notes: 'Recovery from Raheel Store',
    });

    const stmt4 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    assert(stmt4.lines.length === 6, 'Must have 6 rows total');
    const paymentLine = stmt4.lines[5];
    assert(paymentLine.transactionType === 'Payment Received' || paymentLine.transactionType === 'Cash Recovery', 'Payment row type must be Payment Received');
    assert(paymentLine.debit === 0, 'Payment debit must be 0');
    assert(paymentLine.credit === 1000, 'Payment credit must be 1000.00');
    assert(paymentLine.runningBalance === 7000, 'Running balance after payment must be 7000.00 (8000 - 1000)');

    console.log('\n--- TEST 5: SALES RETURN (Customer returns 500 worth of goods) ---');
    ReturnsService.createSalesReturn({
      companyId,
      customerId: testCustomerId,
      returnDate: '2026-10-24',
      items: [
        {
          productId: product.id,
          unitRatePaisas: 50000,
          condition: 'FRESH',
          piecesQty: 1,
        }
      ],
      settlementType: 'CREDIT_TO_LEDGER',
      notes: 'Customer return credit note',
    }, companyId, false);

    const stmt5 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    assert(stmt5.lines.length === 7, 'Must have 7 rows total');
    const returnLine = stmt5.lines[6];
    assert(returnLine.transactionType === 'Sales Return', 'Return row type must be Sales Return');
    assert(returnLine.debit === 0, 'Return debit must be 0');
    assert(returnLine.credit === 500, 'Return credit must be 500.00');
    assert(stmt5.closingBalance === 6500, 'Closing balance must be 6500.00 (7000 - 500)');

    console.log('\n--- TEST 6: OPENING BALANCE & DATE FILTERING ---');
    // Filter from 2026-10-22 onwards (orders on 20th and 21st become opening balance)
    // On 20th: Bill 3990, Cash 990 -> 3000 remaining
    // On 21st: Bill 5000, Cash 0 -> 5000 remaining
    // Total opening balance at 2026-10-22 should be 8000.00!
    const stmt6 = ReportsService.getPartyLedgerStatement({
      companyId,
      entityType: 'CUSTOMER',
      entityId: testCustomerId,
      fromDate: '2026-10-22',
      toDate: '2026-10-31',
    });

    console.log('Stmt 6 Open:', stmt6.openingBalance, 'Debits:', stmt6.totalDebits, 'Credits:', stmt6.totalCredits, 'Close:', stmt6.closingBalance);
    assert(stmt6.openingBalance === 8000, 'Opening balance on 2026-10-22 must be exactly 8000.00');
    // Period debits (Order 3 on 22nd: 5000)
    assert(stmt6.totalDebits === 5000, 'Period debits must be 5000.00');
    // Period credits (Spot cash on 22nd: 5000, Payment on 23rd: 1000, Return on 24th: 500 -> total 6500)
    assert(stmt6.totalCredits === 6500, 'Period credits must be 6500.00');
    // Closing: 8000 + 5000 - 6500 = 6500.00
    assert(stmt6.closingBalance === 6500, 'Closing balance must be 6500.00');

    console.log('\n--- TEST 7: VENDOR KHATA INTEGRITY ---');
    const vendors = db.prepare('SELECT id FROM vendors WHERE company_id = ? LIMIT 1').all(companyId);
    if (vendors.length > 0) {
      const vStmt = ReportsService.getPartyLedgerStatement({
        companyId,
        entityType: 'VENDOR',
        entityId: vendors[0].id,
        fromDate: '2020-01-01',
        toDate: '2030-12-31',
      });
      assert(vStmt !== null, 'Vendor statement must generate successfully');
      assert(vStmt.party.entityType === 'VENDOR', 'Vendor statement party must be VENDOR');
    }

    console.log('\n========================================');
    console.log('ALL PARTY LEDGER REGRESSION TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    // Cleanup temporary test DB
    try {
      const { closeDatabase } = await import('../src/core/database/db.ts');
      closeDatabase();
    } catch {}

    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }

    const finalHash = getFileHash(originalDbPath);
    console.log('Original DB Final Hash:', finalHash);
    if (initialHash !== finalHash) {
      console.error('FATAL: Original DB was modified during test!');
      process.exit(1);
    } else {
      console.log('VERIFIED: Original business DB remained 100% UNTOUCHED.');
    }
  }
}

runTests().catch((e) => {
  console.error('Test failed with error:', e);
  process.exit(1);
});
