import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { POSTGRES_CREATE_TABLES_SQL } from '../src/core/database/postgres/schema.js';

const { Client } = pg;

async function check() {
  const sqliteDb = new DatabaseSync('data/sales_distribution.db');
  const sqliteTables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();

  // Create a client to test postgres
  const pgClient = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/saleflow_test_phase4b' });
  await pgClient.connect();

  console.log('Comparing SQLite tables with PostgreSQL tables...');
  let totalMismatches = 0;

  for (const t of sqliteTables) {
    const tableName = t.name;
    const sqliteCols = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all().map(c => c.name);

    const pgColsRes = await pgClient.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    if (pgColsRes.rows.length === 0) {
      console.error(`[MISSING TABLE] Table ${tableName} missing in PostgreSQL!`);
      totalMismatches++;
      continue;
    }

    const pgCols = pgColsRes.rows.map(r => r.column_name);

    const missingInPg = sqliteCols.filter(c => !pgCols.includes(c));
    const extraInPg = pgCols.filter(c => !sqliteCols.includes(c));

    if (missingInPg.length > 0 || extraInPg.length > 0) {
      console.warn(`[TABLE ${tableName}] Column diff:`);
      if (missingInPg.length > 0) console.warn(`   Missing in PG: ${missingInPg.join(', ')}`);
      if (extraInPg.length > 0) console.warn(`   Extra in PG: ${extraInPg.join(', ')}`);
      totalMismatches++;
    } else {
      console.log(`[OK] Table ${tableName}: all ${sqliteCols.length} columns match!`);
    }
  }

  await pgClient.end();
  sqliteDb.close();

  console.log(`Finished check. Total discrepancies: ${totalMismatches}`);
}

check().catch(console.error);
