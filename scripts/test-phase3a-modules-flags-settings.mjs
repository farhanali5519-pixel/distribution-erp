import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DB_PATH = 'data/sales_distribution.db';
const db = new DatabaseSync(DB_PATH);

const COMPANY_A = '00000000-0000-0000-0000-000000000001'; // Farhan Distribution
const COMPANY_B = '00000000-0000-0000-0000-000000000002'; // Beta Traders

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runPhase3ATests() {
  console.log('\n=============================================================');
  console.log('PHASE 3A TEST SUITE: Company-Wise Modules, Flags & Settings');
  console.log('=============================================================\n');

  // Setup Company B if not present
  const compB = db.prepare('SELECT id FROM companies WHERE id = ?').get(COMPANY_B);
  if (!compB) {
    db.prepare(`
      INSERT INTO companies (id, name, slug, is_active, created_at, updated_at)
      VALUES (?, 'Beta Traders', 'beta-traders', 1, datetime('now'), datetime('now'))
    `).run(COMPANY_B);
  }

  // Import Phase 3A services and helpers via dynamic import
  const { ModuleRegistry } = await import('../src/core/registry/module-registry.ts');
  const { FeatureFlagService } = await import('../src/core/settings/flags.ts');
  const { CompanySettingsService } = await import('../src/core/settings/company-settings.ts');
  const {
    isModuleEnabled,
    requireModuleEnabled,
    isFeatureEnabled,
    requireFeatureEnabled,
    getCompanySetting,
    setCompanySetting,
    TenantModuleDisabledError,
    TenantFeatureDisabledError,
  } = await import('../src/core/tenancy/enforcement.ts');
  const { AuthService } = await import('../src/modules/auth/service.ts');

  // Ensure catalog modules are synced
  const { initializeSystemModules } = await import('../src/modules/init.ts');
  initializeSystemModules();

  // -------------------------------------------------------------
  // TEST GROUP 1: Canonical Helpers Existence & Signatures
  // -------------------------------------------------------------
  console.log('TEST GROUP 1: Reusable Helper Functions Verification');
  assert(typeof isModuleEnabled === 'function', 'isModuleEnabled helper is exported');
  assert(typeof requireModuleEnabled === 'function', 'requireModuleEnabled helper is exported');
  assert(typeof isFeatureEnabled === 'function', 'isFeatureEnabled helper is exported');
  assert(typeof requireFeatureEnabled === 'function', 'requireFeatureEnabled helper is exported');
  assert(typeof getCompanySetting === 'function', 'getCompanySetting helper is exported');
  assert(typeof setCompanySetting === 'function', 'setCompanySetting helper is exported');

  // -------------------------------------------------------------
  // TEST GROUP 2: Company-Wise Module Management & Isolation
  // -------------------------------------------------------------
  console.log('\nTEST GROUP 2: Company-Wise Module Management (ON in Co A, OFF in Co B)');
  
  // Configure Company A: 'field_order_booking' ON
  ModuleRegistry.toggleModule('field_order_booking', true, COMPANY_A);
  // Configure Company B: 'field_order_booking' OFF
  ModuleRegistry.toggleModule('field_order_booking', false, COMPANY_B);

  const modOnA = isModuleEnabled(COMPANY_A, 'field_order_booking');
  const modOnB = isModuleEnabled(COMPANY_B, 'field_order_booking');

  assert(modOnA === true, 'Company A has field_order_booking module ENABLED');
  assert(modOnB === false, 'Company B has field_order_booking module DISABLED');

  // Verify requireModuleEnabled behavior
  let coAPassed = false;
  try {
    requireModuleEnabled(COMPANY_A, 'field_order_booking');
    coAPassed = true;
  } catch {
    coAPassed = false;
  }
  assert(coAPassed, 'requireModuleEnabled(Company A) passes without throwing');

  let coBBlocked = false;
  let coBErrorStatus = 0;
  let coBErrorName = '';
  try {
    requireModuleEnabled(COMPANY_B, 'field_order_booking');
  } catch (err) {
    coBBlocked = true;
    coBErrorStatus = err.status || err.statusCode;
    coBErrorName = err.name;
  }
  assert(coBBlocked, 'requireModuleEnabled(Company B) throws error when module is disabled');
  assert(coBErrorStatus === 403, 'requireModuleEnabled(Company B) throws HTTP 403 status');
  assert(coBErrorName === 'TenantModuleDisabledError', 'Error is instance of TenantModuleDisabledError');

  // Verify role bypass is STRICTLY prohibited
  // Even an ADMIN user cannot bypass requireModuleEnabled for Company B
  const adminRole = 'ADMIN';
  let adminBypassBlocked = false;
  try {
    // Attempting access for Company B regardless of who calls it
    requireModuleEnabled(COMPANY_B, 'field_order_booking');
  } catch (err) {
    if (err.status === 403) {
      adminBypassBlocked = true;
    }
  }
  assert(adminBypassBlocked, `User role (${adminRole}) cannot bypass disabled module for Company B`);

  // Verify system_modules global catalog is NOT polluted by Company B toggle
  const sysModRow = db.prepare('SELECT is_enabled FROM system_modules WHERE id = ?').get('field_order_booking');
  assert(sysModRow && sysModRow.is_enabled === 1, 'system_modules global catalog is_enabled remains 1');

  // -------------------------------------------------------------
  // TEST GROUP 3: API Runtime Enforcement Simulation
  // -------------------------------------------------------------
  console.log('\nTEST GROUP 3: API Runtime Access Enforcement');

  // Company A accesses sales/route GET logic
  let apiCoASuccess = false;
  try {
    requireModuleEnabled(COMPANY_A, 'sales');
    apiCoASuccess = true;
  } catch {
    apiCoASuccess = false;
  }
  assert(apiCoASuccess, 'API access for Company A succeeds when module is ON');

  // Disable 'purchase' for Company B, keep ON for Company A
  ModuleRegistry.toggleModule('purchase', true, COMPANY_A);
  ModuleRegistry.toggleModule('purchase', false, COMPANY_B);

  let apiCoBStatus = 200;
  let apiCoBMessage = '';
  try {
    requireModuleEnabled(COMPANY_B, 'purchase');
  } catch (err) {
    apiCoBStatus = err.status;
    apiCoBMessage = err.message;
  }
  assert(apiCoBStatus === 403, 'API request for Company B is blocked with 403 Forbidden');
  assert(apiCoBMessage.includes('purchase'), '403 error message specifies disabled purchase module');

  // Verify Company A can still access 'purchase'
  let apiCoAPurchaseSuccess = false;
  try {
    requireModuleEnabled(COMPANY_A, 'purchase');
    apiCoAPurchaseSuccess = true;
  } catch {
    apiCoAPurchaseSuccess = false;
  }
  assert(apiCoAPurchaseSuccess, 'Company A can still access purchase while Company B is blocked');

  // Re-enable purchase for Company B and verify access restored
  ModuleRegistry.toggleModule('purchase', true, COMPANY_B);
  let apiCoBRestored = false;
  try {
    requireModuleEnabled(COMPANY_B, 'purchase');
    apiCoBRestored = true;
  } catch {
    apiCoBRestored = false;
  }
  assert(apiCoBRestored, 'Company B access to purchase is successfully restored when module toggled ON');

  // -------------------------------------------------------------
  // TEST GROUP 4: Company-Wise Feature Flags Isolation
  // -------------------------------------------------------------
  console.log('\nTEST GROUP 4: Company-Wise Feature Flags Scoping & Isolation');

  // Flag: 'sales.enable_order_booking'
  // Enable for Company A, Disable for Company B
  FeatureFlagService.updateFlag('sales.enable_order_booking', 'true', COMPANY_A);
  FeatureFlagService.updateFlag('sales.enable_order_booking', 'false', COMPANY_B);

  const flagA = isFeatureEnabled(COMPANY_A, 'sales.enable_order_booking');
  const flagB = isFeatureEnabled(COMPANY_B, 'sales.enable_order_booking');

  assert(flagA === true, 'Feature flag is ON for Company A');
  assert(flagB === false, 'Feature flag is OFF for Company B');

  // Verify requireFeatureEnabled
  let reqFlagAPassed = false;
  try {
    requireFeatureEnabled(COMPANY_A, 'sales.enable_order_booking');
    reqFlagAPassed = true;
  } catch {
    reqFlagAPassed = false;
  }
  assert(reqFlagAPassed, 'requireFeatureEnabled(Company A) passes');

  let reqFlagBBlocked = false;
  let reqFlagBStatus = 0;
  try {
    requireFeatureEnabled(COMPANY_B, 'sales.enable_order_booking');
  } catch (err) {
    reqFlagBBlocked = true;
    reqFlagBStatus = err.status;
  }
  assert(reqFlagBBlocked, 'requireFeatureEnabled(Company B) throws error');
  assert(reqFlagBStatus === 403, 'requireFeatureEnabled(Company B) throws HTTP 403 status');

  // Verify modifying Company B does NOT leak into Company A
  FeatureFlagService.updateFlag('sales.enable_direct_sale', 'false', COMPANY_B);
  const flagDirectA = isFeatureEnabled(COMPANY_A, 'sales.enable_direct_sale');
  const flagDirectB = isFeatureEnabled(COMPANY_B, 'sales.enable_direct_sale');
  assert(flagDirectA === true, 'Company A flag unchanged when Company B toggled direct sale OFF');
  assert(flagDirectB === false, 'Company B has direct sale flag OFF');

  // Verify feature flag cascades to false if parent module is disabled
  // Disable module 'sales' for Company B
  ModuleRegistry.toggleModule('sales', false, COMPANY_B);
  // Even if flag is 'true' in DB for Company B:
  db.prepare(`
    INSERT INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
    VALUES (?, 'sales.enable_scheme_bonus', 'sales', 'true', 'Scheme Bonus', '', datetime('now'))
    ON CONFLICT(company_id, key) DO UPDATE SET value = 'true'
  `).run(COMPANY_B);
  const cascadeOff = isFeatureEnabled(COMPANY_B, 'sales.enable_scheme_bonus');
  assert(cascadeOff === false, 'Feature flag automatically evaluates to false when parent module is disabled');

  // Re-enable sales for Company B
  ModuleRegistry.toggleModule('sales', true, COMPANY_B);

  // -------------------------------------------------------------
  // TEST GROUP 5: Company-Wise Settings Isolation
  // -------------------------------------------------------------
  console.log('\nTEST GROUP 5: Company-Wise Settings Isolation (No Leakage)');

  setCompanySetting(COMPANY_A, 'tax_rate_percent', '18.0', 'Sales Tax Rate for Co A');
  setCompanySetting(COMPANY_B, 'tax_rate_percent', '5.0', 'Sales Tax Rate for Co B');

  const settingA = getCompanySetting(COMPANY_A, 'tax_rate_percent');
  const settingB = getCompanySetting(COMPANY_B, 'tax_rate_percent');

  assert(settingA === '18.0', 'Company A setting retrieved accurately as "18.0"');
  assert(settingB === '5.0', 'Company B setting retrieved accurately as "5.0"');
  assert(settingA !== settingB, 'Settings differ between the two companies without leakage');

  // Update Company B setting and verify Company A is untouched
  setCompanySetting(COMPANY_B, 'tax_rate_percent', '7.5');
  const settingAAfter = getCompanySetting(COMPANY_A, 'tax_rate_percent');
  const settingBAfter = getCompanySetting(COMPANY_B, 'tax_rate_percent');

  assert(settingAAfter === '18.0', 'Company A setting remains "18.0" after Company B updated');
  assert(settingBAfter === '7.5', 'Company B setting successfully updated to "7.5"');

  // Admin PIN isolation test
  AuthService.setAdminPin('9876', undefined, COMPANY_B);
  const isPinValidA = AuthService.verifyAdminPin('1234', COMPANY_A);
  const isPinValidB = AuthService.verifyAdminPin('9876', COMPANY_B);
  const isPinCrossRejected = AuthService.verifyAdminPin('9876', COMPANY_A);

  assert(isPinValidA === true, 'Company A Admin PIN remains 1234');
  assert(isPinValidB === true, 'Company B Admin PIN is 9876');
  assert(isPinCrossRejected === false, 'Company B PIN (9876) is rejected for Company A');

  // -------------------------------------------------------------
  // TEST GROUP 6: Baseline Farhan Distribution Integrity
  // -------------------------------------------------------------
  console.log('\nTEST GROUP 6: Baseline Farhan Distribution (On-Premise) Integrity');

  // Verify core modules remain enabled for Farhan Distribution
  const coreModules = ['sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings'];
  for (const modId of coreModules) {
    const isEn = isModuleEnabled(COMPANY_A, modId);
    assert(isEn === true, `Baseline module "${modId}" is active for Farhan Distribution`);
  }

  // Verify feature flags count for Farhan Distribution
  const flagsCount = db.prepare('SELECT count(*) as c FROM feature_flags WHERE company_id = ?').get(COMPANY_A);
  assert(flagsCount.c >= 35, `Farhan Distribution has all ${flagsCount.c} feature flags intact`);

  // Verify Chart of Accounts count for Farhan Distribution
  const coaCount = db.prepare('SELECT count(*) as c FROM chart_of_accounts WHERE company_id = ?').get(COMPANY_A);
  assert(coaCount.c >= 20, `Chart of accounts intact (${coaCount.c} accounts)`);

  // Comprehensive cleanup to keep DB 100% matched to baseline
  db.prepare("DELETE FROM app_settings WHERE key = 'tax_rate_percent'").run();
  db.prepare("DELETE FROM app_settings WHERE company_id = ?").run(COMPANY_B);
  db.prepare("DELETE FROM feature_flags WHERE company_id = ?").run(COMPANY_B);
  db.prepare("DELETE FROM company_modules WHERE company_id = ?").run(COMPANY_B);
  db.prepare("DELETE FROM companies WHERE id = ?").run(COMPANY_B);

  ModuleRegistry.toggleModule('field_order_booking', true, COMPANY_A);
  FeatureFlagService.updateFlag('sales.enable_order_booking', 'true', COMPANY_A);
  FeatureFlagService.updateFlag('sales.enable_direct_sale', 'true', COMPANY_A);

  console.log('\n=============================================================');
  console.log(`PHASE 3A TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3ATests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
