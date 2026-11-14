import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/sales_distribution.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

console.log('=== RECORDS CREATED AT OR AROUND 2026-09-27 06:26:04 ===\n');

for (const t of tables) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    if (cols.includes('created_at')) {
      const rows = db.prepare(`SELECT * FROM ${t} WHERE created_at LIKE '2026-09-27%'`).all();
      if (rows.length > 0) {
        console.log(`Table "${t}": ${rows.length} records on 2026-09-27`);
        for (const r of rows.slice(0, 5)) {
          console.log(`   - ID: ${r.id || r.entry_number || r.voucher_number || JSON.stringify(r)} | Date: ${r.created_at}`);
        }
      }
    }
  } catch (e) {}
}
