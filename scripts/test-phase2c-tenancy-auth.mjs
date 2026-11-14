import assert from 'node:assert';
import { 
  DEFAULT_COMPANY_ID, 
  DEFAULT_COMPANY_NAME, 
  DEFAULT_COMPANY_SLUG,
  SESSION_COOKIE_NAME,
  TENANT_HEADER_SLUG,
  TENANT_HEADER_ID
} from '../src/core/tenancy/constants.ts';
import { 
  signSessionToken, 
  verifySessionToken, 
  buildSessionPayload, 
  createSessionCookieHeader, 
  createClearSessionCookieHeader,
  extractSessionTokenFromCookieHeader,
  getSessionFromRequest
} from '../src/core/auth/session.ts';
import { 
  extractSubdomainFromHost, 
  resolveTenant 
} from '../src/core/tenancy/resolver.ts';
import { 
  getTenantContext, 
  requireTenantContext, 
  getCurrentCompanyId, 
  requireAuthenticatedUser,
  TenantContextError
} from '../src/core/tenancy/context.ts';
import { getDatabase } from '../src/core/database/db.ts';

console.log('================================================================');
console.log('   PHASE 2C: TENANT CONTEXT & AUTHENTICATION TEST SUITE         ');
console.log('================================================================\n');

let passedChecks = 0;
function pass(msg) {
  console.log(`[PASS] ${msg}`);
  passedChecks++;
}

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. Session Token HMAC Signing & Verification
  // -------------------------------------------------------------------------
  console.log('--- 1. Testing Secure Session Token HMAC Signing & Tamper Resistance ---');

  const testPayload = buildSessionPayload({
    userId: 'user-test-uuid-1234',
    companyId: DEFAULT_COMPANY_ID,
    role: 'ADMIN',
    username: 'admin',
    fullName: 'System Administrator',
    maxAgeSeconds: 3600
  });

  const token = signSessionToken(testPayload);
  assert.ok(token, 'Token must not be empty');
  assert.ok(token.includes('.'), 'Token must contain payload.signature separator');
  pass('signSessionToken produces signed token with format payload.signature');

  const verified = verifySessionToken(token);
  assert.ok(verified, 'Verified session payload must not be null');
  assert.strictEqual(verified.userId, 'user-test-uuid-1234');
  assert.strictEqual(verified.companyId, DEFAULT_COMPANY_ID);
  assert.strictEqual(verified.role, 'ADMIN');
  pass('verifySessionToken correctly decodes and validates valid token');

  // Test Tampering: Altering payload
  const parts = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...testPayload, role: 'SUPER_ADMIN' })).toString('base64url');
  const forgedToken = `${forgedPayload}.${parts[1]}`;
  const tamperedResult = verifySessionToken(forgedToken);
  assert.strictEqual(tamperedResult, null, 'Tampered token signature must fail verification');
  pass('verifySessionToken detects tampered payload and returns null');

  // Test Expired Token
  const expiredPayload = {
    ...testPayload,
    issuedAt: Date.now() - 100000,
    expiresAt: Date.now() - 1000, // expired 1s ago
  };
  const expiredToken = signSessionToken(expiredPayload);
  const expiredResult = verifySessionToken(expiredToken);
  assert.strictEqual(expiredResult, null, 'Expired token must return null');
  pass('verifySessionToken detects expired token and returns null');

  // Cookie Headers
  const cookieHeader = createSessionCookieHeader(testPayload);
  assert.ok(cookieHeader.includes(`${SESSION_COOKIE_NAME}=${token}`), 'Cookie header must contain name and token');
  assert.ok(cookieHeader.includes('HttpOnly'), 'Cookie header must be HttpOnly');
  assert.ok(cookieHeader.includes('Path=/'), 'Cookie header must have Path=/');
  assert.ok(cookieHeader.includes('SameSite=Lax'), 'Cookie header must have SameSite=Lax');
  pass('createSessionCookieHeader produces secure HttpOnly, SameSite=Lax cookie attribute');

  const clearCookieHeader = createClearSessionCookieHeader();
  assert.ok(clearCookieHeader.includes('Max-Age=0'), 'Clear cookie must have Max-Age=0');
  pass('createClearSessionCookieHeader produces immediate expiration header');

  const extracted = extractSessionTokenFromCookieHeader(`other_cookie=xyz; ${SESSION_COOKIE_NAME}=${token}; test=1`);
  assert.strictEqual(extracted, token);
  pass('extractSessionTokenFromCookieHeader extracts correct session cookie among others');

  // -------------------------------------------------------------------------
  // 2. Subdomain & Hostname Resolution Structure (Cloud-ready)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Subdomain & Hostname Parsing Structure ---');

  assert.strictEqual(extractSubdomainFromHost('farhan.saleflow.app'), 'farhan');
  assert.strictEqual(extractSubdomainFromHost('tenant-b.erp.com:8080'), 'tenant-b');
  assert.strictEqual(extractSubdomainFromHost('client1.localhost:3000'), 'client1');
  pass('extractSubdomainFromHost correctly parses subdomains from hostnames');

  assert.strictEqual(extractSubdomainFromHost('localhost:3000'), null);
  assert.strictEqual(extractSubdomainFromHost('127.0.0.1:3000'), null);
  assert.strictEqual(extractSubdomainFromHost('app.saleflow.com'), null);
  assert.strictEqual(extractSubdomainFromHost('www.saleflow.com'), null);
  assert.strictEqual(extractSubdomainFromHost('api.saleflow.com'), null);
  pass('extractSubdomainFromHost ignores root domains, local IPs, and reserved subdomains');

  // -------------------------------------------------------------------------
  // 3. On-Premise Tenant Resolution
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing On-Premise Tenant Resolution (Zero DNS / Zero Cloud Dependency) ---');

  const onPremiseRes = await resolveTenant();
  assert.strictEqual(onPremiseRes.isValid, true);
  assert.strictEqual(onPremiseRes.companyId, DEFAULT_COMPANY_ID);
  assert.strictEqual(onPremiseRes.companyName, DEFAULT_COMPANY_NAME);
  assert.strictEqual(onPremiseRes.companySlug, DEFAULT_COMPANY_SLUG);
  assert.strictEqual(onPremiseRes.source, 'onpremise_default');
  pass('resolveTenant() in On-Premise mode resolves to DEFAULT_COMPANY_ID without internet/domain');

  // -------------------------------------------------------------------------
  // 4. Server-Side Tenant Context in On-Premise Mode
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Testing Server-Side Tenant Context & Reusable Helpers ---');

  // A. Context with no cookie in On-Premise mode -> defaults gracefully to local admin
  const defaultContext = await getTenantContext();
  assert.strictEqual(defaultContext.companyId, DEFAULT_COMPANY_ID);
  assert.strictEqual(defaultContext.deploymentMode, 'onpremise');
  assert.strictEqual(defaultContext.isOnPremise, true);
  assert.strictEqual(defaultContext.isCloud, false);
  assert.strictEqual(defaultContext.isAuthenticated, true);
  assert.strictEqual(defaultContext.username, 'admin');
  assert.strictEqual(defaultContext.role, 'ADMIN');
  pass('getTenantContext() without session falls back gracefully to default on-premise admin');

  // B. Context with mock request containing valid session cookie for admin user
  const db = getDatabase();
  const adminRow = db.prepare("SELECT id, username, role, full_name FROM app_users WHERE username = 'admin'").get();
  assert.ok(adminRow, 'Admin user must exist in database');

  const adminSession = buildSessionPayload({
    userId: adminRow.id,
    companyId: DEFAULT_COMPANY_ID,
    role: adminRow.role,
    username: adminRow.username,
    fullName: adminRow.full_name,
  });
  const adminToken = signSessionToken(adminSession);

  const mockReqWithCookie = {
    headers: {
      get: (h) => (h.toLowerCase() === 'cookie' ? `${SESSION_COOKIE_NAME}=${adminToken}` : null)
    }
  };

  const authenticatedContext = await getTenantContext(mockReqWithCookie);
  assert.strictEqual(authenticatedContext.isAuthenticated, true);
  assert.strictEqual(authenticatedContext.userId, adminRow.id);
  assert.strictEqual(authenticatedContext.username, 'admin');
  assert.strictEqual(authenticatedContext.role, 'ADMIN');
  assert.strictEqual(authenticatedContext.companyId, DEFAULT_COMPANY_ID);
  pass('getTenantContext() with signed cookie validates user identity from database');

  // C. getCurrentCompanyId() helper
  const companyId = await getCurrentCompanyId(mockReqWithCookie);
  assert.strictEqual(companyId, DEFAULT_COMPANY_ID);
  pass('getCurrentCompanyId() returns active company ID');

  // D. requireTenantContext() helper
  const requiredContext = await requireTenantContext(mockReqWithCookie);
  assert.strictEqual(requiredContext.companyId, DEFAULT_COMPANY_ID);
  pass('requireTenantContext() passes with valid context');

  // E. requireAuthenticatedUser() helper
  const authUser = await requireAuthenticatedUser(mockReqWithCookie);
  assert.strictEqual(authUser.userId, adminRow.id);
  assert.strictEqual(authUser.companyId, DEFAULT_COMPANY_ID);
  assert.strictEqual(authUser.role, 'ADMIN');
  pass('requireAuthenticatedUser() returns verified user payload');

  // -------------------------------------------------------------------------
  // 5. Rule 7 Enforcement: Cross-Tenant Protection & Anti-Spoofing
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Testing Rule 7 Enforcement (Tenant Mismatch & Anti-Spoofing) ---');

  // Session for Company X, but resolved tenant is Company Y
  const foreignCompanySession = buildSessionPayload({
    userId: adminRow.id,
    companyId: '99999999-9999-9999-9999-999999999999', // Foreign company
    role: 'ADMIN',
    username: 'admin',
    fullName: 'Admin',
  });
  const foreignToken = signSessionToken(foreignCompanySession);

  const mockForeignReq = {
    headers: {
      get: (h) => (h.toLowerCase() === 'cookie' ? `${SESSION_COOKIE_NAME}=${foreignToken}` : null)
    }
  };

  const mismatchContext = await getTenantContext(mockForeignReq);
  assert.strictEqual(mismatchContext.isAuthenticated, false);
  assert.ok(mismatchContext.error.includes('Tenant mismatch'), 'Must detect tenant mismatch');
  pass('getTenantContext() detects tenant mismatch when session company does not match resolved company');

  // Forged headers: Client sends arbitrary x-user-role or x-user-id
  const forgedHeaderReq = {
    headers: {
      get: (h) => {
        if (h === 'x-user-role') return 'ADMIN';
        if (h === 'x-user-id') return 'attacker-id';
        return null;
      }
    }
  };
  // In Cloud mode, this would be rejected; in On-Premise, server only reads verified DB user
  const forgedContext = await getTenantContext(forgedHeaderReq);
  assert.notStrictEqual(forgedContext.userId, 'attacker-id', 'Server must never trust client-supplied userId header');
  pass('Anti-Spoofing: Client cannot forge identity via custom x-user-id or x-user-role headers');

  // -------------------------------------------------------------------------
  // 6. Cloud Mode Tenant Resolution (Simulated Environment)
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Testing Cloud Mode Tenant Resolution (Simulated Environment) ---');

  // Temporarily simulate cloud mode
  process.env.DEPLOYMENT_MODE = 'cloud';

  try {
    // A. Resolve existing company by header slug
    const cloudHeaderRes = await resolveTenant({
      headers: { [TENANT_HEADER_SLUG]: 'farhan' }
    });
    assert.strictEqual(cloudHeaderRes.isValid, true);
    assert.strictEqual(cloudHeaderRes.companySlug, 'farhan');
    assert.strictEqual(cloudHeaderRes.companyId, DEFAULT_COMPANY_ID);
    pass('Cloud mode: resolves tenant company via x-tenant-slug header');

    // B. Resolve existing company by host subdomain
    const cloudHostRes = await resolveTenant({
      host: 'farhan.saleflow.app:8080'
    });
    assert.strictEqual(cloudHostRes.isValid, true);
    assert.strictEqual(cloudHostRes.companySlug, 'farhan');
    pass('Cloud mode: resolves tenant company via hostname subdomain (farhan.saleflow.app)');

    // C. Resolve non-existent tenant in Cloud mode
    const cloudMissingRes = await resolveTenant({
      headers: { [TENANT_HEADER_SLUG]: 'non-existent-company-slug' }
    });
    assert.strictEqual(cloudMissingRes.isValid, false);
    assert.ok(cloudMissingRes.error.includes('not found'));
    pass('Cloud mode: rejects non-existent tenant company with isValid: false');

    // D. Cloud mode requireTenantContext throws when unauthenticated
    let cloudAuthError = null;
    try {
      await requireTenantContext({
        headers: { [TENANT_HEADER_SLUG]: 'farhan' }
      });
    } catch (err) {
      cloudAuthError = err;
    }
    assert.ok(cloudAuthError instanceof TenantContextError);
    assert.strictEqual(cloudAuthError.status, 401);
    pass('Cloud mode: requireTenantContext() strictly throws 401 when no session is present');
  } finally {
    // Reset back to onpremise mode
    process.env.DEPLOYMENT_MODE = 'onpremise';
  }

  // -------------------------------------------------------------------------
  // 7. Verify Integrity of Baseline Business Data Remains 100% Unaltered
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Verifying Financial & Stock Baseline Remains 100% Intact ---');

  const jLines = db.prepare(`
    SELECT 
      COUNT(*) as c, 
      COALESCE(SUM(jl.debit_paisas), 0) as debits, 
      COALESCE(SUM(jl.credit_paisas), 0) as credits 
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_id = je.id
    WHERE je.status = 'POSTED'
  `).get();
  assert.strictEqual(Number(jLines.c), 130);
  assert.strictEqual(Number(jLines.debits), 79732606);
  assert.strictEqual(Number(jLines.credits), 80232606);
  pass('General Ledger: 130 posted lines, 79,732,606 debits, 80,232,606 credits intact');

  const dueCream = db.prepare("SELECT current_stock FROM products WHERE name = '01-DUE BEAUTY CREAM'").get();
  assert.strictEqual(Number(dueCream.current_stock), 177);
  pass('Stock verification: 01-DUE BEAUTY CREAM = 177 PCS');

  console.log('\n================================================================');
  console.log(`   >>> ALL ${passedChecks} PHASE 2C VALIDATION CHECKS PASSED! <<< `);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err);
  process.exit(1);
});
