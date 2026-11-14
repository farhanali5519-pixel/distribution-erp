import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const files = fs.readdirSync('backups').filter(f => f.endsWith('.db') || f.endsWith('.sqlite'));

console.log('=== HISTORICAL AUDIT OF JE-202609-0009 AND JE-202609-0010 ACROSS ALL BACKUPS ===\n');

for (const f of files) {
  try {
    const db = new DatabaseSync('backups/' + f);
    const je9 = db.prepare("SELECT * FROM journal_entries WHERE entry_number = 'JE-202609-0009'").get();
    const je10 = db.prepare("SELECT * FROM journal_entries WHERE entry_number = 'JE-202609-0010'").get();
    const lines9 = db.prepare("SELECT COUNT(*) as c, SUM(debit_paisas) as d, SUM(credit_paisas) as cr FROM journal_lines WHERE journal_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-202609-0009')").get();
    const lines10 = db.prepare("SELECT COUNT(*) as c, SUM(debit_paisas) as d, SUM(credit_paisas) as cr FROM journal_lines WHERE journal_id = (SELECT id FROM journal_entries WHERE entry_number = 'JE-202609-0010')").get();
    const gl = db.prepare("SELECT COUNT(*) as c, SUM(debit_paisas) as d, SUM(credit_paisas) as cr FROM journal_lines").get();
    
    console.log(`[FILE] ${f}`);
    console.log(`   GL Totals: lines=${gl.c}, debit=${gl.d}, credit=${gl.cr}, diff=${gl.d - gl.cr}`);
    console.log(`   JE-202609-0009 exists: ${!!je9} | Lines: ${lines9.c} (Dr: ${lines9.d}, Cr: ${lines9.cr})`);
    console.log(`   JE-202609-0010 exists: ${!!je10} | Lines: ${lines10.c} (Dr: ${lines10.d}, Cr: ${lines10.cr})`);
    console.log('');
  } catch (e) {
    // Ignore non-sqlite or unreadable
  }
}
