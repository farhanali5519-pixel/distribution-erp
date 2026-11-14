import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES_SQL, applyRefactorMigrations } from './schema';
import { seedInitialData } from './seed';
import { getAppConfig, isBuildPhase } from '../config/env';
import { appLog } from '../logging/logger';

// Singleton instance to prevent multiple connections during Next.js hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __app_sqlite_db__: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __app_sqlite_initializing__: boolean | undefined;
}

/**
 * Returns the resolved path to the SQLite database file,
 * centralized via environment configuration (SQLITE_DATABASE_PATH).
 */
export function getDatabasePath(): string {
  const config = getAppConfig();
  if (config.deploymentMode === 'cloud' || config.databaseDriver === 'postgres') {
    throw new Error('SQLite database path is not available in Cloud/PostgreSQL mode.');
  }
  return config.sqliteDatabasePath;
}

/**
 * Closes the active synchronous SQLite database handle and clears singletons.
 */
export function closeDatabase(): void {
  if (global.__app_sqlite_db__) {
    try {
      try {
        global.__app_sqlite_db__.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {}
      global.__app_sqlite_db__.close();
      appLog.info('DATABASE', 'Closed SQLite database handle cleanly');
    } catch (e) {
      appLog.warn('DATABASE', 'Warning when closing database', { error: String(e) });
    }
    global.__app_sqlite_db__ = undefined;
    global.__app_sqlite_initializing__ = false;
  }
}

/**
 * Preserved backward compatibility accessor:
 * Returns the active node:sqlite DatabaseSync instance for all existing synchronous ERP services.
 * Strictly prohibited in Cloud / PostgreSQL mode and build phase.
 */
export function getDatabase(): DatabaseSync {
  const config = getAppConfig();
  if (config.deploymentMode === 'cloud' || config.databaseDriver === 'postgres') {
    throw new Error(
      'Direct SQLite database access (getDatabase) is prohibited in Cloud/PostgreSQL mode. Use getDatabaseClient() / DalService instead.'
    );
  }

  // Strictly guard against opening or mutating SQLite during Next.js build
  if (isBuildPhase()) {
    throw new Error(
      '[DATABASE SAFETY] SQLite database initialization is prohibited during Next.js build phase. ' +
      'Database operations are strictly reserved for runtime startup.'
    );
  }

  if (global.__app_sqlite_db__) {
    return global.__app_sqlite_db__;
  }

  // Prevent race conditions within the same Node process during startup
  if (global.__app_sqlite_initializing__) {
    if (global.__app_sqlite_db__) return global.__app_sqlite_db__;
  }
  global.__app_sqlite_initializing__ = true;

  try {
    const dbPath = getDatabasePath();
    appLog.info('DATABASE', `Connecting to SQLite database: ${dbPath}`);

    // Safety check for Hostinger mode: prevent unintended creation of blank database if file doesn't exist
    if (config.deploymentMode === 'hostinger' && !fs.existsSync(dbPath) && process.env.SQLITE_ALLOW_CREATE !== 'true') {
      throw new Error(
        `[DATABASE SAFETY] SQLite database file not found at: "${dbPath}". ` +
        `To protect business data from accidental empty database initialization on Hostinger, please upload your database file to this location or set SQLITE_ALLOW_CREATE=true.`
      );
    }

    // Ensure parent directory exists and is writable for DB + WAL + SHM files
    const parentDir = path.dirname(dbPath);
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });
      } catch (err: any) {
        appLog.error('DATABASE', `Cannot create parent directory for SQLite at: ${parentDir}`, err);
      }
    }

    let db: DatabaseSync;
    try {
      db = new DatabaseSync(dbPath);
    } catch (err: any) {
      appLog.error('DATABASE', `Failed to open SQLite database at: ${dbPath}`, err);
      throw err;
    }

    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 15000;');
    } catch (err: any) {
      appLog.warn('DATABASE', 'Could not set WAL or busy_timeout', { error: err.message });
    }

    // Execute initialization DDL
    try {
      db.exec(CREATE_TABLES_SQL);
    } catch (err: any) {
      appLog.error('DATABASE', 'Failed executing base schema DDL', err);
      throw err;
    }

    // Apply schema upgrades/migrations if updating existing DB
    try {
      applyRefactorMigrations(db);
    } catch (err: any) {
      appLog.error('DATABASE', 'Failed executing refactor migrations', err);
    }

    // Apply official versioned migrations (1.0.0, 1.0.1, 1.1.0, etc.)
    try {
      const { MigrationRunner } = require('./migration-runner');
      MigrationRunner.runPendingMigrations(db);
    } catch (e: any) {
      appLog.warn('DATABASE', `Migration runner notification: ${e?.message || e}`);
    }

    // Seed default Chart of Accounts and modules if empty
    try {
      seedInitialData(db);
    } catch (err: any) {
      appLog.error('DATABASE', 'Failed seeding initial data', err);
    }

    global.__app_sqlite_db__ = db;
    return db;
  } finally {
    global.__app_sqlite_initializing__ = false;
  }
}
