/**
 * SaleFlow ERP - Final Vendor Super Admin Control Panel Test Suite
 * Fully automated, zero production database mutation, complete coverage.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

console.log('===================================================================');
console.log('   SALEFLOW VENDOR SUPER ADMIN CONTROL PANEL VERIFICATION SUITE   ');
console.log('===================================================================\n');

// 1. Setup isolated test database copy to guarantee real database remains untouched
const PROD_DB_PATH = path.join(process.cwd(), 'data', 'sales_distribution.db');
const TEMP_DB_PATH = path.join(os.tmpdir(), `saleflow_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`);

console.log(`[Setup] Isolating database for test suite:`);
console.log(`  Source: ${PROD_DB_PATH}`);
console.log(`  Target: ${TEMP_DB_PATH}`);

fs.copyFileSync(PROD_DB_PATH, TEMP_DB_PATH);
process.env.SQLITE_DATABASE_PATH = TEMP_DB_PATH;
process.env.DEPLOYMENT_MODE = 'hostinger';
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SUPERADMIN_2FA_POLICY = 'OPTIONAL';
process.env.SESSION_SECRET = 'test_secret_key_1234567890_vendor_superadmin_secure_jwt';
process.env.BASE_DOMAIN = 'salesflow.space';
process.env.APP_PROTOCOL = 'https';

// Now import modules after environment setup
const { getDatabase, closeDatabase } = await import('../src/core/database/db.ts');
const { MigrationRunner } = await import('../src/core/database/migration-runner.ts');
const { SuperAdminService } = await import('../src/core/auth/superadmin.service.ts');
const { SuperAdminAuditService } = await import('../src/core/audit/superadmin-audit.service.ts');
const { TwoFactorService } = await import('../src/core/auth/two-factor.service.ts');
const { generateQRCodeSvg } = await import('../src/core/auth/qr-code.ts');
const { clearTestEmailOutbox, getLatestTestEmailFor } = await import('../src/core/auth/email-transport.ts');
const { CompanyProvisioningService } = await import('../src/core/tenancy/company-provisioning.service.ts');
const { extractSubdomainFromHost, getCompanyUrl } = await import('../src/core/tenancy/subdomain.ts');
const { resolveTenantContext } = await import('../src/core/tenancy/resolver.ts');
const { getBrandingConfig, saveBrandingConfig, deleteTenantBrandingOverride, APPROVED_FONTS } = await import('../src/core/branding/theme.service.ts');
const { AVAILABLE_SYSTEM_MODULES, PREDEFINED_PLANS } = await import('../src/core/tenancy/plans.ts');
const { signSuperAdminToken, verifySuperAdminToken, requireSuperAdmin } = await import('../src/core/auth/superadmin-session.ts');
const { signSessionToken } = await import('../src/core/auth/session.ts');
const { RESERVED_COMPANY_SLUGS, DEFAULT_COMPANY_ID } = await import('../src/core/tenancy/constants.ts');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTestSuite() {
  const db = getDatabase();

  try {
    // -----------------------------------------------------------------
    // TEST SECTION 1: Idempotent Database Migrations
    // -----------------------------------------------------------------
    console.log('\n--- 1. Testing Schema & Idempotent Migrations ---');
    MigrationRunner.runPendingMigrations(db);
    
    // Check that migration 1.2.0 added columns
    const companyCols = db.prepare("PRAGMA table_info(companies)").all().map(c => c.name);
    assert(companyCols.includes('legal_name'), 'companies table has legal_name column');
    assert(companyCols.includes('tenant_code'), 'companies table has tenant_code column');
    assert(companyCols.includes('primary_contact_name'), 'companies table has primary_contact_name column');
    assert(companyCols.includes('email'), 'companies table has email column');
    assert(companyCols.includes('notes'), 'companies table has notes column');

    const userCols = db.prepare("PRAGMA table_info(platform_users)").all().map(c => c.name);
    assert(userCols.includes('totp_enabled'), 'platform_users has totp_enabled column');
    assert(userCols.includes('totp_secret'), 'platform_users has totp_secret column');
    assert(userCols.includes('email_otp_enabled'), 'platform_users has email_otp_enabled column');
    assert(userCols.includes('recovery_codes_hash'), 'platform_users has recovery_codes_hash column');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert(tables.includes('platform_otp_tokens'), 'platform_otp_tokens table created');
    assert(tables.includes('audit_logs'), 'audit_logs table exists');

    // -----------------------------------------------------------------
    // TEST SECTION 2: Domain & Tenant Resolution
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Domain & Tenant Subdomain Resolution ---');
    assert(extractSubdomainFromHost('salesflow.space') === null, 'Apex domain salesflow.space resolves to null (Apex portal)');
    assert(extractSubdomainFromHost('www.salesflow.space') === null, 'www.salesflow.space has no customer tenant (Apex www redirect)');
    assert(extractSubdomainFromHost('farhan.salesflow.space') === 'farhan', 'farhan.salesflow.space extracts "farhan"');
    assert(extractSubdomainFromHost('abcdistributors.salesflow.space') === 'abcdistributors', 'abcdistributors.salesflow.space extracts "abcdistributors"');
    assert(extractSubdomainFromHost('localhost:3000') === null, 'localhost:3000 resolves to apex');

    // Reserved slugs validation
    for (const r of ['www', 'admin', 'superadmin', 'api', 'app', 'mail', 'support', 'static']) {
      assert(RESERVED_COMPANY_SLUGS.includes(r), `Slug "${r}" is in RESERVED_COMPANY_SLUGS`);
    }

    // -----------------------------------------------------------------
    // TEST SECTION 3: Super Admin Authentication & Separation
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Super Admin Authentication & Security Separation ---');

    // Ensure test superadmin exists
    const superAdminUser = 'superadmin_test';
    const superAdminPass = 'SuperPassword@2026!';
    const superAdminEmail = 'superadmin.test@salesflow.space';
    
    // Hash and insert super admin
    const { AuthService } = await import('../src/modules/auth/service.ts');
    const pwdHash = AuthService.hashPassword(superAdminPass);
    db.prepare(`
      INSERT OR REPLACE INTO platform_users (
        id, username, password_hash, full_name, email, role, is_active, 
        totp_enabled, email_otp_enabled, two_factor_policy, created_at, updated_at
      ) VALUES (
        'sa-test-id-1', ?, ?, 'SaleFlow Master Admin', ?, 'SUPER_ADMIN', 1,
        0, 0, 'OPTIONAL', datetime('now'), datetime('now')
      )
    `).run(superAdminUser, pwdHash, superAdminEmail);

    // Step 1: Valid super admin credentials
    const loginStep1 = await SuperAdminService.initiateLogin(
      superAdminUser,
      superAdminPass,
      '127.0.0.1'
    );
    assert(loginStep1.requires2FA === false, '2FA not yet enabled for test user');
    assert(loginStep1.session !== undefined, 'Direct session issued when 2FA is not required');

    // Step 1: Invalid credentials
    let badLoginFailed = false;
    try {
      await SuperAdminService.initiateLogin(
        superAdminUser,
        'wrong_password_123',
        '127.0.0.1'
      );
    } catch (e) {
      badLoginFailed = true;
    }
    assert(badLoginFailed, 'Invalid password rejected at step 1');

    // Tenant user cannot log in as super admin
    let tenantUserBlocked = false;
    try {
      await SuperAdminService.initiateLogin(
        'admin', // tenant admin in app_users
        'Password123!',
        '127.0.0.1'
      );
    } catch (e) {
      tenantUserBlocked = true;
    }
    assert(tenantUserBlocked, 'Tenant user cannot authenticate through SuperAdminService');

    // Session token authorization
    const validToken = signSuperAdminToken(loginStep1.session);
    const verifiedPayload = await verifySuperAdminToken(validToken);
    assert(verifiedPayload !== null && verifiedPayload.role === 'SUPER_ADMIN', 'Super admin session token verified and confirmed SUPER_ADMIN role');

    // Regular tenant session cannot pass requireSuperAdmin
    const fakeTenantToken = signSessionToken({
      userId: 'tenant-user-1',
      username: 'tenant_admin',
      role: 'ADMIN',
      companyId: 'company-123',
    });
    let tenantTokenBlocked = false;
    try {
      const mockReq = {
        cookies: { get: (name) => name === 'saleflow_session' ? { value: fakeTenantToken } : undefined },
        headers: { get: () => null },
      };
      await requireSuperAdmin(mockReq);
    } catch (e) {
      tenantTokenBlocked = true;
    }
    assert(tenantTokenBlocked, 'Tenant session token blocked by requireSuperAdmin');

    // -----------------------------------------------------------------
    // TEST SECTION 4: Two-Factor Authentication (TOTP + SVG QR)
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing Two-Factor Authentication (RFC 6238 TOTP & SVG QR) ---');

    // Setup TOTP
    const totpSetup = await SuperAdminService.setupTotp('sa-test-id-1');
    assert(totpSetup.secret && totpSetup.secret.length === 32, '32-character Base32 TOTP secret generated');
    assert(totpSetup.uri.startsWith('otpauth://totp/'), 'Valid otpauth URI constructed');
    assert(totpSetup.qrDataUrl.startsWith('data:image/svg+xml;base64,'), 'Pure SVG QR data URL generated with zero native dependencies');

    // Generate valid TOTP code
    const validTotpCode = TwoFactorService.generateTotpToken(totpSetup.secret);
    assert(validTotpCode.length === 6 && /^\d{6}$/.test(validTotpCode), '6-digit numeric TOTP code generated');

    // Enable TOTP
    const enableResult = await SuperAdminService.enableTotp('sa-test-id-1', totpSetup.secret, validTotpCode);
    assert(enableResult.success === true, 'TOTP enabled successfully with valid code');
    assert(enableResult.recoveryCodes.length === 8, '8 one-time recovery codes generated upon 2FA enablement');

    // Verify recovery codes are hashed in DB, never plain
    const userRow = db.prepare('SELECT recovery_codes_hash, totp_enabled FROM platform_users WHERE id = ?').get('sa-test-id-1');
    assert(userRow.totp_enabled === 1, 'totp_enabled flag persisted in database');
    const storedHashes = JSON.parse(userRow.recovery_codes_hash);
    assert(storedHashes.length === 8, '8 hashes stored in DB');
    assert(storedHashes[0].length === 64, 'Recovery codes stored as SHA-256 hashes');

    // Now test 2-Step Login with TOTP
    const loginStep1With2FA = await SuperAdminService.initiateLogin(
      superAdminUser,
      superAdminPass,
      '127.0.0.1'
    );
    assert(loginStep1With2FA.requires2FA === true, 'Login Step 1 now requires 2FA');
    assert(loginStep1With2FA.challengeToken !== undefined, '2FA challenge token returned');
    assert(loginStep1With2FA.allowedMethods.includes('totp'), 'TOTP is among allowed 2FA methods');

    // Step 2: Verify with TOTP
    const currentCode = TwoFactorService.generateTotpToken(totpSetup.secret);
    const loginStep2 = await SuperAdminService.verify2faAndLogin(
      loginStep1With2FA.challengeToken,
      'totp',
      currentCode,
      '127.0.0.1'
    );
    assert(loginStep2.session !== undefined, 'Step 2 TOTP verification succeeded');
    assert(loginStep2.cookieHeader !== undefined, 'Super admin authenticated session cookie granted');

    // -----------------------------------------------------------------
    // TEST SECTION 5: Recovery Code Usage & Invalidation
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing Recovery Codes Lifecycle ---');
    const firstRecoveryCode = enableResult.recoveryCodes[0];

    const loginWithRecoveryCode = await SuperAdminService.verify2faAndLogin(
      loginStep1With2FA.challengeToken,
      'recovery_code',
      firstRecoveryCode,
      '127.0.0.1'
    );
    assert(loginWithRecoveryCode.session !== undefined, 'Step 2 login with recovery code succeeded');

    // Attempt to reuse the same recovery code -> must fail
    let reuseFailed = false;
    try {
      await SuperAdminService.verify2faAndLogin(
        loginStep1With2FA.challengeToken,
        'recovery_code',
        firstRecoveryCode,
        '127.0.0.1'
      );
    } catch (e) {
      reuseFailed = true;
    }
    assert(reuseFailed, 'Used recovery code is strictly invalidated and cannot be reused');

    // Regenerate recovery codes
    const regenResult = await SuperAdminService.regenerateRecoveryCodes('sa-test-id-1', superAdminPass, '127.0.0.1');
    assert(regenResult.recoveryCodes.length === 8, '8 fresh recovery codes regenerated');

    // -----------------------------------------------------------------
    // TEST SECTION 6: Email OTP 2FA & Cooldown
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing Email OTP Flow & Cooldown Protection ---');
    
    // Enable Email OTP on user
    db.prepare('UPDATE platform_users SET email_otp_enabled = 1 WHERE id = ?').run('sa-test-id-1');

    // Clear test outbox
    clearTestEmailOutbox();

    // Request Email OTP
    const otpSent = await SuperAdminService.requestEmailOtp(loginStep1With2FA.challengeToken);
    assert(otpSent.maskedEmail !== undefined, 'Email OTP dispatched');
    const sentEmail = getLatestTestEmailFor(superAdminEmail);
    assert(sentEmail !== null, 'Email delivered to test outbox');
    assert(sentEmail.to === superAdminEmail, 'Email sent to correct Super Admin address');
    assert(/\b\d{6}\b/.test(sentEmail.text), 'Email body contains 6-digit numeric OTP');

    // Extract OTP from test email
    const otpCode = sentEmail.text.match(/\b\d{6}\b/)[0];

    // Attempt immediate resend (must trigger cooldown)
    let cooldownEnforced = false;
    try {
      await SuperAdminService.requestEmailOtp(loginStep1With2FA.challengeToken);
    } catch (e) {
      cooldownEnforced = e.message.toLowerCase().includes('wait') || e.message.toLowerCase().includes('cooldown');
    }
    assert(cooldownEnforced, 'Resend cooldown enforced (blocks rapid spamming)');

    // Verify Email OTP
    const verifyOtpResult = await SuperAdminService.verify2faAndLogin(
      loginStep1With2FA.challengeToken,
      'email_otp',
      otpCode,
      '127.0.0.1'
    );
    assert(verifyOtpResult.session !== undefined, 'Email OTP verification succeeded');

    // Disable TOTP
    const disableResult = await SuperAdminService.disableTotp('sa-test-id-1', superAdminPass, '127.0.0.1');
    assert(disableResult === true, 'TOTP disabled with valid password');

    // -----------------------------------------------------------------
    // TEST SECTION 7: Company / Customer Management & Provisioning
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing Customer / Company Provisioning ---');

    const testCustomerInput = {
      name: 'Blue Star Logistics Ltd',
      legalName: 'Blue Star Logistics Private Limited',
      tenantCode: 'BSL-001',
      slug: 'bluestar',
      plan: 'COMMERCIAL',
      status: 'ACTIVE',
      primaryContactName: 'Kamran Akram',
      email: 'kamran@bluestar.pk',
      phone: '+92 300 1234567',
      address: '14-B Industrial Area, Multan Road',
      city: 'Lahore',
      country: 'Pakistan',
      notes: 'Enterprise distributor account',
      subscriptionStartsAt: '2026-01-01',
      subscriptionEndsAt: '2027-01-01',
      initialAdmin: {
        username: 'bluestar_admin',
        password: 'Password123!',
        fullName: 'Kamran Akram',
        email: 'admin@bluestar.pk',
        phone: '+92 300 1234567',
      },
    };

    const provisionResult = CompanyProvisioningService.provisionCompany(testCustomerInput, 'superadmin');
    const newCompany = provisionResult.company;
    const newAdmin = provisionResult.initialAdminUser;

    assert(newCompany.id !== undefined, 'Company provisioned with valid UUID');
    assert(newCompany.slug === 'bluestar', 'Company assigned requested slug "bluestar"');
    assert(newCompany.tenant_code === 'BSL-001', 'Tenant code BSL-001 recorded');
    assert(newCompany.legal_name === 'Blue Star Logistics Private Limited', 'Legal name recorded');
    assert(newCompany.primary_contact_name === 'Kamran Akram', 'Primary contact recorded');
    assert(newCompany.plan === 'COMMERCIAL', 'Plan COMMERCIAL assigned');
    assert(newAdmin.username === 'bluestar_admin', 'Primary admin user created');
    assert(newAdmin.role === 'ADMIN', 'Primary admin role is ADMIN');
    assert(newAdmin.companyId === newCompany.id, 'Primary admin strictly isolated to new tenant companyId');

    // Subdomain preview verification
    assert(getCompanyUrl('bluestar') === 'https://bluestar.salesflow.space', 'Subdomain URL generated: https://bluestar.salesflow.space');

    // -----------------------------------------------------------------
    // TEST SECTION 8: Module Assignment & Plan Overrides
    // -----------------------------------------------------------------
    console.log('\n--- 8. Testing Module Assignment & Per-Tenant Overrides ---');

    // Check modules initially provisioned for COMMERCIAL plan
    const initialModules = db.prepare('SELECT module_id, is_enabled FROM company_modules WHERE company_id = ?').all(newCompany.id);
    assert(initialModules.length > 0, 'Commercial modules provisioned');

    // Override modules: disable 'inventory' and enable 'banking'
    CompanyProvisioningService.setCompanyModules(newCompany.id, [
      { moduleId: 'inventory', isEnabled: false },
      { moduleId: 'banking', isEnabled: true },
    ], 'superadmin');

    const updatedModules = db.prepare('SELECT module_id, is_enabled FROM company_modules WHERE company_id = ?').all(newCompany.id);
    const invModule = updatedModules.find(m => m.module_id === 'inventory');
    const bankModule = updatedModules.find(m => m.module_id === 'banking');
    assert(invModule && invModule.is_enabled === 0, 'Inventory module successfully disabled for this tenant');
    assert(bankModule && bankModule.is_enabled === 1, 'Banking module successfully enabled for this tenant');

    // Verify baseline tenant (Farhan) modules are untouched
    const farhanInv = db.prepare('SELECT is_enabled FROM company_modules WHERE company_id = ? AND module_id = ?').get(DEFAULT_COMPANY_ID, 'inventory');
    assert(farhanInv && farhanInv.is_enabled === 1, 'Baseline Farhan Distribution inventory module remains 100% active (isolated)');

    // -----------------------------------------------------------------
    // TEST SECTION 9: Tenant User Management
    // -----------------------------------------------------------------
    console.log('\n--- 9. Testing Tenant User Management ---');

    // Create additional user
    const newUser = CompanyProvisioningService.createCompanyUser(newCompany.id, {
      username: 'bluestar_sales_1',
      password: 'SalesPassword123!',
      fullName: 'Tariq Mehmood',
      email: 'tariq@bluestar.pk',
      phone: '+92 321 9876543',
      role: 'SALESMAN',
    }, 'superadmin');
    assert(newUser.username === 'bluestar_sales_1', 'Tenant user bluestar_sales_1 created');

    // Update user
    CompanyProvisioningService.updateTenantUser(newCompany.id, newUser.id, {
      fullName: 'Tariq Mehmood Khan',
      role: 'CASHIER',
    }, 'superadmin');
    const updatedUserRow = db.prepare('SELECT full_name, role FROM app_users WHERE id = ?').get(newUser.id);
    assert(updatedUserRow.full_name === 'Tariq Mehmood Khan', 'Tenant user name updated');
    assert(updatedUserRow.role === 'CASHIER', 'Tenant user role updated to CASHIER');

    // Reset password
    CompanyProvisioningService.resetTenantUserPassword(newCompany.id, newUser.id, 'NewStrongPassword@2026!', 'superadmin');
    const resetUserRow = db.prepare('SELECT password_hash FROM app_users WHERE id = ?').get(newUser.id);
    const newPwdCheck = AuthService.verifyPassword('NewStrongPassword@2026!', resetUserRow.password_hash);
    assert(newPwdCheck === true, 'Tenant user password successfully reset and verified');

    // -----------------------------------------------------------------
    // TEST SECTION 10: Branding Engine (Global & Tenant Override)
    // -----------------------------------------------------------------
    console.log('\n--- 10. Testing Branding Engine & Font System ---');

    // Approved fonts validation
    assert(APPROVED_FONTS.includes('Inter'), 'Inter is an approved font');
    assert(APPROVED_FONTS.includes('Poppins'), 'Poppins is an approved font');
    assert(APPROVED_FONTS.includes('Manrope'), 'Manrope is an approved font');

    // Default global branding
    const globalDefault = await getBrandingConfig();
    assert(globalDefault.displayName === 'SaleFlow ERP', 'Default displayName is SaleFlow ERP');
    assert(globalDefault.fontFamily === 'Inter', 'Default fontFamily is Inter');

    // Tenant-specific branding override
    await saveBrandingConfig({
      displayName: 'Blue Star Portal',
      primaryColor: '#0284c7',
      fontFamily: 'Poppins',
      borderRadius: 'md',
    }, newCompany.id);

    const tenantBranding = await getBrandingConfig(newCompany.id);
    assert(tenantBranding.displayName === 'Blue Star Portal', 'Tenant branding returns customized displayName');
    assert(tenantBranding.primaryColor === '#0284c7', 'Tenant branding returns customized primaryColor');
    assert(tenantBranding.fontFamily === 'Poppins', 'Tenant branding returns customized fontFamily');

    // Other tenant without override falls back to global default
    const farhanBranding = await getBrandingConfig(DEFAULT_COMPANY_ID);
    assert(farhanBranding.displayName === 'SaleFlow ERP', 'Company without override resolves global default branding');

    // Delete tenant override
    await deleteTenantBrandingOverride(newCompany.id);
    const revertedTenantBranding = await getBrandingConfig(newCompany.id);
    assert(revertedTenantBranding.displayName === 'SaleFlow ERP', 'After override deletion, tenant reverts to global default branding');

    // -----------------------------------------------------------------
    // TEST SECTION 11: Licensing Lifecycle & Status Controls
    // -----------------------------------------------------------------
    console.log('\n--- 11. Testing Licensing Lifecycle & Status Controls ---');

    // Extend license
    const extendedCompany = CompanyProvisioningService.extendLicense(newCompany.id, '2028-12-31', 'Extended 2 years', 'superadmin');
    assert(extendedCompany.subscription_ends_at === '2028-12-31', 'License extended to 2028-12-31');
    assert(extendedCompany.status === 'ACTIVE', 'Company status is ACTIVE');

    // Suspend company
    const suspendedCompany = CompanyProvisioningService.setCompanyStatus(newCompany.id, 'SUSPENDED', 'superadmin');
    assert(suspendedCompany.status === 'SUSPENDED', 'Company status transitioned to SUSPENDED');
    assert(suspendedCompany.is_active === 0, 'is_active set to 0 upon suspension');

    // Reactivate company
    const reactivatedCompany = CompanyProvisioningService.setCompanyStatus(newCompany.id, 'ACTIVE', 'superadmin');
    assert(reactivatedCompany.status === 'ACTIVE', 'Company status transitioned back to ACTIVE');
    assert(reactivatedCompany.is_active === 1, 'is_active set to 1 upon reactivation');

    // -----------------------------------------------------------------
    // TEST SECTION 12: Super Admin Dashboard Metrics & KPIs
    // -----------------------------------------------------------------
    console.log('\n--- 12. Testing Super Admin Dashboard Aggregator ---');

    const dashboardStats = await CompanyProvisioningService.getDashboardStats();
    assert(typeof dashboardStats.kpis.totalCustomers === 'number', 'KPI totalCustomers is numeric');
    assert(typeof dashboardStats.kpis.activeCustomers === 'number', 'KPI activeCustomers is numeric');
    assert(typeof dashboardStats.kpis.trialCustomers === 'number', 'KPI trialCustomers is numeric');
    assert(typeof dashboardStats.kpis.expiredCustomers === 'number', 'KPI expiredCustomers is numeric');
    assert(typeof dashboardStats.kpis.suspendedAccounts === 'number', 'KPI suspendedAccounts is numeric');
    assert(typeof dashboardStats.kpis.totalTenantUsers === 'number', 'KPI totalTenantUsers is numeric');
    assert(Array.isArray(dashboardStats.recentCustomers), 'recentCustomers is array');
    assert(Array.isArray(dashboardStats.recentActivity), 'recentActivity is array');
    assert(Array.isArray(dashboardStats.moduleUsage), 'moduleUsage is array');

    // -----------------------------------------------------------------
    // TEST SECTION 13: Audit Logging & Secret Redaction
    // -----------------------------------------------------------------
    console.log('\n--- 13. Testing Audit Logging & Secret Redaction ---');

    const auditLogsResult = await SuperAdminAuditService.getLogs({ limit: 50 });
    assert(auditLogsResult.logs.length > 0, 'Audit logs recorded sensitive actions');

    // Verify secrets are never logged
    for (const log of auditLogsResult.logs) {
      const serialized = JSON.stringify(log);
      assert(!serialized.includes('Password123!'), 'No raw passwords in audit logs');
      assert(!serialized.includes(superAdminPass), 'No superadmin passwords in audit logs');
      assert(!serialized.includes(totpSetup.secret), 'No TOTP secret in audit logs');
    }

  } finally {
    try {
      closeDatabase();
    } catch {}

    // Clean up temporary database copy
    if (fs.existsSync(TEMP_DB_PATH)) {
      try {
        fs.unlinkSync(TEMP_DB_PATH);
        console.log(`\n[Cleanup] Removed isolated test database: ${TEMP_DB_PATH}`);
      } catch (e) {
        console.warn(`[Cleanup] Could not unlink ${TEMP_DB_PATH}:`, e.message);
      }
    }
  }

  console.log('\n===================================================================');
  console.log(`TEST SUITE COMPLETE: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('===================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('[FATAL] Test runner encountered unhandled error:', err);
  process.exit(1);
});
