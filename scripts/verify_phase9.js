const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

function get(pathStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
  });
}

function post(pathStr, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('=== PHASE 9 ROLES, PERMISSIONS & MULTI-USER RBAC VERIFICATION ===\n');

  // 1. Direct DB verification
  const dbPath = path.join(__dirname, '..', 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);

  console.log('1. Checking Phase 9 Feature Flags in Database...');
  const flags = db.prepare("SELECT key, value FROM feature_flags WHERE key LIKE 'auth.%'").all();
  console.log('Found auth flags:', flags);
  if (flags.length < 3) {
    throw new Error(`Expected at least 3 auth feature flags, found ${flags.length}`);
  }
  console.log('✓ Phase 9 feature flags confirmed.\n');

  console.log('2. Checking app_users Table and Seeded Accounts...');
  const users = db.prepare("SELECT id, username, full_name, role, password_hash, staff_id, is_active FROM app_users").all();
  console.log(`Found ${users.length} seeded users:`);
  for (const u of users) {
    console.log(` - @${u.username} (${u.role}) - ${u.full_name}, active: ${u.is_active}`);
  }

  const admin = users.find(u => u.username === 'admin');
  const salesman = users.find(u => u.username === 'tariq.sales');
  const cashier = users.find(u => u.username === 'imran.cashier');
  const warehouse = users.find(u => u.username === 'asif.warehouse');

  if (!admin || admin.role !== 'ADMIN') throw new Error('Missing admin user with ADMIN role');
  if (!salesman || salesman.role !== 'SALESMAN') throw new Error('Missing tariq.sales user with SALESMAN role');
  if (!cashier || cashier.role !== 'CASHIER') throw new Error('Missing imran.cashier user with CASHIER role');
  if (!warehouse || warehouse.role !== 'WAREHOUSE') throw new Error('Missing asif.warehouse user with WAREHOUSE role');

  // Verify password hash for admin ('admin')
  const expectedAdminHash = crypto.createHash('sha256').update('saleflow_user_salt_admin').digest('hex');
  if (admin.password_hash !== expectedAdminHash) {
    throw new Error('Admin password hash mismatch');
  }
  console.log('✓ Seeded accounts and password encryption confirmed.\n');

  console.log('3. Checking app_settings & Admin Security PIN...');
  const pinSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_security_pin'").get();
  if (!pinSetting) throw new Error('admin_security_pin missing in app_settings');

  const expectedPinHash = crypto.createHash('sha256').update('saleflow_admin_pin_1234').digest('hex');
  if (pinSetting.value !== expectedPinHash) {
    throw new Error('Default Admin PIN 1234 hash mismatch');
  }
  console.log('✓ Default Admin PIN (1234) salt & hash verified in app_settings.\n');

  console.log('4. Testing HTTP UI and API Endpoints...');
  const resUsersPage = await get('/settings/users');
  console.log(`/settings/users -> HTTP ${resUsersPage.status}`);
  if (resUsersPage.status !== 200) throw new Error(`Failed to load /settings/users: ${resUsersPage.status}`);

  const resApiUsers = await get('/api/auth/users');
  console.log(`/api/auth/users -> HTTP ${resApiUsers.status}`);
  if (resApiUsers.status !== 200) throw new Error(`Failed to get /api/auth/users: ${resApiUsers.status}`);
  const apiUsersData = JSON.parse(resApiUsers.data);
  console.log(`API returned ${apiUsersData.users.length} users.`);

  const resSession = await get('/api/auth/session');
  console.log(`/api/auth/session -> HTTP ${resSession.status}`);
  const sessionData = JSON.parse(resSession.data);
  console.log(`Session Default User: @${sessionData.defaultUser?.username} (${sessionData.defaultUser?.role})`);
  console.log('✓ HTTP endpoints operational.\n');

  console.log('5. Testing PIN Verification API...');
  const pinValidRes = await post('/api/auth/verify-pin', { pin: '1234' });
  const pinValidData = JSON.parse(pinValidRes.data);
  if (!pinValidData.valid) throw new Error('Expected PIN 1234 to be valid');
  console.log('PIN 1234 verification: VALID');

  const pinInvalidRes = await post('/api/auth/verify-pin', { pin: '9999' });
  const pinInvalidData = JSON.parse(pinInvalidRes.data);
  if (pinInvalidData.valid) throw new Error('Expected PIN 9999 to be invalid');
  console.log('PIN 9999 verification: REJECTED (as expected)');
  console.log('✓ Admin PIN verification API strictly confirmed.\n');

  console.log('6. Testing Void Protection with Admin PIN Guard...');
  // Test journal void with invalid/missing PIN
  const fakeJournalRes = await post('/api/accounting/journal/void', {
    journalId: 'non-existent-id',
    reason: 'Test void',
    adminPin: '9999'
  });
  console.log(`Attempt void with wrong PIN 9999 -> HTTP ${fakeJournalRes.status}`);
  if (fakeJournalRes.status !== 403) {
    throw new Error(`Expected HTTP 403 Forbidden for wrong PIN, received ${fakeJournalRes.status}`);
  }
  console.log('✓ Void protection blocked unauthorized request with HTTP 403.\n');

  console.log('7. Testing Cost Masking for Salesmen...');
  const resMasked = await get('/api/inventory', { 'x-user-role': 'SALESMAN' });
  const maskedData = JSON.parse(resMasked.data);
  if (maskedData.products.length > 0) {
    const p0 = maskedData.products[0];
    console.log(`Sample Product for SALESMAN: ${p0.name}`);
    console.log(` - Cost Price: PKR ${p0.cost_price}`);
    console.log(` - Base Rate: PKR ${p0.base_rate_per_piece}`);
    console.log(` - Margin: ${p0.margin_percentage}%`);
    if (p0.cost_price !== 0 || p0.base_rate_per_piece !== 0 || p0.margin_percentage !== 0) {
      throw new Error('Cost and Margin are not masked for SALESMAN!');
    }
  }

  const resUnmasked = await get('/api/inventory', { 'x-user-role': 'ADMIN' });
  const unmaskedData = JSON.parse(resUnmasked.data);
  if (unmaskedData.products.length > 0) {
    const p0 = unmaskedData.products[0];
    console.log(`Sample Product for ADMIN: ${p0.name}`);
    console.log(` - Cost Price: PKR ${p0.cost_price}`);
    console.log(` - Margin: ${p0.margin_percentage}%`);
    if (p0.cost_price === 0 && p0.trade_price > 0) {
      throw new Error('Cost Price should not be zero for ADMIN!');
    }
  }
  console.log('✓ Product cost and margin masking for salesmen strictly confirmed.\n');

  console.log('=== ALL PHASE 9 RBAC & AUTH TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
