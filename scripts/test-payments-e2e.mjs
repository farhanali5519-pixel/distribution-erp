import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

async function runTests() {
  console.log('--- Starting Payments Modules E2E Test ---');

  // 1. Fetch Customers and CoA
  const custRes = await fetch('http://localhost:3000/api/customers').then(r => r.json());
  const coaRes = await fetch('http://localhost:3000/api/accounting/coa').then(r => r.json());

  if (!custRes.customers || custRes.customers.length === 0) {
    throw new Error('No customers found in database');
  }

  const customer = custRes.customers[0];
  const cashAccount = coaRes.accounts.find(a => a.code === '1010');
  console.log(`Testing Customer: ${customer.name} (${customer.id})`);
  console.log(`Cash Account: ${cashAccount.name} (${cashAccount.id})`);

  // 2. Fetch customer invoices
  const invRes = await fetch(`http://localhost:3000/api/payments/received/invoices?customerId=${customer.id}`).then(r => r.json());
  console.log(`Customer outstanding invoices count: ${invRes.count}, total: ${invRes.totalOutstanding}`);

  // 3. Record Payment Received (test On-Account or partial allocation)
  let allocations = [];
  if (invRes.invoices && invRes.invoices.length > 0) {
    const inv = invRes.invoices[0];
    allocations.push({
      invoiceId: inv.id,
      invoiceType: inv.invoiceType,
      allocatedAmount: Math.min(inv.remainingBalance, 100),
    });
  }

  const payPayload = {
    customerId: customer.id,
    accountId: cashAccount.id,
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 500,
    paymentMethod: 'CASH',
    referenceNo: 'TEST-REC-001',
    notes: 'E2E Automated test payment receipt',
    allocations,
  };

  const recRes = await fetch('http://localhost:3000/api/payments/received', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payPayload)
  }).then(r => r.json());

  if (!recRes.success) {
    throw new Error(`Failed to record payment received: ${recRes.message}`);
  }

  const payment = recRes.payment;
  console.log(`Payment Received Recorded: ${payment.payment_number}, ID: ${payment.id}, Amount: ${payment.amount}`);

  // 4. View Payment Received
  const viewRes = await fetch(`http://localhost:3000/api/payments/received/${payment.id}`).then(r => r.json());
  if (!viewRes.success) {
    throw new Error(`Failed to view payment: ${viewRes.message}`);
  }
  console.log(`View Payment Loaded: ${viewRes.payment.payment_number}, Status: ${viewRes.payment.status}, Allocations: ${viewRes.payment.allocations?.length}`);

  // 5. Void Payment Received
  const voidRes = await fetch(`http://localhost:3000/api/payments/received/${payment.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'void', reason: 'Automated test cleanup' })
  }).then(r => r.json());

  if (!voidRes.success) {
    throw new Error(`Failed to void payment: ${voidRes.message}`);
  }
  console.log(`Payment Receipt Successfully Voided: Reversal ID ${voidRes.reversalEntryId}`);

  // 6. Test Vendor Payment Made
  // Check if vendors exist or create a mock vendor
  let vRes = await fetch('http://localhost:3000/api/vendors').then(r => r.json());
  let vendor = vRes.vendors && vRes.vendors.length > 0 ? vRes.vendors[0] : null;

  if (!vendor) {
    console.log('Creating a test vendor for Payment Made testing...');
    const createV = await fetch('http://localhost:3000/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha Traders (Supplier)', company_name: 'Alpha Ltd' })
    }).then(r => r.json());
    vendor = createV.vendor;
  }

  console.log(`Testing Vendor: ${vendor.name} (${vendor.id})`);

  // Check vendor bills
  const billsRes = await fetch(`http://localhost:3000/api/payments/made/bills?vendorId=${vendor.id}`).then(r => r.json());
  console.log(`Vendor outstanding bills: ${billsRes.count}, total: ${billsRes.totalOutstanding}`);

  // Record Payment Made (On-Account advance)
  const payMadePayload = {
    vendorId: vendor.id,
    accountId: cashAccount.id,
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 1500,
    paymentMethod: 'BANK_TRANSFER',
    referenceNo: 'TX-BNK-9901',
    notes: 'Advance supplier disbursement test',
    allocations: []
  };

  const madeRes = await fetch('http://localhost:3000/api/payments/made', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payMadePayload)
  }).then(r => r.json());

  if (!madeRes.success) {
    throw new Error(`Failed to record payment made: ${madeRes.message}`);
  }

  const voucher = madeRes.payment;
  console.log(`Payment Made Voucher Recorded: ${voucher.voucher_number}, ID: ${voucher.id}, Amount: ${voucher.amount}`);

  // View Voucher
  const viewVoucherRes = await fetch(`http://localhost:3000/api/payments/made/${voucher.id}`).then(r => r.json());
  if (!viewVoucherRes.success) {
    throw new Error(`Failed to view payment voucher: ${viewVoucherRes.message}`);
  }
  console.log(`View Voucher Loaded: ${viewVoucherRes.payment.voucher_number}, Status: ${viewVoucherRes.payment.status}`);

  // Void Voucher
  const voidVoucherRes = await fetch(`http://localhost:3000/api/payments/made/${voucher.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'void', reason: 'Automated test cleanup' })
  }).then(r => r.json());

  if (!voidVoucherRes.success) {
    throw new Error(`Failed to void payment voucher: ${voidVoucherRes.message}`);
  }
  console.log(`Payment Voucher Successfully Voided: Reversal ID ${voidVoucherRes.reversalEntryId}`);

  console.log('--- ALL E2E TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('E2E TEST ERROR:', err);
  process.exit(1);
});
