import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/sales_distribution.db');

const doc9 = '1b567328-8e20-48ef-bd89-7c1b1a962763';
const doc10 = '4f3390a8-df8a-423b-a102-be957bb60896';

console.log('=== SEARCHING FOR SOURCE TRANSACTIONS ===\n');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

for (const t of tables) {
  try {
    const r9 = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).all(doc9);
    if (r9.length > 0) {
      console.log(`Found doc9 in table "${t}":`, r9);
    }
    const r10 = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).all(doc10);
    if (r10.length > 0) {
      console.log(`Found doc10 in table "${t}":`, r10);
    }
  } catch (e) {}
}

// Check journal_entries
const je9 = db.prepare(`SELECT * FROM journal_entries WHERE id = 'bb19c248-6987-4ee7-84ac-09111befc223' OR entry_number = 'JE-202609-0009'`).all();
const je10 = db.prepare(`SELECT * FROM journal_entries WHERE id = 'bb19c248-6987-4ee7-84ac-09111befc223' OR entry_number = 'JE-202609-0010'`).all();

console.log('\n--- Journal Entry 9 ---');
console.log(je9);

console.log('\n--- Journal Entry 10 ---');
console.log(je10);
