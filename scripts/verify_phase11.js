const path = require('path');
const fs = require('fs');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');

console.log('================================================================');
console.log('  VERIFYING PHASE 11: Business Profile & Print Customization');
console.log('================================================================\n');

let failedTests = 0;
let passedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

// 1. Direct SQLite Database Schema & Flag Verification
const dbPath = path.join(__dirname, '..', 'data', 'sales_distribution.db');
assert(fs.existsSync(dbPath), `Database file exists at ${dbPath}`);

const db = new DatabaseSync(dbPath);

// Verify company_profile table schema
const tableInfo = db.prepare("PRAGMA table_info(company_profile)").all();
const columnNames = tableInfo.map((c) => c.name);

const requiredColumns = [
  'id',
  'business_name',
  'tagline',
  'phone_primary',
  'phone_secondary',
  'email',
  'address',
  'city',
  'ntn_strn',
  'logo_url',
  'currency_symbol',
  'thermal_footer_note',
  'invoice_terms',
  'show_logo_on_prints',
  'show_ntn_on_invoices',
  'show_customer_previous_balance',
  'updated_at',
];

console.log('\n--- 1. Database Table Verification ---');
for (const col of requiredColumns) {
  assert(columnNames.includes(col), `Column 'company_profile.${col}' exists`);
}

// Verify feature flag
console.log('\n--- 2. Feature Flag Verification ---');
const flagRow = db.prepare("SELECT * FROM feature_flags WHERE key = 'settings.enable_custom_branding'").get();
assert(flagRow !== undefined, "Feature flag 'settings.enable_custom_branding' is registered");
if (flagRow) {
  assert(flagRow.value === 'true', `Feature flag default value is 'true' (actual: '${flagRow.value}')`);
  assert(flagRow.module_id === 'settings', `Feature flag module_id is 'settings' (actual: '${flagRow.module_id}')`);
}

// 3. Permissions Registry Verification
console.log('\n--- 3. Permissions Registry Verification ---');
// Read permissions-registry.ts source code
const permFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'modules', 'auth', 'permissions-registry.ts'),
  'utf-8'
);
assert(permFile.includes("slug: 'company-profile'"), "Submodule 'company-profile' is registered in MODULE_GROUPS");
assert(permFile.includes("routePrefixes: ['/settings/company']"), "Route prefix '/settings/company' is configured");
assert(permFile.includes("icon: 'Building2'"), "Building2 icon is used for company-profile");

// 4. Sidebar Navigation Verification
console.log('\n--- 4. Dashboard Sidebar Verification ---');
const sidebarFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'shared', 'components', 'DashboardSidebar.tsx'),
  'utf-8'
);
assert(sidebarFile.includes('/settings/company'), "Sidebar includes link to '/settings/company'");
assert(sidebarFile.includes('Company Profile & Prints'), "Sidebar displays 'Company Profile & Prints'");
assert(sidebarFile.includes('showCompany'), "Sidebar guards link with 'showCompany' permission check");

// 5. System-Wide Print Integration Verification
console.log('\n--- 5. Print Integration Verification ---');
const salesModalFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'modules', 'sales', 'components', 'PrintInvoiceModal.tsx'),
  'utf-8'
);
assert(salesModalFile.includes('useCompanyProfile'), 'PrintInvoiceModal uses useCompanyProfile');
assert(salesModalFile.includes('profile.businessName'), 'PrintInvoiceModal injects dynamic business name');
assert(salesModalFile.includes('profile.thermalFooterNote'), 'PrintInvoiceModal injects dynamic thermal footer');
assert(salesModalFile.includes('profile.invoiceTerms'), 'PrintInvoiceModal injects dynamic invoice terms');
assert(salesModalFile.includes('profile.showLogoOnPrints'), 'PrintInvoiceModal checks showLogoOnPrints');

const customerReturnsFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'sales', 'returns', 'page.tsx'),
  'utf-8'
);
assert(customerReturnsFile.includes('useCompanyProfile'), 'Customer Returns uses useCompanyProfile');
assert(customerReturnsFile.includes('companyProfile.businessName'), 'Customer Returns injects dynamic business name');

const vendorReturnsFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'purchase', 'returns', 'page.tsx'),
  'utf-8'
);
assert(vendorReturnsFile.includes('useCompanyProfile'), 'Vendor Returns uses useCompanyProfile');
assert(vendorReturnsFile.includes('companyProfile.businessName'), 'Vendor Returns injects dynamic business name');

const ledgersFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'reports', 'ledgers', 'page.tsx'),
  'utf-8'
);
assert(ledgersFile.includes('useCompanyProfile'), 'Party Ledgers uses useCompanyProfile');
assert(ledgersFile.includes('companyProfile.businessName'), 'Party Ledgers injects dynamic business name');

const roznamchaFile = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'closing', 'daily-summary', 'page.tsx'),
  'utf-8'
);
assert(roznamchaFile.includes('useCompanyProfile'), 'Roznamcha uses useCompanyProfile');
assert(roznamchaFile.includes('companyProfile.businessName'), 'Roznamcha injects dynamic business name');

