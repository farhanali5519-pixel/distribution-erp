import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
const { Pool } = pg;

function getSqliteHash(filePath: string): { hash: string; size: number; mtime: string } {
  const stat = fs.statSync(filePath);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return { hash, size: stat.size, mtime: stat.mtime.toISOString() };
}

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

async function main() {
  const sqlitePath = path.resolve(process.cwd(), 'data', 'sales_distribution.db');
  const sqliteInfo = getSqliteHash(sqlitePath);
  console.log('SQLite File Info:');
  console.log(`- Path: ${sqlitePath}`);
  console.log(`- Size: ${sqliteInfo.size} bytes`);
  console.log(`- Modified: ${sqliteInfo.mtime}`);
  console.log(`- SHA-256: ${sqliteInfo.hash}\n`);

  // Open SQLite in read-only mode by inspecting tables
  const sqliteDb = new DatabaseSync(sqlitePath, { open: true });

  // Get all SQLite tables
  const sqliteTablesRes = sqliteDb.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
  `).all() as { name: string }[];
  const sqliteTables = sqliteTablesRes.map(t => t.name);

  const sqliteCounts: Record<string, number> = {};
  for (const t of sqliteTables) {
    const r = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${t}"`).get() as { count: number };
    sqliteCounts[t] = r.count;
  }

  // Connect to Supabase
  const env = loadEnv();
  const dbUrl = env.DATABASE_URL;
  const isCloudOrSupabase = 
    dbUrl.includes('supabase') || 
    dbUrl.includes('pooler') || 
    dbUrl.includes('sslmode=require');

  const pool = new Pool({
    connectionString: dbUrl,
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: isCloudOrSupabase ? { rejectUnauthorized: false } : undefined,
  });

  const pgClient = await pool.connect();
  try {
    const pgTablesRes = await pgClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const pgTables = pgTablesRes.rows.map(r => r.table_name);

    const pgCounts: Record<string, number> = {};
    for (const t of pgTables) {
      const r = await pgClient.query(`SELECT COUNT(*) as count FROM "${t}"`);
      pgCounts[t] = parseInt(r.rows[0].count, 10);
    }

    console.log('Table Row Counts Comparison (Preflight):');
    const allTableNames = Array.from(new Set([...sqliteTables, ...pgTables])).sort();
    console.log('| Table Name | SQLite Rows | Supabase Rows |');
    console.log('| :--- | :--- | :--- |');
    for (const t of allTableNames) {
      console.log(`| ${t} | ${sqliteCounts[t] ?? '(N/A)'} | ${pgCounts[t] ?? '(N/A)'} |`);
    }

    // Baseline Seeds Comparison
    console.log('\n--- Checking Baseline Seed Reconciliation ---');

    // 1. Companies
    const sqliteCompanies = sqliteDb.prepare('SELECT id, name, slug FROM companies').all() as any[];
    const pgCompanies = (await pgClient.query('SELECT id, name, slug FROM companies')).rows;
    console.log('Companies:');
    console.log('  SQLite:', JSON.stringify(sqliteCompanies));
    console.log('  Supabase:', JSON.stringify(pgCompanies));

    // 2. Platform Users
    const sqlitePlatformUsers = sqliteDb.prepare('SELECT id, username, role FROM platform_users').all() as any[];
    const pgPlatformUsers = (await pgClient.query('SELECT id, username, role FROM platform_users')).rows;
    console.log('Platform Users:');
    console.log('  SQLite:', JSON.stringify(sqlitePlatformUsers));
    console.log('  Supabase:', JSON.stringify(pgPlatformUsers));

    // 3. App Users
    const sqliteAppUsers = sqliteDb.prepare('SELECT id, username, role, company_id FROM app_users').all() as any[];
    const pgAppUsers = (await pgClient.query('SELECT id, username, role, company_id FROM app_users')).rows;
    console.log('App Users:');
    console.log('  SQLite count:', sqliteAppUsers.length);
    console.log('  Supabase count:', pgAppUsers.length);
    console.log('  Supabase app_users:', JSON.stringify(pgAppUsers));

    // 4. Chart of Accounts
    const sqliteCoa = sqliteDb.prepare('SELECT id, code, name, company_id FROM chart_of_accounts ORDER BY code').all() as any[];
    const pgCoa = (await pgClient.query('SELECT id, code, name, company_id FROM chart_of_accounts ORDER BY code')).rows;
    console.log('Chart of Accounts:');
    console.log('  SQLite count:', sqliteCoa.length);
    console.log('  Supabase count:', pgCoa.length);

    // Check COA code match
    const sqliteCoaCodes = new Map(sqliteCoa.map(c => [c.code, c.id]));
    const pgCoaCodes = new Map(pgCoa.map(c => [c.code, c.id]));
    let coaIdMatches = 0;
    let coaIdMismatches = 0;
    for (const [code, pgId] of pgCoaCodes.entries()) {
      const sqliteId = sqliteCoaCodes.get(code);
      if (sqliteId === pgId) coaIdMatches++;
      else {
        coaIdMismatches++;
        console.log(`  COA mismatch for code ${code}: SQLite id=${sqliteId}, Supabase id=${pgId}`);
      }
    }
    console.log(`  COA ID matches: ${coaIdMatches}, mismatches: ${coaIdMismatches}`);

    // 5. System Modules
    const sqliteModules = sqliteDb.prepare('SELECT id, name FROM system_modules').all() as any[];
    const pgModules = (await pgClient.query('SELECT id, name FROM system_modules')).rows;
    console.log('System Modules:');
    console.log('  SQLite count:', sqliteModules.length, 'Supabase count:', pgModules.length);

    // 6. Company Profile
    const sqliteProfile = sqliteDb.prepare('SELECT id, company_id, business_name FROM company_profile').all() as any[];
    const pgProfile = (await pgClient.query('SELECT id, company_id, business_name FROM company_profile')).rows;
    console.log('Company Profile:');
    console.log('  SQLite:', JSON.stringify(sqliteProfile));
    console.log('  Supabase:', JSON.stringify(pgProfile));

  } finally {
    pgClient.release();
    await pool.end();
    sqliteDb.close();
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
