import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { 
  CompanyProvisioningService 
} from '../src/core/tenancy/company-provisioning.service.ts';
import { 
  RESERVED_COMPANY_SLUGS, 
  DEFAULT_COMPANY_ID,
  SUPERADMIN_COOKIE_NAME,
  SESSION_COOKIE_NAME 
} from '../src/core/tenancy/constants.ts';
import { 
  SuperAdminService 
} from '../src/core/auth/superadmin.service.ts';
import { 
  signSuperAdminToken, 
  verifySuperAdminToken, 
  requireSuperAdmin, 
  SuperAdminAuthError,
  buildSuperAdminSessionPayload 
} from '../src/core/auth/superadmin-session.ts';
import { 
  signSessionToken, 
  buildSessionPayload 
} from '../src/core/auth/session.ts';
import { AuthService } from '../src/modules/auth/service.ts';
import { isModuleEnabled, isFeatureEnabled, getCompanySetting } from '../src/core/tenancy/enforcement.ts';

const DB_PATH = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(DB_PATH);

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

async function runPhase3BTests() {
  console.log('\n=============================================================');
  console.log('PHASE 3B TEST SUITE: Platform Super Admin & Provisioning');
  console.log('=============================================================');

  let companyAId = null;
  let companyBId = null;
  let companyDupId = null;

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: Slug Generation & Reserved Slugs Protection
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 1: Slug Generation & Reserved Slugs Protection');

    const slug1 = CompanyProvisioningService.slugify('ABC Traders');
    assert(slug1 === 'abc-traders', 'slugify("ABC Traders") produces "abc-traders"');

    const slugSpecial = CompanyProvisioningService.slugify('Al-Madina & Sons (Pvt) Ltd. #1');
    assert(slugSpecial === 'al-madina-sons-pvt-ltd-1', 'slugify handles special characters and symbols correctly');

    // Test reserved slugs rejection
    for (const reserved of RESERVED_COMPANY_SLUGS) {
      let isRejected = false;
      try {
        CompanyProvisioningService.generateUniqueSlug(`Company ${reserved}`, reserved);
      } catch (err) {
        isRejected = err.message.includes('reserved');
      }
      assert(isRejected, `Reserved slug "${reserved}" is blocked from registration`);
    }

    // -------------------------------------------------------------
    // TEST GROUP 2: Company Provisioning & Unique Slugs
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 2: Company Provisioning & Unique Slugs');

    // Provision Company A
    const resA = CompanyProvisioningService.provisionCompany({
      name: 'Zenith Logistics',
      slug: 'zenith-logistics',
      plan: 'COMMERCIAL',
      status: 'ACTIVE',
      maxUsers: 8,
      maxWarehouses: 2,
      initialAdmin: {
        username: 'zenith_owner',
        password: 'Password123!',
        fullName: 'Zenith Owner',
        email: 'owner@zenith.local',
      },
    });

    companyAId = resA.company.id;
    assert(resA.company.id.length === 36, 'Company A provisioned with valid UUID');
    assert(resA.company.slug === 'zenith-logistics', 'Company A assigned requested slug "zenith-logistics"');
    assert(resA.company.status === 'ACTIVE', 'Company A status is ACTIVE');
    assert(resA.company.is_active === 1, 'Company A is_active is 1');
    assert(resA.company.max_users === 8, 'Company A max_users is 8');
    assert(resA.enabledModuleCount === 12, 'All 12 modules seeded for Company A');
    assert(resA.seededFeatureFlagCount >= 35, 'Baseline feature flags seeded for Company A');

    // Provision Company with DUPLICATE Name to test automatic slug disambiguation
    const resDup = CompanyProvisioningService.provisionCompany({
      name: 'Zenith Logistics', // Same name!
      plan: 'STARTER',
      status: 'TRIAL',
      initialAdmin: {
        username: 'zenith_dup_admin',
        password: 'Password123!',
        fullName: 'Zenith Branch Admin',
      },
    });

    companyDupId = resDup.company.id;
    assert(resDup.company.slug === 'zenith-logistics-2', 'Duplicate company name automatically resolved to unique slug "zenith-logistics-2"');
    assert(resDup.company.status === 'TRIAL', 'Duplicate company provisioned with status TRIAL');

    // Provision Company B
    const resB = CompanyProvisioningService.provisionCompany({
      name: 'Apex FMCG',
      slug: 'apex-fmcg',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      maxUsers: 15,
      maxWarehouses: 5,
      initialAdmin: {
        username: 'apex_owner',
        password: 'Password123!',
        fullName: 'Apex Owner',
      },
    });

    companyBId = resB.company.id;
    assert(resB.company.slug === 'apex-fmcg', 'Company B assigned slug "apex-fmcg"');

    // -------------------------------------------------------------
    // TEST GROUP 3: Multi-Tenant Data Isolation (Company A vs Company B)
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 3: Multi-Tenant Data Isolation');

    // Verify initial admin accounts exist in app_users scoped by company_id
    const userA = db.prepare('SELECT id, username, company_id, role FROM app_users WHERE company_id = ?').get(companyAId);
    const userB = db.prepare('SELECT id, username, company_id, role FROM app_users WHERE company_id = ?').get(companyBId);

    assert(userA && userA.username === 'zenith_owner', 'Company A owner exists in app_users');
    assert(userB && userB.username === 'apex_owner', 'Company B owner exists in app_users');
    assert(userA.company_id !== userB.company_id, 'Owners have distinct company_ids');

    // Verify password verification works for initial admin
    const adminRowA = db.prepare('SELECT password_hash FROM app_users WHERE id = ?').get(userA.id);
    const isPwdValid = AuthService.verifyPassword('Password123!', adminRowA.password_hash);
    assert(isPwdValid === true, 'Company A owner password hash verifies successfully');

    // Verify Module isolation
    CompanyProvisioningService.setCompanyModules(companyBId, [{ moduleId: 'purchase', isEnabled: false }]);
    const purchaseInA = isModuleEnabled(companyAId, 'purchase');
    const purchaseInB = isModuleEnabled(companyBId, 'purchase');
    assert(purchaseInA === true, 'Purchase module is ENABLED in Company A');
    assert(purchaseInB === false, 'Purchase module is DISABLED in Company B');

    // Verify Feature Flag isolation
    CompanyProvisioningService.setCompanyFeatureFlags(companyBId, [{ key: 'sales.enable_direct_sale', value: 'false' }]);
    const flagInA = isFeatureEnabled(companyAId, 'sales.enable_direct_sale');
    const flagInB = isFeatureEnabled(companyBId, 'sales.enable_direct_sale');
    assert(flagInA === true, 'Feature flag is ON for Company A');
    assert(flagInB === false, 'Feature flag is OFF for Company B');

    // Verify Company Settings isolation
    CompanyProvisioningService.setCompanySettings(companyAId, { custom_invoice_prefix: 'ZEN-' });
    CompanyProvisioningService.setCompanySettings(companyBId, { custom_invoice_prefix: 'APX-' });
    const settingInA = getCompanySetting(companyAId, 'custom_invoice_prefix');
    const settingInB = getCompanySetting(companyBId, 'custom_invoice_prefix');
    assert(settingInA === 'ZEN-', 'Company A setting retrieved accurately ("ZEN-")');
    assert(settingInB === 'APX-', 'Company B setting retrieved accurately ("APX-")');

    // Verify Chart of Accounts isolation
    const coaCountA = db.prepare('SELECT count(*) as c FROM chart_of_accounts WHERE company_id = ?').get(companyAId).c;
    const coaCountB = db.prepare('SELECT count(*) as c FROM chart_of_accounts WHERE company_id = ?').get(companyBId).c;
    assert(coaCountA >= 19, `Company A has ${coaCountA} standard chart of accounts`);
    assert(coaCountB >= 19, `Company B has ${coaCountB} standard chart of accounts`);

    // -------------------------------------------------------------
    // TEST GROUP 4: Super Admin Authentication & Access Enforcement
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 4: Super Admin Authentication & Access Enforcement');

    // Authenticate Super Admin via secure bootstrap
    SuperAdminService.bootstrapInitialSuperAdmin({ username: 'superadmin', password: 'TestSuperAdminPass123!' });
    const authResult = await SuperAdminService.authenticate('superadmin', 'TestSuperAdminPass123!');
    assert(authResult.session.isPlatformSuperAdmin === true, 'SuperAdmin authentication returns platform superadmin session');
    assert(authResult.session.role === 'SUPER_ADMIN', 'Session role is SUPER_ADMIN');
    assert(authResult.cookieHeader.includes(SUPERADMIN_COOKIE_NAME), 'Session cookie header uses SUPERADMIN_COOKIE_NAME');

    // Verify token validation
    const token = signSuperAdminToken(authResult.session);
    const decoded = verifySuperAdminToken(token);
    assert(decoded && decoded.username === 'superadmin', 'verifySuperAdminToken validates valid superadmin token');

    // Verify requireSuperAdmin succeeds with valid token
    const mockValidReq = { headers: { get: (name) => name === 'cookie' ? `${SUPERADMIN_COOKIE_NAME}=${token}` : null } };
    const requiredSession = await requireSuperAdmin(mockValidReq);
    assert(requiredSession.username === 'superadmin', 'requireSuperAdmin passes with valid superadmin session');

    // ENFORCEMENT: Tenant Admin CANNOT access Super Admin
    const tenantAdminPayload = buildSessionPayload({
      userId: userA.id,
      companyId: companyAId,
      role: 'ADMIN',
      username: 'zenith_owner',
      fullName: 'Zenith Owner',
    });
    const tenantToken = signSessionToken(tenantAdminPayload);

    // 1. Passing tenant token to verifySuperAdminToken returns null
    const crossVerify = verifySuperAdminToken(tenantToken);
    assert(crossVerify === null, 'verifySuperAdminToken strictly rejects tenant admin session token');

    // 2. Tenant admin request to superadmin throws 401
    const mockTenantReq = { headers: { get: (name) => name === 'cookie' ? `${SESSION_COOKIE_NAME}=${tenantToken}` : null } };
    let tenantBlocked = false;
    let tenantStatus = 0;
    try {
      await requireSuperAdmin(mockTenantReq);
    } catch (err) {
      tenantBlocked = true;
      tenantStatus = err.status;
    }
    assert(tenantBlocked === true, 'requireSuperAdmin strictly throws error when called by Tenant Admin');
    assert(tenantStatus === 401, 'Tenant Admin blocked with HTTP 401 Unauthorized');

    // ENFORCEMENT: Normal user CANNOT access Super Admin
    const normalUserPayload = buildSessionPayload({
      userId: 'test-user-id',
      companyId: companyAId,
      role: 'SALESMAN',
      username: 'salesman1',
      fullName: 'Salesman One',
    });
    const normalToken = signSessionToken(normalUserPayload);
    const mockNormalReq = { headers: { get: (name) => name === 'cookie' ? `${SESSION_COOKIE_NAME}=${normalToken}` : null } };
    let normalBlocked = false;
    try {
      await requireSuperAdmin(mockNormalReq);
    } catch {
      normalBlocked = true;
    }
    assert(normalBlocked === true, 'Normal tenant user (SALESMAN) strictly blocked from superadmin');

    // -------------------------------------------------------------
    // TEST GROUP 5: Super Admin Company Management Capabilities
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 5: Super Admin Company Management Capabilities');

    // Edit Company
    const updatedCompany = CompanyProvisioningService.updateCompany(companyAId, {
      name: 'Zenith Global Logistics Pvt Ltd',
      maxUsers: 25,
      maxWarehouses: 10,
    });
    assert(updatedCompany.name === 'Zenith Global Logistics Pvt Ltd', 'Super Admin successfully updated company name');
    assert(updatedCompany.max_users === 25, 'Super Admin successfully increased max_users to 25');

    // Suspend Company
    const suspended = CompanyProvisioningService.setCompanyStatus(companyAId, 'SUSPENDED');
    assert(suspended.status === 'SUSPENDED', 'Super Admin set company status to SUSPENDED');
    assert(suspended.is_active === 0, 'Company is_active automatically set to 0 when SUSPENDED');

    // Activate Company
    const reactivated = CompanyProvisioningService.setCompanyStatus(companyAId, 'ACTIVE');
    assert(reactivated.status === 'ACTIVE', 'Super Admin re-activated company');
    assert(reactivated.is_active === 1, 'Company is_active automatically restored to 1');

    // Add user to company under limit
    const addedUser = CompanyProvisioningService.createCompanyUser(companyAId, {
      username: 'zenith_cashier',
      password: 'AccPassword123!',
      fullName: 'Zenith Cashier',
      role: 'CASHIER',
    });
    assert(addedUser.username === 'zenith_cashier', 'Super Admin added new user to company');

    // List companies
    const allCompanies = CompanyProvisioningService.listCompanies();
    assert(allCompanies.length >= 3, `Super Admin listed all ${allCompanies.length} companies`);

    // -------------------------------------------------------------
    // TEST GROUP 6: Baseline Farhan Distribution Integrity
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 6: Baseline Farhan Distribution (On-Premise) Integrity');

    const farhan = CompanyProvisioningService.getCompanyById(DEFAULT_COMPANY_ID);
    assert(farhan && farhan.name === 'Farhan Distribution', 'Farhan Distribution company record intact');
    assert(farhan.slug === 'farhan', 'Farhan Distribution slug is "farhan"');
    assert(farhan.is_active === 1, 'Farhan Distribution is_active is 1');
    assert(farhan.status === 'ACTIVE', 'Farhan Distribution status is ACTIVE');

    const farhanModules = db.prepare('SELECT count(*) as c FROM company_modules WHERE company_id = ? AND is_enabled = 1').get(DEFAULT_COMPANY_ID).c;
    assert(farhanModules === 12, 'Farhan Distribution has all 12 modules enabled');

    const farhanFlags = db.prepare('SELECT count(*) as c FROM feature_flags WHERE company_id = ?').get(DEFAULT_COMPANY_ID).c;
    assert(farhanFlags >= 35, `Farhan Distribution has all ${farhanFlags} feature flags intact`);

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Purge test companies and associated records
    // -------------------------------------------------------------
    console.log('\nCleaning up test-provisioned companies...');
    const testCompanyIds = [companyAId, companyBId, companyDupId].filter(Boolean);

    for (const cid of testCompanyIds) {
      db.prepare('DELETE FROM app_users WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM chart_of_accounts WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM app_settings WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM feature_flags WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM company_profile WHERE company_id = ?').run(cid);
      db.prepare('DELETE FROM companies WHERE id = ?').run(cid);
    }
    console.log('Cleanup completed successfully.');
  }

  console.log('\n=============================================================');
  console.log(`PHASE 3B TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3BTests().catch((err) => {
  console.error('Phase 3B test suite encountered fatal error:', err);
  process.exit(1);
});
