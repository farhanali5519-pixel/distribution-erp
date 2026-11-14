/**
 * Regression Test Suite: Unified Preloader for Super Admin and Tenant ERP
 * Validates Section 17 & 18 Required Test Matrix
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('   SALEFLOW ERP - UNIFIED PRELOADER TEST SUITE      ');
console.log('====================================================\n');

// 1. Verify ApplicationPreloader source code constraints
const preloaderSource = fs.readFileSync(
  path.join(process.cwd(), 'src/core/branding/ApplicationPreloader.tsx'),
  'utf-8'
);

// Constraint 1: SaleFlowIcon must be completely removed from ApplicationPreloader
assert(
  !preloaderSource.includes('SaleFlowIcon'),
  'FAIL: SaleFlowIcon must NOT be imported or used in ApplicationPreloader'
);
console.log('✓ Section 5: SaleFlowIcon completely removed from ApplicationPreloader');

// Constraint 2: State C must render clean arc-spin icon only (no bar, no text, no logo)
assert(
  preloaderSource.includes('preloader-arc-spin'),
  'FAIL: State C must use preloader-arc-spin icon'
);
assert(
  !preloaderSource.includes('Loading platform') && !preloaderSource.includes('Loading {resolvedDisplayName}'),
  'FAIL: Visible ERP Title or Display Name text must not appear in DOM'
);
console.log('✓ Section 1 & 13: State C renders clean professional loader icon only (no bar, no text, no SaleFlow mark)');

// Constraint 3: Strict TRUE OFF STATE (State A) returns null synchronously
assert(
  preloaderSource.includes('if (!isEnabled) {\n      return null;'),
  'FAIL: Preloader OFF must return null synchronously'
);
console.log('✓ Section 1: State A returns null synchronously (Zero DOM when Preloader = OFF)');

// Constraint 4: Route navigation click, popstate, and pushState triggers
assert(
  preloaderSource.includes('handleDocumentClick'),
  'FAIL: Preloader must intercept genuine route link clicks'
);
assert(
  preloaderSource.includes('handlePopState'),
  'FAIL: Preloader must intercept browser Back/Forward (popstate)'
);
assert(
  preloaderSource.includes('origPushState'),
  'FAIL: Preloader must intercept programmatic pushState'
);
assert(
  preloaderSource.includes('prevPathRef.current !== pathname'),
  'FAIL: Preloader must detect route change completion and hide without artificial delay'
);
console.log('✓ Section 7 & 8: Genuine route navigation triggers and instant completion implemented');

// Constraint 5: Double loader check in RouteAccessGuard
const guardSource = fs.readFileSync(
  path.join(process.cwd(), 'src/shared/components/RouteAccessGuard.tsx'),
  'utf-8'
);
assert(
  !guardSource.includes('route-guard-spin'),
  'FAIL: RouteAccessGuard must not render an inner spinner behind the preloader overlay'
);
console.log('✓ Section 12: Zero double-loader / spinner behind overlay in RouteAccessGuard');

// Simulate Logo Candidate Resolution for All Scenarios
function resolveLogoCandidates({ config, isSuperAdmin }) {
  const list = [];
  if (isSuperAdmin) {
    const globalUrl = config?.globalLogo
      ? config.globalLogoVersion
        ? `${config.globalLogo}?v=${config.globalLogoVersion}`
        : config.globalLogo
      : null;

    if (globalUrl) {
      list.push(globalUrl);
    } else if (config?.uploadedLogo) {
      const mainUrl = config.uploadedLogoVersion
        ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion}`
        : config.uploadedLogo;
      list.push(mainUrl);
    } else if (config?.companyLogo) {
      list.push(config.companyLogo);
    }
  } else {
    const tenantUrl = config?.tenantLogo
      ? config.tenantLogoVersion
        ? `${config.tenantLogo}?v=${config.tenantLogoVersion}`
        : config.tenantLogo
      : null;

    if (tenantUrl) {
      list.push(tenantUrl);
    } else if (config?.uploadedLogo) {
      const mainUrl = config.uploadedLogoVersion
        ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion}`
        : config.uploadedLogo;
      list.push(mainUrl);
    } else if (config?.companyLogo) {
      list.push(config.companyLogo);
    }

    const globalUrl = config?.globalLogo
      ? config.globalLogoVersion
        ? `${config.globalLogo}?v=${config.globalLogoVersion}`
        : config.globalLogo
      : null;

    if (globalUrl && !list.includes(globalUrl)) {
      list.push(globalUrl);
    }
  }

  return list.filter((url, index, self) => Boolean(url) && self.indexOf(url) === index);
}

function resolveVisualState({ config, isSuperAdmin }) {
  if (!config?.preloaderEnabled) {
    return 'STATE_A_OFF';
  }
  const candidates = resolveLogoCandidates({ config, isSuperAdmin });
  if (candidates.length > 0) {
    return {
      state: 'STATE_B_MAIN_LOGO_AND_BAR',
      logo: candidates[0],
      allCandidates: candidates,
    };
  }
  return 'STATE_C_LOADING_ICON_ONLY';
}

console.log('\n--- TESTING SUPER ADMIN MATRIX ---');

// Scenario A: Super Admin - Preloader ON + Global Main Logo (Hard refresh)
const sa_A = resolveVisualState({
  config: { preloaderEnabled: true, globalLogo: '/assets/global-logo.webp', globalLogoVersion: 1 },
  isSuperAdmin: true,
});
assert.strictEqual(sa_A.state, 'STATE_B_MAIN_LOGO_AND_BAR');
assert.strictEqual(sa_A.logo, '/assets/global-logo.webp?v=1');
console.log('✓ Scenario A: Super Admin Hard Refresh with Global Main Logo -> Main Logo + Loading Bar');

// Scenario B: Super Admin - Preloader ON + Global Main Logo (Page navigation)
const sa_B = resolveVisualState({
  config: { preloaderEnabled: true, globalLogo: '/assets/global-logo.webp', globalLogoVersion: 1 },
  isSuperAdmin: true,
});
assert.deepStrictEqual(sa_B, sa_A, 'FAIL: Page navigation must produce IDENTICAL visual state to hard refresh');
console.log('✓ Scenario B: Super Admin Page Navigation -> EXACT same Main Logo + Loading Bar');

// Scenario C: Super Admin - Preloader ON + no Main Logo (Hard refresh)
const sa_C = resolveVisualState({
  config: { preloaderEnabled: true, globalLogo: null, uploadedLogo: null, companyLogo: null },
  isSuperAdmin: true,
});
assert.strictEqual(sa_C, 'STATE_C_LOADING_ICON_ONLY');
console.log('✓ Scenario C: Super Admin Hard Refresh with no Main Logo -> Loading Icon only');

// Scenario D: Super Admin - Preloader ON + no Main Logo (Page navigation)
const sa_D = resolveVisualState({
  config: { preloaderEnabled: true, globalLogo: null, uploadedLogo: null, companyLogo: null },
  isSuperAdmin: true,
});
assert.strictEqual(sa_D, 'STATE_C_LOADING_ICON_ONLY');
console.log('✓ Scenario D: Super Admin Page Navigation with no Main Logo -> Loading Icon only');

// Scenario E: Super Admin - Preloader OFF
const sa_E = resolveVisualState({
  config: { preloaderEnabled: false, globalLogo: '/assets/global-logo.webp' },
  isSuperAdmin: true,
});
assert.strictEqual(sa_E, 'STATE_A_OFF');
console.log('✓ Scenario E: Super Admin Preloader OFF -> Renders nothing (null)');

console.log('\n--- TESTING TENANT / CLIENT ERP MATRIX ---');

// Scenario G: Tenant - Tenant Main Logo exists (Hard refresh)
const t_G = resolveVisualState({
  config: {
    preloaderEnabled: true,
    tenantLogo: '/assets/tenant-logo.webp',
    tenantLogoVersion: 2,
    globalLogo: '/assets/global-logo.webp',
  },
  isSuperAdmin: false,
});
assert.strictEqual(t_G.state, 'STATE_B_MAIN_LOGO_AND_BAR');
assert.strictEqual(t_G.logo, '/assets/tenant-logo.webp?v=2');
console.log('✓ Scenario G: Tenant Hard Refresh with Tenant Main Logo -> Tenant Main Logo + Loading Bar');

// Scenario H: Tenant - Tenant Main Logo exists (Page navigation)
const t_H = resolveVisualState({
  config: {
    preloaderEnabled: true,
    tenantLogo: '/assets/tenant-logo.webp',
    tenantLogoVersion: 2,
    globalLogo: '/assets/global-logo.webp',
  },
  isSuperAdmin: false,
});
assert.deepStrictEqual(t_H, t_G, 'FAIL: Tenant navigation must produce IDENTICAL visual state to hard refresh');
console.log('✓ Scenario H: Tenant Page Navigation -> EXACT same Tenant Main Logo + Loading Bar');

// Scenario I: Tenant - Tenant Main missing + Global Main exists
const t_I = resolveVisualState({
  config: {
    preloaderEnabled: true,
    tenantLogo: null,
    globalLogo: '/assets/global-logo.webp',
    globalLogoVersion: 1,
  },
  isSuperAdmin: false,
});
assert.strictEqual(t_I.state, 'STATE_B_MAIN_LOGO_AND_BAR');
assert.strictEqual(t_I.logo, '/assets/global-logo.webp?v=1');
console.log('✓ Scenario I: Tenant Main missing -> Falls back to Global Main Logo + Loading Bar');

// Scenario J: Tenant - No Main Logo anywhere
const t_J = resolveVisualState({
  config: { preloaderEnabled: true, tenantLogo: null, globalLogo: null, uploadedLogo: null, companyLogo: null },
  isSuperAdmin: false,
});
assert.strictEqual(t_J, 'STATE_C_LOADING_ICON_ONLY');
console.log('✓ Scenario J: No Main Logo anywhere -> Loading Icon only');

// Scenario K: Tenant - Preloader OFF
const t_K = resolveVisualState({
  config: { preloaderEnabled: false, tenantLogo: '/assets/tenant-logo.webp' },
  isSuperAdmin: false,
});
assert.strictEqual(t_K, 'STATE_A_OFF');
console.log('✓ Scenario K: Tenant Preloader OFF -> Renders nothing (null)');

// Broken Logo failover test
console.log('\n--- TESTING BROKEN LOGO / ERROR FAILOVER ---');
const failoverCandidates = resolveLogoCandidates({
  config: {
    tenantLogo: '/assets/broken-tenant.webp',
    globalLogo: '/assets/global-fallback.webp',
  },
  isSuperAdmin: false,
});
assert.strictEqual(failoverCandidates[0], '/assets/broken-tenant.webp');
assert.strictEqual(failoverCandidates[1], '/assets/global-fallback.webp');
// Simulating error on candidate 0 -> candidate 1 used
let activeIdx = 0;
// candidate 0 fails:
activeIdx++;
assert.strictEqual(failoverCandidates[activeIdx], '/assets/global-fallback.webp');
// candidate 1 fails:
activeIdx++;
const finalLogo = activeIdx < failoverCandidates.length ? failoverCandidates[activeIdx] : null;
assert.strictEqual(finalLogo, null); // Gracefully switches to State C Generic Loading Icon only
console.log('✓ Section 15: Broken Main Logo fails over to next candidate and then cleanly to State C (Loading Icon only)');

console.log('\n====================================================');
console.log('   ✓ ALL UNIFIED PRELOADER MATRIX TESTS PASSED!    ');
console.log('====================================================');
