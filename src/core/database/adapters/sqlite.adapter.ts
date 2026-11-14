import { DatabaseSync } from 'node:sqlite';
import { IDatabaseClient, ITransactionClient, RunResult, DatabaseDriver } from '../types';

export class SqliteAdapter implements IDatabaseClient, ITransactionClient {
  public readonly driver: DatabaseDriver = 'sqlite';
  private db: DatabaseSync;
  private closed = false;

  constructor(databaseOrPath: DatabaseSync | string) {
    if (typeof databaseOrPath === 'string') {
      this.db = new DatabaseSync(databaseOrPath);
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA busy_timeout = 15000;');
      } catch {}
    } else {
      this.db = databaseOrPath;
    }
  }

  // --- Asynchronous Universal DAL Interface ---

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.querySync<T>(sql, params);
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return this.queryOneSync<T>(sql, params);
  }

  public async execute(sql: string, params: any[] = []): Promise<RunResult> {
    return this.executeSync(sql, params);
  }

  public async exec(sql: string): Promise<void> {
    this.execSync(sql);
  }

  public async transaction<T>(callback: (tx: ITransactionClient) => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('Cannot start transaction on closed SQLite database');
    const savepointId = `dal_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db.exec(`SAVEPOINT ${savepointId};`);

    try {
      const result = await callback(this);
      this.db.exec(`RELEASE SAVEPOINT ${savepointId};`);
      return result;
    } catch (error) {
      try {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointId};`);
        this.db.exec(`RELEASE SAVEPOINT ${savepointId};`);
      } catch {
        // Suppress rollback errors if savepoint state is already invalid
      }
      throw error;
    }
  }

  // --- Synchronous Methods for On-Premise SQLite Callers ---

  public querySync<T = any>(sql: string, params: any[] = []): T[] {
    if (this.closed) throw new Error('Cannot query closed SQLite database');
    const stmt = this.db.prepare(sql);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows as T[];
  }

  public queryOneSync<T = any>(sql: string, params: any[] = []): T | null {
    if (this.closed) throw new Error('Cannot query closed SQLite database');
    const stmt = this.db.prepare(sql);
    const row = params.length > 0 ? stmt.get(...params) : stmt.get();
    return (row as T) ?? null;
  }

  public executeSync(sql: string, params: any[] = []): RunResult {
    if (this.closed) throw new Error('Cannot execute query on closed SQLite database');
    const stmt = this.db.prepare(sql);
    const result = params.length > 0 ? stmt.run(...params) : stmt.run();
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  public execSync(sql: string): void {
    if (this.closed) throw new Error('Cannot execute DDL on closed SQLite database');
    this.db.exec(sql);
  }

  public transactionSync<T>(callback: (tx: SqliteAdapter) => T): T {
    if (this.closed) throw new Error('Cannot start transaction on closed SQLite database');
    const savepointId = `dal_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db.exec(`SAVEPOINT ${savepointId};`);

    try {
      const result = callback(this);
      this.db.exec(`RELEASE SAVEPOINT ${savepointId};`);
      return result;
    } catch (error) {
      try {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointId};`);
        this.db.exec(`RELEASE SAVEPOINT ${savepointId};`);
      } catch {
        // Suppress rollback errors
      }
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (!this.closed) {
      try {
        this.db.close();
      } finally {
        this.closed = true;
      }
    }
  }

  public isConnected(): boolean {
    return !this.closed;
  }

  /**
   * Exposes the underlying synchronous DatabaseSync connection
   * for backward compatibility with existing synchronous modules.
   */
  public getSyncDb(): DatabaseSync {
    return this.db;
  }
}
