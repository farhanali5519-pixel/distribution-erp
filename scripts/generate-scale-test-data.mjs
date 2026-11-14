import pg from 'pg';
import { POSTGRES_CREATE_TABLES_SQL } from '../src/core/database/postgres/schema.ts';
import { DataMigrationService } from '../src/core/database/postgres/data-migration.ts';

const { Pool } = pg;
const PG_SCALE_DB = 'saleflow_scale_test';
const PG_SCALE_URL = `postgresql://postgres:postgres@localhost:5432/${PG_SCALE_DB}`;
const ROOT_PG_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

async function generateScaleData() {
  console.log('================================================================');
  console.log('   PHASE 6: SCALE SYNTHETIC TEST DATA GENERATOR');
  console.log('================================================================\n');
  console.log(`Target Database: ${PG_SCALE_DB} (Isolated PostgreSQL container)`);
  console.log('Live SQLite safety: ZERO contamination (SQLite untouched)\n');

  console.log('--- Step 0: Resetting Fresh Target Database ---');
  await DataMigrationService.resetPostgresDatabase(ROOT_PG_URL, PG_SCALE_DB);
  console.log(`Database "${PG_SCALE_DB}" reset to fresh clean state.\n`);

  const pool = new Pool({ connectionString: PG_SCALE_URL });

  try {
    console.log('--- Step 1: Initializing PostgreSQL Schema and Composite Indexes ---');
    await pool.query(POSTGRES_CREATE_TABLES_SQL);
    console.log('Schema & 40+ composite indexes ready.\n');

    console.log('--- Step 2: Seeding 5 Multi-Tenant Companies ---');
    const companies = [
      { id: '00000000-0000-0000-0000-000000000001', slug: 'main-corp', name: 'Main Enterprise Corp' },
      { id: '00000000-0000-0000-0000-000000000002', slug: 'alpha-dist', name: 'Alpha FMCG Distribution' },
      { id: '00000000-0000-0000-0000-000000000003', slug: 'beta-traders', name: 'Beta Wholesale Traders' },
      { id: '00000000-0000-0000-0000-000000000004', slug: 'gamma-bev', name: 'Gamma Beverages Ltd' },
      { id: '00000000-0000-0000-0000-000000000005', slug: 'delta-retail', name: 'Delta Retail Network' },
    ];

    for (const c of companies) {
      await pool.query(`
        INSERT INTO companies (id, slug, name, is_active, plan, status, max_users, max_warehouses, created_at, updated_at)
        VALUES ($1, $2, $3, 1, 'COMMERCIAL', 'ACTIVE', 50, 10, NOW()::text, NOW()::text)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
      `, [c.id, c.slug, c.name]);
    }
    console.log(`Seeded ${companies.length} companies.`);

    console.log('--- Step 3: Seeding Chart of Accounts for All Companies ---');
    const standardAccounts = [
      { code: '1010', name: 'Cash in Hand', type: 'ASSET', normal: 'DEBIT' },
      { code: '1020', name: 'Bank Accounts', type: 'ASSET', normal: 'DEBIT' },
      { code: '1030', name: 'Accounts Receivable (Customers)', type: 'ASSET', normal: 'DEBIT' },
      { code: '1040', name: 'Merchandise Inventory', type: 'ASSET', normal: 'DEBIT' },
      { code: '2010', name: 'Accounts Payable (Vendors)', type: 'LIABILITY', normal: 'CREDIT' },
      { code: '3010', name: 'Owner Capital', type: 'EQUITY', normal: 'CREDIT' },
      { code: '4010', name: 'Sales Revenue', type: 'INCOME', normal: 'CREDIT' },
      { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT' },
      { code: '5020', name: 'Operating Expenses', type: 'EXPENSE', normal: 'DEBIT' },
    ];

    for (const c of companies) {
      for (const acc of standardAccounts) {
        await pool.query(`
          INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, created_at, updated_at)
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 1, NOW()::text, NOW()::text)
          ON CONFLICT (company_id, code) DO NOTHING
        `, [c.id, acc.code, acc.name, acc.type, acc.normal]);
      }
    }
    console.log(`Seeded standard COA for all ${companies.length} companies.`);

    console.log('\n--- Step 4: Generating 10,000+ Synthetic Customers ---');
    const tCustStart = Date.now();
    for (const c of companies) {
      await pool.query(`
        INSERT INTO customers (
          id, company_id, name, shop_name, phone, city, credit_limit_paisas, credit_limit, balance, is_active,
          sync_status, version, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          'Customer ' || $2 || '-' || lpad(i::text, 5, '0'),
          'Store ' || $2 || '-' || lpad(i::text, 5, '0'),
          '0300' || lpad((1000000 + i)::text, 7, '0'),
          CASE (i % 5)
            WHEN 0 THEN 'Karachi'
            WHEN 1 THEN 'Lahore'
            WHEN 2 THEN 'Rawalpindi'
            WHEN 3 THEN 'Faisalabad'
            ELSE 'Multan'
          END,
          (50000 + (i % 200) * 1000) * 100,
          50000 + (i % 200) * 1000,
          0.00,
          1,
          'synced',
          1,
          (NOW() - (i || ' minutes')::interval)::text,
          (NOW() - (i || ' minutes')::interval)::text
        FROM generate_series(1, 2000) AS i
      `, [c.id, c.slug]);
    }
    console.log(`10,000 customers generated in ${Date.now() - tCustStart}ms.`);

    console.log('\n--- Step 5: Generating 2,500 Synthetic Products ---');
    const tProdStart = Date.now();
    for (const c of companies) {
      await pool.query(`
        INSERT INTO products (
          id, company_id, name, sku, barcode, cost_price_paisas, trade_price_paisas, 
          cost_price, selling_price, current_stock_base, current_stock, is_active,
          sync_status, version, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          'Product ' || $2 || '-' || lpad(i::text, 4, '0'),
          'SKU-' || $2 || '-' || lpad(i::text, 4, '0'),
          '896' || lpad((i * 137)::text, 9, '0'),
          (200 + (i % 50) * 10) * 100,
          (250 + (i % 50) * 12) * 100,
          200 + (i % 50) * 10,
          250 + (i % 50) * 12,
          1000 + (i % 500),
          1000 + (i % 500),
          1,
          'synced',
          1,
          NOW()::text,
          NOW()::text
        FROM generate_series(1, 500) AS i
      `, [c.id, c.slug]);
    }
    console.log(`2,500 products generated in ${Date.now() - tProdStart}ms.`);

    console.log('\n--- Step 6: Generating 100,000+ Sales Orders ---');
    const tOrderStart = Date.now();
    for (const c of companies) {
      console.log(`  Generating 20,000 sales orders for ${c.slug}...`);
      await pool.query(`
        WITH cust_sample AS (
          SELECT id, ROW_NUMBER() OVER () as rn
          FROM customers
          WHERE company_id = $1
        )
        INSERT INTO sales_orders (
          id, company_id, order_number, customer_id, order_date, subtotal_paisas, grand_total_paisas,
          subtotal, grand_total, status, source_channel, payment_status, sync_status, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          'SO-' || $2 || '-' || lpad(i::text, 7, '0'),
          cs.id,
          (CURRENT_DATE - ((i % 180) || ' days')::interval)::text,
          (5000 + (i % 100) * 250) * 100,
          (5000 + (i % 100) * 250) * 100,
          5000 + (i % 100) * 250,
          5000 + (i % 100) * 250,
          CASE (i % 4)
            WHEN 0 THEN 'PENDING'
            WHEN 1 THEN 'CONFIRMED'
            WHEN 2 THEN 'DELIVERED'
            ELSE 'POSTED'
          END,
          CASE (i % 3)
            WHEN 0 THEN 'MANUAL_ERP'
            WHEN 1 THEN 'MOBILE_BOOKER'
            ELSE 'VAN_SALE'
          END,
          CASE (i % 2) WHEN 0 THEN 'PAID' ELSE 'UNPAID' END,
          'SYNCED',
          (NOW() - ((i % 180) || ' days')::interval)::text,
          (NOW() - ((i % 180) || ' days')::interval)::text
        FROM generate_series(1, 20000) AS i
        JOIN cust_sample cs ON cs.rn = ((i - 1) % 2000) + 1
      `, [c.id, c.slug]);
    }
    console.log(`100,000 sales orders generated in ${Date.now() - tOrderStart}ms.`);

    console.log('\n--- Step 7: Generating 200,000+ Sales Order Items ---');
    const tItemStart = Date.now();
    for (const c of companies) {
      console.log(`  Generating 40,000 line items for ${c.slug}...`);
      await pool.query(`
        WITH ord_sample AS (
          SELECT id, ROW_NUMBER() OVER () as rn
          FROM sales_orders
          WHERE company_id = $1
        ),
        prod_sample AS (
          SELECT id, cost_price_paisas, trade_price_paisas, ROW_NUMBER() OVER () as rn
          FROM products
          WHERE company_id = $1
        )
        INSERT INTO sales_order_items (
          id, company_id, order_id, product_id, quantity_base,
          unit_price_paisas, unit_price, line_total_paisas, line_total, created_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          os.id,
          ps.id,
          (1 + (i % 10)) * 12,
          ps.trade_price_paisas,
          ps.trade_price_paisas / 100.0,
          ps.trade_price_paisas * (1 + (i % 10)),
          (ps.trade_price_paisas * (1 + (i % 10))) / 100.0,
          NOW()::text
        FROM generate_series(1, 40000) AS i
        JOIN ord_sample os ON os.rn = (((i - 1) / 2) + 1)
        JOIN prod_sample ps ON ps.rn = ((i - 1) % 500) + 1
      `, [c.id]);
    }
    console.log(`200,000 sales order items generated in ${Date.now() - tItemStart}ms.`);

    console.log('\n--- Step 8: Generating 100,000 Journal Entries & 200,000 Balanced Journal Lines ---');
    const tGlStart = Date.now();
    for (const c of companies) {
      console.log(`  Generating 20,000 journal entries and 40,000 lines for ${c.slug}...`);
      // First insert 20,000 journal entries
      await pool.query(`
        INSERT INTO journal_entries (
          id, company_id, entry_number, entry_date, description, source_module, status,
          total_amount_paisas, total_amount, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          'JE-' || $2 || '-' || lpad(i::text, 7, '0'),
          (CURRENT_DATE - ((i % 180) || ' days')::interval)::text,
          'Daily Sales Transaction #' || i,
          'sales',
          'POSTED',
          (2500 + (i % 100) * 100) * 100,
          2500 + (i % 100) * 100,
          (NOW() - ((i % 180) || ' days')::interval)::text,
          (NOW() - ((i % 180) || ' days')::interval)::text
        FROM generate_series(1, 20000) AS i
      `, [c.id, c.slug]);

      // Query account IDs for AR and Sales
      const arAcc = await pool.query(`SELECT id FROM chart_of_accounts WHERE company_id = $1 AND code = '1030'`, [c.id]);
      const revAcc = await pool.query(`SELECT id FROM chart_of_accounts WHERE company_id = $1 AND code = '4010'`, [c.id]);
      const arId = arAcc.rows[0]?.id;
      const revId = revAcc.rows[0]?.id;

      if (arId && revId) {
        // Insert Debit Lines (AR) linked to customers
        await pool.query(`
          WITH je_sample AS (
            SELECT id, ROW_NUMBER() OVER () as rn
            FROM journal_entries
            WHERE company_id = $1
          ),
          cust_sample AS (
            SELECT id, ROW_NUMBER() OVER () as rn
            FROM customers
            WHERE company_id = $1
          )
          INSERT INTO journal_lines (
            id, company_id, journal_id, account_id, entity_type, entity_id,
            debit_paisas, credit_paisas, debit, credit, memo, created_at
          )
          SELECT
            gen_random_uuid()::text,
            $1,
            je.id,
            $2,
            'CUSTOMER',
            cs.id,
            (2500 + (i % 100) * 100) * 100,
            0,
            2500 + (i % 100) * 100,
            0.00,
            'Customer invoice debit',
            NOW()::text
          FROM generate_series(1, 20000) AS i
          JOIN je_sample je ON je.rn = i
          JOIN cust_sample cs ON cs.rn = ((i - 1) % 2000) + 1
        `, [c.id, arId]);

        // Insert Credit Lines (Sales Revenue)
        await pool.query(`
          WITH je_sample AS (
            SELECT id, ROW_NUMBER() OVER () as rn
            FROM journal_entries
            WHERE company_id = $1
          )
          INSERT INTO journal_lines (
            id, company_id, journal_id, account_id, entity_type, entity_id,
            debit_paisas, credit_paisas, debit, credit, memo, created_at
          )
          SELECT
            gen_random_uuid()::text,
            $1,
            je.id,
            $2,
            NULL,
            NULL,
            0,
            (2500 + (i % 100) * 100) * 100,
            0.00,
            2500 + (i % 100) * 100,
            'Sales revenue credit',
            NOW()::text
          FROM generate_series(1, 20000) AS i
          JOIN je_sample je ON je.rn = i
        `, [c.id, revId]);
      }
    }
    console.log(`100,000 journal entries and 200,000 lines generated in ${Date.now() - tGlStart}ms.`);

    console.log('\n--- Step 9: Generating 200,000+ Inventory Movements ---');
    const tInvStart = Date.now();
    for (const c of companies) {
      console.log(`  Generating 40,000 inventory movements for ${c.slug}...`);
      await pool.query(`
        WITH prod_sample AS (
          SELECT id, name, sku, cost_price_paisas, ROW_NUMBER() OVER () as rn
          FROM products
          WHERE company_id = $1
        )
        INSERT INTO inventory_movements (
          id, company_id, movement_number, movement_date, movement_type,
          source_module, source_document_type, document_number, product_id, product_name, sku, warehouse,
          quantity_in_base, quantity_out_base, net_quantity_base, stock_before_base, stock_after_base,
          unit_cost_paisas, total_cost_paisas, status, day_close_status, created_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          'MOV-' || $2 || '-' || lpad(i::text, 7, '0'),
          (CURRENT_DATE - ((i % 180) || ' days')::interval)::text,
          CASE (i % 2) WHEN 0 THEN 'SALE' ELSE 'PURCHASE' END,
          CASE (i % 2) WHEN 0 THEN 'sales' ELSE 'purchase' END,
          CASE (i % 2) WHEN 0 THEN 'SALE_INVOICE' ELSE 'PURCHASE_BILL' END,
          'DOC-' || $2 || '-' || lpad(i::text, 7, '0'),
          ps.id,
          ps.name,
          ps.sku,
          'Main Warehouse',
          CASE (i % 2) WHEN 1 THEN (10 + (i % 50)) ELSE 0 END,
          CASE (i % 2) WHEN 0 THEN (5 + (i % 25)) ELSE 0 END,
          CASE (i % 2) WHEN 1 THEN (10 + (i % 50)) ELSE -(5 + (i % 25)) END,
          1000,
          1000 + (CASE (i % 2) WHEN 1 THEN (10 + (i % 50)) ELSE -(5 + (i % 25)) END),
          ps.cost_price_paisas,
          ps.cost_price_paisas * (5 + (i % 25)),
          'POSTED',
          'OPEN',
          (NOW() - ((i % 180) || ' days')::interval)::text
        FROM generate_series(1, 40000) AS i
        JOIN prod_sample ps ON ps.rn = ((i - 1) % 500) + 1
      `, [c.id, c.slug]);
    }
    console.log(`200,000 inventory movements generated in ${Date.now() - tInvStart}ms.`);

    console.log('\n--- Step 10: Generating 5,000 Audit Log Entries ---');
    for (const c of companies) {
      await pool.query(`
        INSERT INTO audit_logs (
          id, company_id, action, transaction_type, transaction_id, reason, created_at
        )
        SELECT
          gen_random_uuid()::text,
          $1,
          CASE (i % 3) WHEN 0 THEN 'CREATE' WHEN 1 THEN 'UPDATE' ELSE 'POST' END,
          CASE (i % 3) WHEN 0 THEN 'SALES_ORDER' WHEN 1 THEN 'CUSTOMER' ELSE 'INVENTORY_AUDIT' END,
          gen_random_uuid()::text,
          'System synthetic test audit entry',
          (NOW() - (i || ' minutes')::interval)::text
        FROM generate_series(1, 1000) AS i
      `, [c.id]);
    }
    console.log(`5,000 audit logs generated.`);

    console.log('\n--- Step 11: Compiling Optimizer Statistics (ANALYZE) ---');
    const tAnalyzeStart = Date.now();
    await pool.query('ANALYZE');
    console.log(`PostgreSQL ANALYZE completed in ${Date.now() - tAnalyzeStart}ms.`);

    // Summary Verification
    console.log('\n--- Final Scale Verification ---');
    const tables = ['companies', 'customers', 'products', 'sales_orders', 'sales_order_items', 'journal_entries', 'journal_lines', 'inventory_movements', 'audit_logs'];
    for (const t of tables) {
      const res = await pool.query(`SELECT COUNT(*) as cnt FROM "${t}"`);
      console.log(`  Table [${t}]: ${parseInt(res.rows[0].cnt, 10).toLocaleString()} rows`);
    }

    console.log('\n================================================================');
    console.log('   SCALE SYNTHETIC DATA GENERATION COMPLETE');
    console.log('================================================================\n');

  } finally {
    await pool.end();
  }
}

generateScaleData().catch((err) => {
  console.error('Scale data generation failed:', err);
  process.exit(1);
});
