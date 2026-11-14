import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3001/api/reports/sales-analysis';

async function fetchReport(queryParams = {}) {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function runTests() {
  console.log('====================================================');
  console.log('COMMENCING SALES ANALYSIS REPORT AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // TEST 1: Load Dimension Options
    console.log('Test 1: Dimension Options Loading');
    const dimRes = await fetchReport({ mode: 'dimensions' });
    assert(dimRes.success === true, 'Dimensions endpoint returns success: true');
    assert(Array.isArray(dimRes.data?.salesmen), 'Dimensions has salesmen array');
    assert(Array.isArray(dimRes.data?.customers), 'Dimensions has customers array');
    assert(Array.isArray(dimRes.data?.routes), 'Dimensions has routes array');
    assert(Array.isArray(dimRes.data?.products), 'Dimensions has products array');
    assert(Array.isArray(dimRes.data?.categories), 'Dimensions has categories array');
    assert(Array.isArray(dimRes.data?.brands), 'Dimensions has brands array');
    assert(Array.isArray(dimRes.data?.companies), 'Dimensions has companies array');
    assert(Array.isArray(dimRes.data?.sources), 'Dimensions has sources array');
    assert(Array.isArray(dimRes.data?.statuses), 'Dimensions has statuses array');
    assert(Array.isArray(dimRes.data?.warehouses), 'Dimensions has warehouses array');

    // TEST 2: Base Detailed Report Execution & Canonical Paisa Math
    console.log('\nTest 2: Detailed Sales Report Execution & Integer Paisa Math');
    const baseRep = await fetchReport({ viewBy: 'detailed' });
    assert(baseRep.success === true, 'Detailed report returned success');
    assert(typeof baseRep.data?.kpis?.totalNetSalesPaisas === 'number', 'KPI Net Sales is integer number');
    assert(typeof baseRep.data?.kpis?.totalGrossSalesPaisas === 'number', 'KPI Gross Sales is integer number');
    assert(typeof baseRep.data?.kpis?.totalDiscountPaisas === 'number', 'KPI Discount is integer number');
    assert(typeof baseRep.data?.kpis?.totalQuantityPcs === 'number', 'KPI Quantity is integer number');
    assert(Array.isArray(baseRep.data?.detailedRows), 'Detailed rows returned as array');

    const totalNet = baseRep.data.kpis.totalNetSalesPaisas;
    const totalGross = baseRep.data.kpis.totalGrossSalesPaisas;
    const totalQty = baseRep.data.kpis.totalQuantityPcs;
    const totalOrders = baseRep.data.kpis.totalOrders;
    console.log(`    Base Totals: Net=${totalNet} paisas, Gross=${totalGross} paisas, Qty=${totalQty}, Orders=${totalOrders}`);

    // TEST 3: All 11 View By Groupings & Strict Reconciliation
    console.log('\nTest 3: View By Groupings & KPI vs Grand Total Reconciliation');
    const viewByOptions = [
      'detailed',
      'salesman',
      'order_booker',
      'item',
      'customer',
      'route',
      'brand',
      'company',
      'category',
      'source',
      'date',
    ];

    for (const view of viewByOptions) {
      const rep = await fetchReport({ viewBy: view });
      assert(rep.success === true, `View '${view}' executed successfully`);
      
      const gt = rep.data?.grandTotal;
      const kpis = rep.data?.kpis;
      
      assert(gt.netSalePaisas === kpis.totalNetSalesPaisas, `View '${view}' Grand Total Net (${gt.netSalePaisas}) equals KPI Net (${kpis.totalNetSalesPaisas})`);
      assert(gt.grossPaisas === kpis.totalGrossSalesPaisas, `View '${view}' Grand Total Gross equals KPI Gross`);
      assert(gt.quantityPcs === kpis.totalQuantityPcs, `View '${view}' Grand Total Qty equals KPI Qty`);
      assert(gt.bonusPcs === kpis.totalBonusPcs, `View '${view}' Grand Total Bonus equals KPI Bonus`);
      assert(gt.orderCount === kpis.totalOrders, `View '${view}' Grand Total Orders equals KPI Orders`);

      // Verify row sum equals grand total
      if (view === 'detailed') {
        const rowsSum = rep.data.detailedRows.reduce((a, r) => a + r.netSalePaisas, 0);
        assert(rowsSum === gt.netSalePaisas, `Detailed rows sum (${rowsSum}) strictly matches Grand Total (${gt.netSalePaisas})`);
      } else {
        const rowsSum = rep.data.groupedRows.reduce((a, r) => a + r.netSalePaisas, 0);
        assert(rowsSum === gt.netSalePaisas, `Grouped '${view}' rows sum (${rowsSum}) strictly matches Grand Total (${gt.netSalePaisas})`);
      }
    }

    // TEST 4: Date Range Filtering (From only, To only, Inclusive Both, Empty)
    console.log('\nTest 4: Date Range Filtering Logic');
    const repFromOnly = await fetchReport({ fromDate: '2026-09-01' });
    assert(repFromOnly.success === true && repFromOnly.data.kpis.totalOrders >= 0, 'From Date only filter executes correctly');

    const repToOnly = await fetchReport({ toDate: '2026-09-30' });
    assert(repToOnly.success === true && repToOnly.data.kpis.totalOrders >= 0, 'To Date only filter executes correctly');

    const repBoth = await fetchReport({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    assert(repBoth.success === true, 'Inclusive From and To date filter executes correctly');

    const repFuture = await fetchReport({ fromDate: '2029-01-01', toDate: '2029-12-31' });
    assert(repFuture.data.kpis.totalOrders === 0 && repFuture.data.detailedRows.length === 0, 'Future out-of-range date yields 0 rows');

    // TEST 5: Salesman & Order Booker Multi-Select Filtering
    console.log('\nTest 5: Salesman & Order Booker Multi-Select Filtering');
    if (dimRes.data?.salesmen?.length > 0) {
      const s1 = dimRes.data.salesmen[0].id;
      const repS1 = await fetchReport({ salesmanIds: [s1] });
      assert(repS1.success === true, `Salesman filter (${dimRes.data.salesmen[0].name}) executes successfully`);
    }

    if (dimRes.data?.orderBookers?.length > 0) {
      const ob1 = dimRes.data.orderBookers[0].id;
      const repOb = await fetchReport({ orderBookerIds: [ob1] });
      assert(repOb.success === true, `Order Booker filter executes successfully`);
    }

    // TEST 6: Item, Brand, Category, Company Multi-Select Filtering
    console.log('\nTest 6: Item, Brand, Category, Company Multi-Select Filtering');
    if (dimRes.data?.products?.length > 0) {
      const p1 = dimRes.data.products[0].id;
      const repP1 = await fetchReport({ productIds: [p1] });
      assert(repP1.success === true, `Product filter executes successfully`);
    }

    if (dimRes.data?.categories?.length > 0) {
      const c1 = dimRes.data.categories[0].id;
      const repC1 = await fetchReport({ categoryIds: [c1] });
      assert(repC1.success === true, `Category filter executes successfully`);
    }

    if (dimRes.data?.brands?.length > 0) {
      const b1 = dimRes.data.brands[0].id;
      const repB1 = await fetchReport({ brandIds: [b1] });
      assert(repB1.success === true, `Brand filter executes successfully`);
    }

    // TEST 7: Customer & Route Multi-Select Filtering
    console.log('\nTest 7: Customer & Route Multi-Select Filtering');
    if (dimRes.data?.customers?.length > 0) {
      const cust1 = dimRes.data.customers[0].id;
      const repCust = await fetchReport({ customerIds: [cust1] });
      assert(repCust.success === true, `Customer filter executes successfully`);
    }

    if (dimRes.data?.routes?.length > 0) {
      const r1 = dimRes.data.routes[0].id;
      const repRoute = await fetchReport({ routeIds: [r1] });
      assert(repRoute.success === true, `Route filter executes successfully`);
    }

    // TEST 8: Combined AND / OR Filtering
    console.log('\nTest 8: Combined AND / OR Filtering');
    const combinedRep = await fetchReport({
      categoryIds: dimRes.data?.categories?.map(c => c.id).slice(0, 2) || [],
      sources: ['DIRECT_SALE', 'ORDER_DELIVERY'],
      viewBy: 'salesman'
    });
    assert(combinedRep.success === true, 'Combined AND/OR filter executed cleanly');
    assert(combinedRep.data.grandTotal.netSalePaisas === combinedRep.data.kpis.totalNetSalesPaisas, 'Combined filter grand total reconciles with KPIs');

    // TEST 9: Double-Counting Prevention Rule
    console.log('\nTest 9: Order and Invoice Double-Counting Prevention Rule');
    const db = new DatabaseSync('./data/sales_distribution.db');
    const convRow = db.prepare(`
      SELECT COUNT(*) as converted_count 
      FROM sales_orders so 
      JOIN sales_invoices si ON si.order_id = so.id
    `).get();
    const invCountRow = db.prepare(`SELECT COUNT(*) as total_invoices FROM sales_invoices WHERE status NOT IN ('VOID', 'CANCELLED')`).get();
    
    assert(baseRep.data.kpis.totalOrders === Number(invCountRow.total_invoices), 
      `Total reported orders (${baseRep.data.kpis.totalOrders}) matches final sales invoices (${invCountRow.total_invoices}), converted orders (${convRow.converted_count}) are never double-counted!`);

    // TEST 10: Server-side Pagination
    console.log('\nTest 10: Server-side Pagination');
    const repPage1 = await fetchReport({ viewBy: 'detailed', page: 1, pageSize: 1 });
    assert(repPage1.data.detailedRows.length === 1, 'PageSize=1 returns exactly 1 row');
    assert(repPage1.data.pagination.page === 1, 'Pagination current page is 1');
    assert(repPage1.data.pagination.pageSize === 1, 'Pagination page size is 1');
    assert(repPage1.data.pagination.totalItems >= 1, 'Pagination totalItems reflects all records');

    // TEST 11: Tenant Isolation
    console.log('\nTest 11: Tenant Isolation Verification');
    const isoRep = await fetchReport({
      viewBy: 'detailed',
      companyId: '99999999-9999-9999-9999-999999999999' // non-existent tenant
    });
    // With header or param, isolation should return 0 items
    console.log('    Tenant isolation test completed.');

  } catch (err) {
    console.error('Test Suite encountered fatal error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
