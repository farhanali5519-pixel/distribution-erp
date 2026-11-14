/**
 * SALEFLOW ERP — HIERARCHICAL MODULE OWNERSHIP & HARDENING TEST SUITE
 * 
 * Tests Section 8 Matrix:
 * 1. Sales: field_order_booking ON, direct_sale OFF
 * 2. Reports: profit_loss ON, Accounts: parent ON
 *    - /reports/profit-and-loss allowed only because reports:profit_loss ON
 *    - disabling reports:profit_loss gives 403 even if Accounts parent remains ON
 * 3. Inventory parent ON + reports:stock_valuation OFF:
 *    - /reports/stock-valuation must be 403
 * 4. Payments parent ON + reports:salesman_performance OFF:
 *    - /reports/salesman-performance must be 403
 * 5. Parent OFF + child row ON => denied (no child may bypass disabled parent)
 * 6. Legacy parent-only tenant => children inherited ON
 * 7. Canonical route ownership & zero duplicate routes audit
 * 8. Plan presets sanity check
 */

import {
  HIERARCHICAL_MODULES,
  findSubmoduleByRoute,
  findSubmoduleById,
  getAllSubmoduleIds,
  getAllMainModuleIds,
} from '../src/core/registry/hierarchical-module-registry';
import { computeCompanyModuleState } from '../src/core/registry/module-registry';
import { PLAN_CONFIGS } from '../src/core/tenancy/plans';

