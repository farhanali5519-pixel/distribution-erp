import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);

  // 1. Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SALESMAN', 'SUPPLY_PERSON', 'DRIVER', 'MANAGER')),
        phone TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        route_id TEXT,
        salesman_id TEXT,
        supply_person_id TEXT,
        order_date TEXT NOT NULL,
        delivery_date TEXT,
        status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED')),
        subtotal_paisas INTEGER NOT NULL DEFAULT 0,
        line_discount_paisas INTEGER NOT NULL DEFAULT 0,
        bill_discount_paisas INTEGER NOT NULL DEFAULT 0,
        grand_total_paisas INTEGER NOT NULL DEFAULT 0,
        scheme_items_count INTEGER NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0.00,
        discount REAL NOT NULL DEFAULT 0.00,
        grand_total REAL NOT NULL DEFAULT 0.00,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
        FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity_base INTEGER NOT NULL CHECK (quantity_base > 0),
        cartons_count INTEGER NOT NULL DEFAULT 0,
        loose_pieces_count INTEGER NOT NULL DEFAULT 0,
        unit_price_paisas INTEGER NOT NULL DEFAULT 0,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_paisas INTEGER NOT NULL DEFAULT 0,
        scheme_bonus_base INTEGER NOT NULL DEFAULT 0,
        line_total_paisas INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY,
        payment_number TEXT UNIQUE NOT NULL,
        payment_date TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        route_id TEXT,
        salesman_id TEXT,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE')),
        amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
        amount REAL NOT NULL,
        reference_note TEXT,
        journal_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
        FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    );
  `);

  // 2. Check sales_invoices columns
  const siCols = db.prepare("PRAGMA table_info(sales_invoices)").all();
  const siColNames = new Set(siCols.map((c) => c.name));
  if (!siColNames.has('route_id')) db.exec("ALTER TABLE sales_invoices ADD COLUMN route_id TEXT;");
  if (!siColNames.has('salesman_id')) db.exec("ALTER TABLE sales_invoices ADD COLUMN salesman_id TEXT;");
  if (!siColNames.has('supply_person_id')) db.exec("ALTER TABLE sales_invoices ADD COLUMN supply_person_id TEXT;");
  if (!siColNames.has('order_id')) db.exec("ALTER TABLE sales_invoices ADD COLUMN order_id TEXT;");
  if (!siColNames.has('invoice_type')) db.exec("ALTER TABLE sales_invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'DIRECT_SALE';");
  if (!siColNames.has('subtotal_paisas')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN subtotal_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoices SET subtotal_paisas = CAST(ROUND(subtotal * 100) AS INTEGER);");
  }
  if (!siColNames.has('line_discount_paisas')) db.exec("ALTER TABLE sales_invoices ADD COLUMN line_discount_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!siColNames.has('bill_discount_paisas')) db.exec("ALTER TABLE sales_invoices ADD COLUMN bill_discount_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!siColNames.has('grand_total_paisas')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN grand_total_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoices SET grand_total_paisas = CAST(ROUND(grand_total * 100) AS INTEGER);");
  }
  if (!siColNames.has('cost_of_goods_sold_paisas')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN cost_of_goods_sold_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoices SET cost_of_goods_sold_paisas = CAST(ROUND(cost_of_goods_sold * 100) AS INTEGER);");
  }
  if (!siColNames.has('scheme_expense_paisas')) db.exec("ALTER TABLE sales_invoices ADD COLUMN scheme_expense_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!siColNames.has('cash_received_paisas')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN cash_received_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoices SET cash_received_paisas = CAST(ROUND(amount_paid * 100) AS INTEGER);");
  }
  if (!siColNames.has('remaining_balance_paisas')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN remaining_balance_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoices SET remaining_balance_paisas = CAST(ROUND((grand_total - amount_paid) * 100) AS INTEGER);");
  }

  // 3. Check sales_invoice_items columns
  const siiCols = db.prepare("PRAGMA table_info(sales_invoice_items)").all();
  const siiColNames = new Set(siiCols.map((c) => c.name));
  if (!siiColNames.has('quantity_base')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN quantity_base INTEGER NOT NULL DEFAULT 1;");
    db.exec("UPDATE sales_invoice_items SET quantity_base = CAST(ROUND(quantity) AS INTEGER);");
  }
  if (!siiColNames.has('cartons_count')) db.exec("ALTER TABLE sales_invoice_items ADD COLUMN cartons_count INTEGER NOT NULL DEFAULT 0;");
  if (!siiColNames.has('loose_pieces_count')) db.exec("ALTER TABLE sales_invoice_items ADD COLUMN loose_pieces_count INTEGER NOT NULL DEFAULT 0;");
  if (!siiColNames.has('discount_percent')) db.exec("ALTER TABLE sales_invoice_items ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;");
  if (!siiColNames.has('discount_paisas')) db.exec("ALTER TABLE sales_invoice_items ADD COLUMN discount_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!siiColNames.has('scheme_bonus_base')) db.exec("ALTER TABLE sales_invoice_items ADD COLUMN scheme_bonus_base INTEGER NOT NULL DEFAULT 0;");
  if (!siiColNames.has('line_total_paisas')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN line_total_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoice_items SET line_total_paisas = CAST(ROUND(total_price * 100) AS INTEGER);");
  }
  if (!siiColNames.has('unit_price_paisas')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN unit_price_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoice_items SET unit_price_paisas = CAST(ROUND(unit_price * 100) AS INTEGER);");
  }
  if (!siiColNames.has('unit_cost_paisas')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN unit_cost_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoice_items SET unit_cost_paisas = CAST(ROUND(unit_cost * 100) AS INTEGER);");
  }
  if (!siiColNames.has('total_cost_paisas')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN total_cost_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE sales_invoice_items SET total_cost_paisas = CAST(ROUND(total_cost * 100) AS INTEGER);");
  }

  // 4. Ensure COA 5060 Sales Promotion & Scheme Expense exists
  const has5060 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5060'").get();
  if (!has5060) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, '5060', 'Sales Promotion & Scheme Expense', 'EXPENSE', 'DEBIT', 1, 1, 'Cost of bonus free sample units to retailers', 'PKR')
    `).run(crypto.randomUUID());
  }

  // 5. Seed staff members if empty
  const staffCount = db.prepare('SELECT COUNT(*) as count FROM staff_members').get();
  if (staffCount.count === 0) {
    const insertStaff = db.prepare('INSERT INTO staff_members (id, name, role, phone, is_active) VALUES (?, ?, ?, ?, 1)');
    insertStaff.run(crypto.randomUUID(), 'Tariq Mehmood', 'SALESMAN', '0300-1112233');
    insertStaff.run(crypto.randomUUID(), 'Imran Rafiq', 'SALESMAN', '0321-4445566');
    insertStaff.run(crypto.randomUUID(), 'Bilal Ahmed', 'SUPPLY_PERSON', '0333-7778899');
    insertStaff.run(crypto.randomUUID(), 'Kamran Ali', 'SUPPLY_PERSON', '0345-0001122');
  }

  // 6. Seed default feature flags
  const flags = [
    { key: 'sales.enable_order_booking', module_id: 'sales', value: 'true', label: 'Field Order Booking Workflow', desc: 'Enables advance route order booking page (/sales/order-booking) with status BOOKED without immediate stock release.' },
    { key: 'sales.enable_direct_sale', module_id: 'sales', value: 'true', label: 'Direct & Van Sale Workflow', desc: 'Enables spot counter/van sale page (/sales/direct-sale) with immediate inventory release and dual-leg GL posting.' },
    { key: 'sales.enable_line_discount', module_id: 'sales', value: 'true', label: 'Item Line Discounts', desc: 'Renders reactive two-way discount columns (% and PKR) on order and invoice line items.' },
    { key: 'sales.enable_bill_discount', module_id: 'sales', value: 'true', label: 'Bill / Footer Discount', desc: 'Enables total bill discount input (% and PKR) in order and invoice summary footers.' },
    { key: 'sales.enable_scheme_bonus', module_id: 'sales', value: 'true', label: 'Trade Scheme & Bonus Units', desc: 'Enables free sample/scheme bonus units (0 PKR to retailer, Dr. Scheme Expense / Cr. Inventory at cost).' },
    { key: 'sales.enable_salesman_tracking', module_id: 'sales', value: 'true', label: 'Salesman Assignment Tracking', desc: 'Enables salesman selector in sticky top session and tracks sales commission attribution.' },
    { key: 'sales.enable_supply_person_tracking', module_id: 'sales', value: 'true', label: 'Supply / Delivery Staff Tracking', desc: 'Enables delivery officer selector in sticky top session and delivery dispatch attribution.' },
    { key: 'sales.enable_spot_cash_collection', module_id: 'sales', value: 'true', label: 'Spot Cash Recovery on Invoice', desc: 'Allows recording partial or full cash payment directly on direct sale invoice creation.' },
    { key: 'sales.enable_credit_limit_lock', module_id: 'sales', value: 'true', label: 'Credit Limit Hard Enforcement', desc: 'Strictly blocks invoice generation if live customer balance plus new order amount breaches credit limit.' },
    { key: 'sales.default_print_format', module_id: 'sales', value: 'THERMAL', label: 'Default Print Layout', desc: 'Default layout for receipt generation: THERMAL (80mm roll) or A4 (standard corporate sheet).' },
    { key: 'inventory.enable_low_stock_warning', module_id: 'inventory', value: 'true', label: 'Low Stock Alert Badges', desc: 'Shows prominent warning badges when warehouse stock drops below minimum threshold.' },
    { key: 'accounting.strict_audit_void', module_id: 'accounting', value: 'true', label: 'Strict Journal Void & Audit Trail', desc: 'Requires reason prompt and posts offsetting reversal voucher when voiding general ledger entries.' }
  ];

  const insertFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const f of flags) {
    insertFlag.run(f.key, f.module_id, f.value, f.label, f.desc);
  }

  console.log('Phase 3 migrations executed successfully.');
}
