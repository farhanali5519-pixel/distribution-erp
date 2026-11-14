import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/sales_distribution.db');
const idxs = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name").all();
console.log(`Found ${idxs.length} explicit indexes in SQLite:`);
for (const idx of idxs) {
  console.log(`[${idx.tbl_name}] ${idx.sql}`);
}
