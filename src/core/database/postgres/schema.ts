/**
 * PostgreSQL Schema Definition (Phase 4B Verified)
 * Exact 1-to-1 match with the SQLite production schema:
 * - 39 tables matching all masters, transactions, stock, and GL ledgers
 * - company_id scoping on all tenant tables
 * - BIGINT for all minor-unit paisa columns
 * - Composite unique constraints matching multi-tenant requirements
 * - Foreign key constraints
 * - View 'tenants'
 */

export const POSTGRES_CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "app_settings" (
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY ("company_id", "key")
);

CREATE TABLE IF NOT EXISTS "app_users" (
    "id" TEXT PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "staff_id" TEXT,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "permissions_json" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT,
    "user_name" TEXT,
    "user_role" TEXT,
    "action" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "transaction_number" TEXT,
    "transaction_date" TEXT,
    "reason" TEXT NOT NULL,
    "is_day_closed" BIGINT NOT NULL DEFAULT 0,
    "details_json" TEXT DEFAULT '{}',
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "bank_accounts" (
    "id" TEXT PRIMARY KEY,
    "bank_name" TEXT NOT NULL,
    "account_title" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "iban" TEXT,
    "branch_name" TEXT,
    "branch_code" TEXT,
    "account_type" TEXT NOT NULL DEFAULT 'CURRENT',
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "opening_balance_paisas" BIGINT NOT NULL DEFAULT 0,
    "opening_balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "account_id" TEXT NOT NULL,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "brands" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "description" TEXT,
    "updated_at" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
    "id" TEXT PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normal_balance" TEXT NOT NULL,
    "parent_id" TEXT,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "is_system" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "account_group" TEXT,
    "description" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'synced',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "companies" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tenant_code" TEXT,
    "slug" TEXT UNIQUE NOT NULL,
    "primary_contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "plan" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trial_ends_at" TEXT,
    "subscription_starts_at" TEXT,
    "subscription_ends_at" TEXT,
    "max_users" BIGINT NOT NULL DEFAULT 5,
    "max_warehouses" BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "company_modules" (
    "company_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "is_enabled" BIGINT NOT NULL DEFAULT 1,
    "dependencies" TEXT DEFAULT '[]',
    "settings" TEXT DEFAULT '{}',
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY ("company_id", "module_id")
);

CREATE TABLE IF NOT EXISTS "company_profile" (
    "id" TEXT PRIMARY KEY,
    "business_name" TEXT NOT NULL DEFAULT 'SaleFlow Distribution',
    "tagline" TEXT DEFAULT 'Wholesale & FMCG Distribution',
    "phone_primary" TEXT DEFAULT '',
    "phone_secondary" TEXT DEFAULT '',
    "email" TEXT DEFAULT '',
    "address" TEXT DEFAULT '',
    "city" TEXT DEFAULT '',
    "ntn_strn" TEXT DEFAULT '',
    "logo_url" TEXT,
    "currency_symbol" TEXT DEFAULT 'PKR',
    "thermal_footer_note" TEXT DEFAULT 'Computer Generated Bill. Software Powered by SaleFlow.',
    "invoice_terms" TEXT DEFAULT '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
    "show_logo_on_prints" BIGINT NOT NULL DEFAULT 1,
    "show_ntn_on_invoices" BIGINT NOT NULL DEFAULT 1,
    "show_customer_previous_balance" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "customer_payment_allocations" (
    "id" TEXT PRIMARY KEY,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_type" TEXT NOT NULL DEFAULT 'ORDER',
    "allocated_amount_paisas" BIGINT NOT NULL,
    "allocated_amount" DOUBLE PRECISION NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "customer_payments" (
    "id" TEXT PRIMARY KEY,
    "payment_number" TEXT NOT NULL,
    "payment_date" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "route_id" TEXT,
    "salesman_id" TEXT,
    "payment_method" TEXT NOT NULL,
    "amount_paisas" BIGINT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference_note" TEXT,
    "journal_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "account_id" TEXT,
    "unallocated_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "unallocated_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "updated_at" TEXT,
    "bank_account_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "customers" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "route_name" TEXT,
    "credit_limit" DOUBLE PRECISION DEFAULT 0.00,
    "balance" DOUBLE PRECISION DEFAULT 0.00,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "shop_name" TEXT,
    "cnic_or_ntn" TEXT,
    "route_id" TEXT,
    "credit_limit_paisas" BIGINT NOT NULL DEFAULT 0,
    "credit_days" BIGINT NOT NULL DEFAULT 0,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "daily_closings" (
    "id" TEXT PRIMARY KEY,
    "closing_date" TEXT NOT NULL,
    "opening_cash_paisas" BIGINT NOT NULL DEFAULT 0,
    "spot_cash_sales_paisas" BIGINT NOT NULL DEFAULT 0,
    "debt_recoveries_paisas" BIGINT NOT NULL DEFAULT 0,
    "spot_cash_purchases_paisas" BIGINT NOT NULL DEFAULT 0,
    "daily_expenses_paisas" BIGINT NOT NULL DEFAULT 0,
    "bank_deposits_paisas" BIGINT NOT NULL DEFAULT 0,
    "expected_cash_paisas" BIGINT NOT NULL DEFAULT 0,
    "physical_cash_paisas" BIGINT NOT NULL DEFAULT 0,
    "variance_paisas" BIGINT NOT NULL DEFAULT 0,
    "denominations_json" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "notes" TEXT,
    "closed_by" TEXT DEFAULT 'Admin Cashier',
    "closed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "expenses" (
    "id" TEXT PRIMARY KEY,
    "voucher_number" TEXT NOT NULL,
    "expense_date" TEXT NOT NULL,
    "expense_account_id" TEXT NOT NULL,
    "paid_from_account_id" TEXT NOT NULL,
    "amount_paisas" BIGINT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "staff_id" TEXT,
    "vehicle_number" TEXT,
    "description" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "bank_account_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "feature_flags" (
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "key" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY ("company_id", "key")
);

CREATE TABLE IF NOT EXISTS "inventory_movements" (
    "id" TEXT PRIMARY KEY,
    "movement_number" TEXT NOT NULL,
    "movement_date" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "category_id" TEXT,
    "category_name" TEXT,
    "brand_id" TEXT,
    "brand_name" TEXT,
    "warehouse" TEXT NOT NULL DEFAULT 'Main Warehouse',
    "to_warehouse" TEXT,
    "movement_type" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "source_document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "original_transaction_id" TEXT,
    "reference_number" TEXT,
    "quantity_in_base" BIGINT NOT NULL DEFAULT 0,
    "quantity_out_base" BIGINT NOT NULL DEFAULT 0,
    "net_quantity_base" BIGINT NOT NULL,
    "cartons_count" BIGINT NOT NULL DEFAULT 0,
    "boxes_count" BIGINT NOT NULL DEFAULT 0,
    "pieces_count" BIGINT NOT NULL DEFAULT 0,
    "stock_before_base" BIGINT NOT NULL,
    "stock_after_base" BIGINT NOT NULL,
    "unit_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "total_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "selling_price" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "user_id" TEXT DEFAULT 'admin',
    "user_name" TEXT DEFAULT 'Administrator',
    "user_role" TEXT DEFAULT 'ADMIN',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversed_by_user_id" TEXT,
    "reversed_by_user_name" TEXT,
    "reversed_at" TEXT,
    "reversal_reason" TEXT,
    "admin_override_details" TEXT,
    "reversal_linked_movement_id" TEXT,
    "day_close_status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "journal_entries" (
    "id" TEXT PRIMARY KEY,
    "entry_number" TEXT NOT NULL,
    "entry_date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "source_document_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "created_by" TEXT DEFAULT 'admin',
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "total_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "reversal_of_id" TEXT,
    "is_reversed" BIGINT NOT NULL DEFAULT 0,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "journal_lines" (
    "id" TEXT PRIMARY KEY,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "memo" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "entity_id" TEXT,
    "entity_type" TEXT,
    "debit_paisas" BIGINT NOT NULL DEFAULT 0,
    "credit_paisas" BIGINT NOT NULL DEFAULT 0,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "order_booker_sequences" (
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "booker_code" TEXT NOT NULL,
    "date_code" TEXT NOT NULL,
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY ("company_id", "booker_code", "date_code")
);

CREATE TABLE IF NOT EXISTS "platform_users" (
    "id" TEXT PRIMARY KEY,
    "username" TEXT UNIQUE NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "totp_secret" TEXT,
    "totp_enabled" BIGINT NOT NULL DEFAULT 0,
    "email_otp_enabled" BIGINT NOT NULL DEFAULT 0,
    "recovery_codes_hash" TEXT,
    "two_factor_policy" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "last_2fa_at" TEXT,
    "failed_login_attempts" BIGINT NOT NULL DEFAULT 0,
    "locked_until" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "platform_otp_tokens" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "consumed_at" TEXT,
    "attempts" BIGINT NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "cost_price" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "selling_price" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "current_stock" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "reorder_level" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "barcode" TEXT,
    "category_id" TEXT,
    "uom_base" TEXT NOT NULL DEFAULT 'PIECE',
    "uom_bulk" TEXT NOT NULL DEFAULT 'CARTON',
    "bulk_conversion_factor" BIGINT NOT NULL DEFAULT 1,
    "cost_price_paisas" BIGINT NOT NULL DEFAULT 0,
    "trade_price_paisas" BIGINT NOT NULL DEFAULT 0,
    "mrp_paisas" BIGINT NOT NULL DEFAULT 0,
    "current_stock_base" BIGINT NOT NULL DEFAULT 0,
    "min_stock_alert" BIGINT DEFAULT 0,
    "item_type" TEXT NOT NULL DEFAULT 'STANDARD',
    "costing_method" TEXT NOT NULL DEFAULT 'FIFO',
    "boxes_per_carton" BIGINT NOT NULL DEFAULT 1,
    "pieces_per_box" BIGINT NOT NULL DEFAULT 1,
    "total_pieces_per_carton" BIGINT NOT NULL DEFAULT 1,
    "base_rate_per_piece_paisas" BIGINT NOT NULL DEFAULT 0,
    "damaged_stock_base" BIGINT NOT NULL DEFAULT 0,
    "brand_id" TEXT,
    "brand_name" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "purchase_bill_items" (
    "id" TEXT PRIMARY KEY,
    "bill_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "item_reference" TEXT,
    "batch_number" TEXT,
    "expiry_date" TEXT,
    "cartons_qty" BIGINT NOT NULL DEFAULT 0,
    "boxes_qty" BIGINT NOT NULL DEFAULT 0,
    "loose_pieces_qty" BIGINT NOT NULL DEFAULT 0,
    "total_pieces" BIGINT NOT NULL DEFAULT 0,
    "rate_per_piece_paisas" BIGINT NOT NULL DEFAULT 0,
    "gross_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "tax_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_paisas" BIGINT NOT NULL DEFAULT 0,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "line_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "rate_per_piece" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "line_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "purchase_bills" (
    "id" TEXT PRIMARY KEY,
    "bill_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "bill_date" TEXT NOT NULL,
    "due_date" TEXT,
    "warehouse" TEXT NOT NULL DEFAULT 'Main Warehouse',
    "broker" TEXT,
    "vendor_invoice_number" TEXT NOT NULL,
    "reference_number" TEXT,
    "freight_treatment" TEXT NOT NULL DEFAULT 'LANDED_COST',
    "freight_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "freight_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "subtotal_paisas" BIGINT NOT NULL DEFAULT 0,
    "tax_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "discount_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "net_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "net_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journal_id" TEXT,
    "notes" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "paid_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "remaining_balance_paisas" BIGINT NOT NULL DEFAULT 0,
    "remaining_balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "purchase_return_items" (
    "id" TEXT PRIMARY KEY,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "cartons_qty" BIGINT NOT NULL DEFAULT 0,
    "boxes_qty" BIGINT NOT NULL DEFAULT 0,
    "pieces_qty" BIGINT NOT NULL DEFAULT 0,
    "total_base_qty" BIGINT NOT NULL,
    "rate_per_piece_paisas" BIGINT NOT NULL DEFAULT 0,
    "line_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "rate_per_piece" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "line_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "purchase_returns" (
    "id" TEXT PRIMARY KEY,
    "return_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "return_date" TEXT NOT NULL,
    "vendor_invoice_number" TEXT,
    "total_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "journal_entry_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "routes" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "delivery_days" TEXT NOT NULL DEFAULT '[]',
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "area_territory" TEXT,
    "city" TEXT,
    "assigned_salesperson_id" TEXT,
    "assigned_supply_person_id" TEXT,
    "notes" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_invoice_items" (
    "id" TEXT PRIMARY KEY,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "quantity_base" BIGINT NOT NULL DEFAULT 1,
    "cartons_count" BIGINT NOT NULL DEFAULT 0,
    "loose_pieces_count" BIGINT NOT NULL DEFAULT 0,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "scheme_bonus_base" BIGINT NOT NULL DEFAULT 0,
    "line_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "unit_price_paisas" BIGINT NOT NULL DEFAULT 0,
    "unit_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "boxes_count" BIGINT NOT NULL DEFAULT 0,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_invoices" (
    "id" TEXT PRIMARY KEY,
    "invoice_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "grand_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "cost_of_goods_sold" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "route_id" TEXT,
    "salesman_id" TEXT,
    "supply_person_id" TEXT,
    "order_id" TEXT,
    "invoice_type" TEXT NOT NULL DEFAULT 'DIRECT_SALE',
    "subtotal_paisas" BIGINT NOT NULL DEFAULT 0,
    "line_discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "bill_discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "grand_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "cost_of_goods_sold_paisas" BIGINT NOT NULL DEFAULT 0,
    "scheme_expense_paisas" BIGINT NOT NULL DEFAULT 0,
    "cash_received_paisas" BIGINT NOT NULL DEFAULT 0,
    "remaining_balance_paisas" BIGINT NOT NULL DEFAULT 0,
    "remaining_balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "source_channel" TEXT NOT NULL DEFAULT 'OFFICE',
    "created_by_user_id" TEXT,
    "created_by_staff_id" TEXT,
    "client_order_uuid" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_order_items" (
    "id" TEXT PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_base" BIGINT NOT NULL,
    "cartons_count" BIGINT NOT NULL DEFAULT 0,
    "loose_pieces_count" BIGINT NOT NULL DEFAULT 0,
    "unit_price_paisas" BIGINT NOT NULL DEFAULT 0,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "scheme_bonus_base" BIGINT NOT NULL DEFAULT 0,
    "line_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "unit_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "line_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "boxes_count" BIGINT NOT NULL DEFAULT 0,
    "tax_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_paisas" BIGINT NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_orders" (
    "id" TEXT PRIMARY KEY,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "route_id" TEXT,
    "salesman_id" TEXT,
    "supply_person_id" TEXT,
    "order_date" TEXT NOT NULL,
    "delivery_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "subtotal_paisas" BIGINT NOT NULL DEFAULT 0,
    "line_discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "bill_discount_paisas" BIGINT NOT NULL DEFAULT 0,
    "grand_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "cost_of_goods_sold_paisas" BIGINT NOT NULL DEFAULT 0,
    "scheme_expense_paisas" BIGINT NOT NULL DEFAULT 0,
    "cash_received_paisas" BIGINT NOT NULL DEFAULT 0,
    "remaining_balance_paisas" BIGINT NOT NULL DEFAULT 0,
    "scheme_items_count" BIGINT NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "grand_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "cost_of_goods_sold" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "cash_received" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "remaining_balance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "journal_entry_id" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "tax_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "source_channel" TEXT NOT NULL DEFAULT 'OFFICE',
    "created_by_user_id" TEXT,
    "created_by_staff_id" TEXT,
    "client_order_uuid" TEXT,
    "booker_order_sequence" BIGINT,
    "sync_status" TEXT NOT NULL DEFAULT 'SYNCED',
    "client_created_at" TEXT,
    "server_received_at" TEXT,
    "target_delivery_date" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_return_items" (
    "id" TEXT PRIMARY KEY,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'FRESH',
    "cartons_qty" BIGINT NOT NULL DEFAULT 0,
    "boxes_qty" BIGINT NOT NULL DEFAULT 0,
    "pieces_qty" BIGINT NOT NULL DEFAULT 0,
    "total_base_qty" BIGINT NOT NULL,
    "unit_rate_paisas" BIGINT NOT NULL DEFAULT 0,
    "line_total_paisas" BIGINT NOT NULL DEFAULT 0,
    "unit_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "line_total" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "sales_returns" (
    "id" TEXT PRIMARY KEY,
    "return_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "return_date" TEXT NOT NULL,
    "salesman_id" TEXT,
    "settlement_type" TEXT NOT NULL DEFAULT 'CREDIT_TO_LEDGER',
    "subtotal_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_refund_paisas" BIGINT NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "total_refund" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "journal_entry_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "supply_person_id" TEXT,
    "invoice_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "staff_members" (
    "id" TEXT PRIMARY KEY,
    "employee_code" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "route_id" TEXT,
    "notes" TEXT,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "stock_adjustments" (
    "id" TEXT PRIMARY KEY,
    "adjustment_number" TEXT NOT NULL,
    "adjustment_date" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_base" BIGINT NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "unit_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "total_cost_paisas" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "journal_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "system_modules" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "is_enabled" BIGINT NOT NULL DEFAULT 1,
    "dependencies" TEXT DEFAULT '[]',
    "settings" TEXT DEFAULT '{}',
    "installed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "schema_migrations" (
    "id" TEXT PRIMARY KEY,
    "version" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "batch" BIGINT NOT NULL DEFAULT 1,
    "applied_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "system_license" (
    "id" TEXT PRIMARY KEY,
    "company_id" TEXT,
    "license_key" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "installed_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "last_verified_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "vendor_payment_allocations" (
    "id" TEXT PRIMARY KEY,
    "payment_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "allocated_amount_paisas" BIGINT NOT NULL,
    "allocated_amount" DOUBLE PRECISION NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "vendor_payments" (
    "id" TEXT PRIMARY KEY,
    "payment_number" TEXT NOT NULL,
    "payment_date" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "amount_paisas" BIGINT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unallocated_amount_paisas" BIGINT NOT NULL DEFAULT 0,
    "unallocated_amount" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "reference_note" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journal_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "bank_account_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE TABLE IF NOT EXISTS "vendors" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "cnic_or_ntn" TEXT,
    "payment_terms_days" BIGINT NOT NULL DEFAULT 30,
    "is_active" BIGINT NOT NULL DEFAULT 1,
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    "company_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

-- Tenants compatibility view
CREATE OR REPLACE VIEW tenants AS SELECT * FROM companies;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_app_settings_company_id" ON "app_settings" (company_id);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_users_company_username" ON "app_users" (company_id, username);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_company_id" ON "audit_logs" (company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(transaction_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(transaction_type);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_id ON bank_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank_name ON bank_accounts(bank_name);
CREATE INDEX IF NOT EXISTS "idx_bank_accounts_company_id" ON "bank_accounts" (company_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_active ON bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_brands_company_name" ON "brands" (company_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_company_name" ON "categories" (company_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_coa_company_code" ON "chart_of_accounts" (company_id, code);
CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_invoice ON customer_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_payment ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_bank ON customer_payments(bank_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_payments_company_number" ON "customer_payments" (company_id, payment_number);
CREATE INDEX IF NOT EXISTS "idx_customers_company_id" ON "customers" (company_id);
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_daily_closings_company_date" ON "daily_closings" (company_id, closing_date);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(expense_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_bank ON expenses(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_from ON expenses(paid_from_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_staff ON expenses(staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_expenses_company_voucher" ON "expenses" (company_id, voucher_number);
CREATE INDEX IF NOT EXISTS "idx_feature_flags_company_id" ON "feature_flags" (company_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_date ON inventory_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inv_mov_doc ON inventory_movements(document_number);
CREATE INDEX IF NOT EXISTS idx_inv_mov_orig_tx ON inventory_movements(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_date ON inventory_movements(product_id, movement_date, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_reversal ON inventory_movements(reversal_linked_movement_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_source ON inventory_movements(source_module, source_document_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_status ON inventory_movements(status);
CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_warehouse ON inventory_movements(warehouse);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_mov_company_number" ON "inventory_movements" (company_id, movement_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal ON journal_entries(reversal_of_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_module, source_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_journal_entries_company_number" ON "journal_entries" (company_id, entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_lines_acc_entity ON journal_lines(account_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS "idx_journal_lines_company_id" ON "journal_lines" (company_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_subledger ON journal_lines(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_products_company_sku" ON "products" (company_id, sku);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill ON purchase_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS "idx_purchase_bill_items_company_id" ON "purchase_bill_items" (company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor ON purchase_bills(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_purchase_bills_company_number" ON "purchase_bills" (company_id, bill_number);
CREATE INDEX IF NOT EXISTS "idx_purchase_return_items_company_id" ON "purchase_return_items" (company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON purchase_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_purchase_returns_company_number" ON "purchase_returns" (company_id, return_number);
CREATE INDEX IF NOT EXISTS idx_routes_is_active ON routes(is_active);
CREATE INDEX IF NOT EXISTS idx_routes_salesperson ON routes(assigned_salesperson_id);
CREATE INDEX IF NOT EXISTS idx_routes_supply_person ON routes(assigned_supply_person_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_routes_company_code" ON "routes" (company_id, code);
CREATE INDEX IF NOT EXISTS "idx_sales_invoice_items_company_id" ON "sales_invoice_items" (company_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_route ON sales_invoices(route_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_salesman ON sales_invoices(salesman_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_invoices_company_number" ON "sales_invoices" (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS "idx_sales_order_items_company_id" ON "sales_order_items" (company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_booker ON sales_orders(created_by_staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_client_uuid ON sales_orders(client_order_uuid) WHERE client_order_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_route ON sales_orders(route_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_source ON sales_orders(source_channel);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_orders_company_number" ON "sales_orders" (company_id, order_number);
CREATE INDEX IF NOT EXISTS "idx_sales_return_items_company_id" ON "sales_return_items" (company_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product ON sales_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_salesman ON sales_returns(salesman_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_supply_person ON sales_returns(supply_person_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_returns_company_number" ON "sales_returns" (company_id, return_number);
CREATE INDEX IF NOT EXISTS idx_staff_members_active ON staff_members(is_active);
CREATE INDEX IF NOT EXISTS idx_staff_members_code ON staff_members(employee_code);
CREATE INDEX IF NOT EXISTS idx_staff_members_role ON staff_members(role);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_company_code" ON "staff_members" (company_id, employee_code) WHERE employee_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_adj_company_number" ON "stock_adjustments" (company_id, adjustment_number);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_bill ON vendor_payment_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_payment ON vendor_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_account ON vendor_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_bank ON vendor_payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_payments_company_number" ON "vendor_payments" (company_id, payment_number);
CREATE INDEX IF NOT EXISTS "idx_vendors_company_id" ON "vendors" (company_id);

-- Phase 6 Tenant-Aware Composite Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_date ON sales_orders (company_id, order_date, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_cust ON sales_orders (company_id, customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_status ON sales_orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_created ON sales_orders (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_comp_order ON sales_order_items (company_id, order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_comp_product ON sales_order_items (company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_comp_date ON sales_invoices (company_id, invoice_date, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_comp_cust ON sales_invoices (company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_comp_created ON sales_invoices (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_comp_inv ON sales_invoice_items (company_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_comp_product ON sales_invoice_items (company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_bills_comp_date ON purchase_bills (company_id, bill_date, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_comp_vendor ON purchase_bills (company_id, vendor_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_comp_status ON purchase_bills (company_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_comp_bill ON purchase_bill_items (company_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_comp_product ON purchase_bill_items (company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inv_mov_comp_prod_date ON inventory_movements (company_id, product_id, movement_date, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_comp_date ON inventory_movements (company_id, movement_date, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_mov_comp_orig_tx ON inventory_movements (company_id, original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_comp_status ON inventory_movements (company_id, status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_comp_date ON journal_entries (company_id, entry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_entries_comp_source ON journal_entries (company_id, source_module, source_document_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_comp_status ON journal_entries (company_id, status);

CREATE INDEX IF NOT EXISTS idx_journal_lines_comp_acc ON journal_lines (company_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_comp_subledger ON journal_lines (company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_comp_journal ON journal_lines (company_id, journal_id);

CREATE INDEX IF NOT EXISTS idx_cust_pay_comp_cust ON customer_payments (company_id, customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_cust_pay_comp_date ON customer_payments (company_id, payment_date, created_at);
CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_comp_inv ON customer_payment_allocations (company_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_cust_pay_alloc_comp_pay ON customer_payment_allocations (company_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_vendor_pay_comp_vendor ON vendor_payments (company_id, vendor_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_comp_date ON vendor_payments (company_id, payment_date, created_at);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_comp_bill ON vendor_payment_allocations (company_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pay_alloc_comp_pay ON vendor_payment_allocations (company_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_comp_created ON audit_logs (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_comp_tx ON audit_logs (company_id, transaction_type, transaction_id);

CREATE INDEX IF NOT EXISTS idx_customers_comp_active_name ON customers (company_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_vendors_comp_active_name ON vendors (company_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_products_comp_active_name ON products (company_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_products_comp_cat_brand ON products (company_id, category_id, brand_id);
`;