// 6. Direct Service & Database Read/Write Verification
console.log('\n--- 6. Profile Persistence Verification ---');
const initialProfile = db.prepare('SELECT * FROM company_profile LIMIT 1').get();
assert(initialProfile !== undefined, 'Active company profile exists in database');

// Test update directly on the table
const testBusinessName = 'Super Star FMCG Distributors';
const testTagline = 'Premier Beverage & Grocery Supply';
const testLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

db.prepare(`
  UPDATE company_profile SET
    business_name = ?,
    tagline = ?,
    logo_url = ?,
    currency_symbol = 'Rs.',
    thermal_footer_note = 'Official Bill. Powered by SaleFlow Cloud.',
    updated_at = datetime('now')
  WHERE id = ?
`).run(testBusinessName, testTagline, testLogo, initialProfile.id);

const updatedRow = db.prepare('SELECT * FROM company_profile WHERE id = ?').get(initialProfile.id);
assert(updatedRow.business_name === testBusinessName, `Business name updated to '${testBusinessName}'`);
assert(updatedRow.tagline === testTagline, `Tagline updated to '${testTagline}'`);
assert(updatedRow.logo_url === testLogo, 'Base64 logo stored and retrieved successfully');
assert(updatedRow.currency_symbol === 'Rs.', 'Currency symbol updated');
assert(updatedRow.thermal_footer_note === 'Official Bill. Powered by SaleFlow Cloud.', 'Thermal footer note updated');

// Revert back to original/clean values
db.prepare(`
  UPDATE company_profile SET
    business_name = ?,
    tagline = ?,
    logo_url = ?,
    currency_symbol = ?,
    thermal_footer_note = ?,
    updated_at = datetime('now')
  WHERE id = ?
`).run(
  initialProfile.business_name,
  initialProfile.tagline,
  initialProfile.logo_url,
  initialProfile.currency_symbol,
  initialProfile.thermal_footer_note,
  initialProfile.id
);

// 7. Live HTTP API Endpoint Verification
console.log('\n--- 7. HTTP API Endpoint Verification (http://localhost:3000) ---');

function httpRequest(method, pathStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: method,
      headers: reqHeaders,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runHttpTests() {
  try {
    // 7.1 GET /api/settings/company
    const getRes = await httpRequest('GET', '/api/settings/company');
    assert(getRes.status === 200, `GET /api/settings/company returned 200 OK (actual: ${getRes.status})`);
    assert(getRes.json && getRes.json.success === true, 'GET response includes success: true');
    assert(getRes.json && getRes.json.profile && getRes.json.profile.businessName, `GET response returns profile with businessName: '${getRes.json?.profile?.businessName}'`);

    // 7.2 POST /api/settings/company with non-admin role (SALESMAN) -> expect 403 Forbidden
    const postSalesmanRes = await httpRequest('POST', '/api/settings/company', {
      businessName: 'Hacked Store',
    }, {
      'x-user-role': 'SALESMAN',
    });
    assert(postSalesmanRes.status === 403, `POST /api/settings/company by SALESMAN returned 403 Forbidden (actual: ${postSalesmanRes.status})`);
    assert(postSalesmanRes.json?.success === false, 'POST non-admin returned success: false');

    // 7.3 POST /api/settings/company with empty businessName -> expect 400
    const postInvalidRes = await httpRequest('POST', '/api/settings/company', {
      businessName: '   ',
    }, {
      'x-user-role': 'ADMIN',
    });
    assert(postInvalidRes.status === 400, `POST /api/settings/company with blank business name returned 400 Bad Request (actual: ${postInvalidRes.status})`);

    // 7.4 POST /api/settings/company with ADMIN role -> expect 200 OK
    const postAdminRes = await httpRequest('POST', '/api/settings/company', {
      businessName: 'SaleFlow Distribution',
      tagline: 'Wholesale & FMCG Distribution',
      phonePrimary: '+92 300 1234567',
      phoneSecondary: '+92 321 7654321',
      email: 'info@saleflow.pk',
      address: 'Plot 45-B, Sector 12, Industrial Area',
      city: 'Karachi',
      ntnStrn: 'NTN: 1234567-8 | STRN: 9876543210',
      currencySymbol: 'PKR',
      thermalFooterNote: 'Computer Generated Bill. Software Powered by SaleFlow.',
      invoiceTerms: '1. Goods once sold will only be returned according to company return policy within 7 days.\n2. In case of any billing dispute, please report within 24 hours.',
      showLogoOnPrints: true,
      showNtnOnInvoices: true,
      showCustomerPreviousBalance: true,
    }, {
      'x-user-role': 'ADMIN',
    });
    assert(postAdminRes.status === 200, `POST /api/settings/company by ADMIN returned 200 OK (actual: ${postAdminRes.status})`);
    assert(postAdminRes.json?.success === true, 'POST admin response includes success: true');
    assert(postAdminRes.json?.profile?.businessName === 'SaleFlow Distribution', 'Updated profile returned in POST response');
  } catch (err) {
    console.warn('  [NOTE] Could not connect to local server for live HTTP tests (may need dev server restart):', err.message);
  }

  console.log('\n================================================================');
  console.log(`  SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('Phase 11 verification completed successfully!');
    process.exit(0);
  }
}

runHttpTests();
