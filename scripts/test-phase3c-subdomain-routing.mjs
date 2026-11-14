import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { 
  extractSubdomainFromHost, 
  isReservedSubdomain 
} from '../src/core/tenancy/subdomain.ts';
import { 
  resolveTenant 
} from '../src/core/tenancy/resolver.ts';
import { 
  getTenantContext, 
  requireTenantContext,
  requireAuthenticatedUser,
  TenantContextError 
} from '../src/core/tenancy/context.ts';
import { 
  getCompanyUrl, 
  getBaseDomain, 
  getAppProtocol 
} from '../src/core/config/env.ts';
import { 
  DEFAULT_COMPANY_ID, 
  DEFAULT_COMPANY_NAME, 
  DEFAULT_COMPANY_SLUG, 
  SUPERADMIN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  RESERVED_COMPANY_SLUGS
} from '../src/core/tenancy/constants.ts';
import { 
  CompanyProvisioningService 
} from '../src/core/tenancy/company-provisioning.service.ts';
import { 
  SuperAdminService 
} from '../src/core/auth/superadmin.service.ts';
import { 
  signSuperAdminToken, 
  verifySuperAdminToken, 
  requireSuperAdmin 
} from '../src/core/auth/superadmin-session.ts';
import { 
  signSessionToken, 
  buildSessionPayload 
} from '../src/core/auth/session.ts';

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

