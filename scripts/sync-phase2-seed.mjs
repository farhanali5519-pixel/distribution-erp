import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const db = new DatabaseSync(path.join(process.cwd(), 'data', 'sales_distribution.db'));

// Get categories
const cats = db.prepare('SELECT id, name FROM categories').all();
const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]));

// Get routes
const routes = db.prepare('SELECT id, name FROM routes').all();
const routeMap = Object.fromEntries(routes.map((r) => [r.name, r.id]));

const r1 = routeMap['Route 1 - North Sector A'] || routes[0]?.id;
const r2 = routeMap['Route 2 - Central Commercial Hub'] || routes[1]?.id;

// Update customers
db.prepare(`
  UPDATE customers SET 
    shop_name = 'Al-Madina Mart & Wholesale',
    route_id = ?,
    route_name = 'Route 1 - North Sector A',
    cnic_or_ntn = '35201-1234567-1',
    credit_days = 14,
    credit_limit = 150000,
    credit_limit_paisas = 15000000
  WHERE name = 'Al-Madina Superstore'
`).run(r1);

db.prepare(`
  UPDATE customers SET 
    shop_name = 'Bismillah Store #1',
    route_id = ?,
    route_name = 'Route 1 - North Sector A',
    cnic_or_ntn = '35202-7654321-3',
    credit_days = 7,
    credit_limit = 80000,
    credit_limit_paisas = 8000000
  WHERE name = 'Bismillah General Store'
`).run(r1);

db.prepare(`
  UPDATE customers SET 
    shop_name = 'Khan Hypermarket',
    route_id = ?,
    route_name = 'Route 2 - Central Commercial Hub',
    cnic_or_ntn = 'NTN-9876543-0',
    credit_days = 21,
    credit_limit = 300000,
    credit_limit_paisas = 30000000
  WHERE name = 'Khan Cash & Carry'
`).run(r2);

// 5 distribution products with carton conversion rates
const products = [
  {
    sku: 'BEV-001',
    barcode: '896400010011',
    name: 'Premium Mineral Water 1.5L',
    category_id: catMap['Beverages'],
    category: 'Beverages',
    uom_base: 'BOTTLE',
    uom_bulk: 'CARTON',
    conversion: 6,
    cost_pkr: 380,
    tp_pkr: 480,
    mrp_pkr: 540,
    stock_base: 360,
    min_alert: 60,
  },
  {
    sku: 'OIL-002',
    barcode: '896400020022',
    name: 'Pure Canola Cooking Oil 1L',
    category_id: catMap['Cooking Essentials'],
    category: 'Cooking Essentials',
    uom_base: 'BOTTLE',
    uom_bulk: 'CARTON',
    conversion: 12,
    cost_pkr: 4800,
    tp_pkr: 5500,
    mrp_pkr: 6200,
    stock_base: 144,
    min_alert: 24,
  },
  {
    sku: 'TEA-003',
    barcode: '896400030033',
    name: 'Royal Danedar Tea 900g Pack',
    category_id: catMap['Packaged Foods'],
    category: 'Packaged Foods',
    uom_base: 'PACK',
    uom_bulk: 'CARTON',
    conversion: 24,
    cost_pkr: 32400,
    tp_pkr: 37200,
    mrp_pkr: 40800,
    stock_base: 72,
    min_alert: 24,
  },
  {
    sku: 'SNK-004',
    barcode: '896400040044',
    name: 'Crispy Salted Potato Chips 50g',
    category_id: catMap['Snacks & Confectionery'],
    category: 'Snacks & Confectionery',
    uom_base: 'PACKET',
    uom_bulk: 'BOX',
    conversion: 48,
    cost_pkr: 1680,
    tp_pkr: 2160,
    mrp_pkr: 2400,
    stock_base: 480,
    min_alert: 96,
  },
  {
    sku: 'DRK-005',
    barcode: '896400050055',
    name: 'Thunder Energy Drink 250ml Can',
    category_id: catMap['Beverages'],
    category: 'Beverages',
    uom_base: 'CAN',
    uom_bulk: 'TRAY',
    conversion: 24,
    cost_pkr: 4320,
    tp_pkr: 5280,
    mrp_pkr: 6000,
    stock_base: 240,
    min_alert: 48,
  }
];

for (const p of products) {
  const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku);
  if (existing) {
    db.prepare(`
      UPDATE products SET
        barcode = ?,
        name = ?,
        category_id = ?,
        category = ?,
        uom_base = ?,
        uom_bulk = ?,
        bulk_conversion_factor = ?,
        cost_price_paisas = ?,
        trade_price_paisas = ?,
        mrp_paisas = ?,
        cost_price = ?,
        selling_price = ?,
        current_stock_base = ?,
        current_stock = ?,
        min_stock_alert = ?
      WHERE id = ?
    `).run(
      p.barcode, p.name, p.category_id, p.category,
      p.uom_base, p.uom_bulk, p.conversion,
      p.cost_pkr * 100, p.tp_pkr * 100, p.mrp_pkr * 100,
      p.cost_pkr, p.tp_pkr, p.stock_base, p.stock_base, p.min_alert,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO products (
        id, sku, barcode, name, category_id, category,
        uom_base, uom_bulk, bulk_conversion_factor,
        cost_price_paisas, trade_price_paisas, mrp_paisas,
        cost_price, selling_price, current_stock_base, current_stock, min_stock_alert, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      crypto.randomUUID(), p.sku, p.barcode, p.name, p.category_id, p.category,
      p.uom_base, p.uom_bulk, p.conversion,
      p.cost_pkr * 100, p.tp_pkr * 100, p.mrp_pkr * 100,
      p.cost_pkr, p.tp_pkr, p.stock_base, p.stock_base, p.min_alert
    );
  }
}

console.log('Database synchronized with Phase 2 master seed data successfully.');
