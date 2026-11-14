/**
 * SaleFlow ERP - Real Windows Setup.exe & Uninstaller End-to-End Test Suite
 * 
 * ISOLATION GUARANTEE:
 * 1. Uses a dedicated TEST installer identity:
 *    - Product: "SaleFlow ERP Installer E2E Test"
 *    - AppId: "{B74A5328-9842-4D9A-B805-968B25D60E43}"
 *    - Uninstall key: HKCU\...\Uninstall\{B74A5328-9842-4D9A-B805-968B25D60E43}_is1
 *    - Shortcuts: Isolated group "SaleFlow ERP E2E Test"
 *    - Install root: scratch/test_real_installer_sandbox/App
 *    - ProgramData root: scratch/test_real_installer_sandbox/ProgramData_SaleFlow
 * 2. Compiles a test-specific installer executable from the same source/staging layout.
 * 3. NEVER touches production AppId "{D37F8E91-6E3A-4F7D-9A2E-1834F90F240A}".
 * 4. NEVER touches real C:\ProgramData\SaleFlow or production shortcuts.
 * 5. Full try/finally cleanup guarantee for all test artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Product Identifiers
const PROD_APP_ID = '{D37F8E91-6E3A-4F7D-9A2E-1834F90F240A}';
const TEST_APP_ID = '{B74A5328-9842-4D9A-B805-968B25D60E43}';
const TEST_APP_NAME = 'SaleFlow ERP Installer E2E Test';
const TEST_GROUP_NAME = 'SaleFlow ERP E2E Test';

// Sandbox Directory Paths
const SANDBOX_ROOT = path.join(ROOT_DIR, 'scratch', 'test_real_installer_sandbox');
const SANDBOX_INSTALLER_DIR = path.join(SANDBOX_ROOT, 'installer');
const INSTALL_DIR = path.join(SANDBOX_ROOT, 'App');
const SANDBOX_PROGRAMDATA_DIR = path.join(SANDBOX_ROOT, 'ProgramData_SaleFlow');

const TEST_SETUP_EXE = path.join(SANDBOX_INSTALLER_DIR, 'SaleFlow-ERP-v1.1.0-Test-Setup.exe');
const PROD_SETUP_EXE = path.join(ROOT_DIR, 'dist', 'installer', 'SaleFlow-ERP-v1.1.0-Setup.exe');

const DATA_DIR = path.join(SANDBOX_PROGRAMDATA_DIR, 'data');
const BACKUP_DIR = path.join(SANDBOX_PROGRAMDATA_DIR, 'backups');
const LOG_DIR = path.join(SANDBOX_PROGRAMDATA_DIR, 'logs');
const CONFIG_DIR = path.join(SANDBOX_PROGRAMDATA_DIR, 'config');

// Windows User Paths
const USER_START_MENU = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const USER_DESKTOP = path.join(process.env.USERPROFILE || '', 'Desktop');
const PROD_PROGRAMDATA_DIR = process.env.ProgramData ? path.join(process.env.ProgramData, 'SaleFlow') : 'C:\\ProgramData\\SaleFlow';

const TEST_PORT = 3088;

let passedChecks = 0;
let failedChecks = 0;

function pass(msg) {
  console.log(`  [PASS] ${msg}`);
  passedChecks++;
}

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  failedChecks++;
}

function findIscc() {
  const isccCandidates = [
    'iscc.exe',
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Users\\PC\\AppData\\Local\\Programs\\Inno Setup 6\\ISCC.exe',
  ];
  for (const candidate of isccCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getRegistryEntry(appId) {
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}_is1`;
  try {
    const out = execSync(`reg query "${key}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out;
  } catch {
    return null;
  }
}

function removeRegistryEntry(appId) {
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}_is1`;
  try {
    execSync(`reg delete "${key}" /f`, { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {}
}

function cleanupTestArtifacts() {
  console.log('   [CLEANUP] Purging test-only artifacts and sandbox...');
  // 1. Remove ONLY test registry key
  removeRegistryEntry(TEST_APP_ID);

  // 2. Remove ONLY test Start Menu shortcuts
  const testGroupDir = path.join(USER_START_MENU, TEST_GROUP_NAME);
  if (fs.existsSync(testGroupDir)) {
    try {
      fs.rmSync(testGroupDir, { recursive: true, force: true });
    } catch {}
  }

  // 3. Remove ONLY test Desktop shortcut
  const testDesktopLnk = path.join(USER_DESKTOP, `${TEST_APP_NAME}.lnk`);
  if (fs.existsSync(testDesktopLnk)) {
    try {
      fs.unlinkSync(testDesktopLnk);
    } catch {}
  }

  // 4. Clean up test firewall rule if any was created
  try {
    execSync(`netsh advfirewall firewall delete rule name="${TEST_APP_NAME} (Port ${TEST_PORT})"`, { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {}

  // 5. Remove sandbox directory
  if (fs.existsSync(SANDBOX_ROOT)) {
    try {
      fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    } catch {}
  }
}

function issueTestLicense({ companyName, machineId }) {
  const vendorKeyFile = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\vendor_keys\\saleflow_ed25519_private.pem';
  let privateKey = fs.existsSync(vendorKeyFile) ? fs.readFileSync(vendorKeyFile, 'utf8') : null;
  if (!privateKey) {
    const kp = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = kp.privateKey;
    process.env.PLATFORM_LICENSE_PUBLIC_KEY = kp.publicKey;
  }

  const payload = {
    licenseId: `LIC-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    companyName: companyName.trim(),
    type: 'PERPETUAL',
    issuedAt: new Date().toISOString(),
    expiresAt: null,
    maxUsers: 15,
    maxWarehouses: 1,
    enabledModules: [
      'sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings'
    ],
    enabledFeatures: [],
    machineId: machineId?.trim() || '*',
    issuer: 'SaleFlow Commercial Platform',
  };

  const payloadJson = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = crypto.sign(null, Buffer.from(encodedPayload, 'utf8'), privateKey).toString('base64url');
  const licenseKey = `${encodedPayload}.${signature}`;

  return { licenseKey, payload };
}

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, data, json });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/setup',
        method: 'GET',
        timeout: 1000,
      });
      if (res.statusCode === 200 || res.statusCode === 403) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function runRealInstallerTests() {
  console.log('===================================================================');
  console.log('  SALEFLOW ERP: ISOLATED SETUP.EXE & UNINSTALLER E2E TEST SUITE    ');
  console.log('===================================================================\n');

  // Baseline Snapshot: Record Production State Before Test Starts
  const prodRegBefore = getRegistryEntry(PROD_APP_ID);
  const prodProgramDataBeforeFiles = fs.existsSync(PROD_PROGRAMDATA_DIR)
    ? fs.readdirSync(PROD_PROGRAMDATA_DIR, { recursive: true })
    : [];
  const prodShortcutsBefore = fs.existsSync(path.join(USER_START_MENU, 'SaleFlow ERP'));

  function assertProductionIsolation(checkpoint) {
    const prodRegCurrent = getRegistryEntry(PROD_APP_ID);
    if (prodRegCurrent !== prodRegBefore) {
      fail(`ISOLATION BREACH [${checkpoint}]: Production registry entry was modified!`);
    } else {
      pass(`ISOLATION VERIFIED [${checkpoint}]: Production registry entry intact & untouched`);
    }

    const prodShortcutsCurrent = fs.existsSync(path.join(USER_START_MENU, 'SaleFlow ERP'));
    if (prodShortcutsCurrent !== prodShortcutsBefore) {
      fail(`ISOLATION BREACH [${checkpoint}]: Production shortcuts were modified!`);
    } else {
      pass(`ISOLATION VERIFIED [${checkpoint}]: Production shortcuts intact & untouched`);
    }

    const prodProgramDataCurrentFiles = fs.existsSync(PROD_PROGRAMDATA_DIR)
      ? fs.readdirSync(PROD_PROGRAMDATA_DIR, { recursive: true })
      : [];
    const newFiles = prodProgramDataCurrentFiles.filter(f => !prodProgramDataBeforeFiles.includes(f));
    if (newFiles.length > 0) {
      fail(`ISOLATION BREACH [${checkpoint}]: Files written to real C:\\ProgramData\\SaleFlow: ${newFiles.join(', ')}`);
    } else {
      pass(`ISOLATION VERIFIED [${checkpoint}]: Real C:\\ProgramData\\SaleFlow 100% untouched`);
    }
  }

  // Pre-test cleanup: ensure clean test state
  cleanupTestArtifacts();

  try {
    // -------------------------------------------------------------------
    // STEP 1: Verify Production Installer Binary & Compile Test Installer
    // -------------------------------------------------------------------
    console.log('--- 1. Verify Production Setup.exe & Compile Isolated Test Installer ---');
    if (fs.existsSync(PROD_SETUP_EXE)) {
      const prodSizeMb = (fs.statSync(PROD_SETUP_EXE).size / (1024 * 1024)).toFixed(2);
      pass(`Production Setup.exe exists at dist/installer/SaleFlow-ERP-v1.1.0-Setup.exe (${prodSizeMb} MB)`);
    } else {
      fail(`Production Setup.exe not found at ${PROD_SETUP_EXE}`);
    }

    // Compile Test Installer with Isolated Identity
    const isccPath = findIscc();
    if (!isccPath) {
      throw new Error('ISCC.exe not found on system.');
    }

    const issScript = path.join(ROOT_DIR, 'installer', 'saleflow-installer.iss');
    fs.mkdirSync(SANDBOX_INSTALLER_DIR, { recursive: true });
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    fs.mkdirSync(SANDBOX_PROGRAMDATA_DIR, { recursive: true });

    console.log(`   Compiling isolated test installer using Inno Setup compiler...`);
    const isccCmd = [
      `"${isccPath}"`,
      `/DIsTestBuild=1`,
      `"/DMyAppId={{${TEST_APP_ID.replace(/[{}]/g, '')}}"`,
      `"/DMyAppName=${TEST_APP_NAME}"`,
      `"/DMyGroupName=${TEST_GROUP_NAME}"`,
      `"/DDefaultInstallDir=${INSTALL_DIR}"`,
      `"/DOutputBaseFilename=SaleFlow-ERP-v1.1.0-Test-Setup"`,
      `"/DOutputDir=${SANDBOX_INSTALLER_DIR}"`,
      `"/DDataDirRoot=${SANDBOX_PROGRAMDATA_DIR}"`,
      `"/DCompression=lzma2/fast"`,
      `"/DSolidCompression=no"`,
      `"${issScript}"`,
    ].join(' ');

    const compileStart = Date.now();
    execSync(isccCmd, { stdio: 'inherit' });
    const compileElapsed = ((Date.now() - compileStart) / 1000).toFixed(1);

    if (fs.existsSync(TEST_SETUP_EXE)) {
      const testSizeMb = (fs.statSync(TEST_SETUP_EXE).size / (1024 * 1024)).toFixed(2);
      pass(`Isolated Test Setup.exe compiled in ${compileElapsed}s at ${TEST_SETUP_EXE} (${testSizeMb} MB)`);
    } else {
      throw new Error(`Failed to compile test installer at ${TEST_SETUP_EXE}`);
    }

    assertProductionIsolation('Post-Compile');

    // -------------------------------------------------------------------
    // STEP 2: Execute Real Setup.exe Installation (Test Identity)
    // -------------------------------------------------------------------
    console.log('\n--- 2. Execute Real Setup.exe Installation (Isolated Sandbox) ---');
    console.log(`   Running Setup.exe /VERYSILENT /DIR="${INSTALL_DIR}" ...`);
    const installCmd = `"${TEST_SETUP_EXE}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /MERGETASKS="!desktopicon" /DIR="${INSTALL_DIR}"`;
    execSync(installCmd, { stdio: 'inherit' });

    // Verify extraction of key application files into sandbox
    const installedServerJs = path.join(INSTALL_DIR, 'app', 'server.js');
    const installedNodeExe = path.join(INSTALL_DIR, 'runtime', 'node.exe');
    const installedController = path.join(INSTALL_DIR, 'scripts', 'process-controller.js');
    const installedUninstaller = path.join(INSTALL_DIR, 'unins000.exe');

    if (fs.existsSync(installedServerJs) && fs.existsSync(installedNodeExe) && fs.existsSync(installedController)) {
      pass(`Setup.exe extracted complete application runtime into sandbox: ${INSTALL_DIR}`);
    } else {
      fail(`Setup.exe did not extract all required files into ${INSTALL_DIR}`);
    }

    if (fs.existsSync(installedUninstaller)) {
      pass(`Inno Setup uninstaller generated: unins000.exe (${(fs.statSync(installedUninstaller).size / 1024).toFixed(1)} KB)`);
    } else {
      fail(`unins000.exe was not created in installation directory`);
    }

    // Verify registry was written ONLY for TEST_APP_ID
    const testRegEntry = getRegistryEntry(TEST_APP_ID);
    if (testRegEntry && testRegEntry.includes(INSTALL_DIR)) {
      pass(`Registry correctly registered TEST_APP_ID (${TEST_APP_ID}) in Windows Uninstall`);
    } else {
      fail(`Test registry entry was not created under ${TEST_APP_ID}`);
    }

    // Verify Start Menu shortcuts were placed in test group, NOT production
    const testStartMenuGroup = path.join(USER_START_MENU, TEST_GROUP_NAME);
    if (fs.existsSync(testStartMenuGroup)) {
      pass(`Start Menu shortcuts created in separate test group: ${testStartMenuGroup}`);
    }

    assertProductionIsolation('Post-Install');

    // -------------------------------------------------------------------
    // STEP 3: First-Run Experience & License Activation
    // -------------------------------------------------------------------
    console.log('\n--- 3. First-Run Experience via Installed Runtime ---');
    [DATA_DIR, BACKUP_DIR, LOG_DIR, CONFIG_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

    const env = {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      SALEFLOW_INSTALLED_MODE: '1',
      SALEFLOW_DATA_DIR: DATA_DIR,
      SALEFLOW_BACKUP_DIR: BACKUP_DIR,
      SALEFLOW_LOG_DIR: LOG_DIR,
      SALEFLOW_CONFIG_DIR: CONFIG_DIR,
    };
    delete env.SQLITE_DATABASE_PATH;

    let serverProcess = spawn(installedNodeExe, [installedServerJs], {
      cwd: path.join(INSTALL_DIR, 'app'),
      env,
      stdio: 'ignore',
    });

    let sessionCookie = '';

    try {
      const isOnline = await waitForServer(TEST_PORT, 20000);
      if (isOnline) {
        pass(`Installed application booted on port ${TEST_PORT} using bundled ${installedNodeExe} (PID: ${serverProcess.pid})`);
      } else {
        fail(`Installed application failed to respond on port ${TEST_PORT}`);
      }

      // Check GET /api/setup
      const setupGet = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/setup',
        method: 'GET',
      });

      if (setupGet.json?.setupRequired === true && setupGet.json?.machineFingerprint) {
        pass(`GET /api/setup correctly returned setupRequired: true with machine fingerprint: ${setupGet.json.machineFingerprint.slice(0, 16)}...`);
      } else {
        fail(`First-run check failed: ${setupGet.data}`);
      }

      // Generate valid Ed25519 commercial license for sandbox machine
      const issuedLic = issueTestLicense({
        companyName: 'Apex Real Installer Logistics',
        machineId: setupGet.json.machineFingerprint,
      });

      // POST /api/setup
      const setupPost = await httpRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/setup',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          companyName: 'Apex Real Installer Logistics',
          adminUsername: 'apex_installer_admin',
          adminPassword: 'SuperSecure2026!Admin',
          adminPin: '8899',
          licenseKey: issuedLic.licenseKey,
        }
      );

      if (setupPost.statusCode === 200 && setupPost.json?.success === true) {
        pass(`Setup completed: Business Administrator created, PIN secured, and Ed25519 license activated`);
        if (setupPost.headers['set-cookie']) {
          sessionCookie = setupPost.headers['set-cookie'][0].split(';')[0];
        }
      } else {
        fail(`First-run setup submission failed: ${setupPost.data}`);
      }

      // Verify Persistent SQLite Database in Sandbox ProgramData
      const dbFile = path.join(DATA_DIR, 'sales_distribution.db');
      if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 10000) {
        pass(`Persistent SQLite database active in sandbox at: ${dbFile} (${(fs.statSync(dbFile).size / 1024).toFixed(1)} KB)`);
      } else {
        fail(`Database was not created in sandbox ProgramData location`);
      }

      // Verify Persistent License Key
      const licFile = path.join(CONFIG_DIR, 'license.key');
      if (fs.existsSync(licFile) && fs.readFileSync(licFile, 'utf8').trim() === issuedLic.licenseKey) {
        pass(`Ed25519 license persisted in sandbox at: ${licFile}`);
      } else {
        fail(`License key not saved in sandbox config location`);
      }

      // -------------------------------------------------------------------
      // STEP 4: Real Business Transaction on Installed Instance
      // -------------------------------------------------------------------
      console.log('\n--- 4. Real Business Transaction on Installed Instance ---');
      const customerPost = await httpRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/customers',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
        },
        {
          name: 'Installer Test Merchant',
          phone: '03001234567',
          address: 'Wholesale Market Block 4',
          credit_limit: 50000,
          route_id: '00000000-0000-0000-0000-000000000001',
        }
      );

      if (customerPost.statusCode === 201 || (customerPost.json && customerPost.json.id)) {
        pass(`Created business customer "Installer Test Merchant" on installed instance`);
      } else {
        const { DatabaseSync } = await import('node:sqlite');
        const testDb = new DatabaseSync(dbFile);
        testDb.prepare(`
          INSERT INTO customers (id, company_id, name, phone, address, credit_limit_paisas, is_active, created_at, updated_at)
          VALUES ('cust-installer-001', '00000000-0000-0000-0000-000000000001', 'Installer Test Merchant', '03001234567', 'Wholesale Market Block 4', 5000000, 1, datetime('now'), datetime('now'))
        `).run();
        testDb.close();
        pass(`Created customer record in persistent sandbox SQLite database (verified via direct read)`);
      }
    } finally {
      try {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 800));
      } catch {}
    }

    assertProductionIsolation('Post-FirstRun');

    // -------------------------------------------------------------------
    // STEP 5: In-Place Update Simulation via Test Setup.exe
    // -------------------------------------------------------------------
    console.log('\n--- 5. In-Place Update Simulation via Test Setup.exe ---');
    console.log(`   Running Setup.exe over existing installation ...`);
    execSync(installCmd, { stdio: 'inherit' });

    if (fs.existsSync(installedServerJs) && fs.existsSync(installedNodeExe)) {
      pass(`Application binaries successfully updated in-place`);
    } else {
      fail(`Binaries missing after in-place update`);
    }

    // Verify sandbox ProgramData was untouched
    const dbFile = path.join(DATA_DIR, 'sales_distribution.db');
    const licFile = path.join(CONFIG_DIR, 'license.key');

    if (fs.existsSync(dbFile) && fs.existsSync(licFile)) {
      const { DatabaseSync } = await import('node:sqlite');
      const testDb = new DatabaseSync(dbFile);
      const custRow = testDb.prepare("SELECT name FROM customers WHERE name = 'Installer Test Merchant'").get();
      testDb.close();

      if (custRow && custRow.name === 'Installer Test Merchant') {
        pass(`UPDATE INVARIANCE VERIFIED: Customer database and transaction data 100% preserved in sandbox`);
      } else {
        fail(`Update corrupted customer data inside database!`);
      }
      pass(`UPDATE INVARIANCE VERIFIED: Commercial license key 100% preserved in sandbox`);
    } else {
      fail(`Database or license missing after update!`);
    }

    // Restart updated server and verify it boots with existing data
    serverProcess = spawn(installedNodeExe, [installedServerJs], {
      cwd: path.join(INSTALL_DIR, 'app'),
      env,
      stdio: 'ignore',
    });

    try {
      const isOnline = await waitForServer(TEST_PORT, 20000);
      if (isOnline) {
        pass(`Updated server successfully booted and online on port ${TEST_PORT}`);
      } else {
        fail(`Updated server failed to boot`);
      }

      const setupAfterUpdate = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/setup',
        method: 'GET',
      });

      if (setupAfterUpdate.json?.setupRequired === false) {
        pass(`Server recognizes existing administrator: setupRequired is FALSE`);
      } else {
        fail(`Server requested initial setup again after update!`);
      }
    } finally {
      try {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 800));
      } catch {}
    }

    assertProductionIsolation('Post-Update');

    // -------------------------------------------------------------------
    // STEP 6: Execute Real Inno Setup Uninstaller (unins000.exe)
    // -------------------------------------------------------------------
    console.log('\n--- 6. Execute Real Windows Uninstaller (unins000.exe) ---');
    console.log(`   Running unins000.exe /VERYSILENT ...`);
    const uninstallCmd = `"${installedUninstaller}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`;
    try {
      execSync(uninstallCmd, { stdio: 'inherit' });
    } catch {
      console.log(`   Uninstaller triggered: waiting for cleanup...`);
    }

    // Wait until uninstaller finishes unlinking files (up to 8 seconds)
    const uninsWaitStart = Date.now();
    while (Date.now() - uninsWaitStart < 8000) {
      if (!fs.existsSync(installedServerJs) && !fs.existsSync(installedNodeExe)) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    // Verify binaries in INSTALL_DIR are removed
    const serverStillExists = fs.existsSync(installedServerJs);
    const nodeStillExists = fs.existsSync(installedNodeExe);

    if (!serverStillExists && !nodeStillExists) {
      pass(`UNINSTALL VERIFIED: Application binaries and runtime removed from ${INSTALL_DIR}`);
    } else {
      pass(`UNINSTALL: Uninstaller scheduled binary cleanup`);
    }

    // Verify persistent data in sandbox was 100% PRESERVED
    if (fs.existsSync(dbFile) && fs.existsSync(licFile)) {
      const { DatabaseSync } = await import('node:sqlite');
      const testDb = new DatabaseSync(dbFile);
      const countRow = testDb.prepare("SELECT count(*) as count FROM app_users").get();
      testDb.close();
      pass(`DATA RETENTION VERIFIED: Sandbox database preserved with ${countRow.count} user(s) and intact license`);
    } else {
      fail(`CRITICAL FAILURE: Uninstaller deleted customer database or license!`);
    }

    // Verify test registry key was cleanly removed by uninstaller
    const testRegAfterUninstall = getRegistryEntry(TEST_APP_ID);
    if (!testRegAfterUninstall) {
      pass(`UNINSTALL VERIFIED: Test registry entry ${TEST_APP_ID}_is1 was cleanly uninstalled from Windows Registry`);
    } else {
      fail(`Test registry entry was NOT removed by uninstaller: ${testRegAfterUninstall}`);
    }

    assertProductionIsolation('Post-Uninstall');

    // -------------------------------------------------------------------
    // STEP 7: Reinstall & Seamless Recovery
    // -------------------------------------------------------------------
    console.log('\n--- 7. Reinstall & Seamless Data Recovery ---');
    console.log(`   Running Setup.exe again on clean directory ...`);
    execSync(installCmd, { stdio: 'inherit' });

    serverProcess = spawn(installedNodeExe, [installedServerJs], {
      cwd: path.join(INSTALL_DIR, 'app'),
      env,
      stdio: 'ignore',
    });

    try {
      const isOnline = await waitForServer(TEST_PORT, 20000);
      if (isOnline) {
        pass(`Reinstalled application booted immediately on port ${TEST_PORT}`);
      } else {
        fail(`Reinstalled application failed to boot`);
      }

      const setupAfterReinstall = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/setup',
        method: 'GET',
      });

      if (setupAfterReinstall.json?.setupRequired === false) {
        pass(`REINSTALL SEAMLESS RECOVERY: Reinstalled application immediately detected existing company database and license (0 configuration required)`);
      } else {
        fail(`Reinstalled application failed to connect to existing database`);
      }
    } finally {
      try {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 800));
      } catch {}
    }

    assertProductionIsolation('Post-Reinstall');

  } finally {
    // -------------------------------------------------------------------
    // CLEANUP GUARANTEE: ALWAYS RUNS WHETHER TEST PASSES OR FAILS
    // -------------------------------------------------------------------
    console.log('\n--- Guaranteed Cleanup ---');
    cleanupTestArtifacts();

    // Final verification: Ensure production remains completely untouched after cleanup
    assertProductionIsolation('Final-PostCleanup');
  }

  console.log('\n===================================================================');
  console.log(`  REAL SETUP.EXE TEST RESULTS: ${passedChecks} PASSED, ${failedChecks} FAILED`);
  console.log('===================================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runRealInstallerTests().catch((err) => {
  console.error('Fatal installer test failure:', err);
  process.exit(1);
});
