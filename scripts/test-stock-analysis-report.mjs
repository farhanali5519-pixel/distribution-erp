import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3001/api/reports/stock-analysis';

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
  console.log('STOCK & BOOKING ANALYSIS REPORT TEST SUITE');
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
    assert(Array.isArray(dimRes.data?.supplyPersons), 'Dimensions has supplyPersons array');
    assert(Array.isArray(dimRes.data?.salesmen), 'Dimensions has salesmen array');
    assert(Array.isArray(dimRes.data?.orderBookers), 'Dimensions has orderBookers array');
    assert(Array.isArray(dimRes.data?.customers), 'Dimensions has customers array');
    assert(Array.isArray(dimRes.data?.routes), 'Dimensions has routes array');
    assert(Array.isArray(dimRes.data?.products), 'Dimensions has products array');
    assert(Array.isArray(dimRes.data?.categories), 'Dimensions has categories array');
    assert(Array.isArray(dimRes.data?.brands), 'Dimensions has brands array');
    assert(Array.isArray(dimRes.data?.companies), 'Dimensions has companies array');
    assert(Array.isArray(dimRes.data?.sources), 'Dimensions has sources array');
    assert(Array.isArray(dimRes.data?.statuses), 'Dimensions has statuses array');
    assert(Array.isArray(dimRes.data?.warehouses), 'Dimensions has warehouses array');

    const supplyPersons = dimRes.data?.supplyPersons || [];
    const salesmen = dimRes.data?.salesmen || [];
    const customers = dimRes.data?.customers || [];
    const routes = dimRes.data?.routes || [];
    const products = dimRes.data?.products || [];

    console.log(`    Found: ${supplyPersons.length} supply men, ${salesmen.length} salesmen, ${customers.length} customers, ${routes.length} routes, ${products.length} products`);

    // TEST 2: Base Detailed Report & Reconciliation (868 Total Booked = 2 Issued + 866 Pending)
    console.log('\nTest 2: Detailed Stock Report Execution & Canonical PCS Reconciliation');
    const baseRep = await fetchReport({ viewBy: 'detailed' });
    assert(baseRep.success === true, 'Detailed report returned success');
    const kpis = baseRep.data?.kpis;
    assert(typeof kpis?.totalBookedPcs === 'number', 'KPI totalBookedPcs is number');
    assert(typeof kpis?.totalAllocatedPcs === 'number', 'KPI totalAllocatedPcs is number');
    assert(typeof kpis?.totalIssuedPcs === 'number', 'KPI totalIssuedPcs is number');
    assert(typeof kpis?.totalPendingPcs === 'number', 'KPI totalPendingPcs is number');

    const expectedBooked = kpis.totalBookedPcs;
    const expectedIssued = kpis.totalIssuedPcs;
    const expectedPending = kpis.totalPendingPcs;
    const expectedAllocated = kpis.totalAllocatedPcs;

    console.log(`    Base Totals: Booked=${expectedBooked}, Allocated=${expectedAllocated}, Issued=${expectedIssued}, Pending=${expectedPending}`);
    assert(expectedBooked === expectedIssued + expectedPending, 'Canonical Equation: Booked PCS = Issued PCS + Pending PCS');
    assert(expectedBooked === 868, 'Expected 868 Total Booked PCS in active database');
    assert(expectedIssued === 2, 'Expected 2 Issued PCS from converted orders');
    assert(expectedPending === 866, 'Expected 866 Pending PCS from unconverted orders');

    // TEST 3: All 12 View By Groupings & Strict Cross-View Reconciliation
    console.log('\nTest 3: All 12 View By Groupings & Strict Totals Reconciliation');
    const viewByOptions = [
      'detailed',
      'supply_man',
      'salesman',
      'order_booker',
      'customer',
      'order',
      'item',
      'route',
      'brand',
      'company',
      'category',
      'warehouse',
    ];

    for (const view of viewByOptions) {
      const rep = await fetchReport({ viewBy: view });
      assert(rep.success === true, `View '${view}' returned success: true`);
      const gt = rep.data?.grandTotal;
      assert(gt.bookedPcs === expectedBooked, `View '${view}' Grand Total Booked PCS (${gt.bookedPcs}) equals Detailed (${expectedBooked})`);
      assert(gt.issuedPcs === expectedIssued, `View '${view}' Grand Total Issued PCS (${gt.issuedPcs}) equals Detailed (${expectedIssued})`);
      assert(gt.pendingPcs === expectedPending, `View '${view}' Grand Total Pending PCS (${gt.pendingPcs}) equals Detailed (${expectedPending})`);
      assert(gt.allocatedPcs === expectedAllocated, `View '${view}' Grand Total Allocated PCS (${gt.allocatedPcs}) equals Detailed (${expectedAllocated})`);
    }

    // TEST 4: Stock View Modes
    console.log('\nTest 4: Stock View Modes');
    const stockViewModes = ['all', 'physical', 'booked', 'allocated', 'available'];
    for (const sv of stockViewModes) {
      const rep = await fetchReport({ viewBy: 'item', stockView: sv });
      assert(rep.success === true, `Stock View mode '${sv}' returned success: true`);
      assert(Array.isArray(rep.data?.groupedRows), `Stock View '${sv}' returned groupedRows array`);
    }

    // TEST 5: Supply Man Filter & Drill-down
    console.log('\nTest 5: Supply Man Filter & Grouping Drill-Down');
    if (supplyPersons.length > 0) {
      const firstSM = supplyPersons[0].id;
      const smRep = await fetchReport({ viewBy: 'supply_man', supplyPersonId: firstSM });
      assert(smRep.success === true, 'Supply Man filter returned success: true');
      const rows = smRep.data?.groupedRows || [];
      assert(rows.every(r => r.groupKey === firstSM || r.groupKey === 'unassigned'), 'Filtered rows match selected supply man');

      // Test multi-select OR within supply men
      if (supplyPersons.length > 1) {
        const smList = [supplyPersons[0].id, supplyPersons[1].id];
        const smMultiRep = await fetchReport({ viewBy: 'supply_man', supplyPersonId: smList });
        assert(smMultiRep.success === true, 'Multi-select supply men filter returned success: true');
      }
    }

    // TEST 6: Customer / Shop Filter & Drill-down
    console.log('\nTest 6: Customer / Shop Wise & Filter');
    if (customers.length > 0) {
      const firstCust = customers[0].id;
      const custRep = await fetchReport({ viewBy: 'customer', customerId: firstCust });
      assert(custRep.success === true, 'Customer filter returned success: true');
      const cRows = custRep.data?.groupedRows || [];
      assert(cRows.every(r => r.groupId === firstCust || r.groupKey === firstCust), 'Filtered rows match selected customer');
    }

    // TEST 7: Order Wise & Drill-Down Items Breakdown
    console.log('\nTest 7: Order Wise & Item-Level Drill-Down Structure');
    const orderRep = await fetchReport({ viewBy: 'order' });
    assert(orderRep.success === true, 'Order Wise returned success: true');
    const orderRows = orderRep.data?.groupedRows || [];
    assert(orderRows.length > 0, 'Order Wise returned order rows');
    const firstOrder = orderRows[0];
    assert(Array.isArray(firstOrder.items), 'Order row has items array for drill down');
    assert(firstOrder.items.length > 0, 'Order row contains child items');
    assert(firstOrder.items[0].sku !== undefined, 'Child item has sku field');
    assert(firstOrder.items[0].productName !== undefined, 'Child item has productName field');
    assert(firstOrder.items[0].totalPcs !== undefined, 'Child item has totalPcs field');
    assert(firstOrder.items[0].orderStatus !== undefined, 'Child item has orderStatus field');

    // TEST 8: Route, Salesman, and Booker Filters
    console.log('\nTest 8: Route, Salesman, and Booker Filters');
    if (routes.length > 0) {
      const rRep = await fetchReport({ viewBy: 'route', routeId: routes[0].id });
      assert(rRep.success === true, 'Route filter returned success: true');
    }
    if (salesmen.length > 0) {
      const sRep = await fetchReport({ viewBy: 'salesman', salesmanId: salesmen[0].id });
      assert(sRep.success === true, 'Salesman filter returned success: true');
    }

    // TEST 9: Brand, Company, Category Filters
    console.log('\nTest 9: Brand, Company, and Category Filters');
    const categories = dimRes.data?.categories || [];
    if (categories.length > 0) {
      const catRep = await fetchReport({ viewBy: 'category', categoryId: categories[0].id });
      assert(catRep.success === true, 'Category filter returned success: true');
    }

    // TEST 10: Combined Filters (AND across dimensions, OR within dimensions)
    console.log('\nTest 10: Combined Multi-Dimension Filters (AND logic)');
    const allDetRep = await fetchReport({ viewBy: 'detailed' });
    const sampleRows = allDetRep.data?.detailedRows || [];
    const rowWithBoth = sampleRows.find(r => r.supplyPersonId && r.routeId);
    if (rowWithBoth) {
      const combRep = await fetchReport({
        viewBy: 'detailed',
        supplyPersonId: rowWithBoth.supplyPersonId,
        routeId: rowWithBoth.routeId,
      });
      assert(combRep.success === true, 'Combined filter query succeeded');
      const combRows = combRep.data?.detailedRows || [];
      assert(combRows.length > 0, 'Found rows matching combined filter');
      for (const r of combRows) {
        assert(r.supplyPersonId === rowWithBoth.supplyPersonId, 'Row matches filtered supply man');
        assert(r.routeId === rowWithBoth.routeId, 'Row matches filtered route');
      }
    }

    // TEST 11: 3-Tier Packaging Conversion Accuracy
    console.log('\nTest 11: 3-Tier Packaging Conversion Accuracy');
    assert(sampleRows.length > 0, 'Detailed rows present');
    for (const row of sampleRows.slice(0, 5)) {
      const conv = row.piecesPerCarton || 120;
      const bSize = row.piecesPerBox || 10;
      const totalPcs = row.totalBookedPcs;
      const expCtn = Math.floor(totalPcs / conv);
      const expBox = Math.floor((totalPcs % conv) / bSize);
      const expLoose = (totalPcs % conv) % bSize;
      assert(
        row.bookedCartons === expCtn && row.bookedBoxes === expBox && row.bookedLoosePieces === expLoose,
        `Packaging math verified for ${row.productName}: ${totalPcs} PCS = ${expCtn} CTN + ${expBox} BOX + ${expLoose} PCS`
      );
    }

    // TEST 12: Server-Side Pagination
    console.log('\nTest 12: Server-Side Pagination');
    const pageRep = await fetchReport({ viewBy: 'detailed', page: 1, pageSize: 5 });
    assert(pageRep.success === true, 'Pagination request returned success');
    assert(pageRep.data?.detailedRows?.length === 5, 'Page 1 returned exact requested pageSize of 5');
    assert(pageRep.data?.pagination?.page === 1, 'Pagination current page is 1');
    assert(pageRep.data?.pagination?.pageSize === 5, 'Pagination page size is 5');
    assert(pageRep.data?.pagination?.totalPages >= 1, 'Pagination total pages calculated correctly');

    // TEST 13: Cancelled / Void Order Exclusion
    console.log('\nTest 13: Cancelled / Void Order Exclusion');
    // Querying with non-cancelled orders should not contain CANCELLED status
    assert(sampleRows.every(r => r.orderStatus !== 'CANCELLED' && r.orderStatus !== 'VOID'), 'No cancelled/void orders in active bookings');

    // SUMMARY
    console.log('\n====================================================');
    console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test execution error:', err);
    process.exit(1);
  }
}

runTests();
