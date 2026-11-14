import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const backupsDir = path.join(process.cwd(), 'backups');
const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const targetSqlite = path.join(backupsDir, 'pre-phase4b-final-2026-09-29.sqlite');
const targetDb = path.join(backupsDir, 'pre-phase4b-final-2026-09-29.db');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

if (fs.existsSync(targetSqlite)) {
  fs.unlinkSync(targetSqlite);
}

const db = new DatabaseSync(dbPath);
const cleanTarget = targetSqlite.replace(/\\/g, '/');
db.exec(`VACUUM INTO '${cleanTarget}'`);
db.close();

fs.copyFileSync(dbPath, targetDb);

const stat = fs.statSync(targetSqlite);
console.log(`Pre-Phase4B backup created successfully: ${targetSqlite} (${(stat.size / 1024).toFixed(1)} KB)`);
console.log(`Pre-Phase4B file copy created: ${targetDb}`);
