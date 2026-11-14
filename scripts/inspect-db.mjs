import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
const db = new DatabaseSync(dbPath);

const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%' 
  ORDER BY name
`).all();

console.log('--- Current Database Tables & Record Counts ---');
for (const t of tables) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`${t.name.padEnd(32)}: ${row.c} records`);
  } catch (e) {
    console.log(`${t.name.padEnd(32)}: ERROR (${e.message})`);
  }
}