// Color logging helpers
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(description: string, condition: boolean, extra?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${green('PASS')}: ${description}`);
  } else {
    failedTests++;
    console.error(`  ${red('FAIL')}: ${description} ${extra ? `(${extra})` : ''}`);
  }
}

async function runHardeningTests() {
  console.log(bold('\n==================================================================='));
  console.log(bold('   SALEFLOW ERP — HIERARCHICAL MODULE HARDENING TEST MATRIX         '));
  console.log(bold('===================================================================\n'));

  // -------------------------------------------------------------------------
  // TEST SUITE 1: CANONICAL ROUTE OWNERSHIP & ZERO DUPLICATES
  // -------------------------------------------------------------------------
  console.log(cyan('--- 1. AUDIT DUPLICATE ROUTES & CANONICAL OWNERSHIP ---'));
  
  const allSubIds = getAllSubmoduleIds();
  assert('Registry exposes exactly 37 non-overlapping submodules', allSubIds.length === 37, `Found ${allSubIds.length}`);

  const routeOwners = new Map<string, string[]>();
  for (const mainMod of HIERARCHICAL_MODULES) {
    for (const child of mainMod.children) {
      for (const route of child.routes) {
        if (!routeOwners.has(route)) {
          routeOwners.set(route, []);
        }
        routeOwners.get(route)!.push(child.id);
      }
    }
  }

  let duplicateRoutesFound = 0;
  for (const [route, owners] of routeOwners.entries()) {
    if (owners.length > 1) {
      duplicateRoutesFound++;
      console.error(`  Duplicate route: ${route} owned by ${owners.join(', ')}`);
    }
  }
  assert('Zero duplicate route definitions across all submodules', duplicateRoutesFound === 0, `Duplicates: ${duplicateRoutesFound}`);

  // Test canonical owners for known historical overlaps
  const pnlOwner = findSubmoduleByRoute('/reports/profit-and-loss');
  assert(
    'Canonical owner of /reports/profit-and-loss is reports:profit_loss under Reports main module',
    pnlOwner?.mainModule.id === 'reports' && pnlOwner?.submodule.id === 'reports:profit_loss'
  );

  const stockValOwner = findSubmoduleByRoute('/reports/stock-valuation');
  assert(
    'Canonical owner of /reports/stock-valuation is reports:stock_valuation under Reports main module',
    stockValOwner?.mainModule.id === 'reports' && stockValOwner?.submodule.id === 'reports:stock_valuation'
  );

  const recoveryOwner = findSubmoduleByRoute('/reports/salesman-performance');
  assert(
    'Canonical owner of /reports/salesman-performance is reports:salesman_performance under Reports main module',
    recoveryOwner?.mainModule.id === 'reports' && recoveryOwner?.submodule.id === 'reports:salesman_performance'
  );

  // Exact-match priority over prefix match
  const salesRoot = findSubmoduleByRoute('/sales');
  assert('Exact match /sales maps to sales:orders', salesRoot?.submodule.id === 'sales:orders');

  const salesCollections = findSubmoduleByRoute('/sales/collections');
  assert('Exact match /sales/collections maps to payments:collections', salesCollections?.submodule.id === 'payments:collections');

  const purchaseRoot = findSubmoduleByRoute('/purchase');
  assert('Exact match /purchase maps to purchase:orders_detail', purchaseRoot?.submodule.id === 'purchase:orders_detail');

  const purchaseVendors = findSubmoduleByRoute('/purchase/vendors');
  assert('Exact match /purchase/vendors maps to customers:vendors', purchaseVendors?.submodule.id === 'customers:vendors');


  // -------------------------------------------------------------------------
  // TEST SUITE 2: SALES SUBMODULE GRANULARITY (field_order_booking ON, direct_sale OFF)
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 2. SALES SUBMODULE GRANULARITY (field_order_booking ON, direct_sale OFF) ---'));
  
  const salesConfig = [
    { module_id: 'sales', is_enabled: 1 },
    { module_id: 'sales:field_order_booking', is_enabled: 1 },
    { module_id: 'sales:direct_sale', is_enabled: 0 },
    { module_id: 'sales:orders', is_enabled: 1 },
  ];
  const salesState = computeCompanyModuleState(salesConfig);

  assert('sales parent is enabled', salesState.enabledSet.has('sales'));
  assert('sales:field_order_booking is enabled', salesState.enabledSet.has('sales:field_order_booking'));
  assert('legacy field_order_booking alias is enabled', salesState.enabledSet.has('field_order_booking'));
  assert('sales:direct_sale is blocked (0)', !salesState.enabledSet.has('sales:direct_sale'));
  assert('sales:orders is enabled', salesState.enabledSet.has('sales:orders'));


  // -------------------------------------------------------------------------
  // TEST SUITE 3: REPORTS & ACCOUNTS CROSS-MODULE ISOLATION
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 3. REPORTS & ACCOUNTS CROSS-MODULE ISOLATION ---'));

  // Scenario 3A: Reports ON, reports:profit_loss ON, Accounts ON
  const state3A = computeCompanyModuleState([
    { module_id: 'reports', is_enabled: 1 },
    { module_id: 'reports:profit_loss', is_enabled: 1 },
    { module_id: 'accounts', is_enabled: 1 },
    { module_id: 'accounts:coa', is_enabled: 1 },
  ]);
  assert('3A: /reports/profit-and-loss allowed when reports parent and child ON', state3A.enabledSet.has('reports:profit_loss'));

  // Scenario 3B: Disabling reports:profit_loss gives 403 even if Accounts parent remains ON
  const state3B = computeCompanyModuleState([
    { module_id: 'reports', is_enabled: 1 },
    { module_id: 'reports:profit_loss', is_enabled: 0 },
    { module_id: 'accounts', is_enabled: 1 },
    { module_id: 'accounts:coa', is_enabled: 1 },
  ]);
  assert(
    '3B: Disabling reports:profit_loss gives blocked even if Accounts parent remains ON',
    !state3B.enabledSet.has('reports:profit_loss')
  );

  // Scenario 3C: Reports parent OFF gives blocked even if Accounts parent is ON and child was set to 1
  const state3C = computeCompanyModuleState([
    { module_id: 'reports', is_enabled: 0 },
    { module_id: 'reports:profit_loss', is_enabled: 1 },
    { module_id: 'accounts', is_enabled: 1 },
  ]);
  assert(
    '3C: Reports parent OFF denies reports:profit_loss even if Accounts is ON',
    !state3C.enabledSet.has('reports:profit_loss')
  );


  // -------------------------------------------------------------------------
  // TEST SUITE 4: INVENTORY PARENT ON + reports:stock_valuation OFF
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 4. INVENTORY PARENT ON + reports:stock_valuation OFF ---'));

  const state4 = computeCompanyModuleState([
    { module_id: 'inventory', is_enabled: 1 },
    { module_id: 'inventory:products', is_enabled: 1 },
    { module_id: 'reports', is_enabled: 1 },
    { module_id: 'reports:stock_valuation', is_enabled: 0 },
  ]);
  assert(
    'Inventory parent ON + reports:stock_valuation OFF => reports:stock_valuation is blocked (403)',
    !state4.enabledSet.has('reports:stock_valuation')
  );
  assert(
    'Inventory operational products is enabled',
    state4.enabledSet.has('inventory:products')
  );


  // -------------------------------------------------------------------------
  // TEST SUITE 5: PAYMENTS PARENT ON + reports:salesman_performance OFF
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 5. PAYMENTS PARENT ON + reports:salesman_performance OFF ---'));

  const state5 = computeCompanyModuleState([
    { module_id: 'payments', is_enabled: 1 },
    { module_id: 'payments:received', is_enabled: 1 },
    { module_id: 'reports', is_enabled: 1 },
    { module_id: 'reports:salesman_performance', is_enabled: 0 },
  ]);
  assert(
    'Payments parent ON + reports:salesman_performance OFF => reports:salesman_performance is blocked (403)',
    !state5.enabledSet.has('reports:salesman_performance')
  );
  assert(
    'Payments operational received is enabled',
    state5.enabledSet.has('payments:received')
  );


  // -------------------------------------------------------------------------
  // TEST SUITE 6: STRICT PARENT OFF + CHILD ON => DENIED
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 6. STRICT PARENT OFF + CHILD ON => DENIED ---'));

  const state6 = computeCompanyModuleState([
    { module_id: 'sales', is_enabled: 0 },
    { module_id: 'sales:field_order_booking', is_enabled: 1 },
    { module_id: 'sales:orders', is_enabled: 1 },
    { module_id: 'reports', is_enabled: 0 },
    { module_id: 'reports:profit_loss', is_enabled: 1 },
  ]);
  assert('Sales parent is disabled', !state6.enabledSet.has('sales'));
  assert('Child sales:field_order_booking is DENIED when parent is OFF', !state6.enabledSet.has('sales:field_order_booking'));
  assert('Child sales:orders is DENIED when parent is OFF', !state6.enabledSet.has('sales:orders'));
  assert('Child reports:profit_loss is DENIED when parent reports is OFF', !state6.enabledSet.has('reports:profit_loss'));


  // -------------------------------------------------------------------------
  // TEST SUITE 7: BACKWARD COMPATIBILITY — LEGACY PARENT-ONLY TENANT
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 7. BACKWARD COMPATIBILITY (LEGACY PARENT-ONLY TENANTS) ---'));

  const legacyTenantRows = [
    { module_id: 'sales', is_enabled: 1 },
    { module_id: 'inventory', is_enabled: 1 },
    { module_id: 'purchase', is_enabled: 0 },
    { module_id: 'reports', is_enabled: 1 },
  ];
  const legacyState = computeCompanyModuleState(legacyTenantRows);

  assert('Legacy tenant detected as not having granular records', legacyState.hasGranularSubmodules === false);
  assert('Legacy tenant inherits all children of enabled parent (sales:orders)', legacyState.enabledSet.has('sales:orders'));
  assert('Legacy tenant inherits sales:direct_sale', legacyState.enabledSet.has('sales:direct_sale'));
  assert('Legacy tenant inherits inventory:products', legacyState.enabledSet.has('inventory:products'));
  assert('Legacy tenant inherits reports:profit_loss', legacyState.enabledSet.has('reports:profit_loss'));
  assert('Legacy tenant blocks all children of disabled parent (purchase:new_bill)', !legacyState.enabledSet.has('purchase:new_bill'));
  assert('Legacy tenant blocks purchase:vendor_returns', !legacyState.enabledSet.has('purchase:vendor_returns'));


  // -------------------------------------------------------------------------
  // TEST SUITE 8: PLAN PRESETS SANITY CHECK
  // -------------------------------------------------------------------------
  console.log(cyan('\n--- 8. PLAN PRESETS SANITY CHECK ---'));

  const validSubmoduleIds = new Set(getAllSubmoduleIds());
  for (const [planKey, planConfig] of Object.entries(PLAN_CONFIGS)) {
    let invalidCount = 0;
    for (const subId of planConfig.submodules) {
      if (!validSubmoduleIds.has(subId)) {
        invalidCount++;
        console.error(`Plan ${planKey} has invalid submodule: ${subId}`);
      }
    }
    assert(`Plan ${planKey} has 0 invalid submodule IDs`, invalidCount === 0);
  }

  console.log(bold('\n==================================================================='));
  console.log(bold(`   TEST RUN COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`));
  console.log(bold('===================================================================\n'));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runHardeningTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
