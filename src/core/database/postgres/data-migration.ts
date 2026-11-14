import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { POSTGRES_CREATE_TABLES_SQL } from './schema';

const { Pool, Client } = pg;

// Register INT8 (BIGINT) parser to return numbers instead of strings for precision arithmetic
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => parseInt(val, 10));

export const MIGRATION_TABLE_ORDER = [
  // Level 0: Foundations & Catalogs
  'companies',
  'system_modules',
  'platform_users',
  'categories',
  'brands',

  // Level 1: Configuration & Tenant Meta
  'company_modules',
  'feature_flags',
  'app_settings',
  'company_profile',
  'chart_of_accounts',
  'system_license',
  'schema_migrations',

  // Level 2: Masters
  'bank_accounts',
  'vendors',
  'routes',
  'staff_members',
  'app_users',
  'customers',
  'products',
  'order_booker_sequences',

  // Level 3: Journal Headers & Lines
  'journal_entries',
  'journal_lines',

  // Level 4: Transactions
  'daily_closings',
  'sales_orders',
  'sales_order_items',
  'sales_invoices',
  'sales_invoice_items',
  'purchase_bills',
  'purchase_bill_items',
  'sales_returns',
  'sales_return_items',
  'purchase_returns',
  'purchase_return_items',
  'customer_payments',
  'customer_payment_allocations',
  'vendor_payments',
  'vendor_payment_allocations',
  'expenses',
  'stock_adjustments',
  'inventory_movements',
  'audit_logs',
];

export interface MigrationOptions {
  sqliteDbPath: string;
  postgresUrl: string;
  recreateSchema?: boolean;
  batchSize?: number;
}

export interface MigrationSummary {
  tablesMigrated: number;
  totalRecordsMigrated: number;
  tableCounts: Record<string, { sqlite: number; postgres: number; match: boolean }>;
  durationMs: number;
}

export class DataMigrationService {
  /**
   * Recreates target PostgreSQL test database from root connection
   */
  public static async resetPostgresDatabase(rootUrl: string, targetDbName: string): Promise<void> {
    const rootClient = new Client({ connectionString: rootUrl });
    await rootClient.connect();

    try {
      await rootClient.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid();
      `, [targetDbName]);

      await rootClient.query(`DROP DATABASE IF EXISTS "${targetDbName}";`);
      await rootClient.query(`CREATE DATABASE "${targetDbName}";`);
    } finally {
      await rootClient.end();
    }
  }

  /**
   * Performs full atomic data copy from SQLite to PostgreSQL
   */
  public static async migrateSqliteToPostgres(options: MigrationOptions): Promise<MigrationSummary> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 200;

    const sqliteDb = new DatabaseSync(options.sqliteDbPath);
    const isCloudOrSupabase =
      options.postgresUrl.includes('supabase') ||
      options.postgresUrl.includes('pooler') ||
      options.postgresUrl.includes('sslmode=require');
    const pool = new Pool({
      connectionString: options.postgresUrl,
      max: 2,
      ssl: isCloudOrSupabase ? { rejectUnauthorized: false } : undefined,
    });
    const pgClient = await pool.connect();

    const tableCounts: Record<string, { sqlite: number; postgres: number; match: boolean }> = {};
    let totalRecords = 0;

    try {
      if (options.recreateSchema) {
        await pgClient.query(POSTGRES_CREATE_TABLES_SQL);
      }

      await pgClient.query('BEGIN;');
      // Temporarily disable foreign key triggers during bulk insertion
      await pgClient.query("SET session_replication_role = 'replica';");

      // Clean existing baseline seeded rows to ensure exact SQLite UUIDs and records are loaded without conflict
      for (const t of [...MIGRATION_TABLE_ORDER].reverse()) {
        await pgClient.query(`DELETE FROM "${t}";`);
      }

      for (const tableName of MIGRATION_TABLE_ORDER) {
        // 1. Fetch SQLite rows
        const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all() as any[];
        const sqliteCount = rows.length;

        if (sqliteCount > 0) {
          const sampleRow = rows[0];
          const columns = Object.keys(sampleRow);
          const quotedColumns = columns.map(c => `"${c}"`).join(', ');

          // Batch insert into PostgreSQL
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const valueClauses: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            for (const row of batch) {
              const rowPlaceholders: string[] = [];
              for (const col of columns) {
                rowPlaceholders.push(`$${paramIdx++}`);
                params.push(row[col] === undefined ? null : row[col]);
              }
              valueClauses.push(`(${rowPlaceholders.join(', ')})`);
            }

            const insertSql = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${valueClauses.join(', ')}`;
            await pgClient.query(insertSql, params);
          }
        }

        // Verify count in PostgreSQL
        const pgCountRes = await pgClient.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        const postgresCount = parseInt(pgCountRes.rows[0].count, 10);

        const match = sqliteCount === postgresCount;
        tableCounts[tableName] = { sqlite: sqliteCount, postgres: postgresCount, match };

        if (!match) {
          throw new Error(`Count mismatch in table "${tableName}": SQLite=${sqliteCount}, Postgres=${postgresCount}`);
        }

        totalRecords += sqliteCount;
      }

      // Re-enable triggers and foreign keys
      await pgClient.query("SET session_replication_role = 'origin';");
      await pgClient.query('COMMIT;');

      return {
        tablesMigrated: MIGRATION_TABLE_ORDER.length,
        totalRecordsMigrated: totalRecords,
        tableCounts,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      await pgClient.query('ROLLBACK;');
      throw error;
    } finally {
      pgClient.release();
      await pool.end();
      sqliteDb.close();
    }
  }
}
