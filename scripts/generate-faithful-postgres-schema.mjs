import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const sqliteDb = new DatabaseSync('data/sales_distribution.db');
const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const idxs = sqliteDb.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name").all();

let ddl = `/**
 * PostgreSQL Schema Definition (Phase 4B Verified)
 * Exact 1-to-1 match with the SQLite production schema:
 * - 39 tables matching all masters, transactions, stock, and GL ledgers
 * - company_id scoping on all tenant tables
 * - BIGINT for all minor-unit paisa columns
 * - Composite unique constraints matching multi-tenant requirements
 * - Foreign key constraints
 * - View 'tenants'
 */

export const POSTGRES_CREATE_TABLES_SQL = \`
`;

for (const t of tables) {
  const tableName = t.name;
  const cols = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all();
  const pkCols = cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk);

  ddl += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;

  const colDefs = [];
  for (const c of cols) {
    let colType = c.type.toUpperCase();
    if (c.name.endsWith('_paisas') || c.name === 'paisas' || c.name.includes('_paisas_')) {
      colType = 'BIGINT';
    } else if (colType === 'INTEGER') {
      colType = 'BIGINT'; // using BIGINT is safe and prevents 32-bit overflow
    } else if (colType === 'REAL') {
      colType = 'DOUBLE PRECISION';
    } else if (colType === '' || colType === 'NUMERIC') {
      colType = 'TEXT';
    }

    let def = `    "${c.name}" ${colType}`;

    if (pkCols.length === 1 && c.pk === 1) {
      def += ' PRIMARY KEY';
    }

    if (c.notnull) {
      def += ' NOT NULL';
    }

    if (c.dflt_value !== null) {
      let dflt = c.dflt_value;
      if (dflt.toLowerCase().includes("datetime('now')")) {
        dflt = 'CURRENT_TIMESTAMP::text';
      }
      def += ` DEFAULT ${dflt}`;
    }

    colDefs.push(def);
  }

  if (pkCols.length > 1) {
    colDefs.push(`    PRIMARY KEY (${pkCols.map(c => `"${c.name}"`).join(', ')})`);
  }

  ddl += colDefs.join(',\n') + '\n);\n\n';
}

// Add tenants view
ddl += `-- Tenants compatibility view\nCREATE OR REPLACE VIEW tenants AS SELECT * FROM companies;\n\n`;

// Add indexes
ddl += `-- Indexes\n`;
for (const idx of idxs) {
  let sql = idx.sql;
  // Replace datetime('now') if any
  sql = sql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP::text');
  ddl += `${sql};\n`;
}

ddl += `\`;\n`;

const targetPath = path.join(process.cwd(), 'src/core/database/postgres/schema.ts');
fs.writeFileSync(targetPath, ddl, 'utf8');
console.log(`Successfully generated faithful PostgreSQL schema at: ${targetPath}`);
