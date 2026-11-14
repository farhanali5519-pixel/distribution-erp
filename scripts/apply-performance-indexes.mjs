import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/sales_distribution.db');

const indexes = [
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

console.log(`Applying ${indexes.length} Phase 6 tenant composite indexes to SQLite...`);
for (const idx of indexes) {
  db.exec(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" (${idx.cols});`);
}

const checkIntegrity = db.prepare('PRAGMA integrity_check;').all();
const checkFk = db.prepare('PRAGMA foreign_key_check;').all();
const totals = db.prepare('SELECT COUNT(*) as lines, SUM(debit_paisas) as debit, SUM(credit_paisas) as credit FROM journal_lines;').get();

console.log('Integrity check:', checkIntegrity);
console.log('Foreign key check:', checkFk);
console.log('Journal totals:', totals);
console.log('Done!');
db.close();
