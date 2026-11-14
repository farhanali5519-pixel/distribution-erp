import type { DatabaseSync } from 'node:sqlite';

export type DatabaseDriver = 'sqlite' | 'postgres';
export type DatabaseIntent = 'write' | 'read' | 'primary';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint | string;
}

/**
 * Interface representing a transactional context.
 */
export interface ITransactionClient {
  /**
   * Run a query and return all matching rows.
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Run a query and return the first matching row or null.
   */
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;

  /**
   * Execute an INSERT, UPDATE, or DELETE query and return execution statistics.
   */
  execute(sql: string, params?: any[]): Promise<RunResult>;

  /**
   * Execute a raw SQL script (e.g. multi-statement DDL/migrations).
   */
  exec(sql: string): Promise<void>;
}

/**
 * Universal Database Client interface for both SQLite and PostgreSQL.
 */
export interface IDatabaseClient {
  /**
   * Active database driver identifier ('sqlite' | 'postgres').
   */
  readonly driver: DatabaseDriver;

  /**
   * Run an asynchronous query and return all rows.
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Run an asynchronous query and return the first row, or null if empty.
   */
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;

  /**
   * Execute an asynchronous mutation (INSERT/UPDATE/DELETE) and return statistics.
   */
  execute(sql: string, params?: any[]): Promise<RunResult>;

  /**
   * Execute raw multi-statement SQL strings.
   */
  exec(sql: string): Promise<void>;

  /**
   * Execute operations within an atomic transaction.
   * Commits if the callback resolves successfully, rolls back on exception.
   */
  transaction<T>(callback: (tx: ITransactionClient) => Promise<T>): Promise<T>;

  /**
   * Close the underlying connection pool or database handle.
   */
  close(): Promise<void>;

  /**
   * Returns true if the client connection is open and ready.
   */
  isConnected(): boolean;

  /**
   * Optional bridge to synchronous SQLite DatabaseSync instance for legacy services.
   */
  getSyncDb?(): DatabaseSync;

  /**
   * Optional synchronous query method when running under SQLite.
   */
  querySync?<T = any>(sql: string, params?: any[]): T[];

  /**
   * Optional synchronous queryOne method when running under SQLite.
   */
  queryOneSync?<T = any>(sql: string, params?: any[]): T | null;

  /**
   * Optional synchronous execute method when running under SQLite.
   */
  executeSync?(sql: string, params?: any[]): RunResult;

  /**
   * Optional synchronous exec method when running under SQLite.
   */
  execSync?(sql: string): void;
}
