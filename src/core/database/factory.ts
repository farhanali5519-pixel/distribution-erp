import { IDatabaseClient, DatabaseIntent } from './types';
import { SqliteAdapter } from './adapters/sqlite.adapter';
import { PostgresAdapter } from './adapters/postgres.adapter';
import { getAppConfig } from '../config/env';
import { getDatabase } from './db';

declare global {
  // eslint-disable-next-line no-var
  var __app_dal_client__: IDatabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __app_dal_read_client__: IDatabaseClient | undefined;
}

/**
 * Returns the active Database Abstraction Layer client singleton,
 * selected based on the DATABASE_DRIVER environment variable ('sqlite' | 'postgres').
 *
 * Supports Read-Replica routing readiness (Phase 6 Architecture):
 * - intent 'write' or 'primary': returns primary connection (for all writes and critical immediate reads)
 * - intent 'read': returns read-replica connection if DATABASE_READ_URL is configured;
 *   otherwise gracefully falls back to the primary connection.
 */
export function getDatabaseClient(intent: DatabaseIntent = 'write'): IDatabaseClient {
  const config = getAppConfig();

  // STRICT Cloud / PostgreSQL mode: NEVER fallback to SQLite
  if (config.deploymentMode === 'cloud' || config.databaseDriver === 'postgres') {
    if (intent === 'read' && config.databaseReadUrl) {
      if (global.__app_dal_read_client__) {
        return global.__app_dal_read_client__;
      }
      try {
        const readClient = new PostgresAdapter(config.databaseReadUrl);
        global.__app_dal_read_client__ = readClient;
        return readClient;
      } catch (err: any) {
        throw new Error(`Failed to initialize PostgreSQL read replica adapter: ${err.message}`);
      }
    }

    if (global.__app_dal_client__) {
      return global.__app_dal_client__;
    }

    if (!config.databaseUrl) {
      throw new Error(
        'PostgreSQL connection URL is missing. Set DATABASE_URL in environment when DEPLOYMENT_MODE=cloud or DATABASE_DRIVER=postgres.'
      );
    }

    try {
      const client = new PostgresAdapter(config.databaseUrl);
      global.__app_dal_client__ = client;
      return client;
    } catch (err: any) {
      throw new Error(`Failed to initialize PostgreSQL adapter in cloud mode: ${err.message}`);
    }
  }

  // STRICT On-Premise SQLite mode
  if (intent === 'read' && global.__app_dal_read_client__) {
    return global.__app_dal_read_client__;
  }
  if (global.__app_dal_client__) {
    return global.__app_dal_client__;
  }

  // Default: SQLite driver using existing node:sqlite handle with initialization
  const syncDb = getDatabase();
  const client = new SqliteAdapter(syncDb);
  global.__app_dal_client__ = client;
  return client;
}

/**
 * Explicit helper to obtain the Primary / Write database client.
 */
export function getPrimaryDatabaseClient(): IDatabaseClient {
  return getDatabaseClient('primary');
}

/**
 * Explicit helper to obtain the Read database client (routes to read replica if configured).
 */
export function getReadDatabaseClient(): IDatabaseClient {
  return getDatabaseClient('read');
}

/**
 * Closes the active DAL client(s) and clears global singletons.
 */
export async function closeDatabaseClient(): Promise<void> {
  if (global.__app_dal_read_client__) {
    await global.__app_dal_read_client__.close();
    global.__app_dal_read_client__ = undefined;
  }
  if (global.__app_dal_client__) {
    await global.__app_dal_client__.close();
    global.__app_dal_client__ = undefined;
  }
}
