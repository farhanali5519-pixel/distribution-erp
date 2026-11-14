import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const liveDb = new DatabaseSync('data/sales_distribution.db');

console.log('=== PER-JOURNAL-ENTRY BALANCE CHECK ON LIVE DB ===');

const entries = liveDb.prepare(`
  SELECT 
    je.id,
    je.entry_number,
    je.entry_date,
    je.description,
    je.source_module,
    je.source_document_id,
    je.status,
    je.created_at,
    COALESCE(SUM(jl.debit_paisas), 0) as total_debits,
    COALESCE(SUM(jl.credit_paisas), 0) as total_credits,
    (COALESCE(SUM(jl.debit_paisas), 0) - COALESCE(SUM(jl.credit_paisas), 0)) as diff_paisas,
    COUNT(jl.id) as line_count
  FROM journal_entries je
  LEFT JOIN journal_lines jl ON jl.journal_id = je.id
  GROUP BY je.id
  ORDER BY je.created_at ASC
`).all();

let unbalancedEntries = [];
let balancedCount = 0;

for (const entry of entries) {
  if (entry.diff_paisas !== 0) {
    unbalancedEntries.push(entry);
    console.log(`[UNBALANCED] ${entry.entry_number} (${entry.id})`);
    console.log(`   Source: ${entry.source_module} / Doc: ${entry.source_document_id}`);
    console.log(`   Date: ${entry.entry_date} | Created: ${entry.created_at}`);
    console.log(`   Debits: ${entry.total_debits} | Credits: ${entry.total_credits} | Diff: ${entry.diff_paisas}`);
    console.log(`   Description: ${entry.description}`);
    
    // Fetch all lines for this entry
    const lines = liveDb.prepare(`
      SELECT jl.*, coa.code as account_code, coa.name as account_name
      FROM journal_lines jl
      LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
      WHERE jl.journal_id = ?
    `).all(entry.id);
    console.log('   Lines:');
    for (const l of lines) {
      console.log(`     - Acct ${l.account_code} (${l.account_name}): Dr ${l.debit_paisas}, Cr ${l.credit_paisas}, Entity: ${l.entity_type} ${l.entity_id}`);
    }
  } else {
    balancedCount++;
  }
}

console.log(`\nTotal Entries: ${entries.length}`);
console.log(`Balanced Entries: ${balancedCount}`);
console.log(`Unbalanced Entries: ${unbalancedEntries.length}`);

// Check for orphan journal lines (lines without valid journal_entry)
const orphanLines = liveDb.prepare(`
  SELECT jl.*, coa.code as account_code, coa.name as account_name
  FROM journal_lines jl
  LEFT JOIN journal_entries je ON je.id = jl.journal_id
  LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
  WHERE je.id IS NULL
`).all();

console.log(`\nOrphan Journal Lines (without journal_entries): ${orphanLines.length}`);
if (orphanLines.length > 0) {
  for (const l of orphanLines) {
    console.log(`   - ID: ${l.id} | Acct: ${l.account_code} (${l.account_name}) | Dr: ${l.debit_paisas} | Cr: ${l.credit_paisas} | Created: ${l.created_at}`);
  }
}
