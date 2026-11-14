import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/sales_distribution.db');

console.log('Connecting to database:', dbPath);
const db = new DatabaseSync(dbPath);


db.exec('PRAGMA foreign_keys = ON;');

// Execute migrations
console.log('Running Phase 12 schema migrations...');

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
`);

const categoryCols = db.prepare("PRAGMA table_info(categories)").all();
if (!categoryCols.some(c => c.name === 'description')) {
  db.exec("ALTER TABLE categories ADD COLUMN description TEXT;");
  console.log('Added description to categories');
}
if (!categoryCols.some(c => c.name === 'updated_at')) {
  db.exec("ALTER TABLE categories ADD COLUMN updated_at TEXT;");
  console.log('Added updated_at to categories');
}


const productCols = db.prepare("PRAGMA table_info(products)").all();
if (!productCols.some(c => c.name === 'brand_id')) {
  db.exec("ALTER TABLE products ADD COLUMN brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL;");
  console.log('Added brand_id to products');
}
if (!productCols.some(c => c.name === 'brand_name')) {
  db.exec("ALTER TABLE products ADD COLUMN brand_name TEXT;");
  console.log('Added brand_name to products');
}
if (!productCols.some(c => c.name === 'boxes_per_carton')) {
  db.exec("ALTER TABLE products ADD COLUMN boxes_per_carton INTEGER NOT NULL DEFAULT 1;");
  console.log('Added boxes_per_carton to products');
}
if (!productCols.some(c => c.name === 'pieces_per_box')) {
  db.exec("ALTER TABLE products ADD COLUMN pieces_per_box INTEGER NOT NULL DEFAULT 1;");
  console.log('Added pieces_per_box to products');
}
if (!productCols.some(c => c.name === 'total_pieces_per_carton')) {
  db.exec("ALTER TABLE products ADD COLUMN total_pieces_per_carton INTEGER NOT NULL DEFAULT 1;");
  console.log('Added total_pieces_per_carton to products');
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);`);

const soItemCols = db.prepare("PRAGMA table_info(sales_order_items)").all();
if (!soItemCols.some(c => c.name === 'boxes_count')) {
  db.exec("ALTER TABLE sales_order_items ADD COLUMN boxes_count INTEGER NOT NULL DEFAULT 0;");
  console.log('Added boxes_count to sales_order_items');
}

const siItemCols = db.prepare("PRAGMA table_info(sales_invoice_items)").all();
if (!siItemCols.some(c => c.name === 'boxes_count')) {
  db.exec("ALTER TABLE sales_invoice_items ADD COLUMN boxes_count INTEGER NOT NULL DEFAULT 0;");
  console.log('Added boxes_count to sales_invoice_items');
}

// Feature flags
const insertFlagStmt = db.prepare(`
  INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);

insertFlagStmt.run('inventory.enable_brand_management', 'inventory', 'true', 'Brand & Company Master Management', 'Enables creation, editing, and filtering of manufacturer brands and company principles.');
insertFlagStmt.run('inventory.enable_3tier_packaging', 'inventory', 'true', '3-Tier Flexible Packaging (Carton > Box > Piece)', 'Enables multi-tier packaging configuration per product with automatic conversion across inventory, sales, and purchase.');

console.log('Migrations completed successfully!');
db.close();
