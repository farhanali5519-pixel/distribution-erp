const http = require('http');

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
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
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
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function del(pathStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      method: 'DELETE',
      headers: headers
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
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('ENTERPRISE USER MANAGEMENT & PERMISSIONS VERIFICATION');
  console.log('====================================================\n');

  // Step 1: Verify Session Endpoint
  console.log('Step 1: Checking GET /api/auth/session...');
  const sessionRes = await get('/api/auth/session');
  console.log(`Session response status: ${sessionRes.status}, success: ${sessionRes.json?.success}`);
  if (sessionRes.status !== 200 || !sessionRes.json?.success) {
    console.error('Session endpoint failed:', sessionRes);
    process.exit(1);
  }
  console.log(`Active session users: ${sessionRes.json.users.length}`);

  // Step 2: Verify List Users Endpoint
  console.log('\nStep 2: Checking GET /api/auth/users...');
  const usersRes = await get('/api/auth/users');
  console.log(`Users response status: ${usersRes.status}, count: ${usersRes.json?.users?.length}`);
  if (usersRes.status !== 200 || !usersRes.json?.success) {
    console.error('List users failed:', usersRes);
    process.exit(1);
  }
  const usersList = usersRes.json.users;
  const adminUser = usersList.find(u => u.username === 'admin');
  console.log(`Admin user found: ${!!adminUser}, permissions parsed: ${!!adminUser?.permissions}`);

  // Step 3: Create a Test User
  console.log('\nStep 3: Creating a new user via POST /api/auth/users...');
  const testUsername = 'test.sales_' + Date.now();
  const createRes = await post('/api/auth/users', {
    username: testUsername,
    fullName: 'Test Sales Rep',
    password: 'password123',
    role: 'SALESMAN'
  });
  console.log(`Create user status: ${createRes.status}, success: ${createRes.json?.success}`);
  if (createRes.status !== 200 || !createRes.json?.success) {
    console.error('Create user failed:', createRes);
    process.exit(1);
  }
  const testUser = createRes.json.user;
  console.log(`Created user @${testUser.username} with ID: ${testUser.id}`);

  // Step 4: Fetch Granular Permissions via GET /api/auth/users/[id]/permissions
  console.log('\nStep 4: Fetching permissions via GET /api/auth/users/[id]/permissions...');
  const permsRes = await get(`/api/auth/users/${testUser.id}/permissions`);
  console.log(`Permissions GET status: ${permsRes.status}, success: ${permsRes.json?.success}`);
  if (permsRes.status !== 200 || !permsRes.json?.success) {
    console.error('Get permissions failed:', permsRes);
    process.exit(1);
  }
  console.log(`Module groups returned: ${permsRes.json.moduleGroups?.length} (Expected 7)`);
  console.log(`Total submodules returned: ${permsRes.json.allSubModules?.length}`);
  console.log(`Order booking access: ${permsRes.json.permissions['order-booking']?.access}`);
  console.log(`Purchase bill access (expected false for salesman): ${permsRes.json.permissions['new-purchase-bill']?.access}`);

  if (permsRes.json.moduleGroups?.length !== 7) {
    console.error('Module groups count mismatch!');
    process.exit(1);
  }

  // Step 5: Update Granular Permissions via POST /api/auth/users/[id]/permissions
  console.log('\nStep 5: Updating permissions via POST /api/auth/users/[id]/permissions...');
  const updatedPerms = { ...permsRes.json.permissions };
  // Grant custom access to new-purchase-bill and daily-expenses
  updatedPerms['new-purchase-bill'] = { access: true, edit: true, void: false, delete: false };
  updatedPerms['daily-expenses'] = { access: true, edit: true, void: true, delete: false };

  const savePermsRes = await post(`/api/auth/users/${testUser.id}/permissions`, {
    permissions: updatedPerms
  });
  console.log(`Save permissions status: ${savePermsRes.status}, success: ${savePermsRes.json?.success}`);
  if (savePermsRes.status !== 200 || !savePermsRes.json?.success) {
    console.error('Save permissions failed:', savePermsRes);
    process.exit(1);
  }

  // Verify reload of updated permissions
  const verifyPermsRes = await get(`/api/auth/users/${testUser.id}/permissions`);
  console.log(`Reloaded new-purchase-bill access: ${verifyPermsRes.json.permissions['new-purchase-bill']?.access} (Expected: true)`);
  console.log(`Reloaded daily-expenses void: ${verifyPermsRes.json.permissions['daily-expenses']?.void} (Expected: true)`);
  if (!verifyPermsRes.json.permissions['new-purchase-bill']?.access || !verifyPermsRes.json.permissions['daily-expenses']?.void) {
    console.error('Permissions verification failed after update!');
    process.exit(1);
  }

  // Step 6: Test Reset Password Endpoint
  console.log('\nStep 6: Resetting password via POST /api/auth/users/[id]/reset-password...');
  const resetRes = await post(`/api/auth/users/${testUser.id}/reset-password`, {
    password: 'brandNewSecretPassword123'
  });
  console.log(`Reset password status: ${resetRes.status}, success: ${resetRes.json?.success}`);
  if (resetRes.status !== 200 || !resetRes.json?.success) {
    console.error('Password reset failed:', resetRes);
    process.exit(1);
  }

  // Step 7: Test Admin User Deletion Safeguard
  console.log('\nStep 7: Testing Admin user deletion safeguard...');
  const adminDelRes = await del(`/api/auth/users/${adminUser.id}?action=delete`);
  console.log(`Admin delete attempt status: ${adminDelRes.status}, message: ${adminDelRes.json?.message}`);
  if (adminDelRes.status === 200 && adminDelRes.json?.success) {
    console.error('FAILED: Primary admin user was deleted!');
    process.exit(1);
  }
  console.log('Safeguard passed: Admin user cannot be deleted.');

  // Step 8: Delete Test User
  console.log('\nStep 8: Deleting test user via DELETE /api/auth/users/[id]?action=delete...');
  const delRes = await del(`/api/auth/users/${testUser.id}?action=delete`);
  console.log(`Delete status: ${delRes.status}, message: ${delRes.json?.message}`);
  if (delRes.status !== 200 || !delRes.json?.success) {
    console.error('Delete user failed:', delRes);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('>>> ALL VERIFICATION CHECKS PASSED (100% SUCCESS) <<<');
  console.log('====================================================');
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
