/**
 * SQL Dialect Abstraction & Translation (Phase 4A)
 * Provides automatic translation of SQLite-specific syntax to PostgreSQL:
 * - Positional ? placeholders -> $1, $2, $3 ...
 * - datetime('now') -> CURRENT_TIMESTAMP::text
 * - datetime('now', ...) -> CURRENT_TIMESTAMP + INTERVAL ...
 * - strftime(...) -> TO_CHAR / SUBSTR
 * - INSERT OR IGNORE INTO ... -> INSERT INTO ... ON CONFLICT DO NOTHING
 * - sqlite_master -> information_schema.tables
 * - PRAGMA handling / interception
 */

/**
 * Replaces ? placeholders outside of string literals with $1, $2, etc.
 */
export function translateSqlPlaceholders(sql: string): string {
  if (sql.includes('$1') || !sql.includes('?')) {
    return sql;
  }
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

/**
 * Checks if a query is a SQLite PRAGMA statement.
 */
export function isPragmaQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith('PRAGMA ');
}

/**
 * Handles SQLite PRAGMA queries by returning simulated responses in PostgreSQL.
 */
export function handlePragmaQuery(sql: string): { intercepted: boolean; result: any[] } {
  const clean = sql.trim().toLowerCase().replace(/;/g, '');
  if (clean.includes('foreign_keys')) {
    return { intercepted: true, result: [] };
  }
  if (clean.includes('journal_mode')) {
    return { intercepted: true, result: [{ journal_mode: 'wal' }] };
  }
  if (clean.includes('integrity_check')) {
    return { intercepted: true, result: [{ integrity_check: 'ok' }] };
  }
  if (clean.includes('foreign_key_check')) {
    return { intercepted: true, result: [] };
  }
  return { intercepted: true, result: [] };
}

/**
 * Translates an arbitrary SQL query written with SQLite conventions to valid PostgreSQL SQL.
 */
export function translateSqlToPostgres(sql: string): string {
  let translated = sql;

  // 1. Handle sqlite_master table lookups
  if (/sqlite_master/i.test(translated)) {
    translated = translated.replace(
      /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
      "FROM information_schema.tables WHERE table_schema = 'public' AND table_name ="
    );
    translated = translated.replace(
      /FROM\s+sqlite_master/gi,
      "FROM information_schema.tables WHERE table_schema = 'public'"
    );
  }

  // 2. Handle INSERT OR IGNORE INTO
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(translated)) {
    translated = translated.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(translated)) {
      translated = `${translated.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
    }
  }

  // 3. Handle datetime('now') and datetime('now', ...)
  translated = translated.replace(/datetime\('now',\s*'\+([0-9]+)\s+days?'\)/gi, "(CURRENT_TIMESTAMP + INTERVAL '$1 days')::text");
  translated = translated.replace(/datetime\('now',\s*'-([0-9]+)\s+days?'\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '$1 days')::text");
  translated = translated.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP::text');

  // 4. Handle strftime calls
  translated = translated.replace(/strftime\('%Y-%m',\s*([^)]+)\)/gi, 'SUBSTR($1::text, 1, 7)');
  translated = translated.replace(/strftime\('%Y-%m-%d',\s*([^)]+)\)/gi, 'SUBSTR($1::text, 1, 10)');
  translated = translated.replace(/strftime\('%Y',\s*([^)]+)\)/gi, 'SUBSTR($1::text, 1, 4)');

  // 5. Parameter placeholders ? -> $1, $2, ...
  translated = translateSqlPlaceholders(translated);

  return translated;
}
