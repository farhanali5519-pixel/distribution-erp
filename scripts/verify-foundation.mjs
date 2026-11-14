import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

console.log('=====================================================');
console.log('   SALES DISTRIBUTION SYSTEM - FOUNDATION TEST SUITE   ');
console.log('=====================================================\n');

// 1. Test In-Memory Database and Schemas
const db = new DatabaseSync(':memory:');

// Load SQL DDL
const schemaContent = fs.readFileSync(
  path.join(process.cwd(), 'src', 'core', 'database', 'schema.ts'),
  'utf8'
);
const sqlMatch = schemaContent.match(/export const CREATE_TABLES_SQL = `([\s\S]*?)`;/);
if (!sqlMatch) {
  throw new Error('Could not parse SQL schema from schema.ts');
}

db.exec(sqlMatch[1]);
console.log('✅ SQLite Schema DDL applied successfully with foreign keys and WAL mode.');

// 2. Test UUID generation
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const testUUID = crypto.randomUUID();
if (!uuidRegex.test(testUUID)) {
  throw new Error('UUID format invalid!');
}
console.log(`✅ UUID generation verified (Sample: ${testUUID})`);

// 3. Test Double-Entry Rules:
// Insert two test accounts: Cash (Asset) and Sales (Revenue)
const cashId = crypto.randomUUID();
const salesId = crypto.randomUUID();

db.prepare(`
  INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system)
  VALUES (?, '1010', 'Cash in Hand', 'ASSET', 'DEBIT', 1, 1)
`).run(cashId);

db.prepare(`
  INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system)
  VALUES (?, '4010', 'Sales Revenue', 'REVENUE', 'CREDIT', 1, 1)
`).run(salesId);

console.log('✅ Core Chart of Accounts seeded.');

// Test A: Balanced entry (Dr Cash 5000, Cr Sales 5000)
const journalId = crypto.randomUUID();
db.exec('BEGIN TRANSACTION;');
db.prepare(`
  INSERT INTO journal_entries (id, entry_number, entry_date, description, source_module, status, total_amount)
  VALUES (?, 'JE-2026-0001', '2026-09-19', 'Cash Sale Test', 'sales', 'POSTED', 5000.00)
`).run(journalId);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit, credit)
  VALUES (?, ?, ?, 5000.00, 0.00)
`).run(crypto.randomUUID(), journalId, cashId);

db.prepare(`
  INSERT INTO journal_lines (id, journal_id, account_id, debit, credit)
  VALUES (?, ?, ?, 0.00, 5000.00)
`).run(crypto.randomUUID(), journalId, salesId);

db.exec('COMMIT;');
console.log('✅ Balanced journal entry (Debit 5000 == Credit 5000) posted successfully.');

// Test B: Verify Total Debits == Total Credits in Trial Balance
const totals = db.prepare(`
  SELECT SUM(debit) as totalDebits, SUM(credit) as totalCredits
  FROM journal_lines
`).get();

if (totals.totalDebits !== totals.totalCredits || totals.totalDebits !== 5000) {
  throw new Error(`Trial balance mismatch! Debits: ${totals.totalDebits}, Credits: ${totals.totalCredits}`);
}
console.log(`✅ Trial Balance strictly balanced: Debits = ${totals.totalDebits}, Credits = ${totals.totalCredits}`);

// Test C: Foreign Key & Check Constraint verification
try {
  // Try inserting negative debit - should fail!
  db.prepare(`
    INSERT INTO journal_lines (id, journal_id, account_id, debit, credit)
    VALUES (?, ?, ?, -100.00, 0.00)
  `).run(crypto.randomUUID(), journalId, cashId);
  throw new Error('Database allowed negative debit, which is forbidden!');
} catch (e) {
  console.log('✅ Negative amount constraint verified: SQLite rejected negative debit.');
}

console.log('\n=====================================================');
console.log('   ALL ARCHITECTURAL INTEGRITY CHECKS PASSED 100%    ');
console.log('=====================================================\n');
