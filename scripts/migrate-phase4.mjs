import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const dbPath = 'data/sales_distribution.db';
console.log(`Connecting to database at ${dbPath}...`);
const db = new DatabaseSync(dbPath);

// 1. Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company_name TEXT,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      cnic_or_ntn TEXT,
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_bills (
      id TEXT PRIMARY KEY,
      bill_number TEXT UNIQUE NOT NULL,
      vendor_id TEXT NOT NULL,
      bill_date TEXT NOT NULL,
      due_date TEXT,
      warehouse TEXT NOT NULL DEFAULT 'Main Warehouse',
      broker TEXT,
      vendor_invoice_number TEXT NOT NULL,
      reference_number TEXT,
      freight_treatment TEXT NOT NULL DEFAULT 'LANDED_COST' CHECK (freight_treatment IN ('LANDED_COST', 'DIRECT_EXPENSE', 'NONE')),
      freight_amount_paisas INTEGER NOT NULL DEFAULT 0,
      freight_amount REAL NOT NULL DEFAULT 0.00,
      subtotal_paisas INTEGER NOT NULL DEFAULT 0,
      tax_amount_paisas INTEGER NOT NULL DEFAULT 0,
      discount_amount_paisas INTEGER NOT NULL DEFAULT 0,
      net_amount_paisas INTEGER NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0.00,
      tax REAL NOT NULL DEFAULT 0.00,
      discount REAL NOT NULL DEFAULT 0.00,
      net_amount REAL NOT NULL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
      journal_id TEXT,
      notes TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
      FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS purchase_bill_items (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      item_reference TEXT,
      batch_number TEXT,
      expiry_date TEXT,
      cartons_qty INTEGER NOT NULL DEFAULT 0,
      boxes_qty INTEGER NOT NULL DEFAULT 0,
      loose_pieces_qty INTEGER NOT NULL DEFAULT 0,
      total_pieces INTEGER NOT NULL DEFAULT 0,
      rate_per_piece_paisas INTEGER NOT NULL DEFAULT 0,
      gross_amount_paisas INTEGER NOT NULL DEFAULT 0,
      tax_percent REAL NOT NULL DEFAULT 0,
      tax_paisas INTEGER NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      discount_paisas INTEGER NOT NULL DEFAULT 0,
      line_total_paisas INTEGER NOT NULL DEFAULT 0,
      rate_per_piece REAL NOT NULL DEFAULT 0.00,
      line_total REAL NOT NULL DEFAULT 0.00,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor ON purchase_bills(vendor_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
  CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill ON purchase_bill_items(bill_id);
`);

// 2. Add columns to products
const prodCols = db.prepare('PRAGMA table_info(products)').all();
const prodColNames = new Set(prodCols.map((c) => c.name));

if (!prodColNames.has('item_type')) {
  db.exec("ALTER TABLE products ADD COLUMN item_type TEXT NOT NULL DEFAULT 'STANDARD';");
}
if (!prodColNames.has('costing_method')) {
  db.exec("ALTER TABLE products ADD COLUMN costing_method TEXT NOT NULL DEFAULT 'FIFO';");
}
if (!prodColNames.has('boxes_per_carton')) {
  db.exec("ALTER TABLE products ADD COLUMN boxes_per_carton INTEGER NOT NULL DEFAULT 1;");
}
if (!prodColNames.has('pieces_per_box')) {
  db.exec("ALTER TABLE products ADD COLUMN pieces_per_box INTEGER NOT NULL DEFAULT 1;");
  db.exec("UPDATE products SET pieces_per_box = bulk_conversion_factor WHERE pieces_per_box = 1 AND bulk_conversion_factor > 1;");
}
if (!prodColNames.has('total_pieces_per_carton')) {
  db.exec("ALTER TABLE products ADD COLUMN total_pieces_per_carton INTEGER NOT NULL DEFAULT 1;");
  db.exec("UPDATE products SET total_pieces_per_carton = boxes_per_carton * pieces_per_box;");
}
if (!prodColNames.has('base_rate_per_piece_paisas')) {
  db.exec("ALTER TABLE products ADD COLUMN base_rate_per_piece_paisas INTEGER NOT NULL DEFAULT 0;");
  db.exec("UPDATE products SET base_rate_per_piece_paisas = CASE WHEN total_pieces_per_carton > 0 THEN CAST(ROUND(cost_price_paisas / total_pieces_per_carton) AS INTEGER) ELSE cost_price_paisas END;");
}

// 3. Update account 5040
db.exec("UPDATE chart_of_accounts SET name = 'Inward Freight Expense' WHERE code = '5040';");

// 4. Update system_modules for purchase
db.exec("UPDATE system_modules SET is_enabled = 1 WHERE id = 'purchase';");

// 5. Seed Vendors
const vendorCount = db.prepare('SELECT COUNT(*) as c FROM vendors').get().c;
if (vendorCount === 0) {
  const insertVendor = db.prepare(`
    INSERT INTO vendors (id, name, company_name, contact_person, phone, email, address, city, cnic_or_ntn, payment_terms_days, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertVendor.run(crypto.randomUUID(), 'Nestlé Pakistan Limited', 'Nestlé Pakistan Ltd', 'Asim Munir', '0300-8889900', 'supply@nestle.com.pk', 'Plot 34, Industrial Estate', 'Lahore', '0801234-5', 30);
  insertVendor.run(crypto.randomUUID(), 'Shan Foods Private Limited', 'Shan Foods Pvt Ltd', 'Zeeshan Ahmed', '0321-7776655', 'orders@shanfoods.com', 'Sector 23, Korangi Industrial Area', 'Karachi', '1405678-9', 21);
  insertVendor.run(crypto.randomUUID(), 'National Foods Manufacturer', 'National Foods Ltd', 'Usman Tariq', '0333-5554433', 'sales@nfoods.com', '12-KM Bahawalpur Road', 'Multan', '2209876-1', 15);
  console.log('Seeded 3 Vendors.');
}

// 6. Seed Phase 4 Products
const catBeverages = db.prepare("SELECT id FROM categories WHERE name = 'Beverages'").get()?.id;
const catFoods = db.prepare("SELECT id FROM categories WHERE name = 'Packaged Foods'").get()?.id;

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, category,
    uom_base, uom_bulk, bulk_conversion_factor,
    boxes_per_carton, pieces_per_box, total_pieces_per_carton, base_rate_per_piece_paisas,
    cost_price_paisas, trade_price_paisas, mrp_paisas,
    cost_price, selling_price, current_stock_base, current_stock, min_stock_alert,
    item_type, costing_method
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

if (!db.prepare("SELECT id FROM products WHERE sku = 'SPICE-001'").get()) {
  insertProduct.run(
    crypto.randomUUID(), 'SPICE-001', '896400010101', 'Shan Biryani Masala 50g', catFoods, 'Packaged Foods',
    'PACKET', 'CARTON', 144, 12, 12, 144, 9000, 1296000, 1440000, 1728000, 12960.0, 14400.0, 288, 288, 72,
    'STANDARD', 'FIFO'
  );
  console.log('Seeded Standard Product SPICE-001.');
}

if (!db.prepare("SELECT id FROM products WHERE sku = 'MILK-002'").get()) {
  insertProduct.run(
    crypto.randomUUID(), 'MILK-002', '896400020202', 'Nestlé MilkPak 1000ml (Batch-Tracked)', catBeverages, 'Beverages',
    'PACK', 'CARTON', 12, 1, 12, 12, 26000, 312000, 348000, 372000, 3120.0, 3480.0, 120, 120, 24,
    'BATCH', 'FIFO'
  );
  console.log('Seeded Batch Product MILK-002.');
}

if (!db.prepare("SELECT id FROM products WHERE sku = 'SRV-003'").get()) {
  insertProduct.run(
    crypto.randomUUID(), 'SRV-003', 'SRV-003-LOG', 'Inbound Cold-Chain Logistics & Handling', catBeverages, 'Beverages',
    'SERVICE', 'SERVICE', 1, 1, 1, 1, 500000, 500000, 500000, 500000, 5000.0, 5000.0, 0, 0, 0,
    'SERVICE', 'FIFO'
  );
  console.log('Seeded Service Product SRV-003.');
}

// 7. Seed feature flags
const insertFlag = db.prepare(`
  INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);
insertFlag.run('purchase.enable_freight_landed_cost', 'purchase', 'true', 'Freight Landed Cost Capitalization', 'Allows toggling between capitalizing freight into inventory asset vs separate direct expense.');
insertFlag.run('purchase.enable_3tier_uom', 'purchase', 'true', '3-Tier UOM Entry (CTN / Box / Pcs)', 'Enables Carton, Inner Box, and Loose Pieces breakdown for wholesale goods receipt.');
insertFlag.run('purchase.enable_batch_tracking', 'purchase', 'true', 'Batch & Expiry Date Tracking', 'Requires batch numbers and expiry dates on batch-controlled perishable items.');

console.log('✅ Phase 4 migration and seeding applied successfully!');
