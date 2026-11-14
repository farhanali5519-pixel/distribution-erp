import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);

  // Apply schema migrations
  const schemaContent = fs.readFileSync(
    path.join(process.cwd(), 'src', 'core', 'database', 'schema.ts'),
    'utf8'
  );
  
  // Run table creations
  db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        delivery_days TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
        id TEXT PRIMARY KEY,
        adjustment_number TEXT UNIQUE NOT NULL,
        adjustment_date TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity_base INTEGER NOT NULL,
        adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE')),
        unit_cost_paisas INTEGER NOT NULL DEFAULT 0,
        total_cost_paisas INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL,
        journal_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    );
  `);

  // Check columns in customers
  const custCols = db.prepare("PRAGMA table_info(customers)").all();
  const custColNames = new Set(custCols.map((c) => c.name));

  if (!custColNames.has('shop_name')) db.exec("ALTER TABLE customers ADD COLUMN shop_name TEXT;");
  if (!custColNames.has('cnic_or_ntn')) db.exec("ALTER TABLE customers ADD COLUMN cnic_or_ntn TEXT;");
  if (!custColNames.has('route_id')) db.exec("ALTER TABLE customers ADD COLUMN route_id TEXT;");
  if (!custColNames.has('credit_limit_paisas')) {
    db.exec("ALTER TABLE customers ADD COLUMN credit_limit_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE customers SET credit_limit_paisas = CAST(ROUND(credit_limit * 100) AS INTEGER);");
  }
  if (!custColNames.has('credit_days')) db.exec("ALTER TABLE customers ADD COLUMN credit_days INTEGER NOT NULL DEFAULT 0;");

  // Check columns in products
  const prodCols = db.prepare("PRAGMA table_info(products)").all();
  const prodColNames = new Set(prodCols.map((c) => c.name));

  if (!prodColNames.has('barcode')) db.exec("ALTER TABLE products ADD COLUMN barcode TEXT;");
  if (!prodColNames.has('category_id')) db.exec("ALTER TABLE products ADD COLUMN category_id TEXT;");
  if (!prodColNames.has('uom_base')) db.exec("ALTER TABLE products ADD COLUMN uom_base TEXT NOT NULL DEFAULT 'PIECE';");
  if (!prodColNames.has('uom_bulk')) db.exec("ALTER TABLE products ADD COLUMN uom_bulk TEXT NOT NULL DEFAULT 'CARTON';");
  if (!prodColNames.has('bulk_conversion_factor')) db.exec("ALTER TABLE products ADD COLUMN bulk_conversion_factor INTEGER NOT NULL DEFAULT 1;");
  if (!prodColNames.has('cost_price_paisas')) {
    db.exec("ALTER TABLE products ADD COLUMN cost_price_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE products SET cost_price_paisas = CAST(ROUND(cost_price * 100) AS INTEGER);");
  }
  if (!prodColNames.has('trade_price_paisas')) {
    db.exec("ALTER TABLE products ADD COLUMN trade_price_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE products SET trade_price_paisas = CAST(ROUND(selling_price * 100) AS INTEGER);");
  }
  if (!prodColNames.has('mrp_paisas')) {
    db.exec("ALTER TABLE products ADD COLUMN mrp_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE products SET mrp_paisas = CAST(ROUND(selling_price * 1.15 * 100) AS INTEGER);");
  }
  if (!prodColNames.has('current_stock_base')) {
    db.exec("ALTER TABLE products ADD COLUMN current_stock_base INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE products SET current_stock_base = CAST(ROUND(current_stock) AS INTEGER);");
  }
  if (!prodColNames.has('min_stock_alert')) db.exec("ALTER TABLE products ADD COLUMN min_stock_alert INTEGER DEFAULT 0;");

  // Seed categories & routes if missing
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)');
    for (const c of ['Beverages', 'Cooking Essentials', 'Packaged Foods', 'Snacks & Confectionery']) {
      insertCat.run(crypto.randomUUID(), c);
    }
  }

  const routeCount = db.prepare('SELECT COUNT(*) as count FROM routes').get();
  if (routeCount.count === 0) {
    const insertRoute = db.prepare('INSERT INTO routes (id, name, code, delivery_days) VALUES (?, ?, ?, ?)');
    insertRoute.run(crypto.randomUUID(), 'Route 1 - North Sector A', 'R-NORTH-A', JSON.stringify(['Monday', 'Thursday']));
    insertRoute.run(crypto.randomUUID(), 'Route 2 - Central Commercial Hub', 'R-CENTRAL', JSON.stringify(['Tuesday', 'Friday']));
  }

  console.log('Phase 2 migrations applied successfully.');
}
