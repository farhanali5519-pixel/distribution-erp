/**
 * SaleFlow ERP - Focused Production Standalone Startup Smoke Test
 *
 * Verifies that the compiled .hostinger bundle boots cleanly under Node.js runtime,
 * connects to database, keeps the process alive, and responds successfully to critical routes:
 * - GET /
 * - GET /login
 * - GET /superadmin/login
 * - GET /api/branding/assets/logo
 * - GET /api/branding/assets/sidebar-logo
 * - GET /api/branding/assets/favicon
 *
 * Runs strictly with isolated temporary database. Real production DB is NEVER touched.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const REAL_DB = path.join(ROOT_DIR, 'data', 'sales_distribution.db');
const TEMP_DIR = path.join(os.tmpdir(), 'saleflow_smoke_suite_' + Date.now());
fs.mkdirSync(TEMP_DIR, { recursive: true });
const TEMP_DB = path.join(TEMP_DIR, 'sales_smoke.db');

if (fs.existsSync(REAL_DB)) {
  fs.copyFileSync(REAL_DB, TEMP_DB);
  console.log('[Smoke Test] Copied reference database to temporary path:', TEMP_DB);
} else {
  console.log('[Smoke Test] Notice: Real database not found, using fresh temp database');
}

const TEST_PORT = 3015;
const env = {
  ...process.env,
  PORT: String(TEST_PORT),
  HOSTNAME: '127.0.0.1',
  NODE_ENV: 'production',
  DEPLOYMENT_MODE: 'hostinger',
  DATABASE_DRIVER: 'sqlite',
  SQLITE_DATABASE_PATH: TEMP_DB,
  SQLITE_ALLOW_CREATE: 'true',
};

const serverJs = path.join(ROOT_DIR, '.hostinger', 'server.js');
if (!fs.existsSync(serverJs)) {
  console.error('[FATAL] Standalone server.js not found at:', serverJs);
  console.error('Run `npm run build` first before executing smoke test.');
  process.exit(1);
}

console.log('[Smoke Test] Launching production standalone server on port', TEST_PORT);
const child = spawn(process.execPath, [serverJs], {
  cwd: path.join(ROOT_DIR, '.hostinger'),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', (d) => {
  serverLog += d.toString();
});
child.stderr.on('data', (d) => {
  serverLog += d.toString();
});

let serverExited = false;
child.on('exit', (code, signal) => {
  serverExited = true;
  console.log(`[Smoke Test] Server exited (code: ${code}, signal: ${signal})`);
});

function requestRoute(urlPath, host = 'salesflow.space') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: 'GET',
        headers: {
          'Host': host,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            bodySnippet: body.slice(0, 300),
          });
        });
      }
    );
    req.on('error', (err) => resolve({ error: err.message }));
    req.setTimeout(6000, () => {
      req.destroy();
      resolve({ error: 'Timeout after 6s' });
    });
    req.end();
  });
}

async function runSmokeSuite() {
  console.log('[Smoke Test] Waiting for standalone server readiness...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (serverExited) break;
    const res = await requestRoute('/superadmin/login');
    if (!res.error && res.statusCode) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!ready) {
    console.error('[FAIL] Standalone production server failed to start within 15 seconds!');
    console.error('[Server Logs]:\n', serverLog);
    child.kill('SIGKILL');
    cleanup();
    process.exit(1);
  }

  console.log('[Smoke Test] ✓ Standalone server is alive and accepting connections.');

  const checks = [
    {
      name: 'Super Admin Login Page',
      path: '/superadmin/login',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 200 && r.bodySnippet.includes('html'),
    },
    {
      name: 'Root Apex Route Redirect',
      path: '/',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 307 || r.statusCode === 200,
    },
    {
      name: 'Tenant Login Route on Apex',
      path: '/login',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 307 || r.statusCode === 200,
    },
    {
      name: 'Branding Favicon Asset Route',
      path: '/api/branding/assets/favicon',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 200,
    },
    {
      name: 'Branding Logo Asset Route (Missing Logo Failure Safety)',
      path: '/api/branding/assets/logo',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 404 || r.statusCode === 200,
    },
    {
      name: 'Branding Sidebar Logo Route (Missing Sidebar Logo Failure Safety)',
      path: '/api/branding/assets/sidebar-logo',
      host: 'salesflow.space',
      validate: (r) => r.statusCode === 404 || r.statusCode === 200,
    },
  ];

  let passedAll = true;
  for (const check of checks) {
    const res = await requestRoute(check.path, check.host);
    const pass = !res.error && check.validate(res);
    if (pass) {
      console.log(`  ✓ PASS: ${check.name} [${check.path}] -> HTTP ${res.statusCode}`);
    } else {
      passedAll = false;
      console.error(`  ✗ FAIL: ${check.name} [${check.path}] -> Error: ${res.error || 'status ' + res.statusCode}`);
    }
  }

  // Ensure server process is still alive and did not terminate
  if (serverExited) {
    console.error('[FAIL] Server terminated unexpectedly during test execution!');
    passedAll = false;
  } else {
    console.log('[Smoke Test] ✓ Server process remained alive throughout all requests.');
  }

  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  cleanup();

  if (!passedAll) {
    console.error('\n[Smoke Test] Suite FAILED');
    process.exit(1);
  }

  console.log('\n[Smoke Test] ALL SMOKE TESTS PASSED CLEANLY');
}

function cleanup() {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {}
}

runSmokeSuite().catch((err) => {
  console.error('[Smoke Test] Exception:', err);
  child.kill('SIGKILL');
  cleanup();
  process.exit(1);
});
