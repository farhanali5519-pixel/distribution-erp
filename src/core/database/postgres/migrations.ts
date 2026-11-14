import { Pool } from 'pg';
import { POSTGRES_CREATE_TABLES_SQL } from './schema';
import { seedPostgresInitialData } from './seed';
import { IDatabaseClient } from '../types';

const POSTGRES_UPGRADE_SQL = `
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "tax" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "net_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "subtotal_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "tax_amount_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "discount_amount_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "net_amount_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "paid_amount_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "remaining_balance_paisas" BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "remaining_balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
  ALTER TABLE "purchase_bills" ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'UNPAID';

  UPDATE "purchase_bills" 
  SET "subtotal_paisas" = (
    SELECT COALESCE(SUM(gross_amount_paisas), 0) 
    FROM "purchase_bill_items" 
    WHERE "purchase_bill_items".bill_id = "purchase_bills".id
  )
  WHERE "subtotal_paisas" = 0 
    AND (SELECT COUNT(*) FROM "purchase_bill_items" WHERE "purchase_bill_items".bill_id = "purchase_bills".id) > 0;

  UPDATE "purchase_bills" 
  SET "subtotal" = ROUND(("subtotal_paisas" / 100.0)::numeric, 2) 
  WHERE ("subtotal" = 0.00 OR "subtotal" IS NULL) AND "subtotal_paisas" > 0;

  UPDATE "purchase_bills" 
  SET "tax_amount_paisas" = (
    SELECT COALESCE(SUM(tax_paisas), 0) 
    FROM "purchase_bill_items" 
    WHERE "purchase_bill_items".bill_id = "purchase_bills".id
  )
  WHERE "tax_amount_paisas" = 0 
    AND (SELECT COUNT(*) FROM "purchase_bill_items" WHERE "purchase_bill_items".bill_id = "purchase_bills".id) > 0;

  UPDATE "purchase_bills" 
  SET "tax" = ROUND(("tax_amount_paisas" / 100.0)::numeric, 2) 
  WHERE ("tax" = 0.00 OR "tax" IS NULL) AND "tax_amount_paisas" > 0;

  UPDATE "purchase_bills" 
  SET "discount_amount_paisas" = (
    SELECT COALESCE(SUM(discount_paisas), 0) 
    FROM "purchase_bill_items" 
    WHERE "purchase_bill_items".bill_id = "purchase_bills".id
  )
  WHERE "discount_amount_paisas" = 0 
    AND (SELECT COUNT(*) FROM "purchase_bill_items" WHERE "purchase_bill_items".bill_id = "purchase_bills".id) > 0;

  UPDATE "purchase_bills" 
  SET "discount" = ROUND(("discount_amount_paisas" / 100.0)::numeric, 2) 
  WHERE ("discount" = 0.00 OR "discount" IS NULL) AND "discount_amount_paisas" > 0;

  UPDATE "purchase_bills" 
  SET "remaining_balance_paisas" = "net_amount_paisas", 
      "remaining_balance" = "net_amount" 
  WHERE ("remaining_balance_paisas" = 0 OR "remaining_balance" = 0.00) 
    AND "paid_amount_paisas" = 0 
    AND "net_amount_paisas" > 0;
`;

/**
 * Initializes and validates PostgreSQL schema and baseline data.
 * Executes within an atomic transaction or multi-statement DDL execution.
 */
export async function runPostgresMigrations(connectionOrPool: Pool | IDatabaseClient | string): Promise<{ success: boolean; tablesCreated: number }> {
  let pool: Pool;
  let shouldClosePool = false;

  if (typeof connectionOrPool === 'string') {
    const isCloudOrSupabase =
      connectionOrPool.includes('supabase') ||
      connectionOrPool.includes('pooler') ||
      connectionOrPool.includes('sslmode=require') ||
      process.env.DATABASE_SSL === 'true';
    const isSslDisabled = connectionOrPool.includes('sslmode=disable') || process.env.DATABASE_SSL === 'false';
    pool = new Pool({
      connectionString: connectionOrPool,
      ssl: isSslDisabled ? false : (isCloudOrSupabase ? { rejectUnauthorized: false } : undefined),
    });
    shouldClosePool = true;
  } else if ('driver' in connectionOrPool && connectionOrPool.driver === 'postgres') {
    await connectionOrPool.exec(POSTGRES_CREATE_TABLES_SQL);
    await connectionOrPool.exec(POSTGRES_UPGRADE_SQL);
    await seedPostgresInitialData(connectionOrPool);
    await connectionOrPool.exec(`
      INSERT INTO schema_migrations (id, version, name, batch, applied_at)
      VALUES 
        ('mig-1.0.0', '1.0.0', 'initial_multi_tenant_foundation', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.0.1', '1.0.1', 'commercial_licensing_and_audit', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.1.0', '1.1.0', 'commercial_onpremise_hardening', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.1.1', '1.1.1', 'purchase_bills_schema_parity', 1, CURRENT_TIMESTAMP::text)
      ON CONFLICT (version) DO NOTHING;
    `);
    return { success: true, tablesCreated: 41 };
  } else if (connectionOrPool instanceof Pool) {
    pool = connectionOrPool;
  } else {
    throw new Error('Unsupported connection type passed to runPostgresMigrations');
  }

  const client = await pool.connect();
  try {
    // 1. Execute DDL
    await client.query(POSTGRES_CREATE_TABLES_SQL);

    // 2. Execute Upgrades & Parity Migrations
    await client.query(POSTGRES_UPGRADE_SQL);

    // 3. Check if companies table is empty; if so, seed baseline data
    const res = await client.query('SELECT COUNT(*) as count FROM companies');
    const count = parseInt(res.rows[0].count, 10);
    if (count === 0) {
      await seedPostgresInitialData(client);
    }

    // 4. Record canonical migration versions into schema_migrations
    await client.query(`
      INSERT INTO schema_migrations (id, version, name, batch, applied_at)
      VALUES 
        ('mig-1.0.0', '1.0.0', 'initial_multi_tenant_foundation', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.0.1', '1.0.1', 'commercial_licensing_and_audit', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.1.0', '1.1.0', 'commercial_onpremise_hardening', 1, CURRENT_TIMESTAMP::text),
        ('mig-1.1.1', '1.1.1', 'purchase_bills_schema_parity', 1, CURRENT_TIMESTAMP::text)
      ON CONFLICT (version) DO NOTHING;
    `);

    return { success: true, tablesCreated: 41 };
  } finally {
    client.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}
