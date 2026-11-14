const BASE_URL = 'http://localhost:3000';

async function testEndpoint(url, name, validator) {
  try {
    const res = await fetch(`${BASE_URL}${url}`);
    if (!res.ok) {
      console.error(`[FAIL] ${name} (${url}) -> HTTP ${res.status}`);
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const valid = validator ? validator(data) : true;
      if (valid) {
        console.log(`[PASS] ${name.padEnd(32)} -> OK (${url})`);
        return true;
      } else {
        console.error(`[FAIL] ${name.padEnd(32)} -> Validation Failed (${url}):`, JSON.stringify(data).slice(0, 100));
        return false;
      }
    } else {
      console.log(`[PASS] ${name.padEnd(32)} -> HTTP 200 Page Loaded (${url})`);
      return true;
    }
  } catch (err) {
    console.error(`[FAIL] ${name.padEnd(32)} -> Error (${url}): ${err.message}`);
    return false;
  }
}

async function run() {
  console.log('=====================================================');
  console.log('    VERIFYING FRESH TESTING STATE ACROSS THE ERP     ');
  console.log('=====================================================');

  const tests = [
    // 1. Auth & Admin User
    ['/api/auth/session', 'Auth Session (Admin User)', (d) => d.success && d.defaultUser?.username === 'admin' && d.defaultUser?.role === 'ADMIN'],
    
    // 2. Business Data Endpoints (MUST BE ZERO RECORDS)
    ['/api/customers', 'Customers API', (d) => d.success && Array.isArray(d.customers) && d.customers.length === 0],
    ['/api/vendors', 'Vendors API', (d) => d.success && Array.isArray(d.vendors) && d.vendors.length === 0],
    ['/api/inventory', 'Products/Inventory API', (d) => d.success && Array.isArray(d.products) && d.products.length === 0],
    ['/api/sales/orders', 'Sales Orders API', (d) => d.success && Array.isArray(d.orders) && d.orders.length === 0],
    ['/api/sales', 'Sales Invoices API', (d) => d.success && Array.isArray(d.invoices) && d.invoices.length === 0],
    ['/api/purchase/bills', 'Purchase Bills API', (d) => d.success && Array.isArray(d.bills) && d.bills.length === 0],
    ['/api/sales/collections', 'Route Collections API', (d) => d.success && Array.isArray(d.payments) && d.payments.length === 0],
    ['/api/expenses', 'Expenses API', (d) => d.success && Array.isArray(d.expenses) && d.expenses.length === 0],
    ['/api/accounting/journal', 'General Ledger Journal API', (d) => d.success && Array.isArray(d.entries) && d.entries.length === 0],
    ['/api/accounting/trial-balance', 'Trial Balance API (0 Balance)', (d) => d.success && Array.isArray(d.rows) && d.rows.every(a => a.totalDebit === 0 && a.totalCredit === 0 && a.netBalance === 0)],

    // 3. System Foundations
    ['/api/modules', 'Module Registry API', (d) => d.success && Array.isArray(d.modules) && d.modules.length === 10],
    ['/api/settings/features', 'Feature Flags API', (d) => d.success && Array.isArray(d.flags) && d.flags.length === 33],
    ['/api/settings/company', 'Company Profile API', (d) => d.success && d.profile?.businessName === 'Farhan Distribution'],
    ['/api/backup/list', 'Database Backup List API', (d) => d.success && Array.isArray(d.backups) && d.backups.length >= 1],

    // 4. Frontend Module Pages (All should load 200)
    ['/', 'Page: Executive Overview', null],
    ['/sales/order-booking', 'Page: Order Booking', null],
    ['/sales', 'Page: Orders & Commercial Bills', null],
    ['/sales/direct-sale', 'Page: Direct Van Sale', null],
    ['/sales/returns', 'Page: Customer Sales Returns', null],
    ['/dispatch/load-sheet', 'Page: Route Load Sheet', null],
    ['/customers', 'Page: Customers', null],
    ['/purchase/new-bill', 'Page: New Purchase Bill', null],
    ['/purchase/orders-detail', 'Page: Purchase Bills Detail', null],
    ['/purchase/returns', 'Page: Vendor Purchase Returns', null],
    ['/accounting/coa', 'Page: Chart of Accounts', null],
    ['/accounting/journal', 'Page: General Ledger & Journals', null],
    ['/accounting/trial-balance', 'Page: Trial Balance', null],
    ['/reports/profit-and-loss', 'Page: Profit & Loss Statement', null],
    ['/sales/collections', 'Page: Route Collections', null],
    ['/expenses', 'Page: Daily Expenses', null],
    ['/closing/daily-summary', 'Page: Daily Cash Closing', null],
    ['/reports/salesman-performance', 'Page: Salesman Recovery', null],
    ['/inventory/products', 'Page: Products & Pricing', null],
    ['/reports/stock-valuation', 'Page: Stock Valuation', null],
    ['/reports/ledgers', 'Page: Party Ledgers (Khata)', null],
    ['/settings/users', 'Page: User Management', null],
    ['/modules', 'Page: Module Registry', null],
    ['/settings/features', 'Page: Feature Flags', null],
    ['/settings/company', 'Page: Company Profile', null],
    ['/settings/backup', 'Page: Database Backup', null],
  ];

  let passed = 0;
  for (const [url, name, val] of tests) {
    const ok = await testEndpoint(url, name, val);
    if (ok) passed++;
  }

  console.log('\n=====================================================');
  console.log(`RESULTS: ${passed}/${tests.length} tests passed successfully.`);
  console.log('=====================================================');

  if (passed === tests.length) {
    console.log('>>> ALL MODULES OPERATIONAL IN COMPLETELY FRESH STATE <<<');
  } else {
    process.exit(1);
  }
}

run();
