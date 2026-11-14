import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

// Ensure audit_logs and other schema changes exist
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      transaction_number TEXT,
      transaction_date TEXT,
      reason TEXT NOT NULL,
      is_day_closed INTEGER NOT NULL DEFAULT 0,
      details_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(transaction_type);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(transaction_date);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
`);

const BASE_URL = 'http://localhost:3000';

function log(testNum, title, passed, detail) {
  const symbol = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[Test ${testNum}] ${symbol}: ${title}`);
  if (detail) {
    console.log(`   -> ${detail}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING DELETE & REVERSE POLICY COMPREHENSIVE TEST SUITE');
  console.log('===============================================================\n');

  let allPassed = true;

  // -------------------------------------------------------------
  // TEST 1: Customer with no transactions -> deletion allowed
  // -------------------------------------------------------------
  try {
    const custId = `test_cust_clean_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, shop_name, phone, address, credit_limit, balance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(custId, 'Clean Test Customer', 'Clean Shop', '03001234567', 'Clean Street', 10000, 0);

    const res = await fetch(`${BASE_URL}/api/customers/${custId}`, {
      method: 'DELETE',
    });
    const data = await res.json();

    const exists = db.prepare(`SELECT id FROM customers WHERE id = ?`).get(custId);
    const passed = res.status === 200 && data.success === true && !exists;
    if (!passed) allPassed = false;
    log(1, 'Customer with NO transactions -> Deletion allowed', passed, `Status: ${res.status}, Success: ${data.success}, Deleted from DB: ${!exists}`);
  } catch (err) {
    allPassed = false;
    log(1, 'Customer with NO transactions -> Deletion allowed', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 2: Customer with linked transactions -> deletion blocked with detailed message
  // -------------------------------------------------------------
  try {
    const custId = `test_cust_busy_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, shop_name, phone, address, credit_limit, balance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(custId, 'Busy Test Customer', 'Busy Shop', '03007654321', 'Busy Market', 50000, 0);

    // Link a Sales Order and a Payment Received
    const orderId = `so_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO sales_orders (id, order_number, customer_id, order_date, subtotal, grand_total, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 'SO-TEST-001', custId, '2026-09-27', 1500, 1500, 'POSTED');

    const paymentId = `pay_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO customer_payments (id, payment_number, customer_id, payment_date, amount, amount_paisas, payment_method, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, 'CR-TEST-001', custId, '2026-09-27', 1000, 100000, 'CASH', 'POSTED');

    const res = await fetch(`${BASE_URL}/api/customers/${custId}`, {
      method: 'DELETE',
    });
    const data = await res.json();

    const expectedSubstring = 'Cannot delete this customer';
    const hasOrderMention = data.message && (data.message.includes('Sales Order') || data.message.includes('Payment'));
    const passed = res.status === 400 && data.success === false && data.message && data.message.includes(expectedSubstring) && hasOrderMention;
    if (!passed) allPassed = false;
    log(2, 'Customer with LINKED transactions -> Deletion blocked with detailed breakdown', passed, `Status: ${res.status}, Message: "${data.message}"`);

    // Clean up test records
    db.prepare(`DELETE FROM sales_orders WHERE id = ?`).run(orderId);
    db.prepare(`DELETE FROM customer_payments WHERE id = ?`).run(paymentId);
    db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  } catch (err) {
    allPassed = false;
    log(2, 'Customer with LINKED transactions -> Deletion blocked', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 3: Vendor with no transactions -> deletion allowed
  // -------------------------------------------------------------
  try {
    const vendorId = `test_vend_clean_${Date.now()}`;
    db.prepare(`
      INSERT INTO vendors (id, name, company_name, phone, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(vendorId, 'Clean Test Supplier', 'Clean Mills Ltd', '03211112233');

    const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}`, {
      method: 'DELETE',
    });
    const data = await res.json();

    const exists = db.prepare(`SELECT id FROM vendors WHERE id = ?`).get(vendorId);
    const passed = res.status === 200 && data.success === true && !exists;
    if (!passed) allPassed = false;
    log(3, 'Vendor with NO transactions -> Deletion allowed', passed, `Status: ${res.status}, Success: ${data.success}, Deleted from DB: ${!exists}`);
  } catch (err) {
    allPassed = false;
    log(3, 'Vendor with NO transactions -> Deletion allowed', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 4: Vendor with linked transactions -> deletion blocked with detailed message
  // -------------------------------------------------------------
  try {
    const vendorId = `test_vend_busy_${Date.now()}`;
    db.prepare(`
      INSERT INTO vendors (id, name, company_name, phone, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(vendorId, 'Busy Test Supplier', 'Busy Mills Ltd', '03219998877');

    // Link a Purchase Bill and a Payment Made
    const billId = `bill_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO purchase_bills (id, bill_number, vendor_id, bill_date, vendor_invoice_number, net_amount, remaining_balance, payment_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(billId, 'PB-TEST-001', vendorId, '2026-09-27', 'VINV-001', 5000, 5000, 'UNPAID', 'POSTED');

    const paymentMadeId = `pm_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO vendor_payments (id, payment_number, vendor_id, account_id, payment_date, amount, amount_paisas, payment_method, status)
      VALUES (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1010' LIMIT 1), ?, ?, ?, ?, ?)
    `).run(paymentMadeId, 'PV-TEST-001', vendorId, '2026-09-27', 2500, 250000, 'CASH', 'POSTED');

    const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}`, {
      method: 'DELETE',
    });
    const data = await res.json();

    const expectedSubstring = 'Cannot delete this vendor';
    const hasBillMention = data.message && (data.message.includes('Purchase Bill') || data.message.includes('Payment'));
    const passed = res.status === 400 && data.success === false && data.message && data.message.includes(expectedSubstring) && hasBillMention;
    if (!passed) allPassed = false;
    log(4, 'Vendor with LINKED transactions -> Deletion blocked with detailed breakdown', passed, `Status: ${res.status}, Message: "${data.message}"`);

    // Clean up test records
    db.prepare(`DELETE FROM purchase_bills WHERE id = ?`).run(billId);
    db.prepare(`DELETE FROM vendor_payments WHERE id = ?`).run(paymentMadeId);
    db.prepare(`DELETE FROM vendors WHERE id = ?`).run(vendorId);
  } catch (err) {
    allPassed = false;
    log(4, 'Vendor with LINKED transactions -> Deletion blocked', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 5: Normal user BEFORE Day Close -> Delete & Reverse allowed
  // -------------------------------------------------------------
  try {
    const openDate = '2026-09-25';
    // Ensure daily_closings is NOT closed for openDate
    db.prepare(`DELETE FROM daily_closings WHERE closing_date = ?`).run(openDate);

    // Create an Expense voucher on openDate
    const expenseId = `exp_test_open_${Date.now()}`;
    const voucherNo = `EXP-TEST-OPEN-${Date.now().toString().slice(-4)}`;
    
    // Create mock journal entry and lines for this expense
    const journalId = `je_test_open_${Date.now()}`;
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')
    `).run(journalId, `JV-${voucherNo}`, openDate, 'Test Open Day Expense', 'expenses', expenseId, 120000, 1200);

    db.prepare(`
      INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit)
      VALUES (?, ?, (SELECT id FROM chart_of_accounts WHERE code = '5010' LIMIT 1), 120000, 0, 1200, 0),
             (?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1010' LIMIT 1), 0, 120000, 0, 1200)
    `).run(`${journalId}_1`, journalId, `${journalId}_2`, journalId);

    db.prepare(`
      INSERT INTO expenses (id, voucher_number, expense_date, expense_account_id, paid_from_account_id, amount_paisas, amount, description, journal_entry_id, status)
      VALUES (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '5010' LIMIT 1), (SELECT id FROM chart_of_accounts WHERE code = '1010' LIMIT 1), ?, ?, ?, ?, 'POSTED')
    `).run(expenseId, voucherNo, openDate, 120000, 1200, 'Test Open Day Expense', journalId);

    // Call DELETE as normal user (no admin headers)
    const res = await fetch(`${BASE_URL}/api/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': 'SALES_OFFICER',
      },
    });
    const data = await res.json();

    const expenseExists = db.prepare(`SELECT id FROM expenses WHERE id = ?`).get(expenseId);
    const journalExists = db.prepare(`SELECT id FROM journal_entries WHERE id = ?`).get(journalId);
    const linesCount = db.prepare(`SELECT COUNT(*) as c FROM journal_lines WHERE journal_id = ?`).get(journalId).c;

    const passed = res.status === 200 && data.success === true && !expenseExists && !journalExists && linesCount === 0;
    if (!passed) allPassed = false;
    log(5, 'Normal user BEFORE Day Close -> Delete & Reverse allowed and full reversal verified', passed, `Status: ${res.status}, Voucher deleted: ${!expenseExists}, GL entry & lines deleted: ${!journalExists && linesCount === 0}`);
  } catch (err) {
    allPassed = false;
    log(5, 'Normal user BEFORE Day Close', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 6: Normal user AFTER Day Close -> Blocked with exact message
  // -------------------------------------------------------------
  const closedDate = '2026-09-15';
  let closedExpenseId = `exp_test_closed_${Date.now()}`;
  let closedJournalId = `je_test_closed_${Date.now()}`;
  let closedVoucherNo = `EXP-TEST-CLOSED-${Date.now().toString().slice(-4)}`;

  try {
    // Mark closedDate as CLOSED in daily_closings
    db.prepare(`DELETE FROM daily_closings WHERE closing_date = ?`).run(closedDate);
    db.prepare(`
      INSERT INTO daily_closings (id, closing_date, status, closed_at, closed_by)
      VALUES (?, ?, 'CLOSED', datetime('now'), 'Admin Cashier')
    `).run(`close_${closedDate}`, closedDate);

    // Create an Expense on closedDate
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, source_document_id, total_amount_paisas, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')
    `).run(closedJournalId, `JV-${closedVoucherNo}`, closedDate, 'Test Closed Day Expense', 'expenses', closedExpenseId, 300000, 3000);

    db.prepare(`
      INSERT INTO journal_lines (id, journal_id, account_id, debit_paisas, credit_paisas, debit, credit)
      VALUES (?, ?, (SELECT id FROM chart_of_accounts WHERE code = '5010' LIMIT 1), 300000, 0, 3000, 0),
             (?, ?, (SELECT id FROM chart_of_accounts WHERE code = '1010' LIMIT 1), 0, 300000, 0, 3000)
    `).run(`${closedJournalId}_1`, closedJournalId, `${closedJournalId}_2`, closedJournalId);

    db.prepare(`
      INSERT INTO expenses (id, voucher_number, expense_date, expense_account_id, paid_from_account_id, amount_paisas, amount, description, journal_entry_id, status)
      VALUES (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE code = '5010' LIMIT 1), (SELECT id FROM chart_of_accounts WHERE code = '1010' LIMIT 1), ?, ?, ?, ?, 'POSTED')
    `).run(closedExpenseId, closedVoucherNo, closedDate, 300000, 3000, 'Test Closed Day Expense', closedJournalId);

    // Attempt DELETE as normal user (no admin pin)
    const res = await fetch(`${BASE_URL}/api/expenses/${closedExpenseId}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': 'SALES_OFFICER',
      },
    });
    const data = await res.json();

    const expectedMsg = 'This transaction belongs to a closed day and can only be deleted by an Administrator.';
    const passed = (res.status === 403 || res.status === 400) && data.success === false && data.message === expectedMsg;
    if (!passed) allPassed = false;
    log(6, 'Normal user AFTER Day Close -> Blocked with exact message', passed, `Status: ${res.status}, Message: "${data.message}"`);
  } catch (err) {
    allPassed = false;
    log(6, 'Normal user AFTER Day Close', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 7: Admin AFTER Day Close -> Requires reason & logs in audit_logs
  // -------------------------------------------------------------
  try {
    // Sub-test 7A: Admin attempts delete WITHOUT reason -> Blocked
    const resNoReason = await fetch(`${BASE_URL}/api/expenses/${closedExpenseId}`, {
      method: 'DELETE',
      headers: {
        'x-admin-pin': '1234',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({}),
    });
    const dataNoReason = await resNoReason.json();
    const reasonRequiredMsg = 'A deletion reason is required for administrative override on a closed day.';
    const subPassedA = resNoReason.status === 400 && dataNoReason.message === reasonRequiredMsg;

    // Sub-test 7B: Admin attempts delete WITH reason -> Succeeds, fully reverses, logs to audit_logs
    const overrideReason = 'Audited month-end duplicate correction by Management';
    const resWithReason = await fetch(`${BASE_URL}/api/expenses/${closedExpenseId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': '1234',
        'x-user-role': 'ADMIN',
        'x-delete-reason': overrideReason,
      },
      body: JSON.stringify({
        reason: overrideReason,
        adminPin: '1234',
        userRole: 'ADMIN',
      }),
    });
    const dataWithReason = await resWithReason.json();

    const expenseExists = db.prepare(`SELECT id FROM expenses WHERE id = ?`).get(closedExpenseId);
    const journalExists = db.prepare(`SELECT id FROM journal_entries WHERE id = ?`).get(closedJournalId);
    const linesCount = db.prepare(`SELECT COUNT(*) as c FROM journal_lines WHERE journal_id = ?`).get(closedJournalId).c;

    // Check audit_logs
    const auditRecord = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE transaction_id = ?
    `).get(closedExpenseId);

    const auditPassed = auditRecord && 
      auditRecord.reason === overrideReason && 
      auditRecord.transaction_date === closedDate &&
      auditRecord.transaction_number === closedVoucherNo &&
      auditRecord.is_day_closed === 1;

    const passed = subPassedA && 
                   resWithReason.status === 200 && 
                   dataWithReason.success === true && 
                   !expenseExists && 
                   !journalExists && 
                   linesCount === 0 && 
                   auditPassed;

    if (!passed) allPassed = false;
    log(7, 'Admin AFTER Day Close -> Reason mandatory, deletion & full reversal executed, audit logged', passed, 
      `Without reason blocked: ${subPassedA}, With reason success: ${dataWithReason.success}, Reversal verified: ${!expenseExists && !journalExists}, Audit record logged: ${!!auditRecord}`);

    // Clean up test day closing
    db.prepare(`DELETE FROM daily_closings WHERE closing_date = ?`).run(closedDate);
  } catch (err) {
    allPassed = false;
    log(7, 'Admin AFTER Day Close', false, err.message);
  }

  console.log('\n===============================================================');
  if (allPassed) {
    console.log('🎉 ALL 7 TESTS PASSED PERFECTLY!');
  } else {
    console.log('⚠️ SOME TESTS FAILED. CHECK OUTPUT ABOVE.');
  }
  console.log('===============================================================');
}

runTests().catch(console.error);
