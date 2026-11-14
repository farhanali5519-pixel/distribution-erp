import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const src = path.join(process.cwd(), 'data', 'sales_distribution.db');
const dest = path.join(process.cwd(), 'backups', 'post-phase4b-final-2026-09-29.db');
const destClean = dest.replace(/\\/g, '/');

if (!fs.existsSync(path.dirname(dest))) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
}

if (fs.existsSync(dest)) {
  fs.unlinkSync(dest);
}

const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${destClean}'`);
db.close();

const stat = fs.statSync(dest);
console.log('Created backup:', dest, 'size:', stat.size, 'bytes');

const verifyDb = new DatabaseSync(dest);
const check = verifyDb.prepare('PRAGMA integrity_check').get();
console.log('Integrity check:', check);
verifyDb.close();
