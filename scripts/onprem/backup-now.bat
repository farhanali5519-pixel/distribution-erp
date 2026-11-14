@echo off
setlocal
cd /d "%~dp0.."
set "RUNTIME_NODE=%~dp0..\runtime\node.exe"
if not exist "%RUNTIME_NODE%" set "RUNTIME_NODE=node"

echo ===================================================
echo   SaleFlow ERP - Manual Backup Execution
echo ===================================================

"%RUNTIME_NODE%" -e "
const path = require('node:path');
const fs = require('node:fs');
const isInstalled = process.env.SALEFLOW_INSTALLED_MODE === '1';
const dataDir = process.env.SALEFLOW_DATA_DIR || (isInstalled && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'data') : path.resolve(process.cwd(), 'data'));
const backupDir = process.env.SALEFLOW_BACKUP_DIR || (isInstalled && process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'backups') : path.resolve(process.cwd(), 'backups'));
const dbFile = path.join(dataDir, 'sales_distribution.db');

if (!fs.existsSync(dbFile)) {
  console.error('[ERROR] Database file not found at:', dbFile);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destFile = path.join(backupDir, 'manual-backup-' + timestamp + '.db');
fs.copyFileSync(dbFile, destFile);
console.log('[PASS] Backup created successfully:');
console.log('       Destination:', destFile);
console.log('       Size:       ', (fs.statSync(destFile).size / 1024).toFixed(1), 'KB');
"
pause
endlocal
