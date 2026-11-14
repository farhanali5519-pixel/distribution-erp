import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';

const { Pool } = pg;

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return env;
}

async function compare() {
  const sqliteDb = new DatabaseSync('data/sales_distribution.db', { open: true });
  const env = loadEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  const pgClient = await pool.connect();

  try {
    const sqliteTables = sqliteDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
    `).all().map((t: any) => t.name);

    console.log(`Checking ${sqliteTables.length} SQLite tables against PostgreSQL...`);

    const differences: Record<string, any> = {};

    for (const table of sqliteTables) {
      const sqliteCols = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all().map((c: any) => c.name);
      const pgColsRes = await pgClient.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      const pgCols = pgColsRes.rows.map(r => r.column_name);

      const missingInPg = sqliteCols.filter(c => !pgCols.includes(c));
      const extraInPg = pgCols.filter(c => !sqliteCols.includes(c));

      if (missingInPg.length > 0 || extraInPg.length > 0) {
        differences[table] = {
          sqliteColCount: sqliteCols.length,
          pgColCount: pgCols.length,
          missingInPg,
          extraInPg,
        };
      }
    }

    console.log('Schema Column Differences:');
    if (Object.keys(differences).length === 0) {
      console.log('ALL columns match 1-to-1 between SQLite and PostgreSQL!');
    } else {
      console.log(JSON.stringify(differences, null, 2));
    }

  } finally {
    pgClient.release();
    await pool.end();
    sqliteDb.close();
  }
}

compare().catch(err => {
  console.error(err);
  process.exit(1);
});
