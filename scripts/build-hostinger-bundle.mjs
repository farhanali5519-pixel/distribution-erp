/**
 * SaleFlow ERP - Hostinger Standalone Bundle Builder
 * Generates an isolated, self-contained deployment artifact in .hostinger/
 * compatible with Hostinger Business Web Hosting Node.js runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const NEXT_DIR = path.join(ROOT_DIR, '.next');
const STANDALONE_DIR = path.join(NEXT_DIR, 'standalone');
const HOSTINGER_DIR = path.join(ROOT_DIR, '.hostinger');
const STATIC_SRC = path.join(NEXT_DIR, 'static');
const PUBLIC_SRC = path.join(ROOT_DIR, 'public');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');

console.log('===================================================================');
console.log('   SALEFLOW ERP - HOSTINGER STANDALONE BUNDLE COMPILATION   ');
console.log('===================================================================\n');

// ---------------------------------------------------------------------
// STEP 1: CLEAN PREVIOUS ARTIFACTS
// ---------------------------------------------------------------------
console.log('--- 1. Cleaning previous build directories ---');
if (fs.existsSync(NEXT_DIR)) {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log('  Cleaned .next directory');
}
if (fs.existsSync(HOSTINGER_DIR)) {
  fs.rmSync(HOSTINGER_DIR, { recursive: true, force: true });
  console.log('  Cleaned .hostinger directory');
}

// ---------------------------------------------------------------------
// STEP 2: RUN NEXT.JS STANDALONE WEBPACK PRODUCTION BUILD
// ---------------------------------------------------------------------
console.log('\n--- 2. Compiling Next.js Standalone Production Build ---');
const buildEnv = {
  ...process.env,
  NODE_ENV: 'production',
  SALEFLOW_HOSTINGER_BUNDLE: 'true',
  SALEFLOW_BUILD_PHASE: 'true',
  DEPLOYMENT_MODE: 'hostinger',
  DATABASE_DRIVER: 'sqlite',
  // Guarantee no real production DB is required during compilation
  SQLITE_ALLOW_CREATE: 'false',
};

// Use npx next build --webpack
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const buildCommand = `${npxCmd} next build --webpack`;
console.log(`  Executing: ${buildCommand}`);

try {
  execSync(buildCommand, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: buildEnv,
  });
} catch (err) {
  console.error('\n[FATAL] Next.js compilation failed.');
  process.exit(1);
}

// ---------------------------------------------------------------------
// STEP 3: VERIFY STANDALONE ARTIFACTS IN .next/standalone
// ---------------------------------------------------------------------
console.log('\n--- 3. Verifying Standalone Output ---');

if (!fs.existsSync(STANDALONE_DIR)) {
  console.error(`[FATAL] .next/standalone directory does not exist at: ${STANDALONE_DIR}`);
  process.exit(1);
}

// Find server.js in standalone directory (root or first subfolder if nested)
let standaloneRoot = STANDALONE_DIR;
if (!fs.existsSync(path.join(standaloneRoot, 'server.js'))) {
  // Check for nested project folder inside standalone
  const entries = fs.readdirSync(STANDALONE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(STANDALONE_DIR, entry.name);
      if (fs.existsSync(path.join(candidate, 'server.js'))) {
        standaloneRoot = candidate;
        break;
      }
    }
  }
}

const serverJsSrc = path.join(standaloneRoot, 'server.js');
const nodeModulesSrc = path.join(STANDALONE_DIR, 'node_modules');
const nextModuleSrc = path.join(nodeModulesSrc, 'next');

if (!fs.existsSync(serverJsSrc)) {
  console.error(`[FATAL] Missing standalone server.js (checked ${serverJsSrc})`);
  process.exit(1);
}
console.log(`  ✓ Found server.js at: ${serverJsSrc}`);

if (!fs.existsSync(nodeModulesSrc)) {
  console.error(`[FATAL] Missing standalone node_modules at: ${nodeModulesSrc}`);
  process.exit(1);
}
console.log(`  ✓ Found standalone node_modules at: ${nodeModulesSrc}`);

if (!fs.existsSync(nextModuleSrc)) {
  console.error(`[FATAL] Missing next module inside standalone node_modules at: ${nextModuleSrc}`);
  process.exit(1);
}
console.log(`  ✓ Found standalone next package at: ${nextModuleSrc}`);

// ---------------------------------------------------------------------
// STEP 4: ASSEMBLE .hostinger BUNDLE
// ---------------------------------------------------------------------
console.log('\n--- 4. Assembling Self-Contained .hostinger Bundle ---');
fs.mkdirSync(HOSTINGER_DIR, { recursive: true });

function copyRecursive(src, dest, excludeFilter) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      const srcItem = path.join(src, item);
      const destItem = path.join(dest, item);
      if (excludeFilter && excludeFilter(srcItem, item)) continue;
      copyRecursive(srcItem, destItem, excludeFilter);
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const isForbidden = (fullPath, basename) => {
  const lower = basename.toLowerCase();
  if (lower.startsWith('.env')) return true;
  if (lower.endsWith('.db') || lower.endsWith('.db-wal') || lower.endsWith('.db-shm')) return true;
  if (lower.endsWith('.sqlite') || lower.endsWith('.sqlite3')) return true;
  if (lower === '.git') return true;

  // Protect against copying root project directories if traversed,
  // but NEVER exclude packages or build output inside node_modules or .next!
  const normalized = fullPath.replace(/\\/g, '/');
  if (!normalized.includes('/node_modules') && !normalized.includes('/.next')) {
    if (
      lower === 'data' ||
      lower === 'backups' ||
      lower === 'logs' ||
      lower === 'scratch' ||
      lower === 'installer' ||
      lower === 'dist' ||
      lower === 'dist-hostinger'
    ) {
      return true;
    }
  }
  return false;
};

// Copy all standalone files into .hostinger root
console.log('  Copying standalone runtime files into .hostinger/...');
copyRecursive(standaloneRoot, HOSTINGER_DIR, isForbidden);

// If node_modules was in STANDALONE_DIR and standaloneRoot was a subfolder, ensure node_modules is copied
const destNodeModules = path.join(HOSTINGER_DIR, 'node_modules');
if (!fs.existsSync(destNodeModules) && fs.existsSync(nodeModulesSrc)) {
  console.log('  Copying standalone node_modules into .hostinger/node_modules/...');
  copyRecursive(nodeModulesSrc, destNodeModules, isForbidden);
}

// Copy .next/static -> .hostinger/.next/static
const destStatic = path.join(HOSTINGER_DIR, '.next', 'static');
if (fs.existsSync(STATIC_SRC)) {
  console.log('  Copying .next/static into .hostinger/.next/static/...');
  copyRecursive(STATIC_SRC, destStatic, isForbidden);
} else {
  console.error('[FATAL] Missing .next/static build directory');
  process.exit(1);
}

// Copy public -> .hostinger/public
const destPublic = path.join(HOSTINGER_DIR, 'public');
if (fs.existsSync(PUBLIC_SRC)) {
  console.log('  Copying public assets into .hostinger/public/...');
  copyRecursive(PUBLIC_SRC, destPublic, isForbidden);
}

// Copy version.json if available
if (fs.existsSync(VERSION_FILE)) {
  fs.copyFileSync(VERSION_FILE, path.join(HOSTINGER_DIR, 'version.json'));
}

// Ensure complete runtime packages from project node_modules into .hostinger/node_modules
// This resolves the known Hostinger failure: "Cannot find module 'next' in server.js"
// caused by Next.js standalone tracer omitting package.json and non-statically-traced entrypoints.
const criticalRuntimePackages = [
  'next',
  'react',
  'react-dom',
  '@swc',
  '@next',
  'styled-jsx',
  'client-only',
  'scheduler',
  'pg',
  'pg-protocol',
  'pg-types',
  'pg-pool',
  'pg-int8',
  'pgpass',
  'pg-cloudflare',
  'pg-connection-string',
  'postgres-array',
  'postgres-bytea',
  'postgres-date',
  'postgres-interval',
  'split2',
  'xtend',
  'sharp',
  '@img',
  'lucide-react',
];

console.log('  Ensuring complete runtime packages in .hostinger/node_modules/...');
for (const pkg of criticalRuntimePackages) {
  const pkgSrc = path.join(ROOT_DIR, 'node_modules', pkg);
  const pkgDest = path.join(HOSTINGER_DIR, 'node_modules', pkg);
  if (fs.existsSync(pkgSrc)) {
    copyRecursive(pkgSrc, pkgDest, isForbidden);
  }
}

// ---------------------------------------------------------------------
// STEP 5: STRICT ARTIFACT SECURITY & INTEGRITY VERIFICATION
// ---------------------------------------------------------------------
console.log('\n--- 5. Verifying Bundle Integrity & Security ---');

const hostingerServer = path.join(HOSTINGER_DIR, 'server.js');
const hostingerNodeModules = path.join(HOSTINGER_DIR, 'node_modules');
const hostingerNextPkg = path.join(hostingerNodeModules, 'next');
const hostingerStatic = path.join(HOSTINGER_DIR, '.next', 'static');

if (!fs.existsSync(hostingerServer)) {
  throw new Error(`CRITICAL: .hostinger/server.js was not found at ${hostingerServer}`);
}
if (!fs.existsSync(hostingerNodeModules)) {
  throw new Error(`CRITICAL: .hostinger/node_modules was not found at ${hostingerNodeModules}`);
}
if (!fs.existsSync(hostingerNextPkg)) {
  throw new Error(`CRITICAL: .hostinger/node_modules/next was not found at ${hostingerNextPkg}`);
}
if (!fs.existsSync(hostingerStatic)) {
  throw new Error(`CRITICAL: .hostinger/.next/static was not found at ${hostingerStatic}`);
}

// Verify self-contained module resolution from .hostinger
const hostingerNorm = path.resolve(HOSTINGER_DIR).toLowerCase();
const resolvedNext = require.resolve('next', { paths: [HOSTINGER_DIR] });
if (!path.resolve(resolvedNext).toLowerCase().startsWith(hostingerNorm)) {
  throw new Error(`CRITICAL: 'next' did not resolve from .hostinger bundle! Resolved: ${resolvedNext}`);
}
const resolvedReact = require.resolve('react', { paths: [HOSTINGER_DIR] });
if (!path.resolve(resolvedReact).toLowerCase().startsWith(hostingerNorm)) {
  throw new Error(`CRITICAL: 'react' did not resolve from .hostinger bundle! Resolved: ${resolvedReact}`);
}
const resolvedReactDom = require.resolve('react-dom', { paths: [HOSTINGER_DIR] });
if (!path.resolve(resolvedReactDom).toLowerCase().startsWith(hostingerNorm)) {
  throw new Error(`CRITICAL: 'react-dom' did not resolve from .hostinger bundle! Resolved: ${resolvedReactDom}`);
}
const resolvedStartServer = require.resolve('next/dist/server/lib/start-server', { paths: [HOSTINGER_DIR] });
if (!path.resolve(resolvedStartServer).toLowerCase().startsWith(hostingerNorm)) {
  throw new Error(`CRITICAL: 'next/dist/server/lib/start-server' did not resolve from .hostinger bundle! Resolved: ${resolvedStartServer}`);
}

// Scan for any forbidden files inside .hostinger
function scanDir(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    const lower = item.name.toLowerCase();
    if (
      lower.startsWith('.env') ||
      lower.endsWith('.db') ||
      lower.endsWith('.sqlite') ||
      lower.endsWith('.db-wal') ||
      lower.endsWith('.db-shm')
    ) {
      throw new Error(`SECURITY ALERT: Forbidden file found inside .hostinger: ${full}`);
    }
    if (item.isDirectory() && item.name !== 'node_modules') {
      scanDir(full);
    }
  }
}
scanDir(HOSTINGER_DIR);

console.log('  ✓ .hostinger/server.js confirmed');
console.log('  ✓ .hostinger/node_modules confirmed');
console.log('  ✓ .hostinger/node_modules/next confirmed');
console.log(`  ✓ 'next' strictly resolves inside bundle: ${resolvedNext}`);
console.log(`  ✓ 'react' strictly resolves inside bundle: ${resolvedReact}`);
console.log(`  ✓ 'react-dom' strictly resolves inside bundle: ${resolvedReactDom}`);
console.log(`  ✓ 'start-server' strictly resolves inside bundle: ${resolvedStartServer}`);
console.log('  ✓ .hostinger/.next/static confirmed');
console.log('  ✓ Zero databases or .env files present in bundle');

console.log('\n===================================================================');
console.log('   ✓ HOSTINGER STANDALONE BUNDLE SUCCESSFULLY GENERATED!   ');
console.log('   Destination: .hostinger/');
console.log('===================================================================\n');
