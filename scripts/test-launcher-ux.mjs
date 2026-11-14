/**
 * SaleFlow ERP - Launcher UX & Process Safety Test Suite
 * Validates:
 * 1. Cold start (first launch): boots server, polls readiness, opens browser
 * 2. Warm start (second launch): detects running instance, opens browser immediately without double spawn
 * 3. Stale PID recovery (dead process / post-reboot simulation): cleans stale PID, boots server, opens browser
 * 4. Stale PID safety (PID reused by unrelated process): leaves unrelated process alive, starts server
 * 5. Unrelated port collision safety: detects conflicting port, REFUSES to kill unrelated process, exits 1
 * 6. Native PE header verification: SaleFlow.exe has IMAGE_SUBSYSTEM_WINDOWS_GUI (no CMD flash)
 * 7. Desktop shortcut verification: targets SaleFlow.exe
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TEST_PORT = 3991;
const SANDBOX_DIR = path.join(ROOT_DIR, 'scratch', 'test_launcher_sandbox');
const CONFIG_DIR = path.join(SANDBOX_DIR, 'config');
const LOG_DIR = path.join(SANDBOX_DIR, 'logs');
const DATA_DIR = path.join(SANDBOX_DIR, 'data');
const BACKUP_DIR = path.join(SANDBOX_DIR, 'backups');
const APP_DIR = path.join(SANDBOX_DIR, 'app');
const SCRIPTS_DIR = path.join(SANDBOX_DIR, 'scripts');

let passedTests = 0;
let failedTests = 0;

function pass(name) {
  console.log(`   [PASS] ${name}`);
  passedTests++;
}

function fail(name, details = '') {
  console.error(`   [FAIL] ${name} ${details ? '- ' + details : ''}`);
  failedTests++;
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid) {
  if (!pid || !isAlive(pid)) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {}
}

function checkHttp(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function cleanSandbox() {
  if (fs.existsSync(SANDBOX_DIR)) {
    try {
      const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        killPid(pid);
      }
    } catch {}
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }

  [SANDBOX_DIR, CONFIG_DIR, LOG_DIR, DATA_DIR, BACKUP_DIR, APP_DIR, SCRIPTS_DIR].forEach((d) => {
    fs.mkdirSync(d, { recursive: true });
  });

  // Copy scripts/onprem/process-controller.js into sandbox/scripts
  fs.copyFileSync(
    path.join(ROOT_DIR, 'scripts', 'onprem', 'process-controller.js'),
    path.join(SCRIPTS_DIR, 'process-controller.js')
  );

  // Create lightweight mock server.js in sandbox/app/server.js
  const mockServerJs = `
const http = require('http');
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', server: 'SaleFlow ERP Sandbox' }));
});

server.listen(port, host, () => {
  console.log('SaleFlow Sandbox Server listening on ' + host + ':' + port);
});
`;
  fs.writeFileSync(path.join(APP_DIR, 'server.js'), mockServerJs, 'utf8');

  // Write port to config/saleflow.env
  fs.writeFileSync(path.join(CONFIG_DIR, 'saleflow.env'), `PORT=${TEST_PORT}\nHOST=127.0.0.1\n`, 'utf8');
}

function runController(command = 'launch', extraArgs = []) {
  const env = {
    ...process.env,
    PORT: String(TEST_PORT),
    HOST: '127.0.0.1',
    SALEFLOW_DATA_DIR: DATA_DIR,
    SALEFLOW_LOG_DIR: LOG_DIR,
    SALEFLOW_CONFIG_DIR: CONFIG_DIR,
    SALEFLOW_BACKUP_DIR: BACKUP_DIR,
  };

  try {
    const output = execSync(
      `node "${path.join(SCRIPTS_DIR, 'process-controller.js')}" ${command} ${extraArgs.join(' ')}`,
      {
        cwd: SANDBOX_DIR,
        env,
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    return { exitCode: 0, output };
  } catch (err) {
    return { exitCode: err.status || 1, output: (err.stdout || '') + '\n' + (err.stderr || '') };
  }
}

async function runTests() {
  console.log('===================================================================');
  console.log('   SALEFLOW ERP - LAUNCHER UX & SAFETY VERIFICATION SUITE         ');
  console.log('===================================================================\n');

  await cleanSandbox();

  // -------------------------------------------------------------------
  // TEST 1: FIRST LAUNCH (COLD START)
  // -------------------------------------------------------------------
  console.log('--- Test 1: First Launch (Cold Start) ---');
  {
    const res = runController('launch');
    const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');

    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && isAlive(pid)) {
        pass(`Server spawned and PID saved: ${pid}`);
      } else {
        fail(`PID file saved but process not alive: ${pid}`);
      }
    } else {
      fail(`PID file not created at ${pidFile}`);
    }

    const isResponding = await checkHttp(TEST_PORT);
    if (isResponding) {
      pass(`Server successfully booted and responding on port ${TEST_PORT}`);
    } else {
      fail(`Server port ${TEST_PORT} did not respond to HTTP`);
    }

    if (res.output.includes('Opening portal in default browser') || res.output.includes(`http://localhost:${TEST_PORT}`)) {
      pass(`Automatic browser launch command executed to: http://localhost:${TEST_PORT}`);
    } else {
      fail(`Browser launch output missing from cold start`);
    }
  }

  // -------------------------------------------------------------------
  // TEST 2: SECOND LAUNCH WHILE SERVER ALREADY RUNNING (WARM START)
  // -------------------------------------------------------------------
  console.log('\n--- Test 2: Second Launch While Running (Warm Start) ---');
  {
    const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');
    const originalPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);

    const start = Date.now();
    const res = runController('launch');
    const duration = Date.now() - start;

    const currentPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (currentPid === originalPid) {
      pass(`Server was NOT duplicated (PID remains ${originalPid})`);
    } else {
      fail(`Duplicate server spawned! Original: ${originalPid}, New: ${currentPid}`);
    }

    if (res.output.includes('Already running') && res.output.includes('Opening portal in default browser')) {
      pass(`Detected running instance and immediately requested browser open (took ${duration}ms)`);
    } else {
      fail(`Did not trigger immediate browser open on warm start: ${res.output}`);
    }
  }

  // -------------------------------------------------------------------
  // TEST 3: STALE PID HANDLING (PROCESS MISSING / POST-REBOOT)
  // -------------------------------------------------------------------
  console.log('\n--- Test 3: Stale PID Recovery (Dead PID / Post-Reboot) ---');
  {
    // Stop server
    runController('stop');
    await new Promise((r) => setTimeout(r, 500));

    // Plant fake dead PID
    const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');
    fs.writeFileSync(pidFile, '999998', 'utf8');

    const res = runController('launch');
    const newPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);

    if (newPid && newPid !== 999998 && isAlive(newPid)) {
      pass(`Stale PID 999998 purged and fresh server spawned (new PID: ${newPid})`);
    } else {
      fail(`Failed to recover from dead stale PID: ${newPid}`);
    }

    const isResponding = await checkHttp(TEST_PORT);
    if (isResponding) {
      pass(`Server responding on port ${TEST_PORT} after stale PID cleanup`);
    } else {
      fail(`Server not responding after stale PID cleanup`);
    }

    if (res.output.includes('Opening portal in default browser')) {
      pass(`Browser auto-opened after recovering from stale PID`);
    } else {
      fail(`Browser launch missing in stale PID recovery`);
    }
  }

  // -------------------------------------------------------------------
  // TEST 4: STALE PID SAFETY (PID BELONGS TO UNRELATED PROCESS)
  // -------------------------------------------------------------------
  console.log('\n--- Test 4: Stale PID Safety (Unrelated Process Protection) ---');
  {
    // Stop server
    runController('stop');
    await new Promise((r) => setTimeout(r, 500));

    // Spawn an unrelated dummy background process (e.g. ping sleeping)
    const dummyProcess = spawn('cmd.exe', ['/c', 'ping', '127.0.0.1', '-n', '30'], {
      detached: true,
      stdio: 'ignore',
    });
    dummyProcess.unref();

    const dummyPid = dummyProcess.pid;
    if (!dummyPid || !isAlive(dummyPid)) {
      fail(`Could not spawn test dummy process`);
    } else {
      pass(`Spawned unrelated background process (PID: ${dummyPid})`);

      // Plant unrelated PID in saleflow.pid
      const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');
      fs.writeFileSync(pidFile, String(dummyPid), 'utf8');

      // Run launch
      const res = runController('launch');

      // CRITICAL CHECK: The unrelated process MUST STILL BE ALIVE!
      if (isAlive(dummyPid)) {
        pass(`SAFETY VERIFIED: Unrelated process (PID: ${dummyPid}) was NOT killed!`);
      } else {
        fail(`SAFETY VIOLATION: Unrelated process (PID: ${dummyPid}) was killed!`);
      }

      const newPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (newPid && newPid !== dummyPid && isAlive(newPid)) {
        pass(`Fresh SaleFlow server spawned (PID: ${newPid}) while preserving unrelated process`);
      } else {
        fail(`SaleFlow failed to spawn beside unrelated PID: ${newPid}`);
      }

      // Cleanup dummy process
      killPid(dummyPid);
    }
  }

  // -------------------------------------------------------------------
  // TEST 5: UNRELATED PROCESS OCCUPYING TARGET PORT
  // -------------------------------------------------------------------
  console.log('\n--- Test 5: Unrelated Port Collision Safety ---');
  {
    // Stop server
    runController('stop');
    await new Promise((r) => setTimeout(r, 500));

    // Start an unrelated TCP server on TEST_PORT
    const dummyTcpServer = net.createServer((sock) => sock.end());
    await new Promise((resolve) => dummyTcpServer.listen(TEST_PORT, '127.0.0.1', resolve));
    pass(`Unrelated TCP server listening on target port ${TEST_PORT}`);

    // Remove PID file so controller only sees port in use
    const pidFile = path.join(CONFIG_DIR, 'saleflow.pid');
    try { fs.unlinkSync(pidFile); } catch {}

    const res = runController('launch');

    if (res.exitCode !== 0) {
      pass(`Controller safely exited with non-zero code (${res.exitCode})`);
    } else {
      fail(`Controller should have exited with error code on port collision`);
    }

    if (res.output.includes('occupied by an unrelated process') || res.output.includes('will not terminate unrelated')) {
      pass(`Actionable error logged stating unrelated process will not be terminated`);
    } else {
      fail(`Missing explicit safety notice on port collision: ${res.output}`);
    }

    // Close dummy TCP server
    await new Promise((resolve) => dummyTcpServer.close(resolve));
    pass(`Unrelated TCP server closed cleanly`);
  }

  // -------------------------------------------------------------------
  // TEST 6: NATIVE GUI LAUNCHER PE HEADER SUBSYSTEM (IMAGE_SUBSYSTEM_WINDOWS_GUI)
  // -------------------------------------------------------------------
  console.log('\n--- Test 6: SaleFlow.exe PE Header Subsystem Verification ---');
  {
    const exePath = path.join(ROOT_DIR, 'scripts', 'onprem', 'SaleFlow.exe');
    const csPath = path.join(ROOT_DIR, 'scripts', 'onprem', 'SaleFlowLauncher.cs');
    if (!fs.existsSync(exePath) && fs.existsSync(csPath)) {
      const cscCandidates = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
        'csc.exe'
      ];
      for (const cand of cscCandidates) {
        if (fs.existsSync(cand)) {
          try {
            execSync(`"${cand}" /target:winexe /optimize+ /nologo /r:System.Windows.Forms.dll /out:"${exePath}" "${csPath}"`, { stdio: 'ignore' });
            break;
          } catch {}
        }
      }
    }
    if (!fs.existsSync(exePath)) {
      fail(`SaleFlow.exe does not exist at ${exePath}`);
    } else {
      const buffer = fs.readFileSync(exePath);
      // Read PE offset from 0x3C
      const peOffset = buffer.readUInt32LE(0x3C);
      // Subsystem is at peOffset + 24 (COFF header) + 68 (Standard Optional Header fields) = peOffset + 92 (for PE32+)
      // Or peOffset + 68 for PE32
      // Check magic number at peOffset + 24:
      const magic = buffer.readUInt16LE(peOffset + 24);
      let subsystemOffset;
      if (magic === 0x20B) { // PE32+ (64-bit)
        subsystemOffset = peOffset + 24 + 68;
      } else { // PE32 (32-bit)
        subsystemOffset = peOffset + 24 + 68;
      }
      const subsystem = buffer.readUInt16LE(subsystemOffset);

      // 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI
      // 3 = IMAGE_SUBSYSTEM_WINDOWS_CUI (Console)
      if (subsystem === 2) {
        pass(`PE Subsystem = 2 (IMAGE_SUBSYSTEM_WINDOWS_GUI) -> GUARANTEED ZERO CMD CONSOLE FLASH!`);
      } else {
        fail(`PE Subsystem = ${subsystem} (Expected 2 for GUI, got ${subsystem})`);
      }
    }
  }

  // -------------------------------------------------------------------
  // TEST 7: INSTALLED DESKTOP SHORTCUT TARGET
  // -------------------------------------------------------------------
  console.log('\n--- Test 7: Desktop Shortcut Target Verification ---');
  {
    const desktopLnk = 'C:\\Users\\PC\\OneDrive\\Desktop\\SaleFlow ERP.lnk';
    if (fs.existsSync(desktopLnk)) {
      try {
        const target = execSync(
          `powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).CreateShortcut('${desktopLnk}').TargetPath"`,
          { encoding: 'utf8' }
        ).trim();

        if (target.toLowerCase().endsWith('saleflow.exe')) {
          pass(`Desktop shortcut targets native GUI launcher: ${target}`);
        } else {
          fail(`Desktop shortcut targets non-GUI file: ${target}`);
        }
      } catch (err) {
        fail(`Failed to inspect desktop shortcut: ${err.message}`);
      }
    } else {
      console.log(`   [INFO] Desktop shortcut not present at ${desktopLnk}`);
    }
  }

  // Cleanup sandbox
  await cleanSandbox();

  console.log('\n===================================================================');
  console.log(`   TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED     `);
  console.log('===================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
