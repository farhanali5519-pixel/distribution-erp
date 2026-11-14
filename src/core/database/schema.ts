import { DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_PLAN } from '../tenancy/constants';

export const CREATE_TABLES_SQL = `
-- PRAGMAS for performance and integrity
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ==========================================================
-- 0. TENANTS & COMPANIES MASTER (Phase 2A Foundation)
-- ==========================================================
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    legal_name TEXT,
    tenant_code TEXT,
    slug TEXT UNIQUE NOT NULL,
    primary_contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    plan TEXT NOT NULL DEFAULT 'COMMERCIAL',
    trial_ends_at TEXT,
    subscription_starts_at TEXT,
    subscription_ends_at TEXT,
    max_users INTEGER NOT NULL DEFAULT 5,
    max_warehouses INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    is_active INTEGER NOT NULL DEFAULT 1,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    email_otp_enabled INTEGER NOT NULL DEFAULT 0,
    recovery_codes_hash TEXT,
    two_factor_policy TEXT NOT NULL DEFAULT 'OPTIONAL',
    last_2fa_at TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_otp_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_otp_tokens_user_purpose ON platform_otp_tokens(user_id, purpose);

CREATE VIEW IF NOT EXISTS tenants AS SELECT * FROM companies;

CREATE TABLE IF NOT EXISTS company_modules (
    company_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    dependencies TEXT DEFAULT '[]',
    settings TEXT DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, module_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES system_modules(id) ON DELETE CASCADE
);

-- ==========================================================
-- 1. SYSTEM & MODULE REGISTRY
-- ==========================================================
CREATE TABLE IF NOT EXISTS system_modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    dependencies TEXT DEFAULT '[]',
    settings TEXT DEFAULT '{}',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    batch INTEGER NOT NULL DEFAULT 1,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_license (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    license_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'VALID',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ==========================================================
-- 2. CHART OF ACCOUNTS (Control Accounts / GL Roots)
-- ==========================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY, -- UUID
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    normal_balance TEXT NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    parent_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_system INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PKR',
    account_group TEXT,
    description TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
);

-- ==========================================================
-- 3. JOURNAL ENTRIES (Immutable General Ledger Engine)
-- ==========================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY, -- UUID
    entry_number TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    description TEXT NOT NULL,
    source_module TEXT NOT NULL,
    source_document_id TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    total_amount_paisas INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0.00,
    created_by TEXT DEFAULT 'admin',
    reversal_of_id TEXT,
    is_reversed INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY, -- UUID
    journal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_paisas INTEGER NOT NULL DEFAULT 0 CHECK (debit_paisas >= 0),
    credit_paisas INTEGER NOT NULL DEFAULT 0 CHECK (credit_paisas >= 0),
    debit REAL NOT NULL DEFAULT 0.00 CHECK (debit >= 0),
    credit REAL NOT NULL DEFAULT 0.00 CHECK (credit >= 0),
    entity_id TEXT,
    entity_type TEXT CHECK (entity_type IS NULL OR entity_type IN ('CUSTOMER', 'VENDOR', 'EMPLOYEE')),
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    CHECK (debit_paisas > 0 OR credit_paisas > 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_subledger ON journal_lines(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_acc_entity ON journal_lines(account_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_module, source_document_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal ON journal_entries(reversal_of_id);

-- ==========================================================
-- 4. ROUTES & CUSTOMER MANAGEMENT (Distribution Master)
-- ==========================================================
CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    area_territory TEXT,
    city TEXT,
    assigned_salesperson_id TEXT,
    assigned_supply_person_id TEXT,
    delivery_days TEXT NOT NULL DEFAULT '[]', -- JSON array of weekdays
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assigned_salesperson_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    shop_name TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    cnic_or_ntn TEXT,
    route_id TEXT,
    route_name TEXT,
    credit_limit_paisas INTEGER NOT NULL DEFAULT 0,
    credit_limit REAL DEFAULT 0.00,
    credit_days INTEGER NOT NULL DEFAULT 0,
    balance REAL DEFAULT 0.00,
    is_active INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);

-- ==========================================================
-- 5. CATEGORIES, PRODUCTS & INVENTORY MASTER
-- ==========================================================
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, -- UUID
    sku TEXT NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    category_id TEXT,
    category TEXT,
    brand_id TEXT,
    brand_name TEXT,
    uom_base TEXT NOT NULL DEFAULT 'PIECE',
    uom_bulk TEXT NOT NULL DEFAULT 'CARTON',
    bulk_conversion_factor INTEGER NOT NULL DEFAULT 1, -- e.g. 12 pieces per carton
    boxes_per_carton INTEGER NOT NULL DEFAULT 1,
    pieces_per_box INTEGER NOT NULL DEFAULT 1,
    total_pieces_per_carton INTEGER NOT NULL DEFAULT 1,
    base_rate_per_piece_paisas INTEGER NOT NULL DEFAULT 0,
    cost_price_paisas INTEGER NOT NULL DEFAULT 0,      -- Cost baseline
    trade_price_paisas INTEGER NOT NULL DEFAULT 0,     -- Wholesale Trade Price (TP)
    mrp_paisas INTEGER NOT NULL DEFAULT 0,             -- Maximum Retail Price (MRP)
    cost_price REAL NOT NULL DEFAULT 0.00,
    selling_price REAL NOT NULL DEFAULT 0.00,          -- Mirrors trade_price in decimal
    item_type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (item_type IN ('STANDARD', 'BATCH', 'SERVICE')),
    costing_method TEXT NOT NULL DEFAULT 'FIFO' CHECK (costing_method IN ('FIFO', 'AVCO')),
    current_stock_base INTEGER NOT NULL DEFAULT 0,     -- Strictly in base unit
    current_stock REAL NOT NULL DEFAULT 0.00,
    min_stock_alert INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- Stock adjustments / Opening inventory ledger
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY, -- UUID
    adjustment_number TEXT NOT NULL,
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

-- ==========================================================
-- 5B. CENTRAL IMMUTABLE INVENTORY AUDIT & STOCK LEDGER
-- ==========================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY, -- UUID
    movement_number TEXT NOT NULL, -- e.g. MOV-2026-000001
    movement_date TEXT NOT NULL, -- YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    category_id TEXT,
    category_name TEXT,
    brand_id TEXT,
    brand_name TEXT,
    warehouse TEXT NOT NULL DEFAULT 'Main Warehouse',
    to_warehouse TEXT,
    movement_type TEXT NOT NULL, -- OPENING_STOCK, PURCHASE, PURCHASE_RETURN, SALE_ORDER, DIRECT_SALE, SALE_RETURN, STOCK_ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, DAMAGE_WRITEOFF, BONUS_FREE, CANCELLED, REVERSAL_IN, REVERSAL_OUT
    source_module TEXT NOT NULL, -- 'inventory', 'purchase', 'sales', 'returns'
    source_document_type TEXT NOT NULL, -- 'PRODUCT_OPENING', 'PURCHASE_BILL', 'PURCHASE_RETURN', 'SALES_ORDER', 'SALES_INVOICE', 'SALES_RETURN', 'STOCK_ADJUSTMENT', 'WAREHOUSE_TRANSFER'
    document_number TEXT NOT NULL,
    original_transaction_id TEXT,
    reference_number TEXT,
    quantity_in_base INTEGER NOT NULL DEFAULT 0 CHECK (quantity_in_base >= 0),
    quantity_out_base INTEGER NOT NULL DEFAULT 0 CHECK (quantity_out_base >= 0),
    net_quantity_base INTEGER NOT NULL, -- (+ In, - Out)
    cartons_count INTEGER NOT NULL DEFAULT 0,
    boxes_count INTEGER NOT NULL DEFAULT 0,
    pieces_count INTEGER NOT NULL DEFAULT 0,
    stock_before_base INTEGER NOT NULL,
    stock_after_base INTEGER NOT NULL,
    unit_cost_paisas INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0.00,
    total_cost_paisas INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0.00,
    selling_price REAL NOT NULL DEFAULT 0.00,
    user_id TEXT DEFAULT 'admin',
    user_name TEXT DEFAULT 'Administrator',
    user_role TEXT DEFAULT 'ADMIN',
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED', 'DELETED')),
    reversed_by_user_id TEXT,
    reversed_by_user_name TEXT,
    reversed_at TEXT,
    reversal_reason TEXT,
    admin_override_details TEXT,
    reversal_linked_movement_id TEXT,
    day_close_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (day_close_status IN ('OPEN', 'CLOSED')),
    notes TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_date ON inventory_movements(product_id, movement_date, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_date ON inventory_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inv_mov_doc ON inventory_movements(document_number);
CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_source ON inventory_movements(source_module, source_document_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_orig_tx ON inventory_movements(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_status ON inventory_movements(status);
CREATE INDEX IF NOT EXISTS idx_inv_mov_warehouse ON inventory_movements(warehouse);
CREATE INDEX IF NOT EXISTS idx_inv_mov_reversal ON inventory_movements(reversal_linked_movement_id);


-- ==========================================================
-- 6. SALES INVOICES & ORDERS
-- ==========================================================
CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY, -- UUID
    invoice_number TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    route_id TEXT,
    salesman_id TEXT,
    supply_person_id TEXT,
    order_id TEXT,
    invoice_date TEXT NOT NULL,
    due_date TEXT,
    subtotal_paisas INTEGER NOT NULL DEFAULT 0,
    line_discount_paisas INTEGER NOT NULL DEFAULT 0,
    bill_discount_paisas INTEGER NOT NULL DEFAULT 0,
    grand_total_paisas INTEGER NOT NULL DEFAULT 0,
    cost_of_goods_sold_paisas INTEGER NOT NULL DEFAULT 0,
    scheme_expense_paisas INTEGER NOT NULL DEFAULT 0,
    cash_received_paisas INTEGER NOT NULL DEFAULT 0,
    remaining_balance_paisas INTEGER NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0.00,
    discount REAL NOT NULL DEFAULT 0.00,
    tax REAL NOT NULL DEFAULT 0.00,
    grand_total REAL NOT NULL DEFAULT 0.00,
    cost_of_goods_sold REAL NOT NULL DEFAULT 0.00,
    amount_paid REAL NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    invoice_type TEXT NOT NULL DEFAULT 'DIRECT_SALE' CHECK (invoice_type IN ('DIRECT_SALE', 'ORDER_DELIVERY')),
    notes TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
    FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id TEXT PRIMARY KEY, -- UUID
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_base INTEGER NOT NULL DEFAULT 1 CHECK (quantity_base > 0),
    cartons_count INTEGER NOT NULL DEFAULT 0,
    loose_pieces_count INTEGER NOT NULL DEFAULT 0,
    unit_price_paisas INTEGER NOT NULL DEFAULT 0,
    unit_cost_paisas INTEGER NOT NULL DEFAULT 0,
    total_cost_paisas INTEGER NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_paisas INTEGER NOT NULL DEFAULT 0,
    scheme_bonus_base INTEGER NOT NULL DEFAULT 0,
    line_total_paisas INTEGER NOT NULL DEFAULT 0,
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.00,
    total_price REAL NOT NULL,
    total_cost REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- ==========================================================
-- 7. SALES ORDERS (Operative Commercial Sale Bill & Delivery)
-- ==========================================================
CREATE TABLE IF NOT EXISTS sales_orders (
    id TEXT PRIMARY KEY, -- UUID
    order_number TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    route_id TEXT,
    salesman_id TEXT,
    supply_person_id TEXT,
    order_date TEXT NOT NULL,
    delivery_date TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'BOOKED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'VOID')),
    subtotal_paisas INTEGER NOT NULL DEFAULT 0,
    line_discount_paisas INTEGER NOT NULL DEFAULT 0,
    bill_discount_paisas INTEGER NOT NULL DEFAULT 0,
    tax_amount_paisas INTEGER NOT NULL DEFAULT 0,
    grand_total_paisas INTEGER NOT NULL DEFAULT 0,
    cost_of_goods_sold_paisas INTEGER NOT NULL DEFAULT 0,
    scheme_expense_paisas INTEGER NOT NULL DEFAULT 0,
    cash_received_paisas INTEGER NOT NULL DEFAULT 0,
    remaining_balance_paisas INTEGER NOT NULL DEFAULT 0,
    scheme_items_count INTEGER NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0.00,
    discount REAL NOT NULL DEFAULT 0.00,
    tax REAL NOT NULL DEFAULT 0.00,
    grand_total REAL NOT NULL DEFAULT 0.00,
    cost_of_goods_sold REAL NOT NULL DEFAULT 0.00,
    cash_received REAL NOT NULL DEFAULT 0.00,
    remaining_balance REAL NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID',
    journal_entry_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
    FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id TEXT PRIMARY KEY, -- UUID
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_base INTEGER NOT NULL CHECK (quantity_base > 0),
    cartons_count INTEGER NOT NULL DEFAULT 0,
    loose_pieces_count INTEGER NOT NULL DEFAULT 0,
    unit_price_paisas INTEGER NOT NULL DEFAULT 0,
    unit_cost_paisas INTEGER NOT NULL DEFAULT 0,
    total_cost_paisas INTEGER NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_paisas INTEGER NOT NULL DEFAULT 0,
    tax_percent REAL NOT NULL DEFAULT 0,
    tax_paisas INTEGER NOT NULL DEFAULT 0,
    scheme_bonus_base INTEGER NOT NULL DEFAULT 0,
    line_total_paisas INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0.00,
    unit_cost REAL NOT NULL DEFAULT 0.00,
    total_cost REAL NOT NULL DEFAULT 0.00,
    tax REAL NOT NULL DEFAULT 0.00,
    line_total REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- ==========================================================
-- 8. STAFF MEMBERS (Salesmen & Delivery Supply Personnel)
-- ==========================================================
CREATE TABLE IF NOT EXISTS staff_members (
    id TEXT PRIMARY KEY, -- UUID
    employee_code TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SALESMAN', 'SUPPLY_PERSON', 'BOTH', 'DRIVER', 'MANAGER')),
    phone TEXT,
    route_id TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
);

-- ==========================================================
-- 9. FEATURE CONFIGURATION & FLAGS
-- ==========================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    company_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, key)
);

-- ==========================================================
-- 10. CUSTOMER PAYMENTS (Collections & Receipts)
-- ==========================================================
CREATE TABLE IF NOT EXISTS customer_payments (
    id TEXT PRIMARY KEY, -- UUID
    payment_number TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    account_id TEXT,
    route_id TEXT,
    salesman_id TEXT,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE')),
    amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
    amount REAL NOT NULL,
    unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0,
    unallocated_amount REAL NOT NULL DEFAULT 0.00,
    reference_note TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
    journal_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
    FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS customer_payment_allocations (
    id TEXT PRIMARY KEY, -- UUID
    payment_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    invoice_type TEXT NOT NULL DEFAULT 'ORDER' CHECK (invoice_type IN ('ORDER', 'INVOICE')),
    allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
    allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_payment ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_invoice ON customer_payment_allocations(invoice_id);

-- ==========================================================
-- 11. VENDORS MASTER (Manufacturer Suppliers & Mills)
-- ==========================================================
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, -- UUID
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

-- ==========================================================
-- 12. PURCHASE BILLS & VENDOR INVOICES
-- ==========================================================
CREATE TABLE IF NOT EXISTS purchase_bills (
    id TEXT PRIMARY KEY, -- UUID
    bill_number TEXT NOT NULL,
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
    paid_amount_paisas INTEGER NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0.00,
    remaining_balance_paisas INTEGER NOT NULL DEFAULT 0,
    remaining_balance REAL NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
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
    id TEXT PRIMARY KEY, -- UUID
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

-- ==========================================================
-- 12B. VENDOR PAYMENTS (Payment Made to Suppliers)
-- ==========================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
    id TEXT PRIMARY KEY, -- UUID
    payment_number TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE')),
    amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
    amount REAL NOT NULL CHECK (amount > 0),
    unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0,
    unallocated_amount REAL NOT NULL DEFAULT 0.00,
    reference_note TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
    journal_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
    id TEXT PRIMARY KEY, -- UUID
    payment_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
    allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES vendor_payments(id) ON DELETE CASCADE,
    FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_account ON vendor_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_payment ON vendor_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_bill ON vendor_payment_allocations(bill_id);

-- ==========================================================
-- 13. EXPENSES (Daily Operational & Logistics Expenses)
-- ==========================================================
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, -- UUID
    voucher_number TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    expense_account_id TEXT NOT NULL,
    paid_from_account_id TEXT NOT NULL,
    amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
    amount REAL NOT NULL CHECK (amount > 0),
    staff_id TEXT,
    vehicle_number TEXT,
    description TEXT NOT NULL,
    journal_entry_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (paid_from_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_from ON expenses(paid_from_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_staff ON expenses(staff_id);

-- ==========================================================
-- 14. DAILY CLOSINGS (Daily Cash Reconciliation & Roznamcha)
-- ==========================================================
CREATE TABLE IF NOT EXISTS daily_closings (
    id TEXT PRIMARY KEY, -- UUID
    closing_date TEXT NOT NULL,
    opening_cash_paisas INTEGER NOT NULL DEFAULT 0,
    spot_cash_sales_paisas INTEGER NOT NULL DEFAULT 0,
    debt_recoveries_paisas INTEGER NOT NULL DEFAULT 0,
    spot_cash_purchases_paisas INTEGER NOT NULL DEFAULT 0,
    daily_expenses_paisas INTEGER NOT NULL DEFAULT 0,
    bank_deposits_paisas INTEGER NOT NULL DEFAULT 0,
    expected_cash_paisas INTEGER NOT NULL DEFAULT 0,
    physical_cash_paisas INTEGER NOT NULL DEFAULT 0,
    variance_paisas INTEGER NOT NULL DEFAULT 0,
    denominations_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'CLOSED')),
    notes TEXT,
    closed_by TEXT DEFAULT 'Admin Cashier',
    closed_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);

-- ==========================================================
-- 15. SALES RETURNS & CREDIT NOTES
-- ==========================================================
CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY, -- UUID
    return_number TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    invoice_id TEXT,
    return_date TEXT NOT NULL,
    salesman_id TEXT,
    supply_person_id TEXT,
    settlement_type TEXT NOT NULL DEFAULT 'CREDIT_TO_LEDGER' CHECK (settlement_type IN ('CREDIT_TO_LEDGER', 'CASH_REFUND')),
    subtotal_paisas INTEGER NOT NULL DEFAULT 0,
    total_refund_paisas INTEGER NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0.00,
    total_refund REAL NOT NULL DEFAULT 0.00,
    journal_entry_id TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id TEXT PRIMARY KEY, -- UUID
    return_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    condition TEXT NOT NULL DEFAULT 'FRESH' CHECK (condition IN ('FRESH', 'DAMAGED_EXPIRED')),
    cartons_qty INTEGER NOT NULL DEFAULT 0,
    boxes_qty INTEGER NOT NULL DEFAULT 0,
    pieces_qty INTEGER NOT NULL DEFAULT 0,
    total_base_qty INTEGER NOT NULL CHECK (total_base_qty > 0),
    unit_rate_paisas INTEGER NOT NULL DEFAULT 0,
    line_total_paisas INTEGER NOT NULL DEFAULT 0,
    unit_rate REAL NOT NULL DEFAULT 0.00,
    line_total REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product ON sales_return_items(product_id);

-- ==========================================================
-- 16. PURCHASE RETURNS & DEBIT NOTES
-- ==========================================================
CREATE TABLE IF NOT EXISTS purchase_returns (
    id TEXT PRIMARY KEY, -- UUID
    return_number TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    return_date TEXT NOT NULL,
    vendor_invoice_number TEXT,
    total_amount_paisas INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0.00,
    journal_entry_id TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id TEXT PRIMARY KEY, -- UUID
    return_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    cartons_qty INTEGER NOT NULL DEFAULT 0,
    boxes_qty INTEGER NOT NULL DEFAULT 0,
    pieces_qty INTEGER NOT NULL DEFAULT 0,
    total_base_qty INTEGER NOT NULL CHECK (total_base_qty > 0),
    rate_per_piece_paisas INTEGER NOT NULL DEFAULT 0,
    line_total_paisas INTEGER NOT NULL DEFAULT 0,
    rate_per_piece REAL NOT NULL DEFAULT 0.00,
    line_total REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON purchase_return_items(product_id);

-- ==========================================================
-- 17. APP USERS & SYSTEM SETTINGS (RBAC & Multi-User)
-- ==========================================================
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY, -- UUID
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SALESMAN', 'CASHIER', 'WAREHOUSE', 'ORDER_BOOKER')),
    staff_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    permissions_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

CREATE TABLE IF NOT EXISTS app_settings (
    company_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, key)
);

-- ==========================================================
-- 18. COMPANY PROFILE & PRINT SETTINGS (Phase 11)
-- ==========================================================
CREATE TABLE IF NOT EXISTS company_profile (
    id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL DEFAULT 'SaleFlow Distribution',
    tagline TEXT DEFAULT 'Wholesale & FMCG Distribution',
    phone_primary TEXT DEFAULT '',
    phone_secondary TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    ntn_strn TEXT DEFAULT '',
    logo_url TEXT,
    currency_symbol TEXT DEFAULT 'PKR',
    thermal_footer_note TEXT DEFAULT 'Computer Generated Bill. Software Powered by SaleFlow.',
    invoice_terms TEXT DEFAULT '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
    show_logo_on_prints INTEGER NOT NULL DEFAULT 1,
    show_ntn_on_invoices INTEGER NOT NULL DEFAULT 1,
    show_customer_previous_balance INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 19. AUDIT LOGS (Transaction Reversal & Deletion Audit Trail)
-- ==========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    transaction_number TEXT,
    transaction_date TEXT,
    reason TEXT NOT NULL,
    is_day_closed INTEGER NOT NULL DEFAULT 0,
    details_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(transaction_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(transaction_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ==========================================================
-- 20. BANK ACCOUNTS MASTER
-- ==========================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY, -- UUID
    bank_name TEXT NOT NULL,
    account_title TEXT NOT NULL,
    account_number TEXT NOT NULL,
    iban TEXT,
    branch_name TEXT,
    branch_code TEXT,
    account_type TEXT NOT NULL DEFAULT 'CURRENT' CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OTHER')),
    currency TEXT NOT NULL DEFAULT 'PKR',
    opening_balance_paisas INTEGER NOT NULL DEFAULT 0,
    opening_balance REAL NOT NULL DEFAULT 0.00,
    account_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_id ON bank_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_active ON bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank_name ON bank_accounts(bank_name);
`;

