import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/sales_distribution.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();

console.log(`Found ${tables.length} tables:`);
for (const t of tables) {
  console.log(`--- TABLE: ${t.name} ---`);
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  for (const c of cols) {
    console.log(`  ${c.name} (${c.type}) ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value !== null ? 'DEFAULT ' + c.dflt_value : ''} ${c.pk ? 'PK' : ''}`);
  }
}
