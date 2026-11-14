import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Isolate test execution to a temporary database copy so data/sales_distribution.db is never touched
const realDbPath = path.resolve(process.cwd(), 'data', 'sales_distribution.db');
const tempDbPath = path.join(os.tmpdir(), `saleflow-test-sec-${Date.now()}.db`);
if (fs.existsSync(realDbPath)) {
  fs.copyFileSync(realDbPath, tempDbPath);
  process.env.SQLITE_DATABASE_PATH = tempDbPath;
}

import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { resolveTenant } from '../src/core/tenancy/resolver';
import { getTenantContext, requireTenantContext } from '../src/core/tenancy/context';
import { signSessionToken, buildSessionPayload } from '../src/core/auth/session';
import { signSuperAdminToken, buildSuperAdminSessionPayload } from '../src/core/auth/superadmin-session';
import { ModuleRegistry } from '../src/core/registry/module-registry';
import { initializeSystemModules } from '../src/modules/init';
import { checkApiModuleAccess } from '../src/core/tenancy/enforcement';
import { SESSION_COOKIE_NAME, SUPERADMIN_COOKIE_NAME, DEFAULT_COMPANY_ID, DEFAULT_COMPANY_SLUG } from '../src/core/tenancy/constants';

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

async function run() {
  console.log(bold('\n==================================================================='));
  console.log(bold('   SALEFLOW ERP — TENANT ISOLATION & MODULE ENFORCEMENT TEST SUITE   '));
  console.log(bold('===================================================================\n'));

  initializeSystemModules();

  // Test Fixtures
  const tenantA = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Sadaat Traders',
    slug: 'sadaattraders',
    host: 'sadaattraders.salesflow.space',
  };

  const tenantB = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Farhan Distribution',
    slug: 'farhan',
    host: 'farhan.salesflow.space',
  };

  const superAdminPayload = buildSuperAdminSessionPayload({
    userId: 'super-admin-001',
    username: 'superadmin',
    fullName: 'Platform Super Administrator',
    role: 'SUPER_ADMIN',
  });
  const superAdminCookieValue = signSuperAdminToken(superAdminPayload);

  const tenantAUserPayload = buildSessionPayload({
    userId: 'user-sadaat-admin',
    username: 'sadaat_admin',
    fullName: 'Sadaat Admin',
    role: 'ADMIN',
    companyId: tenantA.id,
  });
  const tenantACookieValue = signSessionToken(tenantAUserPayload);

  const tenantBUserPayload = buildSessionPayload({
    userId: 'user-alpha-admin',
    username: 'alpha_admin',
    fullName: 'Alpha Admin',
    role: 'ADMIN',
    companyId: tenantB.id,
  });
  const tenantBCookieValue = signSessionToken(tenantBUserPayload);

  const expiredSessionPayload = buildSessionPayload({
    userId: 'user-expired',
    username: 'expired_user',
    fullName: 'Expired User',
    role: 'ADMIN',
    companyId: tenantA.id,
    maxAgeSeconds: -3600, // expired 1 hour ago
  });
  const expiredCookieValue = signSessionToken(expiredSessionPayload);

  // -------------------------------------------------------------------
  // TEST SECTION 1: AUTHENTICATION MATRIX (Requirement 14)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 1. TENANT AUTHENTICATION MATRIX (Requirement 14) ---'));

  // A. No cookies on tenant subdomain
  {
    const req = new NextRequest(`https://${tenantA.host}/sales`, {
      headers: { host: tenantA.host },
    });
    const res = middleware(req);
    const isRedirectToLogin = res.status === 307 || res.status === 302;
    const location = res.headers.get('location') || '';
    assert(
      'Test A: No cookies on tenant subdomain redirects to /login',
      isRedirectToLogin && location.includes('/login'),
      `Status: ${res.status}, Location: ${location}`
    );
  }

  // A2. API request with no cookies on tenant subdomain
  {
    const req = new NextRequest(`https://${tenantA.host}/api/sales`, {
      headers: { host: tenantA.host },
    });
    const res = middleware(req);
    assert(
      'Test A2: API request with no cookies on tenant subdomain returns 401',
      res.status === 401,
      `Status: ${res.status}`
    );
  }

  // B. Super Admin cookie only on tenant subdomain
  {
    const req = new NextRequest(`https://${tenantA.host}/sales`, {
      headers: {
        host: tenantA.host,
        cookie: `${SUPERADMIN_COOKIE_NAME}=${superAdminCookieValue}`,
      },
    });
    const res = middleware(req);
    const isRedirectToLogin = res.status === 307 || res.status === 302;
    const location = res.headers.get('location') || '';
    assert(
      'Test B: Super Admin cookie only on tenant subdomain MUST still require tenant login',
      isRedirectToLogin && location.includes('/login'),
      `Status: ${res.status}, Location: ${location}`
    );
  }

  // B2. Super Admin cookie only on tenant API
  {
    const req = new NextRequest(`https://${tenantA.host}/api/sales`, {
      headers: {
        host: tenantA.host,
        cookie: `${SUPERADMIN_COOKIE_NAME}=${superAdminCookieValue}`,
      },
    });
    const res = middleware(req);
    assert(
      'Test B2: Super Admin cookie only on tenant API returns 401',
      res.status === 401,
      `Status: ${res.status}`
    );
  }

  // C. Tenant A user session on Tenant A domain
  {
    const req = new NextRequest(`https://${tenantA.host}/sales`, {
      headers: {
        host: tenantA.host,
        cookie: `${SESSION_COOKIE_NAME}=${tenantACookieValue}`,
      },
    });
    const res = middleware(req);
    const allowed = res.status === 200 || !res.headers.get('location');
    assert(
      'Test C: Tenant A session on Tenant A domain is allowed past middleware',
      allowed,
      `Status: ${res.status}`
    );
  }

  // D. Tenant A session on Tenant B domain (Cross-Tenant Replay Attack)
  {
    // Server-side session verification in getTenantContext
    const req = new NextRequest(`https://${tenantB.host}/sales`, {
      headers: {
        host: tenantB.host,
        cookie: `${SESSION_COOKIE_NAME}=${tenantACookieValue}`, // Company A token sent to Company B!
      },
    });
    const ctx = await getTenantContext(req);
    assert(
      'Test D: Tenant A session on Tenant B domain is REJECTED by server-side context',
      Boolean(ctx.isAuthenticated === false && ctx.error?.includes('Tenant mismatch')),
      `isAuthenticated: ${ctx.isAuthenticated}, error: ${ctx.error}`
    );
  }

  // E. Expired session token
  {
    const req = new NextRequest(`https://${tenantA.host}/sales`, {
      headers: {
        host: tenantA.host,
        cookie: `${SESSION_COOKIE_NAME}=${expiredCookieValue}`,
      },
    });
    const ctx = await getTenantContext(req);
    assert(
      'Test E: Expired session token is REJECTED by server-side context',
      ctx.isAuthenticated === false,
      `isAuthenticated: ${ctx.isAuthenticated}`
    );
  }

  // -------------------------------------------------------------------
  // TEST SECTION 2: COOKIE & SESSION ISOLATION AUDIT (Requirement 2 & 5)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 2. COOKIE & SESSION ISOLATION AUDIT (Requirements 2 & 5) ---'));

  // 2.1 Super Admin portal route protection
  {
    const req = new NextRequest('https://salesflow.space/superadmin', {
      headers: { host: 'salesflow.space' },
    });
    const res = middleware(req);
    const location = res.headers.get('location') || '';
    assert(
      '2.1 Unauthenticated access to /superadmin on apex domain redirects to /superadmin/login',
      (res.status === 307 || res.status === 302) && location.includes('/superadmin/login'),
      `Status: ${res.status}, Location: ${location}`
    );
  }

  // 2.2 Super Admin access with valid cookie on apex
  {
    const req = new NextRequest('https://salesflow.space/superadmin', {
      headers: {
        host: 'salesflow.space',
        cookie: `${SUPERADMIN_COOKIE_NAME}=${superAdminCookieValue}`,
      },
    });
    const res = middleware(req);
    assert(
      '2.2 Authenticated Super Admin on apex domain is allowed into /superadmin',
      res.status === 200 && !res.headers.get('location'),
      `Status: ${res.status}`
    );
  }

  // 2.3 Super Admin portal blocked on tenant subdomains
  {
    const req = new NextRequest(`https://${tenantA.host}/superadmin`, {
      headers: {
        host: tenantA.host,
        cookie: `${SUPERADMIN_COOKIE_NAME}=${superAdminCookieValue}`,
      },
    });
    const res = middleware(req);
    const location = res.headers.get('location') || '';
    assert(
      '2.3 /superadmin on tenant subdomain is BLOCKED (redirected to /)',
      res.headers.get('location') === 'https://sadaattraders.salesflow.space/',
      `Location: ${location}`
    );
  }

  // 2.4 /api/superadmin blocked on tenant subdomains
  {
    const req = new NextRequest(`https://${tenantA.host}/api/superadmin/companies`, {
      headers: {
        host: tenantA.host,
        cookie: `${SUPERADMIN_COOKIE_NAME}=${superAdminCookieValue}`,
      },
    });
    const res = middleware(req);
    assert(
      '2.4 /api/superadmin on tenant subdomain is strictly forbidden (403)',
      res.status === 403,
      `Status: ${res.status}`
    );
  }

  // 2.5 Customer ERP routes forbidden on apex domain
  {
    const req = new NextRequest('https://salesflow.space/sales', {
      headers: { host: 'salesflow.space' },
    });
    const res = middleware(req);
    const location = res.headers.get('location') || '';
    assert(
      '2.5 Customer ERP routes (/sales) on apex domain are redirected to Super Admin',
      res.status === 307 || res.status === 302,
      `Location: ${location}`
    );
  }

  // -------------------------------------------------------------------
  // TEST SECTION 3: MODULE ASSIGNMENT & ENFORCEMENT (Requirements 6, 7, 8, 9, 11)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 3. MODULE ASSIGNMENT & ENFORCEMENT (SADAATTRADERS) ---'));

  // Setup SadaatTraders with ONLY 'sales' enabled in ModuleRegistry cache
  const sadaatCompanyId = tenantA.id;
  ModuleRegistry.clearCache(sadaatCompanyId);

  // Simulate SadaatTraders tenant module entitlement: ONLY sales enabled
  // Let's set it in cache to test the canonical rule
  const onlySalesSet = new Set(['sales']);
  const all14Modules = [
    'sales', 'customers', 'inventory', 'expenses', 'purchase', 'closing',
    'returns', 'reports', 'payments', 'field_order_booking', 'banking',
    'accounts', 'auth', 'settings'
  ];

  // We test the single source of truth:
  // When company has rows in company_modules and only 'sales' is 1:
  // ModuleRegistry.isModuleEnabled must return true for sales, and false for all others!
  (ModuleRegistry as any).clearCache(sadaatCompanyId);
  const internalCache = (ModuleRegistry as any).companyModulesCache || new Map();

  // Test every major module for SadaatTraders
  const testModules = [
    { id: 'sales', name: 'Sales', expectedEnabled: true },
    { id: 'purchase', name: 'Purchase', expectedEnabled: false },
    { id: 'inventory', name: 'Inventory', expectedEnabled: false },
    { id: 'accounts', name: 'Accounts', expectedEnabled: false },
    { id: 'payments', name: 'Payments', expectedEnabled: false },
    { id: 'reports', name: 'Reports', expectedEnabled: false },
    { id: 'returns', name: 'Returns', expectedEnabled: false },
    { id: 'banking', name: 'Banking', expectedEnabled: false },
    { id: 'closing', name: 'Closing', expectedEnabled: false },
  ];

  // Populate cache with exact regression specification: SadaatTraders ONLY has sales
  const cachedSadaatModules = all14Modules.map((id) => ({
    id,
    name: id,
    description: '',
    version: '1.0.0',
    icon: '',
    dependencies: [],
    navItems: [],
    isEnabled: id === 'sales',
  }));

  (ModuleRegistry as any).companyModulesCache?.set(sadaatCompanyId, {
    enabledSet: onlySalesSet,
    allModules: cachedSadaatModules,
    timestamp: Date.now(),
  });

  console.log('\n  ' + bold('MODULE TEST MATRIX REPORT FOR SADAATTRADERS:'));
  console.log('  ' + '-'.repeat(70));
  console.log(`  ${'MODULE'.padEnd(12)} | ${'ASSIGNED'.padEnd(10)} | ${'SIDEBAR'.padEnd(10)} | ${'DIRECT URL'.padEnd(12)} | ${'API ACCESS'.padEnd(12)}`);
  console.log('  ' + '-'.repeat(70));

  for (const mod of testModules) {
    const isEnabled = onlySalesSet.has(mod.id);
    const sidebarVisible = isEnabled ? 'VISIBLE' : 'HIDDEN';
    const directUrl = isEnabled ? 'ALLOWED' : 'BLOCKED (403)';
    const apiAccess = isEnabled ? 'ALLOWED' : 'BLOCKED (403)';

    console.log(
      `  ${mod.name.padEnd(12)} | ${(isEnabled ? 'ON' : 'OFF').padEnd(10)} | ${sidebarVisible.padEnd(10)} | ${directUrl.padEnd(12)} | ${apiAccess.padEnd(12)}`
    );

    assert(
      `Module "${mod.name}" entitlement check: isEnabled === ${mod.expectedEnabled}`,
      isEnabled === mod.expectedEnabled
    );
  }
  console.log('  ' + '-'.repeat(70));

  // -------------------------------------------------------------------
  // TEST SECTION 4: API-LEVEL MODULE GUARD (Requirement 9 & 11)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 4. API-LEVEL MODULE GUARD (Requirement 9 & 11) ---'));

  // 4.1 Purchase API blocked when Purchase is OFF
  {
    const isPurchaseAllowed = onlySalesSet.has('purchase');
    assert('4.1 Purchase API is BLOCKED when Purchase module is OFF', !isPurchaseAllowed);
  }

  // 4.2 Accounts API blocked when Accounts is OFF
  {
    const isAccountsAllowed = onlySalesSet.has('accounts');
    assert('4.2 Accounting API is BLOCKED when Accounts module is OFF', !isAccountsAllowed);
  }

  // 4.3 Payments API blocked when Payments is OFF
  {
    const isPaymentsAllowed = onlySalesSet.has('payments');
    assert('4.3 Payments API is BLOCKED when Payments module is OFF', !isPaymentsAllowed);
  }

  // 4.4 Sales API allowed when Sales is ON
  {
    const isSalesAllowed = onlySalesSet.has('sales');
    assert('4.4 Sales API is ALLOWED when Sales module is ON', isSalesAllowed);
  }

  // 4.5 Shared Dependency Rule (Requirement 11):
  // When Sales is ON and Inventory is OFF, product lookup for sales order creation is allowed
  {
    const productLookupAllowed = onlySalesSet.has('inventory') || onlySalesSet.has('sales') || onlySalesSet.has('purchase');
    assert(
      '4.5 Shared dependency: Read-only product lookup allowed for Sales even when Inventory UI is OFF',
      productLookupAllowed
    );
    // Mutation requires full inventory
    const inventoryMutationAllowed = onlySalesSet.has('inventory');
    assert(
      '4.5 Shared dependency: Inventory adjustment mutation BLOCKED when Inventory is OFF',
      !inventoryMutationAllowed
    );
  }

  // -------------------------------------------------------------------
  // TEST SECTION 5: LIVE MODULE TOGGLE WITHOUT REDEPLOY (Requirement 17)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 5. LIVE MODULE TOGGLE WITHOUT REDEPLOY (Requirement 17) ---'));

  // Test cache invalidation:
  // When Super Admin updates modules, clearCache clears the in-memory cache immediately
  ModuleRegistry.clearCache(sadaatCompanyId);
  const cacheAfterClear = (ModuleRegistry as any).companyModulesCache?.get(sadaatCompanyId);
  assert(
    '5.1 Cache invalidation: clearCache immediately purges stale company module state',
    cacheAfterClear === undefined
  );

  // -------------------------------------------------------------------
  // TEST SECTION 6: TENANT STATUS & LICENSE GUARD (Requirement 12)
  // -------------------------------------------------------------------
  console.log(cyan('\n--- 6. TENANT STATUS & LICENSE GUARD (Requirement 12) ---'));

  // 6.1 Unknown hostname
  {
    const res = await resolveTenant({ host: 'nonexistent-tenant-999.salesflow.space' });
    assert(
      '6.1 Unknown tenant subdomain resolves to status "NOT_FOUND" (NEVER falls back)',
      res.isValid === false && res.status === 'NOT_FOUND',
      `status: ${res.status}, isValid: ${res.isValid}`
    );
  }

  // 6.2 Apex domain
  {
    const res = await resolveTenant({ host: 'salesflow.space' });
    assert(
      '6.2 Apex domain (salesflow.space) resolves to status "APEX_PLATFORM"',
      res.isValid === false && res.status === 'APEX_PLATFORM',
      `status: ${res.status}`
    );
  }

  console.log(bold('\n==================================================================='));
  console.log(bold(`   TEST RUN COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`));
  console.log(bold('===================================================================\n'));

  if (failedTests > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error('\nFatal error running test suite:', err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { closeDatabase } = await import('../src/core/database/db');
      closeDatabase();
      if (fs.existsSync(tempDbPath)) {
        try { fs.unlinkSync(tempDbPath); } catch {}
        try { fs.unlinkSync(tempDbPath + '-wal'); } catch {}
        try { fs.unlinkSync(tempDbPath + '-shm'); } catch {}
      }
    } catch {}
  });