/**
 * Migration helper to apply refactored columns to existing database without data loss
 */
export function applyRefactorMigrations(db: any): void {
  // Ensure tables exist
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

    CREATE TABLE IF NOT EXISTS staff_members (
        id TEXT PRIMARY KEY,
        employee_code TEXT UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SALESMAN', 'SUPPLY_PERSON', 'BOTH', 'DRIVER', 'MANAGER')),
        phone TEXT,
        route_id TEXT,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
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
        paid_amount_paisas INTEGER NOT NULL DEFAULT 0,
        paid_amount REAL NOT NULL DEFAULT 0.00,
        remaining_balance_paisas INTEGER NOT NULL DEFAULT 0,
        remaining_balance REAL NOT NULL DEFAULT 0.00,
        payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
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
  `);

  // Check columns in journal_lines
  const jlCols = db.prepare("PRAGMA table_info(journal_lines)").all() as { name: string }[];
  const jlColNames = new Set(jlCols.map((c) => c.name));

  if (!jlColNames.has('entity_id')) db.exec("ALTER TABLE journal_lines ADD COLUMN entity_id TEXT;");
  if (!jlColNames.has('entity_type')) db.exec("ALTER TABLE journal_lines ADD COLUMN entity_type TEXT;");
  if (!jlColNames.has('debit_paisas')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN debit_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_lines SET debit_paisas = CAST(ROUND(debit * 100) AS INTEGER);");
  }
  if (!jlColNames.has('credit_paisas')) {
    db.exec("ALTER TABLE journal_lines ADD COLUMN credit_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_lines SET credit_paisas = CAST(ROUND(credit * 100) AS INTEGER);");
  }

  // Check columns in journal_entries
  const jeCols = db.prepare("PRAGMA table_info(journal_entries)").all() as { name: string }[];
  const jeColNames = new Set(jeCols.map((c) => c.name));

  if (!jeColNames.has('total_amount_paisas')) {
    db.exec("ALTER TABLE journal_entries ADD COLUMN total_amount_paisas INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE journal_entries SET total_amount_paisas = CAST(ROUND(total_amount * 100) AS INTEGER);");
  }
  if (!jeColNames.has('reversal_of_id')) db.exec("ALTER TABLE journal_entries ADD COLUMN reversal_of_id TEXT;");
  if (!jeColNames.has('is_reversed')) db.exec("ALTER TABLE journal_entries ADD COLUMN is_reversed INTEGER NOT NULL DEFAULT 0;");

  // Check columns in customers
  const custCols = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
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
  const prodCols = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
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
  if (!prodColNames.has('item_type')) db.exec("ALTER TABLE products ADD COLUMN item_type TEXT NOT NULL DEFAULT 'STANDARD';");
  if (!prodColNames.has('costing_method')) db.exec("ALTER TABLE products ADD COLUMN costing_method TEXT NOT NULL DEFAULT 'FIFO';");
  if (!prodColNames.has('boxes_per_carton')) db.exec("ALTER TABLE products ADD COLUMN boxes_per_carton INTEGER NOT NULL DEFAULT 1;");
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
  if (!prodColNames.has('damaged_stock_base')) {
    db.exec("ALTER TABLE products ADD COLUMN damaged_stock_base INTEGER NOT NULL DEFAULT 0;");
  }

  // Check sales_invoices columns
  const siCols = db.prepare("PRAGMA table_info(sales_invoices)").all() as { name: string }[];
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

  // Check sales_invoice_items columns
  const siiCols = db.prepare("PRAGMA table_info(sales_invoice_items)").all() as { name: string }[];
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

  // Note: purchase_bills schema evolution and parity is canonically managed by MigrationRunner (v1.1.1 purchase_bills_schema_parity)

  // Check sales_orders columns and CHECK constraint
  const soCols = db.prepare("PRAGMA table_info(sales_orders)").all() as { name: string }[];
  const soColNames = new Set(soCols.map((c) => c.name));
  const soSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE name='sales_orders'").get() as { sql: string } | undefined;
  const needsOrderTableRecreation = !soColNames.has('journal_entry_id') || (soSqlRow?.sql && !soSqlRow.sql.includes("'POSTED'"));

  if (needsOrderTableRecreation) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_orders_migrated (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        route_id TEXT,
        salesman_id TEXT,
        supply_person_id TEXT,
        order_date TEXT NOT NULL,
        delivery_date TEXT,
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'BOOKED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'VOID')),
        subtotal_paisas INTEGER NOT NULL DEFAULT 0,
        line_discount_paisas INTEGER NOT NULL DEFAULT 0,
        bill_discount_paisas INTEGER NOT NULL DEFAULT 0,
        grand_total_paisas INTEGER NOT NULL DEFAULT 0,
        cost_of_goods_sold_paisas INTEGER NOT NULL DEFAULT 0,
        scheme_expense_paisas INTEGER NOT NULL DEFAULT 0,
        cash_received_paisas INTEGER NOT NULL DEFAULT 0,
        remaining_balance_paisas INTEGER NOT NULL DEFAULT 0,
        scheme_items_count INTEGER NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0.00,
        discount REAL NOT NULL DEFAULT 0.00,
        grand_total REAL NOT NULL DEFAULT 0.00,
        cost_of_goods_sold REAL NOT NULL DEFAULT 0.00,
        cash_received REAL NOT NULL DEFAULT 0.00,
        remaining_balance REAL NOT NULL DEFAULT 0.00,
        payment_status TEXT NOT NULL DEFAULT 'UNPAID',
        journal_entry_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
        FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL
      );
    `);

    db.exec(`
      INSERT OR IGNORE INTO sales_orders_migrated (
        id, order_number, customer_id, route_id, salesman_id, supply_person_id,
        order_date, delivery_date, status,
        subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
        scheme_items_count, subtotal, discount, grand_total, notes, created_at, updated_at
      )
      SELECT 
        id, order_number, customer_id, route_id, salesman_id, supply_person_id,
        order_date, delivery_date, status,
        subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
        scheme_items_count, subtotal, discount, grand_total, notes, created_at, updated_at
      FROM sales_orders;
    `);

    db.exec("DROP TABLE sales_orders;");
    db.exec("ALTER TABLE sales_orders_migrated RENAME TO sales_orders;");
    db.exec('PRAGMA foreign_keys = ON;');
  }

  // Check sales_order_items columns
  const soiCols = db.prepare("PRAGMA table_info(sales_order_items)").all() as { name: string }[];
  const soiColNames = new Set(soiCols.map((c) => c.name));
  if (!soiColNames.has('unit_cost_paisas')) db.exec("ALTER TABLE sales_order_items ADD COLUMN unit_cost_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!soiColNames.has('total_cost_paisas')) db.exec("ALTER TABLE sales_order_items ADD COLUMN total_cost_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!soiColNames.has('unit_cost')) db.exec("ALTER TABLE sales_order_items ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0.00;");
  if (!soiColNames.has('total_cost')) db.exec("ALTER TABLE sales_order_items ADD COLUMN total_cost REAL NOT NULL DEFAULT 0.00;");
  if (!soiColNames.has('unit_price')) db.exec("ALTER TABLE sales_order_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 0.00;");
  if (!soiColNames.has('line_total')) db.exec("ALTER TABLE sales_order_items ADD COLUMN line_total REAL NOT NULL DEFAULT 0.00;");
  if (!soiColNames.has('tax_percent')) db.exec("ALTER TABLE sales_order_items ADD COLUMN tax_percent REAL NOT NULL DEFAULT 0;");
  if (!soiColNames.has('tax_paisas')) db.exec("ALTER TABLE sales_order_items ADD COLUMN tax_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!soiColNames.has('tax')) db.exec("ALTER TABLE sales_order_items ADD COLUMN tax REAL NOT NULL DEFAULT 0.00;");

  // Check sales_orders tax columns
  const currentSoCols = db.prepare("PRAGMA table_info(sales_orders)").all() as { name: string }[];
  const currentSoColNames = new Set(currentSoCols.map((c) => c.name));
  if (!currentSoColNames.has('tax_amount_paisas')) db.exec("ALTER TABLE sales_orders ADD COLUMN tax_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  if (!currentSoColNames.has('tax')) db.exec("ALTER TABLE sales_orders ADD COLUMN tax REAL NOT NULL DEFAULT 0.00;");

  // Ensure 2020 Sales Tax / Output Tax Payable exists in Chart of Accounts
  const has2020 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '2020'").get();
  if (!has2020) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, '2020', 'Sales Tax / Output Tax Payable', 'LIABILITY', 'CREDIT', 1, 1, 'Collected sales tax payable to authority', 'PKR')
    `).run(crypto.randomUUID());
  }

  // Ensure 5060 Sales Promotion & Scheme Expense exists in Chart of Accounts
  const has5060 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5060'").get();
  if (!has5060) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, '5060', 'Sales Promotion & Scheme Expense', 'EXPENSE', 'DEBIT', 1, 1, 'Cost of bonus free sample units to retailers', 'PKR')
    `).run(crypto.randomUUID());
  }

  // Ensure 5040 Inward Freight Expense is properly labeled
  db.exec("UPDATE chart_of_accounts SET name = 'Inward Freight Expense' WHERE code = '5040';");

  // Ensure standard Phase 6 Expense Accounts exist in Chart of Accounts
  const standardExpenses = [
    { code: '5020', name: 'Sales Van & Delivery Fuel', desc: 'Distribution vehicle petrol, diesel, and CNG expenses' },
    { code: '5025', name: 'Vehicle Repair & Maintenance', desc: 'Van servicing, engine oil, tires, and maintenance' },
    { code: '5035', name: 'Staff Tea & Food / Refreshments', desc: 'Daily driver, supply man, and warehouse tea & food' },
    { code: '5045', name: 'Warehouse Rent & Utilities', desc: 'Electricity bills, godown rent, and municipal taxes' },
    { code: '5050', name: 'General & Miscellaneous Expenses', desc: 'Stationery, office supplies, petty cash sundries' },
  ];

  for (const exp of standardExpenses) {
    const existing = db.prepare("SELECT id FROM chart_of_accounts WHERE code = ?").get(exp.code);
    if (!existing) {
      db.prepare(`
        INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
        VALUES (?, ?, ?, 'EXPENSE', 'DEBIT', 1, 0, ?, 'PKR')
      `).run(crypto.randomUUID(), exp.code, exp.name, exp.desc);
    }
  }

  // Ensure Phase 6 tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        voucher_number TEXT UNIQUE NOT NULL,
        expense_date TEXT NOT NULL,
        expense_account_id TEXT NOT NULL,
        paid_from_account_id TEXT NOT NULL,
        amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
        amount REAL NOT NULL CHECK (amount > 0),
        staff_id TEXT,
        vehicle_number TEXT,
        description TEXT NOT NULL,
        journal_entry_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (paid_from_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS daily_closings (
        id TEXT PRIMARY KEY,
        closing_date TEXT UNIQUE NOT NULL,
        opening_cash_paisas INTEGER NOT NULL DEFAULT 0,
        spot_cash_sales_paisas INTEGER NOT NULL DEFAULT 0,
        debt_recoveries_paisas INTEGER NOT NULL DEFAULT 0,
        spot_cash_purchases_paisas INTEGER NOT NULL DEFAULT 0,
        daily_expenses_paisas INTEGER NOT NULL DEFAULT 0,
        bank_deposits_paisas INTEGER NOT NULL DEFAULT 0,
        expected_cash_paisas INTEGER NOT NULL DEFAULT 0,
        physical_cash_paisas INTEGER NOT NULL DEFAULT 0,
        variance_paisas INTEGER NOT NULL DEFAULT 0,
        denominations_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'CLOSED')),
        notes TEXT,
        closed_by TEXT DEFAULT 'Admin Cashier',
        closed_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_journal_lines_subledger ON journal_lines(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_journal_lines_acc_entity ON journal_lines(account_id, entity_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal ON journal_entries(reversal_of_id);
    CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_route ON sales_orders(route_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_route ON sales_invoices(route_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_salesman ON sales_invoices(salesman_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor ON purchase_bills(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill ON purchase_bill_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(expense_account_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_from ON expenses(paid_from_account_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_staff ON expenses(staff_id);
    CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);
  `);

  // Ensure Phase 6 feature flags exist
  const phase6Flags = [
    {
      key: 'expenses.enable_daily_expenses',
      moduleId: 'expenses',
      value: 'true',
      label: 'Daily Operational Expenses',
      description: 'Enables petty cash, fuel, vehicle, and operational expense tracking with direct GL debit postings.',
    },
    {
      key: 'closing.enable_denomination_counter',
      moduleId: 'closing',
      value: 'true',
      label: 'Currency Denomination Counter',
      description: 'Interactive Pakistani Rupee denomination counter (5000 down to 10 & coins) for physical cash counting.',
    },
    {
      key: 'closing.enable_day_lock',
      moduleId: 'closing',
      value: 'true',
      label: 'Daily Cash Day-End Lock',
      description: 'Locks and finalizes daily cash ledger to prevent backdated modifications once closed.',
    },
  ];

  const insertFlagStmt = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000001', ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const f of phase6Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // Ensure Phase 7 Chart of Accounts exist
  const has4030 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4030'").get();
  if (!has4030) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, '4030', 'Sales Returns & Allowances', 'REVENUE', 'DEBIT', 1, 1, 'Contra-revenue account for customer returned goods', 'PKR')
    `).run(crypto.randomUUID());
  }

  const has5070 = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5070'").get();
  if (!has5070) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, '5070', 'Damaged Goods & Expiry Loss', 'EXPENSE', 'DEBIT', 1, 1, 'Quarantine inventory losses on expired or damaged merchandise', 'PKR')
    `).run(crypto.randomUUID());
  }

  // Ensure Phase 7 tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_returns (
        id TEXT PRIMARY KEY,
        return_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        invoice_id TEXT,
        return_date TEXT NOT NULL,
        salesman_id TEXT,
        supply_person_id TEXT,
        settlement_type TEXT NOT NULL DEFAULT 'CREDIT_TO_LEDGER' CHECK (settlement_type IN ('CREDIT_TO_LEDGER', 'CASH_REFUND')),
        subtotal_paisas INTEGER NOT NULL DEFAULT 0,
        total_refund_paisas INTEGER NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0.00,
        total_refund REAL NOT NULL DEFAULT 0.00,
        journal_entry_id TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (salesman_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (supply_person_id) REFERENCES staff_members(id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sales_return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        condition TEXT NOT NULL DEFAULT 'FRESH' CHECK (condition IN ('FRESH', 'DAMAGED_EXPIRED')),
        cartons_qty INTEGER NOT NULL DEFAULT 0,
        boxes_qty INTEGER NOT NULL DEFAULT 0,
        pieces_qty INTEGER NOT NULL DEFAULT 0,
        total_base_qty INTEGER NOT NULL CHECK (total_base_qty > 0),
        unit_rate_paisas INTEGER NOT NULL DEFAULT 0,
        line_total_paisas INTEGER NOT NULL DEFAULT 0,
        unit_rate REAL NOT NULL DEFAULT 0.00,
        line_total REAL NOT NULL DEFAULT 0.00,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
        id TEXT PRIMARY KEY,
        return_number TEXT UNIQUE NOT NULL,
        vendor_id TEXT NOT NULL,
        return_date TEXT NOT NULL,
        vendor_invoice_number TEXT,
        total_amount_paisas INTEGER NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0.00,
        journal_entry_id TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        cartons_qty INTEGER NOT NULL DEFAULT 0,
        boxes_qty INTEGER NOT NULL DEFAULT 0,
        pieces_qty INTEGER NOT NULL DEFAULT 0,
        total_base_qty INTEGER NOT NULL CHECK (total_base_qty > 0),
        rate_per_piece_paisas INTEGER NOT NULL DEFAULT 0,
        line_total_paisas INTEGER NOT NULL DEFAULT 0,
        rate_per_piece REAL NOT NULL DEFAULT 0.00,
        line_total REAL NOT NULL DEFAULT 0.00,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
    CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_sales_return_items_product ON sales_return_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(return_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON purchase_return_items(product_id);
  `);

  // Ensure Phase 7 feature flags exist
  const phase7Flags = [
    {
      key: 'returns.enable_sales_returns',
      moduleId: 'returns',
      value: 'true',
      label: 'Customer Sales Returns & Credit Notes',
      description: 'Enables customer sales return module and credit note generation with revenue contra posting.',
    },
    {
      key: 'returns.enable_purchase_returns',
      moduleId: 'returns',
      value: 'true',
      label: 'Supplier Purchase Returns & Debit Notes',
      description: 'Enables purchase return module and debit note generation with inventory relief.',
    },
    {
      key: 'returns.strict_sales_history_validation',
      moduleId: 'returns',
      value: 'true',
      label: 'Strict Sales History Return Audit',
      description: 'Strictly blocks returning products never delivered or return quantities exceeding net delivered units.',
    },
    {
      key: 'returns.separate_damage_quarantine',
      moduleId: 'returns',
      value: 'true',
      label: 'Damaged / Expired Quarantine Stock',
      description: 'Isolates damaged and expired returns in quarantine stock rather than sellable inventory.',
    },
  ];

  for (const f of phase7Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // Ensure Phase 8 feature flags exist
  const phase8Flags = [
    {
      key: 'reports.enable_party_ledgers',
      moduleId: 'reports',
      value: 'true',
      label: 'Party Ledgers & Statement of Account',
      description: 'Enables customer and vendor khata jaat with opening and running balances.',
    },
    {
      key: 'reports.enable_profit_and_loss',
      moduleId: 'reports',
      value: 'true',
      label: 'Profit & Loss Statement (Munaffa)',
      description: 'Enables double-entry trading margin, operating expenses, and net profit report.',
    },
    {
      key: 'reports.enable_stock_valuation',
      moduleId: 'reports',
      value: 'true',
      label: 'Stock Valuation & Godown Summary',
      description: 'Enables 3-tier inventory packaging breakdown, sellable valuation, and quarantine stock audit.',
    },
    {
      key: 'reports.enable_salesman_recovery',
      moduleId: 'reports',
      value: 'true',
      label: 'Salesman & Route Recovery Performance',
      description: 'Enables order booking, spot cash, credit, and route collection accountability report.',
    },
  ];

  for (const f of phase8Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // Ensure Phase 9 tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SALESMAN', 'CASHIER', 'WAREHOUSE', 'ORDER_BOOKER')),
        staff_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        permissions_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
    CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure permissions_json column exists on app_users if table already existed
  const appUserColumns = db.prepare("PRAGMA table_info(app_users)").all() as any[];
  if (!appUserColumns.some((col: any) => col.name === 'permissions_json')) {
    db.exec("ALTER TABLE app_users ADD COLUMN permissions_json TEXT;");
  }

  // Ensure default Admin PIN exists in app_settings (Default PIN: 1234)
  const pinSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_security_pin' AND company_id = '00000000-0000-0000-0000-000000000001'").get();
  if (!pinSetting) {
    const crypto = require('crypto');
    const defaultPinHash = crypto.createHash('sha256').update('saleflow_admin_pin_1234').digest('hex');
    db.prepare(`
      INSERT INTO app_settings (company_id, key, value, description, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000001', 'admin_security_pin', ?, 'Hashed 4-digit security PIN for void authorization', datetime('now'))
    `).run(defaultPinHash);
  }

  // Ensure Phase 9 feature flags exist
  const phase9Flags = [
    {
      key: 'auth.enable_rbac',
      moduleId: 'auth',
      value: 'true',
      label: 'Role-Based Access Control (RBAC)',
      description: 'Enforces route guards, navigation filtering, and permission restrictions based on user roles.',
    },
    {
      key: 'auth.require_admin_pin_for_void',
      moduleId: 'auth',
      value: 'true',
      label: 'Admin Security PIN for Transaction Voiding',
      description: 'Requires 4-digit Admin PIN verification before voiding orders, bills, expenses, or journal vouchers.',
    },
    {
      key: 'auth.mask_cost_price_for_salesmen',
      moduleId: 'auth',
      value: 'true',
      label: 'Mask Product Cost & Profit from Salesmen',
      description: 'Hides product purchase cost and profit margin indicators for salesman accounts across order booking and catalogs.',
    },
  ];

  for (const f of phase9Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // Ensure Phase 10 feature flags exist
  const phase10Flags = [
    {
      key: 'backup.enable_manual_backup',
      moduleId: 'backup',
      value: 'true',
      label: 'Manual Database Backup',
      description: 'Allows administrators to create and download live SQLite database backup snapshots on-demand.',
    },
    {
      key: 'backup.enable_auto_daily_backup',
      moduleId: 'backup',
      value: 'true',
      label: 'Automatic Day-End Closing Backup',
      description: 'Automatically creates a timestamped SQLite database snapshot whenever daily cash closing is finalized and locked.',
    },
    {
      key: 'backup.require_admin_pin_for_restore',
      moduleId: 'backup',
      value: 'true',
      label: 'Admin PIN Safeguard for Database Restore',
      description: 'Strictly requires 4-digit Admin PIN verification before restoring or overwriting the system database.',
    },
  ];

  for (const f of phase10Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // Ensure Phase 11: Company Profile & Print Customization Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_profile (
        id TEXT PRIMARY KEY,
        business_name TEXT NOT NULL DEFAULT 'SaleFlow Distribution',
        tagline TEXT DEFAULT 'Wholesale & FMCG Distribution',
        phone_primary TEXT DEFAULT '',
        phone_secondary TEXT DEFAULT '',
        email TEXT DEFAULT '',
        address TEXT DEFAULT '',
        city TEXT DEFAULT '',
        ntn_strn TEXT DEFAULT '',
        logo_url TEXT,
        currency_symbol TEXT DEFAULT 'PKR',
        thermal_footer_note TEXT DEFAULT 'Computer Generated Bill. Software Powered by SaleFlow.',
        invoice_terms TEXT DEFAULT '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
        show_logo_on_prints INTEGER NOT NULL DEFAULT 1,
        show_ntn_on_invoices INTEGER NOT NULL DEFAULT 1,
        show_customer_previous_balance INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default company profile if none exists
  const profileCountRow = db.prepare('SELECT COUNT(*) as count FROM company_profile').get() as { count: number };
  if (!profileCountRow || profileCountRow.count === 0) {
    db.prepare(`
      INSERT INTO company_profile (
        id, business_name, tagline, phone_primary, phone_secondary, email, address, city, ntn_strn,
        currency_symbol, thermal_footer_note, invoice_terms, show_logo_on_prints, show_ntn_on_invoices,
        show_customer_previous_balance, updated_at
      ) VALUES (
        'default-company-profile',
        'SaleFlow Distribution',
        'Wholesale & FMCG Distribution',
        '+92 300 1234567',
        '+92 321 7654321',
        'info@saleflow.pk',
        'Plot 45-B, Sector 12, Industrial Area',
        'Karachi',
        'NTN: 1234567-8 | STRN: 9876543210',
        'PKR',
        'Computer Generated Bill. Software Powered by SaleFlow.',
        '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
        1, 1, 1, datetime('now')
      )
    `).run();
  }

  // Ensure Phase 11 feature flag exists
  insertFlagStmt.run(
    'settings.enable_custom_branding',
    'settings',
    'true',
    'Custom Business Branding & Prints',
    'Enables dynamic business logo, contact information, custom footer, and terms on print templates.'
  );

  // ==========================================================
  // Phase 12: Brands & Product Master Professionalization
  // ==========================================================
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

  // Ensure category columns
  const categoryColumns = db.prepare("PRAGMA table_info(categories)").all() as any[];
  if (!categoryColumns.some((col: any) => col.name === 'description')) {
    db.exec("ALTER TABLE categories ADD COLUMN description TEXT;");
  }
  if (!categoryColumns.some((col: any) => col.name === 'updated_at')) {
    db.exec("ALTER TABLE categories ADD COLUMN updated_at TEXT;");
  }

  // Ensure products columns
  const productColumns = db.prepare("PRAGMA table_info(products)").all() as any[];
  if (!productColumns.some((col: any) => col.name === 'brand_id')) {
    db.exec("ALTER TABLE products ADD COLUMN brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL;");
  }
  if (!productColumns.some((col: any) => col.name === 'brand_name')) {
    db.exec("ALTER TABLE products ADD COLUMN brand_name TEXT;");
  }
  if (!productColumns.some((col: any) => col.name === 'boxes_per_carton')) {
    db.exec("ALTER TABLE products ADD COLUMN boxes_per_carton INTEGER NOT NULL DEFAULT 1;");
  }
  if (!productColumns.some((col: any) => col.name === 'pieces_per_box')) {
    db.exec("ALTER TABLE products ADD COLUMN pieces_per_box INTEGER NOT NULL DEFAULT 1;");
  }
  if (!productColumns.some((col: any) => col.name === 'total_pieces_per_carton')) {
    db.exec("ALTER TABLE products ADD COLUMN total_pieces_per_carton INTEGER NOT NULL DEFAULT 1;");
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);`);

  // Ensure sales_order_items boxes_count
  const soItemColumns = db.prepare("PRAGMA table_info(sales_order_items)").all() as any[];
  if (!soItemColumns.some((col: any) => col.name === 'boxes_count')) {
    db.exec("ALTER TABLE sales_order_items ADD COLUMN boxes_count INTEGER NOT NULL DEFAULT 0;");
  }

  // Ensure sales_invoice_items boxes_count
  const siItemColumns = db.prepare("PRAGMA table_info(sales_invoice_items)").all() as any[];
  if (!siItemColumns.some((col: any) => col.name === 'boxes_count')) {
    db.exec("ALTER TABLE sales_invoice_items ADD COLUMN boxes_count INTEGER NOT NULL DEFAULT 0;");
  }

  // Phase 12 Feature Flags
  const phase12Flags = [
    {
      key: 'inventory.enable_brand_management',
      moduleId: 'inventory',
      value: 'true',
      label: 'Brand & Company Master Management',
      description: 'Enables creation, editing, and filtering of manufacturer brands and company principles.',
    },
    {
      key: 'inventory.enable_3tier_packaging',
      moduleId: 'inventory',
      value: 'true',
      label: '3-Tier Flexible Packaging (Carton > Box > Piece)',
      description: 'Enables multi-tier packaging configuration per product with automatic conversion across inventory, sales, and purchase.',
    },
  ];

  for (const f of phase12Flags) {
    insertFlagStmt.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // ==========================================================
  // Phase 13: Payments & Cash (Payment Received & Payment Made)
  // ==========================================================
  // Ensure customer_payments columns
  const cpColumns = db.prepare("PRAGMA table_info(customer_payments)").all() as any[];
  if (!cpColumns.some((col: any) => col.name === 'account_id')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN account_id TEXT;");
  }
  if (!cpColumns.some((col: any) => col.name === 'unallocated_amount_paisas')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  }
  if (!cpColumns.some((col: any) => col.name === 'unallocated_amount')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN unallocated_amount REAL NOT NULL DEFAULT 0.00;");
  }
  if (!cpColumns.some((col: any) => col.name === 'status')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN status TEXT NOT NULL DEFAULT 'POSTED';");
  }
  if (!cpColumns.some((col: any) => col.name === 'notes')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN notes TEXT;");
  }
  if (!cpColumns.some((col: any) => col.name === 'updated_at')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN updated_at TEXT;");
  }

  // Ensure customer_payment_allocations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_payment_allocations (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        invoice_type TEXT NOT NULL DEFAULT 'ORDER' CHECK (invoice_type IN ('ORDER', 'INVOICE')),
        allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
        allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_payment ON customer_payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_invoice ON customer_payment_allocations(invoice_id);
  `);

  // Ensure vendor_payments & vendor_payment_allocations tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payments (
        id TEXT PRIMARY KEY,
        payment_number TEXT UNIQUE NOT NULL,
        payment_date TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE')),
        amount_paisas INTEGER NOT NULL CHECK (amount_paisas > 0),
        amount REAL NOT NULL CHECK (amount > 0),
        unallocated_amount_paisas INTEGER NOT NULL DEFAULT 0,
        unallocated_amount REAL NOT NULL DEFAULT 0.00,
        reference_note TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
        journal_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_account ON vendor_payments(account_id);

    CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        bill_id TEXT NOT NULL,
        allocated_amount_paisas INTEGER NOT NULL CHECK (allocated_amount_paisas > 0),
        allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (payment_id) REFERENCES vendor_payments(id) ON DELETE CASCADE,
        FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_payment ON vendor_payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_bill ON vendor_payment_allocations(bill_id);
  `);

  // Ensure purchase_bills payment tracking columns
  const pbColumns = db.prepare("PRAGMA table_info(purchase_bills)").all() as any[];
  if (!pbColumns.some((col: any) => col.name === 'paid_amount_paisas')) {
    db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  }
  if (!pbColumns.some((col: any) => col.name === 'paid_amount')) {
    db.exec("ALTER TABLE purchase_bills ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0.00;");
  }
  if (!pbColumns.some((col: any) => col.name === 'remaining_balance_paisas')) {
    db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance_paisas INTEGER NOT NULL DEFAULT 0;");
  }
  if (!pbColumns.some((col: any) => col.name === 'remaining_balance')) {
    db.exec("ALTER TABLE purchase_bills ADD COLUMN remaining_balance REAL NOT NULL DEFAULT 0.00;");
  }
  if (!pbColumns.some((col: any) => col.name === 'payment_status')) {
    db.exec("ALTER TABLE purchase_bills ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';");
  }

  // Ensure sales_invoices remaining_balance column
  const siColumns = db.prepare("PRAGMA table_info(sales_invoices)").all() as any[];
  if (!siColumns.some((col: any) => col.name === 'remaining_balance')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN remaining_balance REAL NOT NULL DEFAULT 0.00;");
    db.exec("UPDATE sales_invoices SET remaining_balance = remaining_balance_paisas / 100.0;");
  }

  // Populate remaining balance on existing posted bills if needed
  db.exec(`
    UPDATE purchase_bills
    SET remaining_balance_paisas = net_amount_paisas,
        remaining_balance = net_amount
    WHERE paid_amount_paisas = 0 
      AND (remaining_balance_paisas = 0 OR remaining_balance_paisas IS NULL)
      AND net_amount_paisas > 0;
  `);

  // Register payments system module
  db.prepare(`
    INSERT OR IGNORE INTO system_modules (id, name, description, version, is_enabled)
    VALUES ('payments', 'Payments & Cash Management', 'Customer payment receipts, vendor payment vouchers, bill/invoice allocations, on-account liquidity.', '1.0.0', 1)
  `).run();

  // Ensure audit_logs table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        transaction_number TEXT,
        transaction_date TEXT,
        reason TEXT NOT NULL,
        is_day_closed INTEGER NOT NULL DEFAULT 0,
        details_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);

  // Upgrade staff_members schema (add employee_code, route_id, notes and expand role CHECK to include 'BOTH')
  const staffCols = db.prepare("PRAGMA table_info(staff_members)").all() as any[];
  const staffColNames = new Set(staffCols.map((c: any) => c.name));
  
  if (!staffColNames.has('employee_code') || !staffColNames.has('route_id') || !staffColNames.has('notes')) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS staff_members_migrated (
          id TEXT PRIMARY KEY,
          employee_code TEXT UNIQUE,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('SALESMAN', 'SUPPLY_PERSON', 'BOTH', 'DRIVER', 'MANAGER')),
          phone TEXT,
          route_id TEXT,
          notes TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
      );
    `);

    const existingStaff = db.prepare("SELECT * FROM staff_members ORDER BY created_at ASC").all() as any[];
    const insertMigrated = db.prepare(`
      INSERT OR REPLACE INTO staff_members_migrated (
        id, employee_code, name, role, phone, route_id, notes, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let empNum = 1;
    for (const s of existingStaff) {
      const code = s.employee_code || `EMP-${String(empNum++).padStart(3, '0')}`;
      insertMigrated.run(
        s.id,
        code,
        s.name,
        s.role,
        s.phone || null,
        s.route_id || null,
        s.notes || null,
        s.is_active !== undefined ? s.is_active : 1,
        s.created_at || new Date().toISOString(),
        s.updated_at || new Date().toISOString()
      );
    }

    db.exec("DROP TABLE staff_members;");
    db.exec("ALTER TABLE staff_members_migrated RENAME TO staff_members;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_staff_members_role ON staff_members(role);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_staff_members_active ON staff_members(is_active);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_staff_members_code ON staff_members(employee_code);");
    db.exec("PRAGMA foreign_keys = ON;");
  }

  // Ensure sales_returns has supply_person_id and invoice_id
  const srCols = db.prepare("PRAGMA table_info(sales_returns)").all() as any[];
  const srColNames = new Set(srCols.map((c: any) => c.name));
  if (!srColNames.has('supply_person_id')) {
    db.exec("ALTER TABLE sales_returns ADD COLUMN supply_person_id TEXT;");
  }
  if (!srColNames.has('invoice_id')) {
    db.exec("ALTER TABLE sales_returns ADD COLUMN invoice_id TEXT;");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_returns_salesman ON sales_returns(salesman_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_returns_supply_person ON sales_returns(supply_person_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);");

  // Ensure bank_accounts master table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        bank_name TEXT NOT NULL,
        account_title TEXT NOT NULL,
        account_number TEXT NOT NULL,
        iban TEXT,
        branch_name TEXT,
        branch_code TEXT,
        account_type TEXT NOT NULL DEFAULT 'CURRENT' CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OTHER')),
        currency TEXT NOT NULL DEFAULT 'PKR',
        opening_balance_paisas INTEGER NOT NULL DEFAULT 0,
        opening_balance REAL NOT NULL DEFAULT 0.00,
        account_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_id ON bank_accounts(account_id);
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_active ON bank_accounts(is_active);
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank_name ON bank_accounts(bank_name);
  `);

  // Ensure bank_account_id exists on customer_payments, vendor_payments, expenses
  const cpCols = db.prepare("PRAGMA table_info(customer_payments)").all() as any[];
  if (!cpCols.some((c: any) => c.name === 'bank_account_id')) {
    db.exec("ALTER TABLE customer_payments ADD COLUMN bank_account_id TEXT;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_payments_bank ON customer_payments(bank_account_id);");
  }

  const vpCols = db.prepare("PRAGMA table_info(vendor_payments)").all() as any[];
  if (!vpCols.some((c: any) => c.name === 'bank_account_id')) {
    db.exec("ALTER TABLE vendor_payments ADD COLUMN bank_account_id TEXT;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_vendor_payments_bank ON vendor_payments(bank_account_id);");
  }

  const expCols = db.prepare("PRAGMA table_info(expenses)").all() as any[];
  if (!expCols.some((c: any) => c.name === 'bank_account_id')) {
    db.exec("ALTER TABLE expenses ADD COLUMN bank_account_id TEXT;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_expenses_bank ON expenses(bank_account_id);");
  }

  // Ensure routes table has territory and staff assignment columns
  const routeCols = db.prepare("PRAGMA table_info(routes)").all() as any[];
  if (!routeCols.some((c: any) => c.name === 'area_territory')) {
    db.exec("ALTER TABLE routes ADD COLUMN area_territory TEXT;");
  }
  if (!routeCols.some((c: any) => c.name === 'city')) {
    db.exec("ALTER TABLE routes ADD COLUMN city TEXT;");
  }
  if (!routeCols.some((c: any) => c.name === 'assigned_salesperson_id')) {
    db.exec("ALTER TABLE routes ADD COLUMN assigned_salesperson_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL;");
  }
  if (!routeCols.some((c: any) => c.name === 'assigned_supply_person_id')) {
    db.exec("ALTER TABLE routes ADD COLUMN assigned_supply_person_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL;");
  }
  if (!routeCols.some((c: any) => c.name === 'notes')) {
    db.exec("ALTER TABLE routes ADD COLUMN notes TEXT;");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_routes_is_active ON routes(is_active);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_routes_salesperson ON routes(assigned_salesperson_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_routes_supply_person ON routes(assigned_supply_person_id);");

  // Ensure inventory_movements central audit table and indexes exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        movement_number TEXT UNIQUE NOT NULL,
        movement_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        category_id TEXT,
        category_name TEXT,
        brand_id TEXT,
        brand_name TEXT,
        warehouse TEXT NOT NULL DEFAULT 'Main Warehouse',
        to_warehouse TEXT,
        movement_type TEXT NOT NULL,
        source_module TEXT NOT NULL,
        source_document_type TEXT NOT NULL,
        document_number TEXT NOT NULL,
        original_transaction_id TEXT,
        reference_number TEXT,
        quantity_in_base INTEGER NOT NULL DEFAULT 0 CHECK (quantity_in_base >= 0),
        quantity_out_base INTEGER NOT NULL DEFAULT 0 CHECK (quantity_out_base >= 0),
        net_quantity_base INTEGER NOT NULL,
        cartons_count INTEGER NOT NULL DEFAULT 0,
        boxes_count INTEGER NOT NULL DEFAULT 0,
        pieces_count INTEGER NOT NULL DEFAULT 0,
        stock_before_base INTEGER NOT NULL,
        stock_after_base INTEGER NOT NULL,
        unit_cost_paisas INTEGER NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0.00,
        total_cost_paisas INTEGER NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0.00,
        selling_price REAL NOT NULL DEFAULT 0.00,
        user_id TEXT DEFAULT 'admin',
        user_name TEXT DEFAULT 'Administrator',
        user_role TEXT DEFAULT 'ADMIN',
        status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED', 'DELETED')),
        reversed_by_user_id TEXT,
        reversed_by_user_name TEXT,
        reversed_at TEXT,
        reversal_reason TEXT,
        admin_override_details TEXT,
        reversal_linked_movement_id TEXT,
        day_close_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (day_close_status IN ('OPEN', 'CLOSED')),
        notes TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_date ON inventory_movements(product_id, movement_date, created_at);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_date ON inventory_movements(movement_date);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_doc ON inventory_movements(document_number);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_source ON inventory_movements(source_module, source_document_type);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_orig_tx ON inventory_movements(original_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_status ON inventory_movements(status);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_warehouse ON inventory_movements(warehouse);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_reversal ON inventory_movements(reversal_linked_movement_id);
  `);

  // Backfill baseline opening records for existing products if inventory_movements is empty
  const countRow = db.prepare("SELECT count(*) as count FROM inventory_movements").get() as { count: number };
  if (countRow.count === 0) {
    const existingProducts = db.prepare(`
      SELECT p.*, c.name as cat_name, b.name as b_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.current_stock_base > 0
    `).all() as any[];

    let seq = 1;
    const year = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];

    const insertStmt = db.prepare(`
      INSERT INTO inventory_movements (
        id, movement_number, movement_date, created_at,
        product_id, product_name, sku, barcode,
        category_id, category_name, brand_id, brand_name,
        warehouse, movement_type, source_module, source_document_type,
        document_number, original_transaction_id, reference_number,
        quantity_in_base, quantity_out_base, net_quantity_base,
        cartons_count, boxes_count, pieces_count,
        stock_before_base, stock_after_base,
        unit_cost_paisas, unit_cost, total_cost_paisas, total_cost, selling_price,
        user_id, user_name, user_role, status, day_close_status, notes
      ) VALUES (
        ?, ?, ?, datetime('now'),
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        'Main Warehouse', 'OPENING_STOCK', 'inventory', 'PRODUCT_OPENING',
        ?, NULL, 'INITIAL-BALANCE',
        ?, 0, ?,
        ?, ?, ?,
        0, ?,
        ?, ?, ?, ?, ?,
        'admin', 'System Administrator', 'ADMIN', 'POSTED', 'OPEN', 'Initial Stock Ledger Baseline'
      )
    `);

    for (const prod of existingProducts) {
      const id = crypto.randomUUID();
      const movNumber = `MOV-${year}-${String(seq++).padStart(6, '0')}`;
      const stock = prod.current_stock_base || 0;
      const bpc = Math.max(1, prod.boxes_per_carton || 1);
      const ppb = Math.max(1, prod.pieces_per_box || 1);
      const totalPiecesPerCarton = bpc * ppb;
      const cartons = Math.floor(stock / totalPiecesPerCarton);
      const remainder = stock % totalPiecesPerCarton;
      const boxes = Math.floor(remainder / ppb);
      const pieces = remainder % ppb;

      const unitCostPaisas = prod.cost_price_paisas || 0;
      const unitCost = prod.cost_price || 0.0;
      const totalCostPaisas = unitCostPaisas * stock;
      const totalCost = Number((totalCostPaisas / 100).toFixed(2));
      const sellingPrice = prod.selling_price || 0.0;

      insertStmt.run(
        id,
        movNumber,
        today,
        prod.id,
        prod.name,
        prod.sku,
        prod.barcode || null,
        prod.category_id || null,
        prod.cat_name || prod.category || 'General',
        prod.brand_id || null,
        prod.b_name || prod.brand_name || 'Generic / Unbranded',
        `OPENING-STK-${prod.sku}`,
        stock,
        stock,
        cartons,
        boxes,
        pieces,
        stock,
        unitCostPaisas,
        unitCost,
        totalCostPaisas,
        totalCost,
        sellingPrice
      );
    }
  }

  // Ensure tax columns on sales_orders
  const orderCols = db.prepare("PRAGMA table_info(sales_orders);").all() as any[];
  if (!orderCols.some((c: any) => c.name === 'tax_amount_paisas')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN tax_amount_paisas INTEGER NOT NULL DEFAULT 0;");
  }
  if (!orderCols.some((c: any) => c.name === 'tax')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN tax REAL NOT NULL DEFAULT 0.00;");
  }

  // Ensure tax columns on sales_order_items
  const itemCols = db.prepare("PRAGMA table_info(sales_order_items);").all() as any[];
  if (!itemCols.some((c: any) => c.name === 'tax_percent')) {
    db.exec("ALTER TABLE sales_order_items ADD COLUMN tax_percent REAL NOT NULL DEFAULT 0;");
  }
  if (!itemCols.some((c: any) => c.name === 'tax_paisas')) {
    db.exec("ALTER TABLE sales_order_items ADD COLUMN tax_paisas INTEGER NOT NULL DEFAULT 0;");
  }
  if (!itemCols.some((c: any) => c.name === 'tax')) {
    db.exec("ALTER TABLE sales_order_items ADD COLUMN tax REAL NOT NULL DEFAULT 0.00;");
  }

  // Ensure Account 2020 (Sales Tax / Output Tax Payable)
  const existingTaxAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '2020'").get();
  if (!existingTaxAcc) {
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, type, normal_balance, is_active)
      VALUES (?, '2020', 'Sales Tax / Output Tax Payable', 'LIABILITY', 'CREDIT', 1)
    `).run(crypto.randomUUID());
  }

  // Ensure Field Order Booking metadata columns on sales_orders
  const fieldSoCols = db.prepare("PRAGMA table_info(sales_orders);").all() as any[];
  const fieldSoColNames = new Set(fieldSoCols.map((c: any) => c.name));
  if (!fieldSoColNames.has('source_channel')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'OFFICE';");
  }
  if (!fieldSoColNames.has('created_by_user_id')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN created_by_user_id TEXT;");
  }
  if (!fieldSoColNames.has('created_by_staff_id')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN created_by_staff_id TEXT;");
  }
  if (!fieldSoColNames.has('client_order_uuid')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN client_order_uuid TEXT;");
  }
  if (!fieldSoColNames.has('booker_order_sequence')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN booker_order_sequence INTEGER;");
  }
  if (!fieldSoColNames.has('sync_status')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'SYNCED';");
  }
  if (!fieldSoColNames.has('client_created_at')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN client_created_at TEXT;");
  }
  if (!fieldSoColNames.has('server_received_at')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN server_received_at TEXT;");
  }
  if (!fieldSoColNames.has('target_delivery_date')) {
    db.exec("ALTER TABLE sales_orders ADD COLUMN target_delivery_date TEXT;");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_client_uuid ON sales_orders(client_order_uuid) WHERE client_order_uuid IS NOT NULL;");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_orders_source ON sales_orders(source_channel);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_orders_booker ON sales_orders(created_by_staff_id);");

  // Ensure metadata columns on sales_invoices
  const siColsAll = db.prepare("PRAGMA table_info(sales_invoices);").all() as any[];
  const siColNamesAll = new Set(siColsAll.map((c: any) => c.name));
  if (!siColNamesAll.has('source_channel')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'OFFICE';");
  }
  if (!siColNamesAll.has('created_by_user_id')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN created_by_user_id TEXT;");
  }
  if (!siColNamesAll.has('created_by_staff_id')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN created_by_staff_id TEXT;");
  }
  if (!siColNamesAll.has('client_order_uuid')) {
    db.exec("ALTER TABLE sales_invoices ADD COLUMN client_order_uuid TEXT;");
  }

  // Ensure order_booker_sequences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_booker_sequences (
        booker_code TEXT NOT NULL,
        date_code TEXT NOT NULL,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (booker_code, date_code)
    );
  `);

  // Migrate app_users role check to include ORDER_BOOKER if necessary
  const userSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='app_users'").get() as { sql: string } | undefined;
  if (userSqlRow && !userSqlRow.sql.includes('ORDER_BOOKER')) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_users_migrated (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SALESMAN', 'CASHIER', 'WAREHOUSE', 'ORDER_BOOKER')),
          staff_id TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          permissions_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE SET NULL
      );
      INSERT INTO app_users_migrated (id, username, password_hash, full_name, role, staff_id, is_active, permissions_json, created_at, updated_at)
      SELECT id, username, password_hash, full_name, role, staff_id, is_active, permissions_json, created_at, updated_at FROM app_users;
      DROP TABLE app_users;
      ALTER TABLE app_users_migrated RENAME TO app_users;
      CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
      CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
      PRAGMA foreign_keys = ON;
    `);
  }

  // Register field_order_booking system module in system_modules
  db.prepare(`
    INSERT OR IGNORE INTO system_modules (id, name, description, version, is_enabled, dependencies)
    VALUES ('field_order_booking', 'Field Order Booking', 'Mobile and tablet order booking portal for field market visits and route-assigned bookers.', '1.0.0', 1, '["sales", "customers"]')
  `).run();

  // Phase 2A: Safe Tenant/Company Schema Foundation
  applyPhase2aTenancyMigrations(db);
}

/**
 * Phase 2A Migration: Safe Tenant/Company Schema Foundation
 */
export function applyPhase2aTenancyMigrations(db: any): void {
  // 1. Create companies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      plan TEXT NOT NULL DEFAULT 'COMMERCIAL',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Insert default company
  const compRow = db.prepare('SELECT id FROM companies WHERE id = ?').get(DEFAULT_COMPANY_ID);
  if (!compRow) {
    db.prepare(`
      INSERT INTO companies (id, name, slug, is_active, plan, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_PLAN);
  }

  // Create tenants view for compatibility
  db.exec(`CREATE VIEW IF NOT EXISTS tenants AS SELECT * FROM companies;`);

  // 2. Create company_modules table and seed from system_modules
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_modules (
      company_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      dependencies TEXT DEFAULT '[]',
      settings TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, module_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES system_modules(id) ON DELETE CASCADE
    );
  `);

  // Seed company_modules for default company from existing system_modules if empty
  const compModCount = db.prepare('SELECT COUNT(*) as cnt FROM company_modules WHERE company_id = ?').get(DEFAULT_COMPANY_ID);
  if (!compModCount || compModCount.cnt === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO company_modules (company_id, module_id, is_enabled, dependencies, settings, updated_at)
      SELECT 
        ?,
        id,
        is_enabled,
        dependencies,
        settings,
        datetime('now')
      FROM system_modules
    `).run(DEFAULT_COMPANY_ID);
  }

  // 3. Add company_id column to all tenant-owned tables
  const tenantTables = [
    'company_profile',
    'chart_of_accounts',
    'bank_accounts',
    'routes',
    'customers',
    'categories',
    'brands',
    'products',
    'staff_members',
    'vendors',
    'journal_entries',
    'journal_lines',
    'stock_adjustments',
    'inventory_movements',
    'sales_orders',
    'sales_order_items',
    'sales_invoices',
    'sales_invoice_items',
    'customer_payments',
    'customer_payment_allocations',
    'purchase_bills',
    'purchase_bill_items',
    'vendor_payments',
    'vendor_payment_allocations',
    'expenses',
    'daily_closings',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items',
    'audit_logs',
    'app_users',
    'app_settings',
    'feature_flags'
  ];

  for (const table of tenantTables) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
    const colNames = new Set(cols.map((c: any) => c.name));
    if (!colNames.has('company_id')) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}';`);
    } else {
      db.prepare(`UPDATE "${table}" SET company_id = ? WHERE company_id IS NULL OR company_id = ''`).run(DEFAULT_COMPANY_ID);
    }
  }

  // Ensure chart_of_accounts has account_group column
  const coaInfoCols = db.prepare('PRAGMA table_info(chart_of_accounts)').all() as any[];
  if (!coaInfoCols.some((c: any) => c.name === 'account_group')) {
    db.exec('ALTER TABLE chart_of_accounts ADD COLUMN account_group TEXT;');
  }

  // 4. Migrate order_booker_sequences to composite PK (company_id, booker_code, date_code)
  const obsCols = db.prepare('PRAGMA table_info(order_booker_sequences)').all();
  const obsColNames = new Set(obsCols.map((c: any) => c.name));
  if (!obsColNames.has('company_id')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_booker_sequences_migrated (
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        booker_code TEXT NOT NULL,
        date_code TEXT NOT NULL,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (company_id, booker_code, date_code)
      );

      INSERT INTO order_booker_sequences_migrated (company_id, booker_code, date_code, last_sequence, created_at, updated_at)
      SELECT '${DEFAULT_COMPANY_ID}', booker_code, date_code, last_sequence, created_at, updated_at
      FROM order_booker_sequences;

      DROP TABLE order_booker_sequences;
      ALTER TABLE order_booker_sequences_migrated RENAME TO order_booker_sequences;
    `);
  }

  // 4b. Migrate app_settings to composite PK (company_id, key)
  const appSettingsCols = db.prepare('PRAGMA table_info(app_settings)').all() as any[];
  const appSettingsCompanyIdCol = appSettingsCols.find((c: any) => c.name === 'company_id');
  if (appSettingsCompanyIdCol && appSettingsCompanyIdCol.pk === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings_migrated (
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (company_id, key)
      );

      INSERT OR IGNORE INTO app_settings_migrated (company_id, key, value, description, updated_at)
      SELECT COALESCE(company_id, '${DEFAULT_COMPANY_ID}'), key, value, description, updated_at
      FROM app_settings;

      DROP TABLE app_settings;
      ALTER TABLE app_settings_migrated RENAME TO app_settings;
    `);
  }

  // 4c. Migrate feature_flags to composite PK (company_id, key)
  const ffCols = db.prepare('PRAGMA table_info(feature_flags)').all() as any[];
  const ffCompanyIdCol = ffCols.find((c: any) => c.name === 'company_id');
  if (ffCompanyIdCol && ffCompanyIdCol.pk === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feature_flags_migrated (
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        key TEXT NOT NULL,
        module_id TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (company_id, key)
      );

      INSERT OR IGNORE INTO feature_flags_migrated (company_id, key, module_id, value, label, description, updated_at)
      SELECT COALESCE(company_id, '${DEFAULT_COMPANY_ID}'), key, module_id, value, label, description, updated_at
      FROM feature_flags;

      DROP TABLE feature_flags;
      ALTER TABLE feature_flags_migrated RENAME TO feature_flags;
    `);
  }

  // 5. Create company-scoped unique composite indexes
  const compositeUniqueIndexes = [
    { name: 'uq_app_users_company_username', table: 'app_users', cols: 'company_id, username' },
    { name: 'uq_products_company_sku', table: 'products', cols: 'company_id, sku' },
    { name: 'uq_routes_company_code', table: 'routes', cols: 'company_id, code' },
    { name: 'uq_coa_company_code', table: 'chart_of_accounts', cols: 'company_id, code' },
    { name: 'uq_sales_orders_company_number', table: 'sales_orders', cols: 'company_id, order_number' },
    { name: 'uq_sales_invoices_company_number', table: 'sales_invoices', cols: 'company_id, invoice_number' },
    { name: 'uq_purchase_bills_company_number', table: 'purchase_bills', cols: 'company_id, bill_number' },
    { name: 'uq_customer_payments_company_number', table: 'customer_payments', cols: 'company_id, payment_number' },
    { name: 'uq_vendor_payments_company_number', table: 'vendor_payments', cols: 'company_id, payment_number' },
    { name: 'uq_expenses_company_voucher', table: 'expenses', cols: 'company_id, voucher_number' },
    { name: 'uq_daily_closings_company_date', table: 'daily_closings', cols: 'company_id, closing_date' },
    { name: 'uq_sales_returns_company_number', table: 'sales_returns', cols: 'company_id, return_number' },
    { name: 'uq_purchase_returns_company_number', table: 'purchase_returns', cols: 'company_id, return_number' },
    { name: 'uq_stock_adj_company_number', table: 'stock_adjustments', cols: 'company_id, adjustment_number' },
    { name: 'uq_inv_mov_company_number', table: 'inventory_movements', cols: 'company_id, movement_number' },
    { name: 'uq_journal_entries_company_number', table: 'journal_entries', cols: 'company_id, entry_number' },
    { name: 'uq_categories_company_name', table: 'categories', cols: 'company_id, name' },
    { name: 'uq_brands_company_name', table: 'brands', cols: 'company_id, name' },
  ];

  // Convert any legacy column-level UNIQUE constraints to company-scoped
  const tablesToConvert = [
    { table: 'app_users', col: 'username', regex: /username\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'username TEXT NOT NULL' },
    { table: 'brands', col: 'name', regex: /name\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'name TEXT NOT NULL' },
    { table: 'categories', col: 'name', regex: /name\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'name TEXT NOT NULL' },
    { table: 'chart_of_accounts', col: 'code', regex: /code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'code TEXT NOT NULL' },
    { table: 'customer_payments', col: 'payment_number', regex: /payment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'payment_number TEXT NOT NULL' },
    { table: 'daily_closings', col: 'closing_date', regex: /closing_date\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'closing_date TEXT NOT NULL' },
    { table: 'expenses', col: 'voucher_number', regex: /voucher_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'voucher_number TEXT NOT NULL' },
    { table: 'inventory_movements', col: 'movement_number', regex: /movement_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'movement_number TEXT NOT NULL' },
    { table: 'journal_entries', col: 'entry_number', regex: /entry_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'entry_number TEXT NOT NULL' },
    { table: 'products', col: 'sku', regex: /sku\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'sku TEXT NOT NULL' },
    { table: 'purchase_bills', col: 'bill_number', regex: /bill_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'bill_number TEXT NOT NULL' },
    { table: 'purchase_returns', col: 'return_number', regex: /return_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'return_number TEXT NOT NULL' },
    { table: 'routes', col: 'code', regex: /code\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'code TEXT NOT NULL' },
    { table: 'sales_invoices', col: 'invoice_number', regex: /invoice_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'invoice_number TEXT NOT NULL' },
    { table: 'sales_orders', col: 'order_number', regex: /order_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'order_number TEXT NOT NULL' },
    { table: 'sales_returns', col: 'return_number', regex: /return_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'return_number TEXT NOT NULL' },
    { table: 'staff_members', col: 'employee_code', regex: /employee_code\s+TEXT\s+UNIQUE/i, replace: 'employee_code TEXT' },
    { table: 'stock_adjustments', col: 'adjustment_number', regex: /adjustment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'adjustment_number TEXT NOT NULL' },
    { table: 'vendor_payments', col: 'payment_number', regex: /payment_number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i, replace: 'payment_number TEXT NOT NULL' },
  ];

  for (const item of tablesToConvert) {
    const tableIndexes = db.prepare(`PRAGMA index_list('${item.table}')`).all() as any[];
    const hasLegacyUnique = tableIndexes.some(idx => idx.unique === 1 && idx.origin === 'u');
    if (!hasLegacyUnique) continue;

    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(item.table) as any;
    if (!tableSqlRow) continue;

    const origSql = tableSqlRow.sql;
    const newSql = origSql.replace(item.regex, item.replace);
    const tempTable = `_conv_${item.table}`;
    const createTempSql = newSql.replace(new RegExp(`CREATE TABLE (IF NOT EXISTS )?"?${item.table}"?`, 'i'), `CREATE TABLE "${tempTable}"`);
    const customIndexes = (db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(item.table) as any[]).map(r => r.sql);
    const cols = (db.prepare(`PRAGMA table_info("${item.table}")`).all() as any[]).map(c => `"${c.name}"`).join(', ');

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(createTempSql);
      db.exec(`INSERT INTO "${tempTable}" (${cols}) SELECT ${cols} FROM "${item.table}";`);
      db.exec(`DROP TABLE "${item.table}";`);
      db.exec(`ALTER TABLE "${tempTable}" RENAME TO "${item.table}";`);
      for (const idxSql of customIndexes) {
        db.exec(idxSql);
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  for (const idx of compositeUniqueIndexes) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (${idx.cols});`);
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_company_code" ON "staff_members" (company_id, employee_code) WHERE employee_code IS NOT NULL;`);

  // 6. Create performance indexes on company_id
  const performanceIndexes = [
    { name: 'idx_customers_company_id', table: 'customers' },
    { name: 'idx_vendors_company_id', table: 'vendors' },
    { name: 'idx_journal_lines_company_id', table: 'journal_lines' },
    { name: 'idx_sales_order_items_company_id', table: 'sales_order_items' },
    { name: 'idx_sales_invoice_items_company_id', table: 'sales_invoice_items' },
    { name: 'idx_purchase_bill_items_company_id', table: 'purchase_bill_items' },
    { name: 'idx_sales_return_items_company_id', table: 'sales_return_items' },
    { name: 'idx_purchase_return_items_company_id', table: 'purchase_return_items' },
    { name: 'idx_bank_accounts_company_id', table: 'bank_accounts' },
    { name: 'idx_audit_logs_company_id', table: 'audit_logs' },
    { name: 'idx_feature_flags_company_id', table: 'feature_flags' },
    { name: 'idx_app_settings_company_id', table: 'app_settings' },
  ];

  for (const idx of performanceIndexes) {
    db.exec(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (company_id);`);
  }

  // 6B. Phase 6: Tenant-Aware Composite Performance Indexes
  const phase6CompositeIndexes = [
    { name: 'idx_sales_orders_comp_date', table: 'sales_orders', cols: 'company_id, order_date, created_at' },
    { name: 'idx_sales_orders_comp_cust', table: 'sales_orders', cols: 'company_id, customer_id, order_date' },
    { name: 'idx_sales_orders_comp_status', table: 'sales_orders', cols: 'company_id, status' },
    { name: 'idx_sales_orders_comp_created', table: 'sales_orders', cols: 'company_id, created_at' },
    { name: 'idx_sales_order_items_comp_order', table: 'sales_order_items', cols: 'company_id, order_id' },
    { name: 'idx_sales_order_items_comp_product', table: 'sales_order_items', cols: 'company_id, product_id' },
    { name: 'idx_sales_invoices_comp_date', table: 'sales_invoices', cols: 'company_id, invoice_date, created_at' },
    { name: 'idx_sales_invoices_comp_cust', table: 'sales_invoices', cols: 'company_id, customer_id' },
    { name: 'idx_sales_invoices_comp_created', table: 'sales_invoices', cols: 'company_id, created_at' },
    { name: 'idx_sales_invoice_items_comp_inv', table: 'sales_invoice_items', cols: 'company_id, invoice_id' },
    { name: 'idx_sales_invoice_items_comp_product', table: 'sales_invoice_items', cols: 'company_id, product_id' },
    { name: 'idx_purchase_bills_comp_date', table: 'purchase_bills', cols: 'company_id, bill_date, created_at' },
    { name: 'idx_purchase_bills_comp_vendor', table: 'purchase_bills', cols: 'company_id, vendor_id, bill_date' },
    { name: 'idx_purchase_bills_comp_status', table: 'purchase_bills', cols: 'company_id, status' },
    { name: 'idx_purchase_bill_items_comp_bill', table: 'purchase_bill_items', cols: 'company_id, bill_id' },
    { name: 'idx_purchase_bill_items_comp_product', table: 'purchase_bill_items', cols: 'company_id, product_id' },
    { name: 'idx_inv_mov_comp_prod_date', table: 'inventory_movements', cols: 'company_id, product_id, movement_date, created_at' },
    { name: 'idx_inv_mov_comp_date', table: 'inventory_movements', cols: 'company_id, movement_date, created_at' },
    { name: 'idx_inv_mov_comp_orig_tx', table: 'inventory_movements', cols: 'company_id, original_transaction_id' },
    { name: 'idx_inv_mov_comp_status', table: 'inventory_movements', cols: 'company_id, status' },
    { name: 'idx_journal_entries_comp_date', table: 'journal_entries', cols: 'company_id, entry_date, created_at' },
    { name: 'idx_journal_entries_comp_source', table: 'journal_entries', cols: 'company_id, source_module, source_document_id' },
    { name: 'idx_journal_entries_comp_status', table: 'journal_entries', cols: 'company_id, status' },
    { name: 'idx_journal_lines_comp_acc', table: 'journal_lines', cols: 'company_id, account_id' },
    { name: 'idx_journal_lines_comp_subledger', table: 'journal_lines', cols: 'company_id, entity_type, entity_id' },
    { name: 'idx_journal_lines_comp_journal', table: 'journal_lines', cols: 'company_id, journal_id' },
    { name: 'idx_cust_pay_comp_cust', table: 'customer_payments', cols: 'company_id, customer_id, payment_date' },
    { name: 'idx_cust_pay_comp_date', table: 'customer_payments', cols: 'company_id, payment_date, created_at' },
    { name: 'idx_cust_pay_alloc_comp_inv', table: 'customer_payment_allocations', cols: 'company_id, invoice_id' },
    { name: 'idx_cust_pay_alloc_comp_pay', table: 'customer_payment_allocations', cols: 'company_id, payment_id' },
    { name: 'idx_vendor_pay_comp_vendor', table: 'vendor_payments', cols: 'company_id, vendor_id, payment_date' },
    { name: 'idx_vendor_pay_comp_date', table: 'vendor_payments', cols: 'company_id, payment_date, created_at' },
    { name: 'idx_vendor_pay_alloc_comp_bill', table: 'vendor_payment_allocations', cols: 'company_id, bill_id' },
    { name: 'idx_vendor_pay_alloc_comp_pay', table: 'vendor_payment_allocations', cols: 'company_id, payment_id' },
    { name: 'idx_audit_logs_comp_created', table: 'audit_logs', cols: 'company_id, created_at' },
    { name: 'idx_audit_logs_comp_tx', table: 'audit_logs', cols: 'company_id, transaction_type, transaction_id' },
    { name: 'idx_customers_comp_active_name', table: 'customers', cols: 'company_id, is_active, name' },
    { name: 'idx_vendors_comp_active_name', table: 'vendors', cols: 'company_id, is_active, name' },
    { name: 'idx_products_comp_active_name', table: 'products', cols: 'company_id, is_active, name' },
    { name: 'idx_products_comp_cat_brand', table: 'products', cols: 'company_id, category_id, brand_id' },
  ];

  for (const idx of phase6CompositeIndexes) {
    db.exec(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (${idx.cols});`);
  }

  // 7. Phase 3B: Platform Super Admin & Extended Companies Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const companyCols = (db.prepare("PRAGMA table_info(companies)").all() as any[]).map(c => c.name);
  if (!companyCols.includes('status')) {
    db.exec("ALTER TABLE companies ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';");
  }
  if (!companyCols.includes('trial_ends_at')) {
    db.exec("ALTER TABLE companies ADD COLUMN trial_ends_at TEXT;");
  }
  if (!companyCols.includes('subscription_starts_at')) {
    db.exec("ALTER TABLE companies ADD COLUMN subscription_starts_at TEXT;");
  }
  if (!companyCols.includes('subscription_ends_at')) {
    db.exec("ALTER TABLE companies ADD COLUMN subscription_ends_at TEXT;");
  }
  if (!companyCols.includes('max_users')) {
    db.exec("ALTER TABLE companies ADD COLUMN max_users INTEGER NOT NULL DEFAULT 5;");
  }
  if (!companyCols.includes('max_warehouses')) {
    db.exec("ALTER TABLE companies ADD COLUMN max_warehouses INTEGER NOT NULL DEFAULT 1;");
  }

  // Security standard: Never automatically seed a hardcoded default super admin password.
  // Only bootstrap initial super admin if SUPERADMIN_INITIAL_PASSWORD is explicitly defined in environment.
  const superadminRow = db.prepare("SELECT count(*) as c FROM platform_users WHERE username = 'superadmin'").get() as any;
  const initialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD?.trim();
  if ((!superadminRow || superadminRow.c === 0) && initialPassword) {
    const crypto = require('node:crypto');
    const pwdHash = crypto.createHash('sha256').update('saleflow_user_salt_' + initialPassword).digest('hex');
    db.prepare(`
      INSERT INTO platform_users (id, username, password_hash, full_name, email, role, is_active, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000099', 'superadmin', ?, 'Platform Super Administrator', 'superadmin@saleflow.local', 'SUPER_ADMIN', 1, datetime('now'), datetime('now'))
    `).run(pwdHash);
  }
}





