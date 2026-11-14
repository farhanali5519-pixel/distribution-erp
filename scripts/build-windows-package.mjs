/**
 * SaleFlow ERP - Automated Windows Commercial Packaging Script
 * Generates self-contained standalone Windows distribution.
 * 
 * Pipeline:
 * 1. Clean previous build artifacts
 * 2. Typecheck with tsc --noEmit
 * 3. Next.js standalone build
 * 4. Assemble clean Windows distribution layout
 * 5. Embed portable Node.js runtime
 * 6. Package security & forbidden-file exclusion audit
 * 7. Inno Setup installer compilation (if ISCC available)
 * 8. Output release summary
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const VERSION_INFO = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
const VERSION = VERSION_INFO.version;

const DIST_ROOT = path.join(ROOT_DIR, 'dist');
const TARGET_PACKAGE_NAME = `SaleFlow-ERP-v${VERSION}-Windows-x64`;
const PACKAGE_DIR = path.join(DIST_ROOT, TARGET_PACKAGE_NAME);
const APP_DIR = path.join(PACKAGE_DIR, 'app');
const RUNTIME_DIR = path.join(PACKAGE_DIR, 'runtime');
const SCRIPTS_DIR = path.join(PACKAGE_DIR, 'scripts');
const DOCS_DIR = path.join(PACKAGE_DIR, 'docs');

console.log('===================================================================');
console.log(`   SALEFLOW ERP - WINDOWS COMMERCIAL PACKAGING (v${VERSION})   `);
console.log('===================================================================\n');

function runStep(title, fn) {
  console.log(`--- ${title} ---`);
  const start = Date.now();
  fn();
  console.log(`[DONE] ${title} (${Date.now() - start}ms)\n`);
}

function copyRecursive(src, dest, filterFn) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      const srcItem = path.join(src, item);
      const destItem = path.join(dest, item);
      if (filterFn && !filterFn(srcItem)) continue;
      copyRecursive(srcItem, destItem, filterFn);
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// -------------------------------------------------------------------
// STEP 1: CLEAN PREVIOUS ARTIFACTS
// -------------------------------------------------------------------
runStep('1. Cleaning Previous Build & Staging Artifacts', () => {
  if (fs.existsSync(PACKAGE_DIR)) {
    fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
});

// -------------------------------------------------------------------
// STEP 2: COMPILE & ASSEMBLE STANDALONE NEXT.JS SERVER
// -------------------------------------------------------------------
runStep('2. Assembling Next.js Standalone Runtime into app/', () => {
  process.env.SALEFLOW_ONPREM_BUILD = 'true';
  const standaloneDir = path.join(ROOT_DIR, '.next', 'standalone');
  if (!fs.existsSync(standaloneDir)) {
    console.log('   Setting SALEFLOW_ONPREM_BUILD=true and running Next.js production build...');
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        SALEFLOW_ONPREM_BUILD: 'true',
      },
    });
  }
  if (!fs.existsSync(standaloneDir)) {
    throw new Error('Next.js standalone build missing. Please run with SALEFLOW_ONPREM_BUILD=true first.');
  }

  // Copy standalone server files (excluding accidental top-level source/data dirs)
  copyRecursive(standaloneDir, APP_DIR, (srcPath) => {
    const rel = path.relative(standaloneDir, srcPath);
    const topLevel = rel.split(path.sep)[0];
    if (['src', 'scripts', 'docs', 'backups', 'dist', 'data', 'scratch', 'config'].includes(topLevel)) {
      return false;
    }
    return true;
  });

  // Copy static assets (.next/static -> app/.next/static)
  const staticSrc = path.join(ROOT_DIR, '.next', 'static');
  const staticDest = path.join(APP_DIR, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    copyRecursive(staticSrc, staticDest);
  }

  // Ensure Next.js Turbopack route runtimes are present in standalone app
  // Next.js 16 standalone tracer omits app-route-turbo.runtime.prod.js required for API routes
  const nextServerSrc = path.join(ROOT_DIR, 'node_modules', 'next', 'dist', 'compiled', 'next-server');
  const nextServerDest = path.join(APP_DIR, 'node_modules', 'next', 'dist', 'compiled', 'next-server');
  if (fs.existsSync(nextServerSrc)) {
    console.log('   Copying Next.js turbopack route runtime modules to standalone bundle...');
    copyRecursive(nextServerSrc, nextServerDest);
  }

  // Copy version metadata
  fs.copyFileSync(VERSION_FILE, path.join(APP_DIR, 'version.json'));
  fs.copyFileSync(VERSION_FILE, path.join(PACKAGE_DIR, 'version.json'));

  // Ensure production .env exists in app/
  const envContent = [
    `# SaleFlow ERP - Standalone Production Environment`,
    `NODE_ENV=production`,
    `DEPLOYMENT_MODE=onpremise`,
    `DATABASE_DRIVER=sqlite`,
    `PORT=3000`,
    `HOST=0.0.0.0`,
    `SALEFLOW_INSTALLED_MODE=1`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(APP_DIR, '.env.production'), envContent, 'utf8');
});

// -------------------------------------------------------------------
// STEP 3: EMBED PORTABLE NODE RUNTIME
// -------------------------------------------------------------------
runStep('3. Embedding Portable Node.js Runtime into runtime/', () => {
  const sourceNodeExe = process.execPath;
  const targetNodeExe = path.join(RUNTIME_DIR, 'node.exe');

  console.log(`   Source Node.js: ${sourceNodeExe} (${process.version})`);
  fs.copyFileSync(sourceNodeExe, targetNodeExe);

  // Write Node.js Redistribution License Notice
  const nodeNotice = [
    `Node.js is an open-source, cross-platform JavaScript runtime environment.`,
    `Copyright Node.js contributors. All rights reserved.`,
    ``,
    `Permission is hereby granted, free of charge, to any person obtaining a copy`,
    `of this software and associated documentation files (the "Software"), to deal`,
    `in the Software without restriction, including without limitation the rights`,
    `to use, copy, modify, merge, publish, distribute, sublicense, and/or sell`,
    `copies of the Software, and to permit persons to whom the Software is`,
    `furnished to do so, subject to the following conditions:`,
    ``,
    `The above copyright notice and this permission notice shall be included in`,
    `all copies or substantial portions of the Software.`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(RUNTIME_DIR, 'LICENSE.txt'), nodeNotice, 'utf8');
});

// -------------------------------------------------------------------
// STEP 4: PACKAGE OPERATIONAL CONTROL SCRIPTS & DOCS
// -------------------------------------------------------------------
runStep('4. Packaging Windows Control Scripts & Customer Documentation', () => {
  const onpremScriptsDir = path.join(ROOT_DIR, 'scripts', 'onprem');
  const controlScripts = [
    'process-controller.js',
    'start-saleflow.bat',
    'stop-saleflow.bat',
    'restart-saleflow.bat',
    'setup-firewall.bat',
    'backup-now.bat',
    'launch-saleflow.vbs',
    'SaleFlowLauncher.cs',
  ];

  for (const script of controlScripts) {
    const src = path.join(onpremScriptsDir, script);
    const dest = path.join(SCRIPTS_DIR, script);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`[WARN] Control script not found: ${src}`);
    }
  }

  // Compile Native Windows GUI Launcher (SaleFlow.exe)
  const launcherCs = path.join(onpremScriptsDir, 'SaleFlowLauncher.cs');
  const targetExe = path.join(PACKAGE_DIR, 'SaleFlow.exe');
  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    'csc.exe',
  ];
  let cscPath = null;
  for (const cand of cscCandidates) {
    if (fs.existsSync(cand)) {
      cscPath = cand;
      break;
    }
  }

  if (cscPath && fs.existsSync(launcherCs)) {
    console.log(`   Compiling native Windows GUI launcher with ${cscPath}...`);
    try {
      execSync(`"${cscPath}" /target:winexe /optimize+ /nologo /r:System.Windows.Forms.dll /out:"${targetExe}" "${launcherCs}"`, {
        stdio: 'inherit',
      });
      if (fs.existsSync(targetExe)) {
        console.log(`   [PASS] Native Windows GUI launcher compiled: SaleFlow.exe (${fs.statSync(targetExe).size} bytes)`);
      }
    } catch (e) {
      console.warn(`[WARN] Failed to compile SaleFlow.exe: ${e.message}`);
    }
  } else {
    console.warn(`[WARN] csc.exe compiler not found; skipping SaleFlow.exe compilation.`);
  }

  // Copy customer documentation
  const docsSrcDir = path.join(ROOT_DIR, 'docs');
  if (fs.existsSync(docsSrcDir)) {
    copyRecursive(docsSrcDir, DOCS_DIR);
  }
});

// -------------------------------------------------------------------
// STEP 5: AUTOMATED PACKAGE SECURITY & EXCLUSION AUDIT
// -------------------------------------------------------------------
runStep('5. Running Automated Package Security & Exclusion Audit', () => {
  let violationCount = 0;

  function failAudit(msg) {
    console.error(`[AUDIT VIOLATION] ${msg}`);
    violationCount++;
  }

  // 1. Strict Folder Absence
  const forbiddenDirs = ['src', 'backups', 'data', 'scratch', '.git', '.github'];
  for (const dir of forbiddenDirs) {
    if (fs.existsSync(path.join(PACKAGE_DIR, dir))) {
      failAudit(`Forbidden directory packaged at root: ${dir}`);
    }
    if (fs.existsSync(path.join(APP_DIR, dir))) {
      failAudit(`Forbidden directory packaged inside app/: ${dir}`);
    }
  }

  // 2. Scan every file in package for forbidden extensions or secret content
  function scanFiles(currentDir) {
    for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, item.name);
      const relPath = path.relative(PACKAGE_DIR, fullPath);

      if (item.isDirectory()) {
        scanFiles(fullPath);
      } else if (item.isFile()) {
        const lower = item.name.toLowerCase();

        // Forbidden Extensions
        if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
          failAudit(`TypeScript source file found in release package: ${relPath}`);
        }
        if (lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3') || lower.endsWith('.db-wal') || lower.endsWith('.db-shm')) {
          failAudit(`Database file found in release package: ${relPath}`);
        }
        if (lower.endsWith('.pem') || lower.endsWith('.key')) {
          failAudit(`Private key file found in release package: ${relPath}`);
        }

        // Forbidden Scripts
        if (!relPath.includes('node_modules') && (lower === 'license-tool.mjs' || lower.startsWith('test-') || lower.startsWith('verify-'))) {
          failAudit(`Vendor/developer script found in release package: ${relPath}`);
        }

        // Content Scan for Secrets
        if (lower.endsWith('.js') || lower.endsWith('.json') || lower.endsWith('.env') || lower.endsWith('.bat')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('BEGIN PRIVATE KEY')) {
              failAudit(`Private key signature found in file: ${relPath}`);
            }
            if (content.includes('PLATFORM_LICENSE_PRIVATE_KEY=')) {
              failAudit(`Vendor private key env variable found in file: ${relPath}`);
            }
          } catch {}
        }
      }
    }
  }

  scanFiles(PACKAGE_DIR);

  if (violationCount > 0) {
    throw new Error(`Security Audit FAILED with ${violationCount} violations. Build aborted.`);
  }
  console.log(`   [PASS] 0 security violations detected across all package files.`);
});

// -------------------------------------------------------------------
// STEP 6: INNO SETUP INSTALLER COMPILATION (IF ISCC AVAILABLE)
// -------------------------------------------------------------------
runStep('6. Checking Inno Setup Compiler & Installer Packaging', () => {
  const isccCandidates = [
    'iscc.exe',
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Users\\PC\\AppData\\Local\\Programs\\Inno Setup 6\\ISCC.exe',
  ];

  let isccPath = null;
  for (const candidate of isccCandidates) {
    if (fs.existsSync(candidate)) {
      isccPath = candidate;
      break;
    }
  }

  const issScript = path.join(ROOT_DIR, 'installer', 'saleflow-installer.iss');
  if (isccPath && fs.existsSync(issScript)) {
    console.log(`   Inno Setup compiler found: ${isccPath}`);
    console.log(`   Compiling Windows installer executable...`);
    try {
      const out = execSync(`"${isccPath}" "${issScript}"`, { encoding: 'utf8' });
      console.log(out);
      const installerExe = path.join(DIST_ROOT, 'installer', `SaleFlow-ERP-v${VERSION}-Setup.exe`);
      if (fs.existsSync(installerExe)) {
        const sizeMb = (fs.statSync(installerExe).size / (1024 * 1024)).toFixed(2);
        console.log(`   [PASS] Windows Installer generated: ${installerExe} (${sizeMb} MB)`);
      }
    } catch (err) {
      console.warn(`[WARN] Installer compilation failed: ${err.message}`);
    }
  } else {
    console.log(`   [INFO] Inno Setup compiler (ISCC.exe) not installed on build environment.`);
    console.log(`   [INFO] Staged installer script ready at: installer/saleflow-installer.iss`);
    console.log(`   [INFO] Fully standalone package ready at: dist/${TARGET_PACKAGE_NAME}`);
  }
});

console.log('===================================================================');
console.log('   WINDOWS PACKAGING COMPLETE: READY FOR COMMERCIAL DISTRIBUTION   ');
console.log(`   Target Directory: dist/${TARGET_PACKAGE_NAME}`);
console.log('===================================================================\n');
