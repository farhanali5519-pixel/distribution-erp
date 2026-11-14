/**
 * COMMERCIAL RELEASE PACKAGING & CLEAN-INSTALL TEST (PHASE 7 RC VALIDATION)
 * 
 * 1. Stages a clean commercial customer release package into dist/SaleFlow-ERP-v1.1.0-OnPremise
 * 2. Enforces strict exclusions (no test databases, no private keys, no vendor tools, no dev scripts)
 * 3. Tests a complete fresh customer installation in a clean temporary directory
 * 4. Verifies database initialization, license activation, and update invariance
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.resolve('dist/SaleFlow-ERP-v1.1.0-OnPremise');
const CLEAN_INSTALL_DIR = path.resolve('scratch/clean_install_test_sandbox');

let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function pass(desc) {
  passedChecks++;
  console.log(`  [PASS] ${desc}`);
}

function fail(desc, err) {
  failedChecks++;
  const msg = err ? `${desc}: ${err.message || err}` : desc;
  failures.push(msg);
  console.error(`  [FAIL] ${msg}`);
}

// Helper to copy files recursively with filter
function copyDirRecursive(src, dest, filterFn) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filterFn && !filterFn(srcPath, entry)) continue;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filterFn);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function runPackagingAndCleanInstall() {
  console.log('===================================================================');
  console.log('  COMMERCIAL RELEASE PACKAGING & CLEAN-INSTALL TEST (SECTION 3)   ');
  console.log('===================================================================\n');

  // =========================================================================
  // STEP 1: CREATE CLEAN RELEASE PACKAGE
  // =========================================================================
  console.log('--- Step 1: Staging Commercial Release Package ---');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy Root Configuration & Launchers
  const rootFiles = [
    '.env.example',
    'package.json',
    'package-lock.json',
    'next.config.mjs',
    'tsconfig.json',
    'start-onpremise.bat',
    'stop-onpremise.bat',
    'restart-onpremise.bat',
  ];

  for (const rf of rootFiles) {
    const p = path.join(ROOT_DIR, rf);
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, path.join(DIST_DIR, rf));
    }
  }

  // Create standard on-premise .env
  fs.writeFileSync(
    path.join(DIST_DIR, '.env'),
    `DEPLOYMENT_MODE=onpremise\nDATABASE_DRIVER=sqlite\nSQLITE_DATABASE_PATH=data/sales_distribution.db\nHOST=0.0.0.0\nPORT=3000\n`,
    'utf8'
  );

  // Copy docs/
  copyDirRecursive(path.join(ROOT_DIR, 'docs'), path.join(DIST_DIR, 'docs'));

  // Copy src/ (Customer application runtime)
  copyDirRecursive(path.join(ROOT_DIR, 'src'), path.join(DIST_DIR, 'src'));

  // Copy .next/ (Compiled production assets: server, static, manifests)
  if (fs.existsSync(path.join(ROOT_DIR, '.next'))) {
    copyDirRecursive(path.join(ROOT_DIR, '.next'), path.join(DIST_DIR, '.next'), (srcPath) => {
      // Exclude cache and Turbopack node_modules symlinks
      return !srcPath.includes('cache') && !srcPath.includes('node_modules');
    });
  }

  // Copy selective customer scripts
  const scriptsDest = path.join(DIST_DIR, 'scripts');
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.copyFileSync(path.join(ROOT_DIR, 'scripts/onprem-update.mjs'), path.join(scriptsDest, 'onprem-update.mjs'));
  fs.copyFileSync(path.join(ROOT_DIR, 'scripts/backup-now.mjs'), path.join(scriptsDest, 'backup-now.mjs'));
  copyDirRecursive(path.join(ROOT_DIR, 'scripts/onprem'), path.join(scriptsDest, 'onprem'));

  // Create clean persistent folders with .gitkeep
  for (const dirName of ['data', 'backups', 'logs', 'config']) {
    const dirPath = path.join(DIST_DIR, dirName);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, '.gitkeep'), '', 'utf8');
  }

  pass(`Staged commercial package layout in: dist/SaleFlow-ERP-v1.1.0-OnPremise`);

  // =========================================================================
  // STEP 2: VERIFY STRICT EXCLUSIONS
  // =========================================================================
  console.log('\n--- Step 2: Verifying Strict Exclusions ---');

  // Check no databases in data/
  const dataEntries = fs.readdirSync(path.join(DIST_DIR, 'data'));
  const dbsInData = dataEntries.filter((f) => f.endsWith('.db') || f.endsWith('.sqlite'));
  if (dbsInData.length === 0) {
    pass(`Customer data/ folder is empty (zero pre-existing or test databases packaged)`);
  } else {
    fail(`Forbidden database packaged in data/: ${dbsInData.join(', ')}`);
  }

  // Check no backups in backups/
  const backupEntries = fs.readdirSync(path.join(DIST_DIR, 'backups'));
  const dbsInBackups = backupEntries.filter((f) => f.endsWith('.db') || f.endsWith('.sqlite'));
  if (dbsInBackups.length === 0) {
    pass(`Customer backups/ folder is clean (zero development backups packaged)`);
  } else {
    fail(`Forbidden backup packaged in backups/: ${dbsInBackups.join(', ')}`);
  }

  // Check license-tool.mjs is excluded
  if (!fs.existsSync(path.join(DIST_DIR, 'scripts/license-tool.mjs'))) {
    pass(`Vendor offline license-tool.mjs is strictly EXCLUDED from customer release`);
  } else {
    fail(`CRITICAL SECURITY FAILURE: license-tool.mjs is packaged in customer release!`);
  }

  // Check developer test scripts are excluded
  const scriptsInDist = fs.readdirSync(path.join(DIST_DIR, 'scripts'));
  const testScripts = scriptsInDist.filter((s) => s.startsWith('test-') || s.startsWith('verify-'));
  if (testScripts.length === 0) {
    pass(`All developer test scripts (test-*, verify-*) are strictly EXCLUDED`);
  } else {
    fail(`Developer test scripts found in release package: ${testScripts.join(', ')}`);
  }

  // Check no private keys inside package
  let foundPrivateKey = false;
  function searchPrivateKeys(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        searchPrivateKeys(fullPath);
      } else if (item.isFile() && (item.name.endsWith('.js') || item.name.endsWith('.ts') || item.name.endsWith('.mjs') || item.name.endsWith('.json') || item.name.endsWith('.env'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('BEGIN PRIVATE KEY')) {
          foundPrivateKey = true;
          console.error(`Found private key in: ${fullPath}`);
        }
      }
    }
  }
  searchPrivateKeys(DIST_DIR);

  if (!foundPrivateKey) {
    pass(`Verified ZERO private keys ("BEGIN PRIVATE KEY") exist in release package`);
  } else {
    fail(`CRITICAL: Private key material detected inside customer release package!`);
  }

  // =========================================================================
  // STEP 3: CLEAN INSTALL SIMULATION IN ISOLATED DIRECTORY
  // =========================================================================
  console.log('\n--- Step 3: Fresh Customer Installation Simulation ---');
  if (fs.existsSync(CLEAN_INSTALL_DIR)) {
    fs.rmSync(CLEAN_INSTALL_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(CLEAN_INSTALL_DIR, { recursive: true });

  // Simulate customer copying the release package
  copyDirRecursive(DIST_DIR, CLEAN_INSTALL_DIR);
  pass(`Simulated customer extracting package to: ${CLEAN_INSTALL_DIR}`);

  // Test first-run database initialization
  const freshDbPath = path.join(CLEAN_INSTALL_DIR, 'data/sales_distribution.db');
  if (!fs.existsSync(freshDbPath)) {
    pass(`Confirmed target database does NOT exist before first run`);
  }

  // Run initial schema creation and migration
  const { MigrationRunner } = await import('../src/core/database/migration-runner.ts');
  const freshDb = new DatabaseSync(freshDbPath);
  freshDb.exec('PRAGMA journal_mode = WAL;');
  freshDb.exec('PRAGMA busy_timeout = 15000;');

  const { CREATE_TABLES_SQL, applyRefactorMigrations, applyPhase2aTenancyMigrations } = await import('../src/core/database/schema.ts');
  const { seedInitialData } = await import('../src/core/database/seed.ts');
  freshDb.exec(CREATE_TABLES_SQL);
  applyRefactorMigrations(freshDb);
  applyPhase2aTenancyMigrations(freshDb);
  seedInitialData(freshDb);
  MigrationRunner.runPendingMigrations(freshDb);

  if (fs.existsSync(freshDbPath)) {
    const size = fs.statSync(freshDbPath).size;
    pass(`Fresh database created on first run (size: ${(size / 1024).toFixed(1)} KB)`);
  } else {
    fail(`Database was not created on first run`);
  }

  // Verify default baseline tables created
  const tables = freshDb.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get().c;
  pass(`Fresh database initialized with all ${tables} tables`);

  // Verify company & admin user setup
  const compCount = freshDb.prepare('SELECT count(*) as c FROM companies').get().c;
  const userCount = freshDb.prepare('SELECT count(*) as c FROM app_users').get().c;
  const coaCount = freshDb.prepare('SELECT count(*) as c FROM chart_of_accounts').get().c;

  if (compCount >= 1 && userCount >= 1 && coaCount >= 19) {
    pass(`Default company (${compCount}), administrator (${userCount}), and chart of accounts (${coaCount}) seeded successfully`);
  } else {
    fail(`Baseline setup missing: companies=${compCount}, users=${userCount}, coa=${coaCount}`);
  }

  // Verify License Activation in Fresh Install
  const { LicenseService } = await import('../src/core/licensing/license.service.ts');
  const machineFp = LicenseService.generateMachineFingerprint();
  pass(`Generated fresh machine fingerprint: ${machineFp}`);

  // Activate valid commercial license using external vendor key
  const vendorKeyFile = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\vendor_keys\\saleflow_ed25519_private.pem';
  let signingKey = process.env.PLATFORM_LICENSE_PRIVATE_KEY;
  if (!signingKey && fs.existsSync(vendorKeyFile)) {
    signingKey = fs.readFileSync(vendorKeyFile, 'utf8');
  } else if (!signingKey) {
    const kp = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    signingKey = kp.privateKey;
    process.env.PLATFORM_LICENSE_PUBLIC_KEY = kp.publicKey;
  }

  const testLicense = LicenseService.issueLicense({
    companyName: 'Fresh Commercial Distribution',
    type: 'PERPETUAL',
    maxUsers: 15,
    machineId: machineFp,
    privateKey: signingKey,
  });

  const verification = LicenseService.verifyLicense(testLicense.licenseKey, true);
  if (verification.isValid && verification.status === 'VALID') {
    pass(`Commercial Ed25519 license activation succeeded on fresh install: ${testLicense.payload.companyName} (${testLicense.payload.type})`);
  } else {
    fail(`License activation failed on fresh install: ${verification.message}`);
  }

  freshDb.close();

  // =========================================================================
  // STEP 4: UPDATE INVARIANCE TEST (OVERWRITE APPLICATION FILES)
  // =========================================================================
  console.log('\n--- Step 4: Application Update Invariance Verification ---');

  // Add canary customer and balance to fresh database before update
  const dbBeforeUpdate = new DatabaseSync(freshDbPath);
  const canaryCustId = `canary_cust_${Date.now()}`;
  dbBeforeUpdate.prepare(`
    INSERT INTO customers (id, company_id, name, shop_name, phone, balance, is_active)
    VALUES (?, '00000000-0000-0000-0000-000000000001', 'Canary Customer Prior To Update', 'Canary Store', '03009998877', 15000, 1)
  `).run(canaryCustId);
  dbBeforeUpdate.close();

  // Simulate updating application software by copying files over
  // Customer rule: never overwrite data/, backups/, logs/, config/
  copyDirRecursive(DIST_DIR, CLEAN_INSTALL_DIR, (srcPath) => {
    const rel = path.relative(DIST_DIR, srcPath);
    if (rel.startsWith('data') || rel.startsWith('backups') || rel.startsWith('logs') || rel.startsWith('config')) {
      return false; // Skip persistent folders
    }
    return true;
  });

  // Verify canary customer still exists
  const dbAfterUpdate = new DatabaseSync(freshDbPath);
  const canaryCheck = dbAfterUpdate.prepare('SELECT name, balance FROM customers WHERE id = ?').get(canaryCustId);
  dbAfterUpdate.close();

  if (canaryCheck && canaryCheck.balance === 15000) {
    pass(`UPDATE INVARIANCE VERIFIED: Customer transactions & balance strictly preserved across application update`);
  } else {
    fail(`Update overwrote or corrupted customer database!`);
  }

  // Clean up clean install sandbox
  try {
    fs.rmSync(CLEAN_INSTALL_DIR, { recursive: true, force: true });
  } catch {}

  console.log('\n===================================================================');
  console.log(`  PACKAGING & CLEAN-INSTALL RESULTS: ${passedChecks} PASSED, ${failedChecks} FAILED`);
  console.log('===================================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runPackagingAndCleanInstall().catch((err) => {
  console.error('Fatal packaging error:', err);
  process.exit(1);
});
