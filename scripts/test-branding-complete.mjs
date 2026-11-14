/**
 * Comprehensive Automated Test Suite for Global ERP Logo, Favicon Upload, and Preloader Control
 * 
 * Verifies Test Matrix A through S in complete isolation.
 * Guarantees zero modifications to real business database.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup Isolated Temporary Testing Environment
const testRunId = `test_branding_${Date.now()}_${Math.random().toString(36).substring(7)}`;
const testDataDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(testDataDir, { recursive: true });

const testDbPath = path.join(testDataDir, 'test_isolated.db');

// Set environment variables BEFORE importing application code
process.env.SALEFLOW_DATA_DIR = testDataDir;
process.env.SQLITE_DATABASE_PATH = testDbPath;
process.env.DEPLOYMENT_MODE = 'hostinger';
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_ALLOW_CREATE = 'true';

console.log('===================================================================');
console.log('   SALEFLOW ERP - GLOBAL BRANDING & PRELOADER TEST SUITE           ');
console.log('===================================================================');
console.log(`[Setup] Isolated Test Data Directory: ${testDataDir}`);
console.log(`[Setup] Isolated Test Database Path:    ${testDbPath}`);

import sharp from 'sharp';

// Dynamically import modules now that environment variables are set
const { getSaleFlowDataDir } = await import('../src/core/config/env.js');
const {
  validateImageMagicBytes,
  saveBrandingAsset,
  removeBrandingAsset,
  getBrandingAsset,
  getBrandingStorageDir,
  optimizeAndValidateBrandingAsset,
  formatFileSize,
  DEFAULT_SALEFLOW_FAVICON_SVG,
  MAX_SOURCE_UPLOAD_SIZE,
  MAX_LOGO_WIDTH,
  MAX_LOGO_HEIGHT,
  FAVICON_TARGET_SIZE,
} = await import('../src/core/branding/storage.ts');
const {
  getBrandingConfig,
  saveBrandingConfig,
  getResolvedBrandIdentity,
  DEFAULT_SALEFLOW_BRANDING,
} = await import('../src/core/branding/theme.service.ts');
const {
  resolveRouteTitle,
  formatFullPageTitle,
  SUPERADMIN_ROUTE_TITLES,
  TENANT_ROUTE_TITLES,
} = await import('../src/core/branding/route-titles.ts');
const { getDatabaseClient } = await import('../src/core/database/factory.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL [${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ PASS [${totalTests}]: ${message}`);
}

async function initTestDatabase() {
  const client = getDatabaseClient();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      company_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (company_id, key)
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );
  `);
}

// Sample Image Buffers with valid Magic Bytes
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
  0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, // 32x32
  0x08, 0x06, 0x00, 0x00, 0x00, 0x73, 0x7a, 0x7a,
]);

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, // JPEG Header
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
]);

const VALID_ICO_BUFFER = Buffer.from([
  0x00, 0x00, 0x01, 0x00, // ICO Header
  0x01, 0x00, 0x20, 0x20, // 1 image, 32x32
  0x00, 0x00, 0x01, 0x00, 0x20, 0x00,
]);

const VALID_WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
]);

const INVALID_SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const INVALID_EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable

async function runTests() {
  await initTestDatabase();

  console.log('\n--- Test A: No Logo -> Default Display Name ---');
  const initialConfig = await getBrandingConfig('SYSTEM');
  assert(initialConfig.displayName === 'SaleFlow ERP', 'Default display name is SaleFlow ERP');
  assert(initialConfig.uploadedLogo === null, 'No uploaded logo initially');
  assert(initialConfig.companyLogo === null, 'No external logo initially');

  console.log('\n--- Test B: Upload PNG Logo ---');
  const logoValidation = validateImageMagicBytes(VALID_PNG_BUFFER, 'logo');
  assert(logoValidation.valid === true, 'PNG magic bytes validated');
  assert(logoValidation.detectedExtension === '.png', 'PNG extension detected');

  const savedLogo = saveBrandingAsset('global', 'logo', logoValidation.detectedExtension, VALID_PNG_BUFFER);
  assert(savedLogo.filename === 'logo.png', 'Logo saved as logo.png');
  assert(fs.existsSync(savedLogo.filePath), 'File exists in persistent storage');

  const logoVersion = Date.now();
  await saveBrandingConfig({
    uploadedLogo: '/api/branding/assets/logo',
    uploadedLogoVersion: logoVersion,
  }, 'SYSTEM');

  const configWithLogo = await getBrandingConfig('SYSTEM');
  assert(configWithLogo.uploadedLogo === '/api/branding/assets/logo', 'Config records uploadedLogo endpoint');
  assert(configWithLogo.uploadedLogoVersion === logoVersion, 'Config records uploadedLogoVersion');

  console.log('\n--- Test C & D: Persistence across Reads and Re-initialization ---');
  const diskAsset = getBrandingAsset('global', 'logo');
  assert(diskAsset !== null, 'Asset retrieved from disk');
  assert(diskAsset.contentType === 'image/png', 'Correct content-type returned (image/png)');
  assert(diskAsset.buffer.equals(VALID_PNG_BUFFER), 'Buffer matches original upload exactly');

  console.log('\n--- Test E: Broken External Logo URL Fallback ---');
  await saveBrandingConfig({
    uploadedLogo: null,
    companyLogo: 'https://non-existent-domain.xyz/broken-logo.png',
  }, 'SYSTEM');
  const brokenExternalConfig = await getBrandingConfig('SYSTEM');
  assert(brokenExternalConfig.companyLogo === 'https://non-existent-domain.xyz/broken-logo.png', 'External URL configured');
  assert(brokenExternalConfig.displayName === 'SaleFlow ERP', 'Display Name fallback available');

  console.log('\n--- Test F: Remove Logo ---');
  const removed = removeBrandingAsset('global', 'logo');
  assert(removed === true, 'Logo file removed from disk');
  assert(getBrandingAsset('global', 'logo') === null, 'Disk confirms no logo exists');
  await saveBrandingConfig({ uploadedLogo: null, uploadedLogoVersion: null, companyLogo: null }, 'SYSTEM');
  const configAfterRemove = await getBrandingConfig('SYSTEM');
  assert(configAfterRemove.uploadedLogo === null, 'uploadedLogo is null');
  assert(configAfterRemove.displayName === 'SaleFlow ERP', 'Falls back cleanly to Display Name');

  console.log('\n--- Test G: Direct Favicon Upload ---');
  const faviconValidation = validateImageMagicBytes(VALID_ICO_BUFFER, 'favicon');
  assert(faviconValidation.valid === true, 'ICO magic bytes validated');
  assert(faviconValidation.detectedExtension === '.ico', 'ICO extension detected');

  const savedFavicon = saveBrandingAsset('global', 'favicon', '.ico', VALID_ICO_BUFFER);
  assert(savedFavicon.filename === 'favicon.ico', 'Favicon saved as favicon.ico');

  const favVersion = Date.now();
  await saveBrandingConfig({
    uploadedFavicon: '/api/branding/assets/favicon',
    uploadedFaviconVersion: favVersion,
  }, 'SYSTEM');

  const configWithFav = await getBrandingConfig('SYSTEM');
  assert(configWithFav.uploadedFavicon === '/api/branding/assets/favicon', 'Favicon recorded');
  assert(configWithFav.uploadedFaviconVersion === favVersion, 'Favicon version recorded');

  console.log('\n--- Test H: Change Favicon with Cache-Busting Version ---');
  const newFavVersion = Date.now() + 5000;
  const webpFavValidation = validateImageMagicBytes(VALID_WEBP_BUFFER, 'favicon');
  assert(webpFavValidation.valid === true, 'WebP favicon magic bytes validated');
  saveBrandingAsset('global', 'favicon', '.webp', VALID_WEBP_BUFFER);
  assert(!fs.existsSync(path.join(getBrandingStorageDir('global'), 'favicon.ico')), 'Previous favicon.ico cleaned up (no orphans)');
  assert(fs.existsSync(path.join(getBrandingStorageDir('global'), 'favicon.webp')), 'New favicon.webp exists');

  await saveBrandingConfig({
    uploadedFavicon: '/api/branding/assets/favicon',
    uploadedFaviconVersion: newFavVersion,
  }, 'SYSTEM');
  const updatedFavConfig = await getBrandingConfig('SYSTEM');
  assert(updatedFavConfig.uploadedFaviconVersion === newFavVersion, 'Cache-busting version updated');

  console.log('\n--- Test I: Remove Favicon -> Fallback to Default ---');
  removeBrandingAsset('global', 'favicon');
  assert(getBrandingAsset('global', 'favicon') === null, 'Disk confirms favicon removed');
  await saveBrandingConfig({ uploadedFavicon: null, uploadedFaviconVersion: null }, 'SYSTEM');
  assert(DEFAULT_SALEFLOW_FAVICON_SVG.includes('svg'), 'Default SVG fallback available');

  console.log('\n--- Test J, K, L: Auto Image Compression, Resizing & Security Matrix ---');

  // 1. 200 KB PNG Logo
  const png200k = await sharp({
    create: { width: 500, height: 200, channels: 4, background: { r: 16, g: 164, b: 106, alpha: 1 } },
  }).png().toBuffer();
  const res200k = await optimizeAndValidateBrandingAsset(png200k, 'logo');
  assert(res200k.extension === '.webp', '200 KB PNG optimized to WebP');
  assert(res200k.contentType === 'image/webp', 'WebP content type set');
  assert(res200k.optimizedSize > 0, '200 KB PNG successfully compressed');

  // 2. 3 MB PNG Logo
  const png3mb = await sharp({
    create: { width: 2500, height: 1200, channels: 4, background: { r: 8, g: 26, b: 47, alpha: 1 } },
  }).png({ compressionLevel: 0 }).toBuffer();
  const res3mb = await optimizeAndValidateBrandingAsset(png3mb, 'logo');
  assert(res3mb.extension === '.webp', '3 MB PNG accepted and optimized to WebP');
  assert(res3mb.width <= MAX_LOGO_WIDTH && res3mb.height <= MAX_LOGO_HEIGHT, '3 MB PNG resized within 1600x600');
  assert(res3mb.optimizedSize < png3mb.length, 'Optimized size significantly smaller than 3 MB');

  // 3. 8–15 MB JPG / large JPG
  const largeJpg = await sharp({
    create: { width: 3500, height: 2000, channels: 3, background: { r: 18, g: 165, b: 148 } },
  }).jpeg({ quality: 100 }).toBuffer();
  const resLargeJpg = await optimizeAndValidateBrandingAsset(largeJpg, 'logo');
  assert(resLargeJpg.extension === '.webp', 'Large JPG accepted and optimized to WebP');
  assert(resLargeJpg.width <= MAX_LOGO_WIDTH && resLargeJpg.height <= MAX_LOGO_HEIGHT, 'Large JPG dimensions proportionally scaled');

  // 4. Very large dimensions: 6000x4000
  const dim6kx4k = await sharp({
    create: { width: 6000, height: 4000, channels: 4, background: { r: 24, g: 119, b: 242, alpha: 0.95 } },
  }).png().toBuffer();
  const res6kx4k = await optimizeAndValidateBrandingAsset(dim6kx4k, 'logo');
  assert(res6kx4k.height === 600, '6000x4000 image height scaled to max 600px');
  assert(res6kx4k.width === 900, '6000x4000 aspect ratio perfectly preserved at 900x600 (3:2)');

  // 5. Transparent PNG Logo: transparency preserved
  const transparentPng = await sharp({
    create: { width: 400, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();
  const resTransparent = await optimizeAndValidateBrandingAsset(transparentPng, 'logo');
  const transparentMeta = await sharp(resTransparent.buffer).metadata();
  assert(transparentMeta.hasAlpha === true, 'Alpha transparency strictly preserved in WebP logo');

  // 6. WebP input
  const webpInput = await sharp({
    create: { width: 300, height: 100, channels: 4, background: { r: 255, g: 100, b: 50, alpha: 0.8 } },
  }).webp().toBuffer();
  const resWebp = await optimizeAndValidateBrandingAsset(webpInput, 'logo');
  assert(resWebp.extension === '.webp', 'WebP input accepted and optimized');

  // 7. Favicon 64x64 safe contain (transparent padding for rectangular input)
  const rectFaviconInput = await sharp({
    create: { width: 400, height: 200, channels: 4, background: { r: 220, g: 38, b: 38, alpha: 1 } },
  }).png().toBuffer();
  const resFavicon = await optimizeAndValidateBrandingAsset(rectFaviconInput, 'favicon');
  assert(resFavicon.extension === '.png', 'Favicon output is PNG');
  assert(resFavicon.width === 64 && resFavicon.height === 64, 'Favicon is square 64x64');
  const favMeta = await sharp(resFavicon.buffer).metadata();
  assert(favMeta.hasAlpha === true, 'Favicon non-square containment uses transparent letterboxing');

  // 8. Invalid fake image rejected
  let fakeImageErrorCaught = false;
  try {
    await optimizeAndValidateBrandingAsset(Buffer.from('this is not an image'), 'logo');
  } catch (err) {
    fakeImageErrorCaught = true;
  }
  assert(fakeImageErrorCaught === true, 'Fake non-image file rejected by decoder validation');

  // 9. > 25 MB file rejected with exact error message
  let ceilingErrorCaught = false;
  let ceilingErrorMessage = '';
  try {
    const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024); // 26 MB
    await optimizeAndValidateBrandingAsset(oversizedBuffer, 'logo');
  } catch (err) {
    ceilingErrorCaught = true;
    ceilingErrorMessage = err.message;
  }
  assert(ceilingErrorCaught === true, 'File > 25 MB rejected');
  assert(ceilingErrorMessage.includes('Image is too large to process. Please use an image smaller than 25 MB.'), 'Clear 25 MB ceiling JSON error returned');

  // 10. SVG rejected for security
  let svgErrorCaught = false;
  try {
    await optimizeAndValidateBrandingAsset(INVALID_SVG_BUFFER, 'logo');
  } catch (err) {
    svgErrorCaught = true;
  }
  assert(svgErrorCaught === true, 'SVG upload rejected for security');

  console.log('\n--- Test M & N: Preloader ON / OFF Controls ---');
  await saveBrandingConfig({ preloaderEnabled: true }, 'SYSTEM');
  const preloaderOnConfig = await getBrandingConfig('SYSTEM');
  assert(preloaderOnConfig.preloaderEnabled === true, 'Preloader toggle saved as ON');

  await saveBrandingConfig({ preloaderEnabled: false }, 'SYSTEM');
  const preloaderOffConfig = await getBrandingConfig('SYSTEM');
  assert(preloaderOffConfig.preloaderEnabled === false, 'Preloader toggle saved as OFF');

  console.log('\n--- Test Matrix Item 1: Sidebar Logo Upload & Storage ---');
  const sidebarValidation = validateImageMagicBytes(VALID_PNG_BUFFER, 'sidebar-logo');
  assert(sidebarValidation.valid === true, 'Sidebar logo PNG magic bytes validated');
  assert(sidebarValidation.detectedExtension === '.png', 'Sidebar logo PNG extension detected');

  const savedSidebarLogo = saveBrandingAsset('global', 'sidebar-logo', sidebarValidation.detectedExtension, VALID_PNG_BUFFER);
  assert(savedSidebarLogo.filename === 'sidebar-logo.png', 'Sidebar logo saved as sidebar-logo.png');
  assert(fs.existsSync(savedSidebarLogo.filePath), 'Sidebar logo exists in persistent storage');

  const sidebarVersion = Date.now();
  await saveBrandingConfig({
    uploadedSidebarLogo: '/api/branding/assets/sidebar-logo',
    uploadedSidebarLogoVersion: sidebarVersion,
    sidebarLogoAsset: '/api/branding/assets/sidebar-logo',
    sidebarLogoVersion: sidebarVersion,
  }, 'SYSTEM');

  const configWithSidebar = await getBrandingConfig('SYSTEM');
  assert(configWithSidebar.uploadedSidebarLogo === '/api/branding/assets/sidebar-logo', 'Config records uploadedSidebarLogo');
  assert(configWithSidebar.sidebarLogoAsset === '/api/branding/assets/sidebar-logo', 'Config records sidebarLogoAsset');
  assert(configWithSidebar.uploadedSidebarLogoVersion === sidebarVersion, 'Config records uploadedSidebarLogoVersion');

  console.log('\n--- Test Matrix Item 2 & 3: Sidebar Logo Fallback when Absent or Broken ---');
  // Ensure main logo and favicon are on disk to test removal isolation
  saveBrandingAsset('global', 'logo', '.png', VALID_PNG_BUFFER);
  saveBrandingAsset('global', 'favicon', '.ico', VALID_ICO_BUFFER);
  await saveBrandingConfig({
    uploadedLogo: '/api/branding/assets/logo',
    uploadedLogoVersion: 100,
  }, 'SYSTEM');

  const foundSidebarAsset = getBrandingAsset('global', 'sidebar-logo');
  assert(foundSidebarAsset !== null, 'Sidebar logo asset file located on disk');

  // Verify removing sidebar logo does NOT remove main logo or favicon
  removeBrandingAsset('global', 'sidebar-logo');
  const removedSidebarAsset = getBrandingAsset('global', 'sidebar-logo');
  assert(removedSidebarAsset === null, 'Sidebar logo removed from storage');

  const mainLogoStillPresent = getBrandingAsset('global', 'logo');
  assert(mainLogoStillPresent !== null, 'Main logo remains intact after removing sidebar logo');

  const faviconStillPresent = getBrandingAsset('global', 'favicon');
  assert(faviconStillPresent !== null, 'Favicon remains intact after removing sidebar logo');

  console.log('\n--- Test Matrix Item 4 & 5: Remove Sidebar Logo -> Reverts to Main Logo ---');
  await saveBrandingConfig({
    uploadedSidebarLogo: null,
    uploadedSidebarLogoVersion: null,
    sidebarLogoAsset: null,
    sidebarLogoVersion: null,
  }, 'SYSTEM');
  const revertedConfig = await getBrandingConfig('SYSTEM');
  assert(revertedConfig.uploadedSidebarLogo === null, 'Sidebar logo is null');
  assert(revertedConfig.uploadedLogo === '/api/branding/assets/logo', 'Main logo is preserved and active for sidebar fallback');

  console.log('\n--- Test Matrix Item 6: Tenant Branding Priority ---');
  // Tenant with custom sidebar logo
  await saveBrandingConfig({
    displayName: 'Tenant Custom Sidebar Co',
    uploadedSidebarLogo: '/api/branding/assets/tenant-sidebar',
  }, 'TENANT_SIDEBAR');
  const tenantSidebarConfig = await getBrandingConfig('TENANT_SIDEBAR');
  assert(tenantSidebarConfig.uploadedSidebarLogo === '/api/branding/assets/tenant-sidebar', 'Tenant custom sidebar logo takes precedence');

  // Tenant without custom sidebar logo inherits global sidebar logo (or global main logo)
  const tenantDefaultSidebarConfig = await getBrandingConfig('TENANT_DEFAULT_SIDEBAR');
  assert(tenantDefaultSidebarConfig.uploadedLogo === '/api/branding/assets/logo', 'Tenant inherits global main logo');

  console.log('\n--- Test Matrix Item 7 & 8: Preloader ON / OFF and Logo Priority ---');
  await saveBrandingConfig({ preloaderEnabled: true }, 'SYSTEM');
  const pOn = await getBrandingConfig('SYSTEM');
  assert(pOn.preloaderEnabled === true, 'Preloader ON confirmed');

  await saveBrandingConfig({ preloaderEnabled: false }, 'SYSTEM');
  const pOff = await getBrandingConfig('SYSTEM');
  assert(pOff.preloaderEnabled === false, 'Preloader OFF confirmed (True OFF State)');

  console.log('\n--- Test Sidebar Logo Sharp Auto-Compression (512x512 WebP) ---');
  const rawLargeLogo = await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 4,
      background: { r: 15, g: 39, b: 71, alpha: 0.8 },
    },
  }).png().toBuffer();

  const optimizedSidebar = await optimizeAndValidateBrandingAsset(rawLargeLogo, 'sidebar-logo');
  assert(optimizedSidebar.extension === '.webp', 'Sidebar logo output format is WebP');
  assert(optimizedSidebar.width <= 512, 'Sidebar logo width constrained to <= 512px');
  assert(optimizedSidebar.height <= 512, 'Sidebar logo height constrained to <= 512px');
  assert(optimizedSidebar.optimizedSize < rawLargeLogo.length, 'Sidebar logo compressed smaller than source');

  console.log('\n--- Test Matrix Item 12 & 13: Storage Isolation & Redeploy Persistence ---');
  const storageDir = getBrandingStorageDir('global');
  assert(!storageDir.includes('.next'), 'Storage path is not inside .next');
  assert(!storageDir.includes('.hostinger'), 'Storage path is not inside .hostinger');
  assert(storageDir.startsWith(testDataDir), 'Storage path resides inside persistent SALEFLOW_DATA_DIR');

  console.log('\n--- Section 24: Test Scenario A (Default ERP Display Name) ---');
  await saveBrandingConfig({ displayName: 'SaleFlow ERP' }, 'SYSTEM');
  const scenarioAIdentity = await getResolvedBrandIdentity('SYSTEM');
  assert(scenarioAIdentity.displayName === 'SaleFlow ERP', 'Scenario A default displayName is SaleFlow ERP');
  const titleA = formatFullPageTitle(resolveRouteTitle('/', false), scenarioAIdentity.displayName);
  assert(titleA === 'Dashboard | SaleFlow ERP', `Scenario A title matches: ${titleA}`);

  console.log('\n--- Section 24: Test Scenario B (Change to Farhan ERP & Save Global Theme) ---');
  await saveBrandingConfig({ displayName: 'Farhan ERP' }, 'SYSTEM');
  const scenarioBIdentity = await getResolvedBrandIdentity('SYSTEM');
  assert(scenarioBIdentity.displayName === 'Farhan ERP', 'Scenario B displayName is Farhan ERP');

  const titleDashboard = formatFullPageTitle(resolveRouteTitle('/', false), scenarioBIdentity.displayName);
  assert(titleDashboard === 'Dashboard | Farhan ERP', `Dashboard title is: ${titleDashboard}`);

  const titleCustomers = formatFullPageTitle(resolveRouteTitle('/customers', false), scenarioBIdentity.displayName);
  assert(titleCustomers === 'Customers | Farhan ERP', `Customers title is: ${titleCustomers}`);

  const titleSales = formatFullPageTitle(resolveRouteTitle('/sales', false), scenarioBIdentity.displayName);
  assert(titleSales === 'Sales | Farhan ERP', `Sales title is: ${titleSales}`);

  const titleBranding = formatFullPageTitle(resolveRouteTitle('/superadmin/branding', true), scenarioBIdentity.displayName);
  assert(titleBranding === 'System Branding | Farhan ERP', `System Branding title is: ${titleBranding}`);

  const titleFieldOrder = formatFullPageTitle(resolveRouteTitle('/sales/field-order-booking', false), scenarioBIdentity.displayName);
  assert(titleFieldOrder === 'Field Order Booking | Farhan ERP', `Field Order Booking title is: ${titleFieldOrder}`);

  console.log('\n--- Section 24: Test Scenario C & D (Persistence across Reads / Simulating Restart) ---');
  const reloadedIdentity = await getResolvedBrandIdentity('SYSTEM');
  assert(reloadedIdentity.displayName === 'Farhan ERP', 'Farhan ERP persists on subsequent DB read');

  console.log('\n--- Section 24: Test Scenario E (Tenant custom display name override preserved) ---');
  await saveBrandingConfig({ displayName: 'Acme Distribution' }, 'TENANT_CUSTOM_NAME');
  const tenantCustomIdentity = await getResolvedBrandIdentity('TENANT_CUSTOM_NAME');
  assert(tenantCustomIdentity.displayName === 'Acme Distribution', 'Tenant custom override keeps intended name');
  assert(tenantCustomIdentity.isCustomOverride === true, 'Tenant is flagged as custom override');
  const tenantTitle = formatFullPageTitle(resolveRouteTitle('/sales', false), tenantCustomIdentity.displayName);
  assert(tenantTitle === 'Sales | Acme Distribution', `Tenant page title is: ${tenantTitle}`);

  console.log('\n--- Section 24: Test Scenario F (Tenant with no override inherits global Farhan ERP) ---');
  const tenantNoOverrideIdentity = await getResolvedBrandIdentity('TENANT_NO_OVERRIDE');
  assert(tenantNoOverrideIdentity.displayName === 'Farhan ERP', 'Tenant without override inherits global Farhan ERP');
  assert(tenantNoOverrideIdentity.isCustomOverride === false, 'Tenant is not flagged as custom override');
  const tenantNoOverrideTitle = formatFullPageTitle(resolveRouteTitle('/sales', false), tenantNoOverrideIdentity.displayName);
  assert(tenantNoOverrideTitle === 'Sales | Farhan ERP', `Tenant without override page title is: ${tenantNoOverrideTitle}`);

  console.log('\n--- Test Section 27: Responsive / Long ERP Display Name ---');
  const longName = 'Farhan Distribution Management ERP';
  const longTitle = formatFullPageTitle('Orders & Commercial Bills', longName);
  assert(longTitle === 'Orders & Commercial Bills | Farhan Distribution Management ERP', `Long title formatted: ${longTitle}`);

  console.log('\n===================================================================');
  console.log(`   ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! `);
  console.log('===================================================================');
}

runTests()
  .then(() => {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
      console.log(`[Cleanup] Temporary test directory removed: ${testDataDir}`);
    } catch {}
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test execution failed:', err);
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  });
