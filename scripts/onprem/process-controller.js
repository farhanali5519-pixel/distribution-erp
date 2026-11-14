/**
 * SaleFlow ERP - Process Controller
 * Lightweight server daemon controller and application launcher for Windows On-Premise deployments.
 * Requires ONLY the bundled Node runtime. Zero third-party dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn, execSync, execFileSync } = require('node:child_process');

// Determine directories
const SCRIPT_DIR = __dirname;
const APP_DIR = path.resolve(SCRIPT_DIR, '..', 'app');
const RUNTIME_NODE = path.resolve(SCRIPT_DIR, '..', 'runtime', 'node.exe');

// Detect node binary: use bundled runtime if present, else fallback to current process
const NODE_EXE = fs.existsSync(RUNTIME_NODE) ? RUNTIME_NODE : process.execPath;

// Determine persistent storage directories
const IS_INSTALLED = process.env.SALEFLOW_INSTALLED_MODE === '1' || fs.existsSync(path.resolve(SCRIPT_DIR, '..', 'unins000.exe'));
const BASE_DATA_DIR = process.env.SALEFLOW_DATA_DIR || 
  (IS_INSTALLED && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'data') : path.resolve(SCRIPT_DIR, '..', 'data'));
const BASE_LOG_DIR = process.env.SALEFLOW_LOG_DIR || 
  (IS_INSTALLED && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'logs') : path.resolve(SCRIPT_DIR, '..', 'logs'));
const BASE_CONFIG_DIR = process.env.SALEFLOW_CONFIG_DIR || 
  (IS_INSTALLED && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'config') : path.resolve(SCRIPT_DIR, '..', 'config'));
const BASE_BACKUP_DIR = process.env.SALEFLOW_BACKUP_DIR || 
  (IS_INSTALLED && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'backups') : path.resolve(SCRIPT_DIR, '..', 'backups'));

// Ensure persistent folders exist
[BASE_DATA_DIR, BASE_LOG_DIR, BASE_CONFIG_DIR, BASE_BACKUP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
});

// Resolve primary PID file location (checking both local config and ProgramData)
function getPidFile() {
  const localPid = path.resolve(SCRIPT_DIR, '..', 'config', 'saleflow.pid');
  if (fs.existsSync(localPid)) return localPid;
  return path.join(BASE_CONFIG_DIR, 'saleflow.pid');
}

function getLogFile() {
  const localLogDir = path.resolve(SCRIPT_DIR, '..', 'logs');
  if (fs.existsSync(localLogDir)) return path.join(localLogDir, 'saleflow.log');
  return path.join(BASE_LOG_DIR, 'saleflow.log');
}

const LOG_FILE = getLogFile();

// Log a timestamped message to both console and log file
function logInfo(msg) {
  const line = `[SaleFlow ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch {}
}

function logError(msg) {
  const line = `[SaleFlow ERROR ${new Date().toISOString()}] ${msg}`;
  console.error(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch {}
}

// Resolve port and host
function resolvePort() {
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  const cfgCandidates = [
    path.join(BASE_CONFIG_DIR, 'saleflow.env'),
    path.resolve(SCRIPT_DIR, '..', 'config', 'saleflow.env'),
  ];
  for (const cfgFile of cfgCandidates) {
    if (fs.existsSync(cfgFile)) {
      const content = fs.readFileSync(cfgFile, 'utf8');
      const match = content.match(/PORT=(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 3000;
}

function resolveHost() {
  if (process.env.HOST) return process.env.HOST.trim();
  const cfgCandidates = [
    path.join(BASE_CONFIG_DIR, 'saleflow.env'),
    path.resolve(SCRIPT_DIR, '..', 'config', 'saleflow.env'),
  ];
  for (const cfgFile of cfgCandidates) {
    if (fs.existsSync(cfgFile)) {
      const content = fs.readFileSync(cfgFile, 'utf8');
      const match = content.match(/HOST=([^\r\n]+)/);
      if (match) return match[1].trim();
    }
  }
  return '0.0.0.0';
}

function getPortalUrl() {
  const port = resolvePort();
  return `http://localhost:${port}`;
}

function isProcessAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Find PID listening on port via netstat (Windows)
function getProcessListeningOnPort(port) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.split(/\r?\n/);
    const regex = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)`, 'i');
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  } catch {}
  return null;
}

// Inspect process details via tasklist (Windows)
function getProcessDetails(pid) {
  if (!pid || isNaN(pid) || process.platform !== 'win32') return { exists: false, name: '' };
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.trim();
    if (!line || line.startsWith('INFO:')) {
      return { exists: false, name: '' };
    }
    const parts = line.split('","').map((p) => p.replace(/"/g, ''));
    return { exists: true, name: parts[0] || '' };
  } catch {
    return { exists: false, name: '' };
  }
}

// Inspect process command line via WMIC (Windows)
function getProcessCommandLine(pid) {
  if (!pid || isNaN(pid) || process.platform !== 'win32') return '';
  try {
    const out = execFileSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/format:list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2500,
    });
    const match = out.match(/CommandLine=(.+)/i);
    if (match) return match[1].trim();
  } catch {}
  return '';
}

// Safety check: verify if a PID is definitely a SaleFlow Node.js process
function isSaleFlowNodeProcess(pid) {
  if (!pid || !isProcessAlive(pid)) return false;
  const details = getProcessDetails(pid);
  if (!details.exists) return false;
  const name = details.name.toLowerCase();
  if (!name.includes('node')) return false;

  const cmd = getProcessCommandLine(pid).toLowerCase();
  if (cmd) {
    if (cmd.includes('saleflow') || cmd.includes('server.js')) return true;
    return false; // Confirmed node, but command line belongs to another application
  }
  return true;
}

// Check if HTTP server is alive and responding to requests
function checkHttpHealth(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const targetHost = (!host || host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
    const req = http.request({
      hostname: targetHost,
      port,
      path: '/',
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

// Poll until HTTP server becomes ready
function waitForServerReady(port, host, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const ready = await checkHttpHealth(port, host, 1000);
      if (ready) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 250);
  });
}

// Test TCP port availability
function testPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

// Open default web browser reliably on Windows
function openBrowser(url) {
  logInfo(`Opening portal in default browser: ${url}`);
  if (process.platform === 'win32') {
    try {
      const p = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      p.unref();
      return true;
    } catch {
      try {
        const p = spawn('cmd.exe', ['/c', 'start', '', url], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        p.unref();
        return true;
      } catch (err) {
        logError(`Failed to launch browser: ${err.message}`);
        return false;
      }
    }
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
}

// Terminate ONLY a verified SaleFlow Node.js process (NEVER an unrelated process)
async function stopProcessByPid(pid) {
  if (!pid || !isProcessAlive(pid)) return;
  if (!isSaleFlowNodeProcess(pid)) {
    logError(`[SECURITY] Refusing to kill PID ${pid}: Process does not match SaleFlow Node.js runtime.`);
    return;
  }

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }

  let attempts = 0;
  while (isProcessAlive(pid) && attempts < 10) {
    await new Promise((r) => setTimeout(r, 250));
    attempts++;
  }
}

// Main Start / Launch logic
async function startServer(options = {}) {
  const shouldOpenBrowser = options.openBrowser ?? true;
  const port = resolvePort();
  const host = resolveHost();
  const portalUrl = getPortalUrl();
  const pidFile = getPidFile();

  logInfo(`Checking process status (target: http://${host}:${port})...`);

  // 1. Check PID file if present
  if (fs.existsSync(pidFile)) {
    let savedPid = null;
    try {
      savedPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    } catch {}

    if (savedPid) {
      if (!isProcessAlive(savedPid)) {
        // Stale PID: process was killed or machine rebooted
        logInfo(`Stale PID file cleaned up (PID ${savedPid} is not running).`);
        try { fs.unlinkSync(pidFile); } catch {}
      } else {
        // Saved PID process IS alive!
        // Check if server is already responding to HTTP
        const isResponding = await checkHttpHealth(port, host, 1500);
        if (isResponding) {
          logInfo(`Already running (PID: ${savedPid}).`);
          logInfo(`Portal available at: ${portalUrl}`);
          if (shouldOpenBrowser) {
            openBrowser(portalUrl);
          }
          return;
        }

        // Process is alive, but port is not responding. Check if it's an unrelated process.
        const isSaleFlow = isSaleFlowNodeProcess(savedPid);
        if (!isSaleFlow) {
          const details = getProcessDetails(savedPid);
          logInfo(`[WARNING] Stale PID ${savedPid} belongs to an unrelated process (${details.name || 'unknown'}).`);
          logInfo(`Removing stale PID file without touching unrelated process.`);
          try { fs.unlinkSync(pidFile); } catch {}
        } else {
          // It's a node process matching our image, but not responding on port.
          const listeningPid = getProcessListeningOnPort(port);
          if (listeningPid && listeningPid !== savedPid) {
            // Port occupied by a different PID, will be handled in step 2
          } else {
            logInfo(`[WARNING] PID ${savedPid} is alive but unresponsive on port ${port}. Terminating hanging instance...`);
            await stopProcessByPid(savedPid);
            try { fs.unlinkSync(pidFile); } catch {}
          }
        }
      }
    }
  }

  // 2. Check if port is already active (even if PID file was missing or out of sync)
  const listeningPid = getProcessListeningOnPort(port);
  if (listeningPid) {
    const isResponding = await checkHttpHealth(port, host, 1500);
    const isSaleFlow = isSaleFlowNodeProcess(listeningPid);

    if (isResponding && isSaleFlow) {
      logInfo(`Active SaleFlow instance detected on port ${port} (PID: ${listeningPid}).`);
      try { fs.writeFileSync(pidFile, String(listeningPid), 'utf8'); } catch {}
      logInfo(`Portal available at: ${portalUrl}`);
      if (shouldOpenBrowser) {
        openBrowser(portalUrl);
      }
      return;
    }

    // Port is occupied by an unrelated process!
    // RULE: DO NOT kill unrelated processes.
    const details = getProcessDetails(listeningPid);
    logError(`Port ${port} is occupied by an unrelated process (PID: ${listeningPid}, Name: ${details.name || 'unknown'}).`);
    logError(`SaleFlow will not terminate unrelated system processes.`);
    logError(`Please close the conflicting application or set a different PORT in config\\saleflow.env`);
    process.exit(1);
  }

  // Double check socket availability
  const isAvailable = await testPortAvailable(port, host);
  if (!isAvailable) {
    logError(`Port ${port} is currently unavailable.`);
    logError(`Please close any conflicting applications or configure a different PORT in config\\saleflow.env`);
    process.exit(1);
  }

  // 3. Locate entrypoint
  const serverJs = path.join(APP_DIR, 'server.js');
  if (!fs.existsSync(serverJs)) {
    logError(`Cannot find application entrypoint: ${serverJs}`);
    process.exit(1);
  }

  // 4. Spawn detached server process
  const outLog = fs.openSync(LOG_FILE, 'a');
  const errLog = outLog;

  const childEnv = {
    ...process.env,
    PORT: String(port),
    HOST: host,
    HOSTNAME: host,
    NODE_ENV: 'production',
    SALEFLOW_INSTALLED_MODE: '1',
    SALEFLOW_DATA_DIR: BASE_DATA_DIR,
    SALEFLOW_LOG_DIR: BASE_LOG_DIR,
    SALEFLOW_CONFIG_DIR: BASE_CONFIG_DIR,
    SALEFLOW_BACKUP_DIR: BASE_BACKUP_DIR,
  };

  const child = spawn(NODE_EXE, ['server.js'], {
    cwd: APP_DIR,
    detached: true,
    stdio: ['ignore', outLog, errLog],
    env: childEnv,
  });

  child.unref();

  // Save PID
  try {
    fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  } catch (err) {
    logInfo(`[WARNING] Could not write PID file: ${err.message}`);
  }

  logInfo(`Server process spawned (PID: ${child.pid}). Waiting for application readiness...`);

  // Wait until server is listening and ready
  const ready = await waitForServerReady(port, host, 30000);
  if (ready) {
    logInfo(`Server started successfully (PID: ${child.pid}).`);
    logInfo(`Local URL:   ${portalUrl}`);
    logInfo(`LAN Binding: ${host}:${port}`);
    logInfo(`Log File:    ${LOG_FILE}`);
    if (shouldOpenBrowser) {
      openBrowser(portalUrl);
    }
  } else {
    logInfo(`[WARNING] Server process was started (PID: ${child.pid}), but HTTP port ${port} did not respond within 30 seconds.`);
    logInfo(`[WARNING] Check logs for details: ${LOG_FILE}`);
    if (shouldOpenBrowser) {
      openBrowser(portalUrl);
    }
  }
}

// Stop Server logic
async function stopServer() {
  const pidFile = getPidFile();
  const port = resolvePort();

  if (!fs.existsSync(pidFile)) {
    const listeningPid = getProcessListeningOnPort(port);
    if (listeningPid && isSaleFlowNodeProcess(listeningPid)) {
      logInfo(`Stopping active SaleFlow server on port ${port} (PID: ${listeningPid})...`);
      await stopProcessByPid(listeningPid);
      logInfo(`Server stopped successfully.`);
      return;
    }
    logInfo(`No running instance detected (PID file not found).`);
    return;
  }

  let pid = null;
  try {
    pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  } catch {}

  if (!pid || !isProcessAlive(pid)) {
    logInfo(`Stale PID file cleaned up.`);
    try { fs.unlinkSync(pidFile); } catch {}
    return;
  }

  logInfo(`Stopping server process (PID: ${pid})...`);
  await stopProcessByPid(pid);
  try { fs.unlinkSync(pidFile); } catch {}
  logInfo(`Server stopped successfully.`);
}

// Status query logic
async function getStatus() {
  const port = resolvePort();
  const host = resolveHost();
  const pidFile = getPidFile();
  const listeningPid = getProcessListeningOnPort(port);

  if (!fs.existsSync(pidFile) && !listeningPid) {
    console.log(`[SaleFlow] Status: STOPPED`);
    return;
  }

  let pid = null;
  if (fs.existsSync(pidFile)) {
    try { pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10); } catch {}
  }
  const effectivePid = pid || listeningPid;

  if (effectivePid && isProcessAlive(effectivePid)) {
    const isResponding = await checkHttpHealth(port, host, 1500);
    console.log(`[SaleFlow] Status:  ${isResponding ? 'RUNNING' : 'INITIALIZING'} (PID: ${effectivePid})`);
    console.log(`[SaleFlow] URL:     http://localhost:${port}`);
    console.log(`[SaleFlow] Health:  ${isResponding ? 'OK (HTTP 200)' : 'Not responding'}`);
    console.log(`[SaleFlow] Logs:    ${LOG_FILE}`);
  } else {
    console.log(`[SaleFlow] Status: STOPPED (stale PID file found)`);
  }
}

// CLI entrypoint
const args = process.argv.slice(2);
const command = args[0] || 'launch';
const hasNoBrowserFlag = args.includes('--no-browser') || args.includes('--headless');

(async () => {
  switch (command.toLowerCase()) {
    case 'launch':
      await startServer({ openBrowser: !hasNoBrowserFlag });
      break;
    case 'start':
      await startServer({ openBrowser: !hasNoBrowserFlag });
      break;
    case 'open-browser':
      openBrowser(getPortalUrl());
      break;
    case 'stop':
      await stopServer();
      break;
    case 'restart':
      await stopServer();
      await new Promise((r) => setTimeout(r, 1000));
      await startServer({ openBrowser: !hasNoBrowserFlag });
      break;
    case 'status':
      await getStatus();
      break;
    default:
      console.log(`Usage: node process-controller.js [launch|start|stop|restart|status|open-browser] [--no-browser]`);
      break;
  }
})();
