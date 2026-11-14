const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

async function runTests() {
  console.log('=== PHASE 8 REPORTS & PROFITABILITY ENGINE VERIFICATION ===\n');

  const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);
  const baseUrl = 'http://localhost:3000';

  // 1. Verify Feature Flags
  console.log('1. Checking Phase 8 Feature Flags in Database...');
  const flags = db.prepare(`SELECT key, value FROM feature_flags WHERE key LIKE 'reports.%'`).all();
  console.log('Found reports flags:', flags);
  if (flags.length < 4) throw new Error('Expected 4 reports feature flags.');
  console.log('✓ Phase 8 feature flags confirmed.\n');

  // 2. Verify HTTP 200 on all UI Pages and API Routes
  console.log('2. Checking HTTP endpoints on running server...');
  const endpoints = [
    '/reports/ledgers',
    '/reports/profit-and-loss',
    '/reports/stock-valuation',
    '/reports/salesman-performance',
    '/api/reports/profit-and-loss',
    '/api/reports/stock-valuation',
    '/api/reports/salesman-performance',
  ];

  for (const ep of endpoints) {
    const res = await fetch(baseUrl + ep);
    console.log(`Endpoint ${ep} -> HTTP ${res.status}`);
    if (res.status !== 200) throw new Error(`Endpoint ${ep} returned status ${res.status}`);
  }
  console.log('✓ All UI pages & API routes returned HTTP 200 OK.\n');

  // 3. Verify Report 1: Party Ledgers (Khata Jaat)
  console.log('3. Testing Report 1: Party Ledgers (Khata Statement)...');
  const custRes = await fetch(`${baseUrl}/api/customers`).then(r => r.json());
  const testCust = custRes.customers[0];

  const ledgerRes = await fetch(`${baseUrl}/api/reports/ledgers?entityType=CUSTOMER&entityId=${testCust.id}`).then(r => r.json());
  if (!ledgerRes.success) throw new Error(`Ledger fetch failed: ${ledgerRes.message}`);

  const stmt = ledgerRes.data;
  console.log(`Party: ${stmt.party.name}, Opening: ${stmt.openingBalance}, Debits: ${stmt.totalDebits}, Credits: ${stmt.totalCredits}, Closing: ${stmt.closingBalance}`);
  console.log(`Voucher Lines Count: ${stmt.lines.length}`);

  // Test Customer Accounting Math: Opening + Debits - Credits = Closing
  const expectedClosing = Math.round((stmt.openingBalance + stmt.totalDebits - stmt.totalCredits) * 100) / 100;
  if (Math.abs(stmt.closingBalance - expectedClosing) > 0.01) {
    throw new Error(`Customer Khata math mismatch: ${stmt.closingBalance} vs expected ${expectedClosing}`);
  }

  // Verify Vendor Khata as well
  const vendRes = await fetch(`${baseUrl}/api/vendors`).then(r => r.json());
  const testVend = vendRes.vendors[0];
  const vendLedgerRes = await fetch(`${baseUrl}/api/reports/ledgers?entityType=VENDOR&entityId=${testVend.id}`).then(r => r.json());
  if (!vendLedgerRes.success) throw new Error(`Vendor ledger fetch failed: ${vendLedgerRes.message}`);
  const vStmt = vendLedgerRes.data;
  console.log(`Vendor: ${vStmt.party.name}, Opening: ${vStmt.openingBalance}, Debits: ${vStmt.totalDebits}, Credits: ${vStmt.totalCredits}, Closing: ${vStmt.closingBalance}`);
  const expectedVendorClosing = Math.round((vStmt.openingBalance + vStmt.totalCredits - vStmt.totalDebits) * 100) / 100;
  if (Math.abs(vStmt.closingBalance - expectedVendorClosing) > 0.01) {
    throw new Error(`Vendor Khata math mismatch: ${vStmt.closingBalance} vs expected ${expectedVendorClosing}`);
  }
  console.log('✓ Party Ledgers (Customer & Vendor) calculation arithmetic verified.\n');

  // 4. Verify Report 2: Profit & Loss (Munaffa)
  console.log('4. Testing Report 2: Profit & Loss Statement (Munaffa)...');
  const pnlRes = await fetch(`${baseUrl}/api/reports/profit-and-loss?fromDate=2020-01-01`).then(r => r.json());
  if (!pnlRes.success) throw new Error(`P&L fetch failed: ${pnlRes.message}`);
  const pnl = pnlRes.data;

  console.log(`Gross Sales: ${pnl.grossSales}`);
  console.log(`Sales Returns: ${pnl.salesReturns}`);
  console.log(`Net Sales: ${pnl.netSales}`);
  console.log(`COGS: ${pnl.costOfGoodsSold}`);
  console.log(`Gross Profit: ${pnl.grossProfit} (${pnl.grossMarginPercentage}%)`);
  console.log(`Total Operating Expenses: ${pnl.totalOperatingExpenses}`);
  console.log(`Net Profit: ${pnl.netProfit} (${pnl.netMarginPercentage}%)`);

  // Verify Trading Math
  const expectedNetSales = Math.round((pnl.grossSales - pnl.salesReturns) * 100) / 100;
  if (Math.abs(pnl.netSales - expectedNetSales) > 0.01) {
    throw new Error(`P&L Net Sales mismatch: ${pnl.netSales} vs ${expectedNetSales}`);
  }
  const expectedGrossProfit = Math.round((pnl.netSales - pnl.costOfGoodsSold) * 100) / 100;
  if (Math.abs(pnl.grossProfit - expectedGrossProfit) > 0.01) {
    throw new Error(`P&L Gross Profit mismatch: ${pnl.grossProfit} vs ${expectedGrossProfit}`);
  }
  const expectedNetProfit = Math.round((pnl.grossProfit - pnl.totalOperatingExpenses) * 100) / 100;
  if (Math.abs(pnl.netProfit - expectedNetProfit) > 0.01) {
    throw new Error(`P&L Net Profit mismatch: ${pnl.netProfit} vs ${expectedNetProfit}`);
  }
  console.log('✓ Profit & Loss Statement arithmetic strictly verified.\n');

  // 5. Verify Report 3: Stock Valuation & Godown Summary
  console.log('5. Testing Report 3: Stock Valuation & Warehouse Audit...');
  const svRes = await fetch(`${baseUrl}/api/reports/stock-valuation`).then(r => r.json());
  if (!svRes.success) throw new Error(`Stock valuation fetch failed: ${svRes.message}`);
  const sv = svRes.data;

  console.log(`Total Products: ${sv.rows.length}`);
  console.log(`Sellable Valuation: ${sv.totalSellableStockValue} (${sv.totalSellablePieces} Pcs)`);
  console.log(`Damaged Quarantine Valuation: ${sv.totalDamagedStockValue} (${sv.totalDamagedPieces} Pcs)`);
  console.log(`Combined Valuation: ${sv.totalCombinedStockValue}`);
  console.log(`GL 1040 Balance: ${sv.glInventoryAccountBalance} (Variance: ${sv.varianceWithGL})`);

  let computedSellable = 0;
  let computedDamaged = 0;
  for (const r of sv.rows) {
    computedSellable += r.sellableStockValue;
    computedDamaged += r.damagedStockValue;
    // Verify 3-tier packaging formula
    const totalPcs = (r.cartonsCount * r.totalPiecesPerCarton) + (r.boxesCount * r.piecesPerBox) + r.piecesCount;
    if (totalPcs !== r.currentStockBase) {
      throw new Error(`Product ${r.sku} packaging breakdown (${totalPcs}) does not match currentStockBase (${r.currentStockBase})`);
    }
  }
  computedSellable = Math.round(computedSellable * 100) / 100;
  computedDamaged = Math.round(computedDamaged * 100) / 100;

  if (Math.abs(sv.totalSellableStockValue - computedSellable) > 0.05) {
    throw new Error(`Stock valuation sum mismatch: ${sv.totalSellableStockValue} vs ${computedSellable}`);
  }
  console.log('✓ Stock Valuation and 3-Tier packaging breakdown confirmed.\n');

  // 6. Verify Report 4: Salesman & Route Recovery Performance
  console.log('6. Testing Report 4: Salesman Performance & Recovery...');
  const spRes = await fetch(`${baseUrl}/api/reports/salesman-performance?fromDate=2020-01-01`).then(r => r.json());
  if (!spRes.success) throw new Error(`Salesman performance fetch failed: ${spRes.message}`);
  const sp = spRes.data;

  console.log(`Total Salesmen Reported: ${sp.salesmen.length}`);
  console.log(`Total Orders: ${sp.totalOrders}`);
  console.log(`Gross Billed: ${sp.totalGrossBilled}`);
  console.log(`Spot Cash: ${sp.totalSpotCash}`);
  console.log(`Credit Issued: ${sp.totalCreditGiven}`);
  console.log(`Recoveries: ${sp.totalRecoveries}`);
  console.log(`Total Cash Handover: ${sp.totalCashHandedOver}`);

  for (const s of sp.salesmen) {
    const expectedHandover = Math.round((s.spotCashCollected + s.routeRecoveriesCollected) * 100) / 100;
    if (Math.abs(s.totalCashHandedOver - expectedHandover) > 0.01) {
      throw new Error(`Salesman ${s.salesmanName} cash handover mismatch: ${s.totalCashHandedOver} vs ${expectedHandover}`);
    }
  }
  console.log('✓ Salesman cash handover and accountability reconciliation confirmed.\n');

  console.log('=== ALL PHASE 8 VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
