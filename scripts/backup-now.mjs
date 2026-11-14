import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupsDir = path.join(process.cwd(), 'backups');
const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const targetSqlite = path.join(backupsDir, `erp-backup-pre-inventory-upgrade-${ts}.sqlite`);
const targetDb = path.join(backupsDir, `erp-backup-pre-inventory-upgrade-${ts}.db`);

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${targetSqlite.replace(/\\/g, '/')}'`);
db.close();

fs.copyFileSync(dbPath, targetDb);

const stat = fs.statSync(targetSqlite);
console.log(`Backup created successfully: ${targetSqlite} (${(stat.size / 1024).toFixed(1)} KB)`);
console.log(`Backup file copy created: ${targetDb}`);
