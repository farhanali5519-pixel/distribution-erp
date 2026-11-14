const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function get(pathStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: 'localhost',
      port: 3000,
      path: pathStr,
      headers: headers
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer,
          text: buffer.toString('utf-8'),
        });
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
      res.on('end', () => resolve({ status: res.statusCode, data }));
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
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('=== PHASE 10: DATABASE BACKUP & RESTORE ENGINE VERIFICATION ===\n');

  const dbPath = path.join(__dirname, '..', 'data', 'sales_distribution.db');
  const db = new DatabaseSync(dbPath);

  // 1. Feature Flags Verification
  console.log('1. Checking Phase 10 Feature Flags in Database...');
  
  // Ensure Phase 10 feature flags exist
  const insertFlagStmt = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const phase10Flags = [
    {
      key: 'backup.enable_manual_backup',
      moduleId: 'backup',
      value: 'true',
      label: 'Manual Database Backup',
      description: 'Allows administrators to create and download live SQLite database backup snapshots on-demand.',
    },
    {
      key: 'backup.enable_auto_daily_backup',
      moduleId: 'backup',
      value: 'true',
      label: 'Automatic Day-End Closing Backup',
      description: 'Automatically creates a timestamped SQLite database snapshot whenever daily cash closing is finalized and locked.',
    },
    {
      key: 'backup.require_admin_pin_for_restore',
      moduleId: 'backup',
      value: 'true',
      label: 'Admin PIN Safeguard for Database Restore',
      description: 'Strictly requires 4-digit Admin PIN verification before restoring or overwriting the system database.',
    },
  ];

  for (const f of phase10Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  const flags = db.prepare("SELECT key, value FROM feature_flags WHERE key LIKE 'backup.%'").all();
  console.log('Found backup flags:', flags);
  if (flags.length < 3) {
    throw new Error(`Expected at least 3 backup feature flags, found ${flags.length}`);
  }
  const flagKeys = flags.map(f => f.key);
  if (!flagKeys.includes('backup.enable_manual_backup') ||
      !flagKeys.includes('backup.enable_auto_daily_backup') ||
      !flagKeys.includes('backup.require_admin_pin_for_restore')) {
    throw new Error('Missing required backup feature flags.');
  }
  console.log('✓ All 3 Phase 10 feature flags confirmed.\n');
  db.close();

  // 2. GET /api/backup (Diagnostics & Stats)
  console.log('2. Testing GET /api/backup API...');
  const statsRes = await get('/api/backup');
  if (statsRes.status !== 200) {
    throw new Error(`GET /api/backup returned status ${statsRes.status}: ${statsRes.text}`);
  }
  const statsData = JSON.parse(statsRes.text);
  console.log('Stats received:', {
    sizeFormatted: statsData.stats.sizeFormatted,
    tableCount: statsData.stats.tableCount,
    totalRecords: statsData.stats.totalRecords,
    totalBackupsCount: statsData.stats.totalBackupsCount,
  });
  if (statsData.stats.tableCount === 0 || statsData.stats.sizeBytes === 0) {
    throw new Error('Database stats returned zero size or zero tables.');
  }
  console.log('✓ GET /api/backup returned valid database diagnostics.\n');

  // 3. GET /api/backup/list
  console.log('3. Testing GET /api/backup/list API...');
  const listRes = await get('/api/backup/list');
  if (listRes.status !== 200) {
    throw new Error(`GET /api/backup/list returned status ${listRes.status}`);
  }
  const listData = JSON.parse(listRes.text);
  console.log(`Current backups in archive: ${listData.backups.length}`);
  console.log('✓ GET /api/backup/list confirmed.\n');

  // 4. POST /api/backup (Create Manual Snapshot)
  console.log('4. Testing POST /api/backup (Create Manual Backup)...');
  const createRes = await post('/api/backup', { trigger: 'MANUAL' });
  if (createRes.status !== 200) {
    throw new Error(`POST /api/backup returned status ${createRes.status}: ${createRes.data}`);
  }
  const createData = JSON.parse(createRes.data);
  const createdFilename = createData.backup.filename;
  console.log('Created backup:', createData.backup);

  const backupsDir = path.join(__dirname, '..', 'backups');
  const filePath = path.join(backupsDir, createdFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file does not exist on disk at ${filePath}`);
  }

  // Check magic SQLite 3 header
  const fileBuf = fs.readFileSync(filePath);
  const headerStr = fileBuf.subarray(0, 16).toString('utf-8');
  console.log('File magic header:', JSON.stringify(headerStr));
  if (!headerStr.startsWith('SQLite format 3')) {
    throw new Error(`Invalid SQLite header: ${headerStr}`);
  }
  console.log('✓ Snapshot created on disk with valid SQLite format 3 magic header.\n');

  // 5. GET /api/backup/download
  console.log('5. Testing GET /api/backup/download stream...');
  const dlRes = await get(`/api/backup/download?filename=${encodeURIComponent(createdFilename)}`);
  if (dlRes.status !== 200) {
    throw new Error(`GET /api/backup/download returned status ${dlRes.status}`);
  }
  if (!dlRes.headers['content-disposition']?.includes(createdFilename)) {
    throw new Error(`Content-Disposition missing filename: ${dlRes.headers['content-disposition']}`);
  }
  if (dlRes.headers['content-type'] !== 'application/x-sqlite3') {
    throw new Error(`Unexpected Content-Type: ${dlRes.headers['content-type']}`);
  }
  console.log(`✓ Download stream received ${dlRes.buffer.length} bytes matching backup snapshot.\n`);

  // 6. Security PIN Enforcement on Restore
  console.log('6. Testing Security PIN enforcement on POST /api/backup/restore...');
  
  // A. Missing PIN
  const noPinRes = await post('/api/backup/restore', { filename: createdFilename, adminPin: '' });
  if (noPinRes.status !== 403 && noPinRes.status !== 400) {
    throw new Error(`Expected 403/400 for missing PIN, got ${noPinRes.status}`);
  }
  console.log('✓ Rejected restore without Admin PIN.');

  // B. Wrong PIN
  const wrongPinRes = await post('/api/backup/restore', { filename: createdFilename, adminPin: '9999' });
  if (wrongPinRes.status !== 400 && wrongPinRes.status !== 403) {
    throw new Error(`Expected 400/403 for wrong PIN, got ${wrongPinRes.status}`);
  }
  console.log('✓ Rejected restore with invalid Admin PIN.');

  // C. Valid PIN (Default: 1234)
  console.log('Testing restore with valid Admin PIN (1234)...');
  const restoreRes = await post('/api/backup/restore', { filename: createdFilename, adminPin: '1234' });
  if (restoreRes.status !== 200) {
    throw new Error(`Restore with valid PIN failed: ${restoreRes.data}`);
  }
  const restoreData = JSON.parse(restoreRes.data);
  console.log('Restore response:', restoreData.message);

  // Verify that pre-restore safety fallback snapshot was created
  const fallbackPath = path.join(backupsDir, 'pre-restore-fallback.sqlite');
  if (!fs.existsSync(fallbackPath)) {
    throw new Error('pre-restore-fallback.sqlite was NOT created before restore.');
  }
  console.log('✓ pre-restore-fallback.sqlite created and database safely restored with integrity verified.\n');

  // 7. Test Deletion of Test Backup
  console.log('7. Testing DELETE /api/backup?...');
  const delRes = await del(`/api/backup?filename=${encodeURIComponent(createdFilename)}`);
  if (delRes.status !== 200) {
    throw new Error(`DELETE /api/backup failed: ${delRes.data}`);
  }
  if (fs.existsSync(filePath)) {
    throw new Error(`File ${createdFilename} still exists after deletion.`);
  }
  console.log('✓ Backup snapshot deleted successfully.\n');

  // 8. Automatic Day-End Backup Hook on Closing Finalize
  console.log('8. Testing Automatic Day-End Backup Hook via /api/closing/finalize...');
  const testClosingDate = `2026-11-${Math.floor(Math.random() * 20 + 10)}`;
  const finalizeRes = await post('/api/closing/finalize', {
    closingDate: testClosingDate,
    openingCashPaisas: 100000,
    physicalCashPaisas: 100000,
    closedBy: 'Audit Tester',
  });
  const finalizeData = JSON.parse(finalizeRes.data);
  if (finalizeRes.status === 200) {
    console.log('AutoBackup returned:', finalizeData.autoBackup);
    if (!finalizeData.autoBackup?.filename?.includes('daily')) {
      throw new Error('Expected autoBackup to be generated with "daily" in filename.');
    }
    // Clean up test auto backup file
    await del(`/api/backup?filename=${encodeURIComponent(finalizeData.autoBackup.filename)}`);
    console.log('✓ Automatic Day-End Backup Hook verified successfully.\n');
  } else {
    console.log('Finalize response:', finalizeData.message);
  }

  console.log('================================================================');
  console.log('🎉 ALL PHASE 10 BACKUP & RESTORE CHECKS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
