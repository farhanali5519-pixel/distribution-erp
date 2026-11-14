import { Pool, PoolClient, PoolConfig, types } from 'pg';
import { IDatabaseClient, ITransactionClient, RunResult, DatabaseDriver } from '../types';
import { getAppConfig } from '../../config/env';
import { 
  translateSqlPlaceholders, 
  translateSqlToPostgres, 
  isPragmaQuery, 
  handlePragmaQuery 
} from '../dialect';

// Re-export for backward compatibility with Phase 2B test suite
export { translateSqlPlaceholders, translateSqlToPostgres };

// Configure PostgreSQL BIGINT (OID 20) and NUMERIC (OID 1700) parser to return numbers for exact paisa math
types.setTypeParser(types.builtins.INT8, (val: string) => {
  if (val === null || val === undefined) return null;
  return parseInt(val, 10);
});
types.setTypeParser(types.builtins.NUMERIC, (val: string) => {
  if (val === null || val === undefined) return null;
  return parseFloat(val);
});

class PostgresTransactionClient implements ITransactionClient {
  private client: PoolClient;
  constructor(client: PoolClient) {
    this.client = client;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (isPragmaQuery(sql)) {
      const pragma = handlePragmaQuery(sql);
      return pragma.result as T[];
    }
    const text = translateSqlToPostgres(sql);
    const result = await this.client.query(text, params);
    return result.rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  public async execute(sql: string, params: any[] = []): Promise<RunResult> {
    if (isPragmaQuery(sql)) {
      return { changes: 0 };
    }
    const text = translateSqlToPostgres(sql);
    const result = await this.client.query(text, params);
    return {
      changes: result.rowCount ?? 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    if (isPragmaQuery(sql)) return;
    const text = translateSqlToPostgres(sql);
    await this.client.query(text);
  }
}

/**
 * PostgreSQL Database Adapter (Phase 4A DAL Architecture)
 * Provides pooled connection handling, transaction management, automatic parameter translation,
 * and seamless SQL dialect adaptation.
 */
export class PostgresAdapter implements IDatabaseClient {
  public readonly driver: DatabaseDriver = 'postgres';
  private pool: Pool | null = null;
  private connectionString?: string;
  private closed = false;

  constructor(configOrUrl?: string | PoolConfig) {
    if (typeof configOrUrl === 'string') {
      this.connectionString = configOrUrl;
    } else if (configOrUrl) {
      this.pool = new Pool(configOrUrl);
    } else {
      this.connectionString = getAppConfig().databaseUrl;
    }
  }

  private getPool(): Pool {
    if (this.closed) throw new Error('PostgresAdapter has been closed');
    if (!this.pool) {
      const url = this.connectionString || getAppConfig().databaseUrl;
      if (!url) {
        throw new Error(
          'PostgreSQL connection URL is missing. Set DATABASE_URL in environment when DATABASE_DRIVER=postgres.'
        );
      }
      const poolDefaults = getAppConfig();
      const isCloudOrSupabase =
        poolDefaults.deploymentMode === 'cloud' ||
        url.includes('supabase') ||
        url.includes('pooler') ||
        url.includes('sslmode=require') ||
        process.env.DATABASE_SSL === 'true';
      const isSslExplicitlyDisabled = url.includes('sslmode=disable') || process.env.DATABASE_SSL === 'false';

      this.pool = new Pool({
        connectionString: url,
        max: poolDefaults.dbPoolMax,
        idleTimeoutMillis: poolDefaults.dbPoolIdleTimeout,
        connectionTimeoutMillis: poolDefaults.dbPoolConnectionTimeout,
        ssl: isSslExplicitlyDisabled ? false : (isCloudOrSupabase ? { rejectUnauthorized: false } : undefined),
      });
    }
    return this.pool;
  }

  public getPoolStats(): { totalCount: number; idleCount: number; waitingCount: number } {
    if (!this.pool) return { totalCount: 0, idleCount: 0, waitingCount: 0 };
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (isPragmaQuery(sql)) {
      const pragma = handlePragmaQuery(sql);
      return pragma.result as T[];
    }
    const pool = this.getPool();
    const text = translateSqlToPostgres(sql);
    const res = await pool.query(text, params);
    return res.rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  public async execute(sql: string, params: any[] = []): Promise<RunResult> {
    if (isPragmaQuery(sql)) {
      return { changes: 0 };
    }
    const pool = this.getPool();
    const text = translateSqlToPostgres(sql);
    const res = await pool.query(text, params);
    return {
      changes: res.rowCount ?? 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    if (isPragmaQuery(sql)) return;
    const pool = this.getPool();
    const text = translateSqlToPostgres(sql);
    await pool.query(text);
  }

  public async transaction<T>(callback: (tx: ITransactionClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresTransactionClient(client);
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool && !this.closed) {
      await this.pool.end();
    }
    this.closed = true;
  }

  public isConnected(): boolean {
    return !this.closed && this.pool !== null;
  }
}
