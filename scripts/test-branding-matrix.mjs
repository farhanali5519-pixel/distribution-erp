/**
 * SaleFlow ERP - Focused Branding Logo Priority Matrix Test
 *
 * Verifies Section 8 Test Matrix from Specification:
 * A. Tenant Main + Tenant Sidebar configured
 *    - Light: Tenant Main Logo
 *    - Dark: Tenant Sidebar Logo
 *
 * B. No Tenant Main, Global Main exists
 *    - Light: Global Main Logo
 *
 * C. Main Logo exists + Sidebar Logo exists
 *    - Light: Main Logo only
 *
 * D. Main Logo missing
 *    - Light: Sidebar Logo fallback allowed
 *
 * E. Theme switch:
 *    - Light -> Main
 *    - Dark -> Sidebar
 *    - Light -> Main
 *    - No glitch / deterministic switch
 */

import assert from 'node:assert';

// Candidate resolution logic mirroring BrandIdentity.tsx exactly
function resolveCandidates({
  isDarkSurface,
  isSuperAdmin = false,
  tenantLogo = null,
  tenantLogoVersion = null,
  globalLogo = null,
  globalLogoVersion = null,
  tenantSidebarLogo = null,
  tenantSidebarLogoVersion = null,
  globalSidebarLogo = null,
  globalSidebarLogoVersion = null,
  uploadedLogo = null,
  uploadedLogoVersion = null,
  companyLogo = null,
  uploadedSidebarLogo = null,
  uploadedSidebarLogoVersion = null,
  sidebarLogoAsset = null,
  sidebarLogoVersion = null,
  priorityLogoUrl = null,
}) {
  const list = [];

  // 1. Tenant Main Logo (explicit tenant logo or custom uploaded logo)
  const rawTenantMain = tenantLogo || null;
  const tenantMainUrl = rawTenantMain
    ? tenantLogoVersion
      ? `${rawTenantMain}?v=${tenantLogoVersion}`
      : rawTenantMain
    : null;

  // 2. Global Main Logo (system uploaded logo or company logo)
  const rawGlobalMain = globalLogo || uploadedLogo || companyLogo || null;
  const globalMainUrl = rawGlobalMain
    ? (globalLogoVersion || uploadedLogoVersion)
      ? `${rawGlobalMain}?v=${globalLogoVersion || uploadedLogoVersion}`
      : rawGlobalMain
    : null;

  // 3. Tenant Sidebar Logo (explicit tenant sidebar logo)
  const rawTenantSidebar = tenantSidebarLogo || null;
  const tenantSidebarUrl = rawTenantSidebar
    ? (tenantSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion)
      ? `${rawTenantSidebar}?v=${tenantSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion}`
      : rawTenantSidebar
    : null;

  // 4. Global Sidebar Logo (system uploaded sidebar logo or sidebar logo asset)
  const rawGlobalSidebar = globalSidebarLogo || uploadedSidebarLogo || sidebarLogoAsset || null;
  const globalSidebarUrl = rawGlobalSidebar
    ? (globalSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion)
      ? `${rawGlobalSidebar}?v=${globalSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion}`
      : rawGlobalSidebar
    : null;

  if (priorityLogoUrl) {
    list.push(priorityLogoUrl);
  }

  if (isSuperAdmin) {
    if (isDarkSurface) {
      if (globalSidebarUrl) list.push(globalSidebarUrl);
      if (globalMainUrl) list.push(globalMainUrl);
    } else {
      if (globalMainUrl) list.push(globalMainUrl);
      if (globalSidebarUrl) list.push(globalSidebarUrl);
    }
  } else {
    if (isDarkSurface) {
      // TENANT DARK MODE:
      // 1. Tenant Sidebar Logo
      // 2. Tenant Main Logo
      // 3. Global Sidebar Logo
      // 4. Global Main Logo
      if (tenantSidebarUrl) list.push(tenantSidebarUrl);
      if (tenantMainUrl) list.push(tenantMainUrl);
      if (globalSidebarUrl) list.push(globalSidebarUrl);
      if (globalMainUrl) list.push(globalMainUrl);
    } else {
      // TENANT LIGHT MODE:
      // 1. Tenant Main Logo
      // 2. Global Main ERP Logo
      // 3. Tenant Sidebar Logo (fallback only if no Main Logo exists)
      // 4. Global Sidebar Logo (fallback only if no Main Logo exists)
      if (tenantMainUrl) list.push(tenantMainUrl);
      if (globalMainUrl) list.push(globalMainUrl);
      if (tenantSidebarUrl) list.push(tenantSidebarUrl);
      if (globalSidebarUrl) list.push(globalSidebarUrl);
    }
  }

  return list.filter((url, index, self) => Boolean(url) && self.indexOf(url) === index);
}

function resolvePrimaryLogo(props) {
  const candidates = resolveCandidates(props);
  return candidates.length > 0 ? candidates[0] : null;
}

console.log('====================================================');
console.log('   SALEFLOW ERP - BRANDING LOGO TEST MATRIX   ');
console.log('====================================================\n');