async function runPhase3CTests() {
  console.log('\n=============================================================');
  console.log('PHASE 3C TEST SUITE: Tenant Subdomain Routing & Cloud Host');
  console.log('=============================================================');

  const createdCompanyIds = [];

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: Subdomain Extraction & Localhost Port Handling
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 1: Subdomain Extraction & Localhost Port Handling');

    assert(extractSubdomainFromHost('farhan.localhost:3000') === 'farhan', 'extractSubdomainFromHost("farhan.localhost:3000") -> "farhan"');
    assert(extractSubdomainFromHost('abc-traders.localhost:3000') === 'abc-traders', 'extractSubdomainFromHost("abc-traders.localhost:3000") -> "abc-traders"');
    assert(extractSubdomainFromHost('zenith.localhost:8080') === 'zenith', 'extractSubdomainFromHost handles arbitrary ports (8080)');
    assert(extractSubdomainFromHost('company-one.localhost') === 'company-one', 'extractSubdomainFromHost handles localhost without port');
    assert(extractSubdomainFromHost('localhost:3000') === null, 'extractSubdomainFromHost("localhost:3000") -> null');
    assert(extractSubdomainFromHost('localhost') === null, 'extractSubdomainFromHost("localhost") -> null');
    assert(extractSubdomainFromHost('127.0.0.1:3000') === null, 'extractSubdomainFromHost("127.0.0.1:3000") -> null');
    assert(extractSubdomainFromHost('192.168.1.100:3000') === null, 'extractSubdomainFromHost LAN IP -> null');
    assert(extractSubdomainFromHost('') === null, 'extractSubdomainFromHost empty string -> null');
    assert(extractSubdomainFromHost(null) === null, 'extractSubdomainFromHost null -> null');

    // -------------------------------------------------------------
    // TEST GROUP 2: Reserved Subdomain Slug Rejection
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 2: Reserved Subdomain Slug Rejection');

    for (const reserved of RESERVED_COMPANY_SLUGS) {
      assert(isReservedSubdomain(reserved) === true, `isReservedSubdomain("${reserved}") is true`);
      assert(extractSubdomainFromHost(`${reserved}.localhost:3000`) === null, `extractSubdomainFromHost("${reserved}.localhost:3000") is rejected as null`);
    }

    // -------------------------------------------------------------
    // TEST GROUP 3: Environment Config & Canonical ERP URLs
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 3: Environment Config & Canonical ERP URLs');

    const baseDomain = getBaseDomain();
    const protocol = getAppProtocol();
    assert(typeof baseDomain === 'string' && baseDomain.length > 0, `Base domain resolved: "${baseDomain}"`);
    assert(protocol === 'http' || protocol === 'https', `Protocol resolved: "${protocol}"`);

    const farhanUrl = getCompanyUrl('farhan');
    const abcUrl = getCompanyUrl('abc-traders');
    assert(farhanUrl.includes('farhan.') && farhanUrl.startsWith(protocol), `getCompanyUrl("farhan") generates canonical url "${farhanUrl}"`);
    assert(abcUrl.includes('abc-traders.') && abcUrl.startsWith(protocol), `getCompanyUrl("abc-traders") generates canonical url "${abcUrl}"`);

    // -------------------------------------------------------------
    // TEST GROUP 4: On-Premise Mode Guarantee (Zero DNS Dependency)
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 4: On-Premise Mode Guarantee (Zero DNS Dependency)');

    // Ensure ONPREMISE mode
    process.env.DEPLOYMENT_MODE = 'onpremise';
    
    const onPremRes1 = await resolveTenant({ host: 'localhost:3000' });
    assert(onPremRes1.isValid === true, 'On-Premise localhost:3000 resolves successfully');
    assert(onPremRes1.companyId === DEFAULT_COMPANY_ID, `On-Premise resolves to DEFAULT_COMPANY_ID (${DEFAULT_COMPANY_ID})`);
    assert(onPremRes1.companySlug === DEFAULT_COMPANY_SLUG, `On-Premise resolves to DEFAULT_COMPANY_SLUG (${DEFAULT_COMPANY_SLUG})`);
    assert(onPremRes1.source === 'onpremise_default', 'Resolution source is "onpremise_default"');

    const onPremResLAN = await resolveTenant({ host: '192.168.1.150:3000' });
    assert(onPremResLAN.isValid === true, 'On-Premise LAN IP resolves successfully');
    assert(onPremResLAN.companyId === DEFAULT_COMPANY_ID, 'On-Premise LAN IP resolves to DEFAULT_COMPANY_ID with 0 DNS');

    // -------------------------------------------------------------
    // TEST GROUP 5: Cloud Mode Subdomain Resolution
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 5: Cloud Mode Subdomain Resolution');

    // Switch to CLOUD mode
    process.env.DEPLOYMENT_MODE = 'cloud';

    // 1. Resolve existing Farhan Distribution via subdomain
    const cloudFarhanRes = await resolveTenant({ host: 'farhan.localhost:3000' });
    assert(cloudFarhanRes.isValid === true, 'Cloud mode resolves "farhan.localhost:3000" successfully');
    assert(cloudFarhanRes.companyId === DEFAULT_COMPANY_ID, 'Resolves to Farhan Distribution companyId');
    assert(cloudFarhanRes.companySlug === 'farhan', 'Resolves slug "farhan"');
    assert(cloudFarhanRes.source === 'hostname', 'Resolution source is "hostname"');
    assert(cloudFarhanRes.status === 'ACTIVE', 'Company status is ACTIVE');

    // 2. Provision Company A (Active)
    const compA = CompanyProvisioningService.provisionCompany({
      name: 'Cloud Retailers',
      slug: 'cloud-retailers',
      plan: 'COMMERCIAL',
      status: 'ACTIVE',
      initialAdmin: {
        username: 'cloud_admin',
        password: 'Password123!',
        fullName: 'Cloud Admin',
      },
    });
    createdCompanyIds.push(compA.company.id);

    const cloudCompARes = await resolveTenant({ host: 'cloud-retailers.localhost:3000' });
    assert(cloudCompARes.isValid === true, 'Cloud mode resolves "cloud-retailers.localhost:3000" successfully');
    assert(cloudCompARes.companyId === compA.company.id, 'Resolves to correct Company A ID');
    assert(cloudCompARes.companySlug === 'cloud-retailers', 'Resolves to correct Company A slug');

    // 3. Provision Company B (Trial)
    const compB = CompanyProvisioningService.provisionCompany({
      name: 'Trial Ventures',
      slug: 'trial-ventures',
      plan: 'STARTER',
      status: 'TRIAL',
      trialEndsAt: '2099-12-31T23:59:59.000Z',
      initialAdmin: {
        username: 'trial_admin',
        password: 'Password123!',
        fullName: 'Trial Admin',
      },
    });
    createdCompanyIds.push(compB.company.id);

    const cloudCompBRes = await resolveTenant({ host: 'trial-ventures.localhost:3000' });
    assert(cloudCompBRes.isValid === true, 'Active TRIAL company resolves successfully');
    assert(cloudCompBRes.status === 'TRIAL', 'Resolved company status is TRIAL');

    // 4. Header Resolution Fallback in Cloud Mode
    const headerRes = await resolveTenant({
      headers: { get: (name) => name === 'x-tenant-slug' ? 'cloud-retailers' : null }
    });
    assert(headerRes.isValid === true, 'Cloud mode resolves via x-tenant-slug header');
    assert(headerRes.companyId === compA.company.id, 'Header resolves correct companyId');
    assert(headerRes.source === 'header', 'Source is "header"');

    // 5. Unknown Subdomain Rejection
    const unknownRes = await resolveTenant({ host: 'nonexistent-tenant.localhost:3000' });
    assert(unknownRes.isValid === false, 'Unknown tenant subdomain is rejected with isValid: false');
    assert(unknownRes.error.includes('not found'), `Error message indicates not found: "${unknownRes.error}"`);

    // 6. Reserved Subdomain Rejection in Cloud Mode
    const reservedRes = await resolveTenant({ host: 'superadmin.localhost:3000' });
    assert(reservedRes.isValid === false, 'Reserved subdomain "superadmin" is rejected with isValid: false');
    assert(reservedRes.error.includes('could not be resolved'), 'Error message indicates unresolvable tenant');

    // -------------------------------------------------------------
    // TEST GROUP 6: Lifecycle Status Enforcement (SUSPENDED / EXPIRED)
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 6: Lifecycle Status Enforcement (SUSPENDED / EXPIRED)');

    // 1. Provision Suspended Company
    const compSuspended = CompanyProvisioningService.provisionCompany({
      name: 'Suspended Logistics',
      slug: 'suspended-logistics',
      plan: 'COMMERCIAL',
      status: 'SUSPENDED',
      initialAdmin: {
        username: 'susp_admin',
        password: 'Password123!',
        fullName: 'Suspended Admin',
      },
    });
    createdCompanyIds.push(compSuspended.company.id);

    const suspRes = await resolveTenant({ host: 'suspended-logistics.localhost:3000' });
    assert(suspRes.isValid === false, 'SUSPENDED company is rejected with isValid: false');
    assert(suspRes.status === 'SUSPENDED', 'Resolved status is SUSPENDED');
    assert(suspRes.error.includes('is suspended'), `Informative suspension error message returned: "${suspRes.error}"`);

    // 2. Provision Expired Company
    const compExpired = CompanyProvisioningService.provisionCompany({
      name: 'Expired Traders',
      slug: 'expired-traders',
      plan: 'COMMERCIAL',
      status: 'EXPIRED',
      initialAdmin: {
        username: 'exp_admin',
        password: 'Password123!',
        fullName: 'Expired Admin',
      },
    });
    createdCompanyIds.push(compExpired.company.id);

    const expRes = await resolveTenant({ host: 'expired-traders.localhost:3000' });
    assert(expRes.isValid === false, 'EXPIRED company is rejected with isValid: false');
    assert(expRes.status === 'EXPIRED', 'Resolved status is EXPIRED');
    assert(expRes.error.includes('expired'), `Informative expiration error message returned: "${expRes.error}"`);

    // 3. Expired Trial Period (status=TRIAL but trial_ends_at is past)
    const compPastTrial = CompanyProvisioningService.provisionCompany({
      name: 'Past Trial Company',
      slug: 'past-trial-co',
      plan: 'STARTER',
      status: 'TRIAL',
      trialEndsAt: '2020-01-01T00:00:00.000Z',
      initialAdmin: {
        username: 'past_admin',
        password: 'Password123!',
        fullName: 'Past Admin',
      },
    });
    createdCompanyIds.push(compPastTrial.company.id);

    const pastTrialRes = await resolveTenant({ host: 'past-trial-co.localhost:3000' });
    assert(pastTrialRes.isValid === false, 'Expired trial company is rejected with isValid: false');
    assert(pastTrialRes.status === 'EXPIRED', 'Status marked as EXPIRED');
    assert(pastTrialRes.error.includes('trial period has expired'), `Trial expired error message: "${pastTrialRes.error}"`);

    // -------------------------------------------------------------
    // TEST GROUP 7: Cross-Company Hostname Access Rejection
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 7: Cross-Company Hostname Access Rejection');

    // Create session token for User of Company A
    const userASession = buildSessionPayload({
      userId: compA.initialAdminUser.id,
      companyId: compA.company.id,
      role: 'ADMIN',
      username: 'cloud_admin',
      fullName: 'Cloud Admin',
    });
    const userAToken = signSessionToken(userASession);

    // 1. User A accessing Company A's hostname -> Allowed
    const mockValidReq = {
      headers: {
        get: (name) => {
          if (name === 'host') return 'cloud-retailers.localhost:3000';
          if (name === 'cookie') return `${SESSION_COOKIE_NAME}=${userAToken}`;
          return null;
        }
      }
    };
    const validCtx = await getTenantContext(mockValidReq);
    assert(validCtx.isAuthenticated === true, 'User A authenticated on Company A hostname');
    assert(validCtx.companyId === compA.company.id, 'Context companyId matches Company A');

    // 2. User A accessing Company B's hostname -> REJECTED
    const mockCrossReq = {
      headers: {
        get: (name) => {
          if (name === 'host') return 'trial-ventures.localhost:3000';
          if (name === 'cookie') return `${SESSION_COOKIE_NAME}=${userAToken}`;
          return null;
        }
      }
    };
    const crossCtx = await getTenantContext(mockCrossReq);
    assert(crossCtx.isAuthenticated === false, 'User A accessing Company B hostname is NOT authenticated');
    assert(crossCtx.error && crossCtx.error.includes('Tenant mismatch'), `Tenant mismatch error thrown: "${crossCtx.error}"`);

    // 3. requireTenantContext strictly throws 403 on cross-company hostname access
    let crossBlocked = false;
    let crossStatusCode = 0;
    try {
      await requireTenantContext(mockCrossReq);
    } catch (err) {
      crossBlocked = true;
      crossStatusCode = err.status;
    }
    assert(crossBlocked === true, 'requireTenantContext strictly throws error on cross-company hostname access');
    assert(crossStatusCode === 403, 'Cross-company access blocked with HTTP 403 Forbidden');

    // 4. Accessing Suspended Company's hostname throws 403
    const mockSuspReq = {
      headers: {
        get: (name) => {
          if (name === 'host') return 'suspended-logistics.localhost:3000';
          return null;
        }
      }
    };
    let suspBlocked = false;
    try {
      await requireTenantContext(mockSuspReq);
    } catch (err) {
      suspBlocked = true;
    }
    assert(suspBlocked === true, 'requireTenantContext strictly blocks requests to suspended company subdomain');

    // -------------------------------------------------------------
    // TEST GROUP 8: Security Fix - Platform Super Admin Credentials
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 8: Security Fix - Platform Super Admin Credentials');

    // 1. Verify schema does not contain "superadmin123"
    const fs = await import('node:fs');
    const schemaContent = fs.readFileSync(path.join(process.cwd(), 'src', 'core', 'database', 'schema.ts'), 'utf8');
    assert(!schemaContent.includes('superadmin123'), 'SECURITY: schema.ts contains NO hardcoded "superadmin123" default password');

    // 2. Bootstrap initial super admin with secure password
    const bootstrapRes = SuperAdminService.bootstrapInitialSuperAdmin({
      username: 'superadmin',
      password: 'SecureTestAdmin2026!#',
      fullName: 'Chief Super Administrator',
    });
    assert(bootstrapRes.username === 'superadmin', 'SuperAdminService.bootstrapInitialSuperAdmin successfully bootstraps admin');

    // 3. Authenticate with bootstrapped password
    const adminAuth = await SuperAdminService.authenticate('superadmin', 'SecureTestAdmin2026!#');
    assert(adminAuth.session.role === 'SUPER_ADMIN', 'Super admin authenticates with bootstrapped password');

    // 4. Old default password "superadmin123" fails authentication
    let oldPwdFailed = false;
    try {
      await SuperAdminService.authenticate('superadmin', 'superadmin123');
    } catch {
      oldPwdFailed = true;
    }
    assert(oldPwdFailed === true, 'SECURITY: Old known password "superadmin123" strictly rejected');

    // 5. Short passwords (< 8 characters) rejected by bootstrap
    let shortPwdFailed = false;
    try {
      SuperAdminService.bootstrapInitialSuperAdmin({ username: 'superadmin', password: '123' });
    } catch {
      shortPwdFailed = true;
    }
    assert(shortPwdFailed === true, 'Bootstrap rejects insecure short passwords (< 8 chars)');

    // -------------------------------------------------------------
    // TEST GROUP 9: ERP URL Availability in Company Provisioning
    // -------------------------------------------------------------
    console.log('\nTEST GROUP 9: ERP URL Availability in Company Provisioning');

    // 1. Provisioned company record returns erpUrl
    assert(typeof compA.company.erpUrl === 'string' && compA.company.erpUrl.length > 0, `compA.company.erpUrl is populated: "${compA.company.erpUrl}"`);
    assert(compA.company.erpUrl.includes('cloud-retailers'), 'ERP URL contains company slug "cloud-retailers"');

    // 2. getCompanyById returns erpUrl
    const fetchedById = CompanyProvisioningService.getCompanyById(compA.company.id);
    assert(fetchedById && fetchedById.erpUrl === compA.company.erpUrl, 'getCompanyById returns canonical erpUrl');

    // 3. getCompanyBySlug returns erpUrl
    const fetchedBySlug = CompanyProvisioningService.getCompanyBySlug('cloud-retailers');
    assert(fetchedBySlug && fetchedBySlug.erpUrl === compA.company.erpUrl, 'getCompanyBySlug returns canonical erpUrl');

    // 4. listCompanies returns erpUrl on each company record
    const compList = CompanyProvisioningService.listCompanies({ search: 'Cloud Retailers' });
    assert(compList.length > 0 && typeof compList[0].erpUrl === 'string', 'listCompanies returns populated erpUrl');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Restore DB to baseline
    // -------------------------------------------------------------
    console.log('\nCleaning up test-provisioned companies...');
    for (const cId of createdCompanyIds) {
      try {
        db.prepare('DELETE FROM app_users WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM feature_flags WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM app_settings WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM chart_of_accounts WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM company_profile WHERE company_id = ?').run(cId);
        db.prepare('DELETE FROM companies WHERE id = ?').run(cId);
      } catch (err) {
        console.warn(`Cleanup error for ${cId}:`, err.message);
      }
    }
    // Restore deployment mode to onpremise
    process.env.DEPLOYMENT_MODE = 'onpremise';
    console.log('Cleanup completed successfully.');
  }

  console.log('\n=============================================================');
  console.log(`PHASE 3C TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3CTests().catch((err) => {
  console.error('Fatal error running Phase 3C tests:', err);
  process.exit(1);
});
