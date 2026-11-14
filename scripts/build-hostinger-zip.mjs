import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist-hostinger');
const stagingDir = path.join(outDir, 'staging');
const zipFile = path.join(outDir, 'saleflow-hostinger.zip');

console.log('--- Preparing Hostinger Deployment ZIP ---');

// 1. Ensure clean dist-hostinger directory
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// 2. Define files and directories to include
const includeFiles = [
  'package.json',
  'package-lock.json',
  'next.config.mjs',
  'tsconfig.json',
  'postcss.config.js',
  'tailwind.config.js',
  'version.json',
  'next-env.d.ts',
];

const includeDirs = [
  'src',
  'public',
  'scripts',
];

// Copy individual files
for (const file of includeFiles) {
  const src = path.join(rootDir, file);
  const dest = path.join(stagingDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`+ Copied file: ${file}`);
  } else {
    console.warn(`! Warning: ${file} not found`);
  }
}

// Copy directories recursively with strict exclusion filter
function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    // Skip hidden files, temporary files, backups, logs, databases
    if (
      entry.name.startsWith('.env') ||
      entry.name.endsWith('.db') ||
      entry.name.endsWith('.sqlite') ||
      entry.name.endsWith('.db-wal') ||
      entry.name.endsWith('.db-shm') ||
      entry.name.endsWith('.log') ||
      entry.name.endsWith('.tmp') ||
      entry.name === '.git' ||
      entry.name === 'node_modules'
    ) {
      console.log(`- Skipping excluded item: ${path.relative(rootDir, srcPath)}`);
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of includeDirs) {
  const src = path.join(rootDir, dir);
  const dest = path.join(stagingDir, dir);
  if (fs.existsSync(src)) {
    console.log(`+ Copying directory: ${dir}/`);
    copyDirRecursive(src, dest);
  }
}

// 3. Verify no forbidden items exist in staging
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const lower = entry.name.toLowerCase();
    if (
      lower.includes('.env') ||
      lower.endsWith('.db') ||
      lower.endsWith('.sqlite') ||
      lower === 'node_modules' ||
      lower === '.next'
    ) {
      throw new Error(`CRITICAL: Forbidden item found in staging: ${full}`);
    }
    if (entry.isDirectory()) scanDir(full);
  }
}
scanDir(stagingDir);
console.log('✓ Staging safety verification passed (zero database, env, or node_modules files).');

// 4. Create ZIP using PowerShell Compress-Archive
console.log(`Compressing to ${zipFile}...`);
const stagingGlob = path.join(stagingDir, '*');
const psCommand = `Compress-Archive -Path '${stagingGlob}' -DestinationPath '${zipFile}' -Force`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

// 5. Clean up staging directory
fs.rmSync(stagingDir, { recursive: true, force: true });

// 6. Verify created ZIP
const stat = fs.statSync(zipFile);
const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
console.log(`✓ Deployment ZIP created successfully!`);
console.log(`  Path: ${zipFile}`);
console.log(`  Size: ${sizeMb} MB (${stat.size} bytes)`);