// TEST A: Tenant Main + Tenant Sidebar configured
console.log('TEST A: Tenant Main + Tenant Sidebar configured');
{
  const tenantMain = '/uploads/tenant-main.webp';
  const tenantSidebar = '/uploads/tenant-sidebar.webp';
  const globalMain = '/uploads/global-main.webp';
  const globalSidebar = '/uploads/global-sidebar.webp';

  const props = {
    isSuperAdmin: false,
    tenantLogo: tenantMain,
    tenantSidebarLogo: tenantSidebar,
    globalLogo: globalMain,
    globalSidebarLogo: globalSidebar,
  };

  const lightLogo = resolvePrimaryLogo({ ...props, isDarkSurface: false });
  const darkLogo = resolvePrimaryLogo({ ...props, isDarkSurface: true });

  assert.strictEqual(lightLogo, tenantMain, 'TEST A FAIL: Light mode must use Tenant Main Logo');
  console.log('  ✓ Light Mode: Tenant Main Logo (' + lightLogo + ')');

  assert.strictEqual(darkLogo, tenantSidebar, 'TEST A FAIL: Dark mode must use Tenant Sidebar Logo');
  console.log('  ✓ Dark Mode:  Tenant Sidebar Logo (' + darkLogo + ')');
}

// TEST B: No Tenant Main, Global Main exists
console.log('\nTEST B: No Tenant Main, Global Main exists');
{
  const tenantSidebar = '/uploads/tenant-sidebar.webp';
  const globalMain = '/uploads/global-main.webp';
  const globalSidebar = '/uploads/global-sidebar.webp';

  const props = {
    isSuperAdmin: false,
    tenantLogo: null,
    tenantSidebarLogo: tenantSidebar,
    globalLogo: globalMain,
    globalSidebarLogo: globalSidebar,
  };

  const lightLogo = resolvePrimaryLogo({ ...props, isDarkSurface: false });
  assert.strictEqual(lightLogo, globalMain, 'TEST B FAIL: Light mode must use Global Main Logo');
  console.log('  ✓ Light Mode: Global Main Logo (' + lightLogo + ')');
}

// TEST C: Main Logo exists + Sidebar Logo exists
console.log('\nTEST C: Main Logo exists + Sidebar Logo exists');
{
  const mainLogo = '/uploads/main-logo.webp';
  const sidebarLogo = '/uploads/sidebar-logo.webp';

  const props = {
    isSuperAdmin: false,
    uploadedLogo: mainLogo,
    uploadedSidebarLogo: sidebarLogo,
  };

  const lightLogo = resolvePrimaryLogo({ ...props, isDarkSurface: false });
  assert.strictEqual(lightLogo, mainLogo, 'TEST C FAIL: Light mode must use Main Logo only');
  console.log('  ✓ Light Mode: Main Logo only (' + lightLogo + ')');
}

// TEST D: Main Logo missing (Sidebar Logo fallback allowed)
console.log('\nTEST D: Main Logo missing');
{
  const sidebarLogo = '/uploads/sidebar-fallback.webp';

  const props = {
    isSuperAdmin: false,
    uploadedLogo: null,
    companyLogo: null,
    uploadedSidebarLogo: sidebarLogo,
  };

  const lightLogo = resolvePrimaryLogo({ ...props, isDarkSurface: false });
  assert.strictEqual(lightLogo, sidebarLogo, 'TEST D FAIL: Light mode must allow Sidebar Logo fallback if Main Logo missing');
  console.log('  ✓ Light Mode: Sidebar Logo fallback allowed (' + lightLogo + ')');
}

// TEST E: Theme switch
console.log('\nTEST E: Theme switch: Light -> Main, Dark -> Sidebar, Light -> Main');
{
  const mainLogo = '/uploads/main.webp';
  const sidebarLogo = '/uploads/sidebar.webp';

  const baseProps = {
    isSuperAdmin: false,
    uploadedLogo: mainLogo,
    uploadedSidebarLogo: sidebarLogo,
  };

  const step1 = resolvePrimaryLogo({ ...baseProps, isDarkSurface: false });
  assert.strictEqual(step1, mainLogo, 'Step 1 should be Main Logo');

  const step2 = resolvePrimaryLogo({ ...baseProps, isDarkSurface: true });
  assert.strictEqual(step2, sidebarLogo, 'Step 2 should be Sidebar Logo');

  const step3 = resolvePrimaryLogo({ ...baseProps, isDarkSurface: false });
  assert.strictEqual(step3, mainLogo, 'Step 3 should switch back cleanly to Main Logo');

  console.log('  ✓ Step 1 (Light): ' + step1 + ' (Main)');
  console.log('  ✓ Step 2 (Dark):  ' + step2 + ' (Sidebar)');
  console.log('  ✓ Step 3 (Light): ' + step3 + ' (Main)');
  console.log('  ✓ No glitch, fully deterministic switch.');
}

console.log('\n====================================================');
console.log('   ✓ ALL 5 BRANDING MATRIX TESTS PASSED!   ');
console.log('====================================================');
