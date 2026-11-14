import fs from 'node:fs';
import path from 'node:path';
import { runPostgresMigrations } from '../src/core/database/postgres/migrations';

function getSqliteStats() {
  const sqlitePath = path.resolve(process.cwd(), 'data', 'sales_distribution.db');
  if (fs.existsSync(sqlitePath)) {
    const stat = fs.statSync(sqlitePath);
    return {
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  }
  return { exists: false, size: 0, mtimeMs: 0 };
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
  const env = loadEnv();
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    console.error(JSON.stringify({ error: 'DATABASE_URL is not set in .env' }));
    process.exit(1);
  }

  const sqliteBefore = getSqliteStats();

  console.log('--- Step 1: Running canonical PostgreSQL migrations (First Run) ---');
  const result1 = await runPostgresMigrations(dbUrl);
  console.log('First Run Result:', JSON.stringify(result1));

  console.log('\n--- Step 2: Testing Idempotency (Second Run) ---');
  const result2 = await runPostgresMigrations(dbUrl);
  console.log('Second Run (Idempotent) Result:', JSON.stringify(result2));

  const sqliteAfter = getSqliteStats();
  const sqliteUntouched = (
    sqliteBefore.exists === sqliteAfter.exists &&
    sqliteBefore.size === sqliteAfter.size &&
    sqliteBefore.mtimeMs === sqliteAfter.mtimeMs
  );

  console.log('\n--- SQLite File Integrity Check ---');
  console.log('SQLite untouched:', sqliteUntouched);

  if (!sqliteUntouched) {
    console.error('ERROR: SQLite database was modified during migration!');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  // Never leak credentials in error output
  const safeErr = (err.message || String(err)).replace(/password=[^&\s]+/gi, 'password=***');
  console.error('Migration failed:', safeErr);
  if (err.stack) {
    console.error(err.stack.replace(/password=[^&\s]+/gi, 'password=***'));
  }
  process.exit(1);
});
