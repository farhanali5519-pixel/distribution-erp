const routes = [
  '/',
  '/sales',
  '/sales/order-booking',
  '/sales/direct-sale',
  '/sales/collections',
  '/sales/returns',
  '/purchase',
  '/purchase/orders-detail',
  '/purchase/returns',
  '/inventory',
  '/inventory/products',
  '/customers',
  '/dispatch/load-sheet',
  '/expenses',
  '/closing/daily-summary',
  '/accounting/coa',
  '/accounting/journal',
  '/accounting/trial-balance',
  '/reports/ledgers',
  '/reports/profit-and-loss',
  '/reports/salesman-performance',
  '/reports/stock-valuation',
  '/settings/company',
  '/settings/features',
  '/settings/backup',
  '/settings/users',
  '/modules'
];

async function checkRoutes() {
  console.log('Verifying all ' + routes.length + ' application routes...');
  let failed = 0;
  for (const route of routes) {
    try {
      const res = await fetch('http://localhost:3000' + route);
      const html = await res.text();
      const hasError = html.includes('Turbopack error') || html.includes('Unhandled Runtime Error');
      if (res.status === 200 && !hasError) {
        console.log(`[OK] 200: ${route} (size: ${html.length})`);
      } else {
        console.error(`[FAIL] ${res.status}: ${route} - Error in page`);
        failed++;
      }
    } catch (e) {
      console.error(`[ERR] ${route}: ${e.message}`);
      failed++;
    }
  }
  if (failed === 0) {
    console.log('\n>>> SUCCESS: ALL ' + routes.length + ' APPLICATION ROUTES RETURNED 200 OK WITH NO RUNTIME ERRORS! <<<');
  } else {
    console.error(`\n>>> FAILURE: ${failed} routes failed! <<<`);
  }
}

checkRoutes();
