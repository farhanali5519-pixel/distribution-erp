/**
 * Universal Database Abstraction Layer (DAL) Business Services (Phase 4A)
 * 
 * Provides complete domain services operable against both SQLite and PostgreSQL:
 * 1. Sales & Field Order Booking
 * 2. Customers
 * 3. Routes & Staff
 * 4. Purchase & Vendors
 * 5. Inventory & Audit
 * 6. Returns (Sales & Purchase)
 * 7. Payments (Customer & Vendor)
 * 8. Expenses
 * 9. Accounts / GL (Double Entry Engine)
 * 10. Bank Accounts & Liquidity
 * 11. Daily Closings & Day Locking
 * 12. Reports & Ledgers
 * 13. Auth & Users
 * 14. Modules
 * 15. Feature Flags
 * 16. Company Settings
 * 17. Super Admin & Company Provisioning
 * 
 * All mutations maintain:
 * - Integer minor-unit (paisa) precision (Zero IEEE-754 float drift)
 * - Atomic transactional consistency
 * - Complete company_id isolation
 * - Double-entry ledger balanced postings
 */

import { IDatabaseClient, ITransactionClient, RunResult } from './types';
import { getDatabaseClient } from './factory';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas, arePaisasEqual } from '@/shared/utils/currency';
import { DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME } from '../tenancy/constants';
import crypto from 'node:crypto';

const PASSWORD_SALT = 'saleflow_user_salt_';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(PASSWORD_SALT + password).digest('hex');
}

export class DalService {
  private static getClient(override?: IDatabaseClient | ITransactionClient): IDatabaseClient | ITransactionClient {
    return override || getDatabaseClient();
  }

  // ==========================================================
  // 1. TENANCY & COMPANY PROVISIONING
  // ==========================================================
  public static async getCompany(idOrSlug: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.queryOne(
      'SELECT * FROM companies WHERE id = ? OR slug = ?',
      [idOrSlug, idOrSlug]
    );
  }

  public static async listCompanies(client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM companies ORDER BY name ASC');
  }

  public static async provisionCompany(
    input: {
      name: string;
      slug: string;
      plan?: string;
      status?: string;
      maxUsers?: number;
      maxWarehouses?: number;
    },
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    await c.execute(
      `INSERT INTO companies (id, name, slug, is_active, status, plan, max_users, max_warehouses)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.slug,
        input.status || 'ACTIVE',
        input.plan || 'COMMERCIAL',
        input.maxUsers || 5,
        input.maxWarehouses || 1,
      ]
    );
    return this.getCompany(id, c);
  }

  // ==========================================================
  // 2. SUPER ADMIN AUTHENTICATION
  // ==========================================================
  public static async authenticateSuperAdmin(username: string, password: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    const user = await c.queryOne(
      'SELECT * FROM platform_users WHERE LOWER(username) = ? AND is_active = 1',
      [username.trim().toLowerCase()]
    );
    if (!user) return null;
    const computedHash = hashPassword(password);
    if (user.password_hash !== computedHash) return null;
    return user;
  }

  // ==========================================================
  // 3. MODULES, FEATURE FLAGS & COMPANY SETTINGS
  // ==========================================================
  public static async getCompanyModules(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT sm.*, COALESCE(cm.is_enabled, sm.is_enabled) as is_enabled
       FROM system_modules sm
       LEFT JOIN company_modules cm ON sm.id = cm.module_id AND cm.company_id = ?
       ORDER BY sm.name ASC`,
      [companyId]
    );
  }

  public static async setCompanyModule(companyId: string, moduleId: string, isEnabled: boolean, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.execute(
      `INSERT INTO company_modules (company_id, module_id, is_enabled)
       VALUES (?, ?, ?)
       ON CONFLICT (company_id, module_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
      [companyId, moduleId, isEnabled ? 1 : 0]
    );
  }

  public static async getFeatureFlags(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT * FROM feature_flags WHERE company_id = ? ORDER BY key ASC`,
      [companyId]
    );
  }

  public static async setFeatureFlag(
    companyId: string,
    key: string,
    value: string,
    moduleId: string = 'sales',
    label: string = '',
    description: string = '',
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    return c.execute(
      `INSERT INTO feature_flags (company_id, key, module_id, value, label, description)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP::text`,
      [companyId, key, moduleId, value, label, description]
    );
  }

  public static async getCompanySetting(companyId: string, key: string, fallback = '', client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    const row = await c.queryOne(
      'SELECT value FROM app_settings WHERE company_id = ? AND key = ?',
      [companyId, key]
    );
    return row ? row.value : fallback;
  }

  public static async setCompanySetting(companyId: string, key: string, value: string, description = '', client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.execute(
      `INSERT INTO app_settings (company_id, key, value, description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP::text`,
      [companyId, key, value, description]
    );
  }

  // ==========================================================
  // 4. GENERAL LEDGER & CHART OF ACCOUNTS (Strict Paisas)
  // ==========================================================
  public static async getChartOfAccounts(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      'SELECT * FROM chart_of_accounts WHERE company_id = ? ORDER BY code ASC',
      [companyId]
    );
  }

  public static async getAccountByCode(companyId: string, code: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.queryOne(
      'SELECT * FROM chart_of_accounts WHERE company_id = ? AND code = ?',
      [companyId, code]
    );
  }

  public static async postJournalEntry(
    input: {
      companyId: string;
      description: string;
      sourceModule: string;
      sourceDocumentId?: string;
      entryDate?: string;
      createdBy?: string;
      lines: {
        accountId: string;
        debitPaisas: number;
        creditPaisas: number;
        memo?: string;
        entityType?: string;
        entityId?: string;
      }[];
    },
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of input.lines) {
      totalDebit += l.debitPaisas;
      totalCredit += l.creditPaisas;
    }

    if (!arePaisasEqual(totalDebit, totalCredit)) {
      throw new Error(`Unbalanced entry! Debit: ${totalDebit} paisas, Credit: ${totalCredit} paisas`);
    }

    const runner = async (tx: ITransactionClient) => {
      const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
      const prefix = `JE-${yearMonth}-`;
      const last = await tx.queryOne(
        'SELECT entry_number FROM journal_entries WHERE company_id = ? AND entry_number LIKE ? ORDER BY entry_number DESC LIMIT 1',
        [input.companyId, `${prefix}%`]
      );
      let seq = 1;
      if (last?.entry_number) {
        const parts = last.entry_number.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
      }
      const entryNumber = `${prefix}${String(seq).padStart(4, '0')}`;
      const journalId = generateUUID();
      const entryDate = input.entryDate || new Date().toISOString().slice(0, 10);

      await tx.execute(
        `INSERT INTO journal_entries (
          id, company_id, entry_number, entry_date, description, source_module,
          source_document_id, status, total_amount_paisas, total_amount, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?)`,
        [
          journalId,
          input.companyId,
          entryNumber,
          entryDate,
          input.description,
          input.sourceModule,
          input.sourceDocumentId || null,
          totalDebit,
          fromPaisas(totalDebit),
          input.createdBy || 'system',
        ]
      );

      for (const l of input.lines) {
        await tx.execute(
          `INSERT INTO journal_lines (
            id, company_id, journal_id, account_id, debit_paisas, credit_paisas,
            debit, credit, memo, entity_type, entity_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateUUID(),
            input.companyId,
            journalId,
            l.accountId,
            l.debitPaisas,
            l.creditPaisas,
            fromPaisas(l.debitPaisas),
            fromPaisas(l.creditPaisas),
            l.memo || null,
            l.entityType || null,
            l.entityId || null,
          ]
        );
      }

      return { journalId, entryNumber, totalAmountPaisas: totalDebit };
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  public static async getSubLedger(
    entityType: string,
    entityId: string,
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    return c.query(`
      SELECT 
        je.entry_date,
        je.entry_number,
        je.description,
        je.source_module,
        jl.memo,
        jl.debit_paisas,
        jl.credit_paisas
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE jl.company_id = ? 
        AND jl.entity_type = ? 
        AND jl.entity_id = ? 
        AND je.status = 'POSTED'
      ORDER BY je.entry_date ASC, je.entry_number ASC, jl.id ASC
    `, [companyId, entityType, entityId]);
  }

  // ==========================================================
  // 5. CUSTOMERS & ROUTES
  // ==========================================================
  public static async getCustomers(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT c.*, r.name as route_name, r.code as route_code
       FROM customers c
       LEFT JOIN routes r ON c.route_id = r.id AND r.company_id = c.company_id
       WHERE c.company_id = ?
       ORDER BY c.name ASC`,
      [companyId]
    );
  }

  public static async getCustomerById(id: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.queryOne(
      'SELECT * FROM customers WHERE id = ? AND company_id = ?',
      [id, companyId]
    );
  }

  public static async createCustomer(
    input: {
      name: string;
      shopName?: string;
      contactPerson?: string;
      phone?: string;
      whatsapp?: string;
      address?: string;
      city?: string;
      cnicOrNtn?: string;
      routeId?: string;
      creditLimitPaisas?: number;
      creditDays?: number;
      paymentTermsDays?: number;
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    const limitPaisas = input.creditLimitPaisas || 0;
    await c.execute(
      `INSERT INTO customers (
        id, company_id, name, shop_name, phone,
        address, city, cnic_or_ntn, route_id, credit_limit_paisas,
        credit_limit, balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        companyId,
        input.name,
        input.shopName || null,
        input.phone || null,
        input.address || null,
        input.city || null,
        input.cnicOrNtn || null,
        input.routeId || null,
        limitPaisas,
        fromPaisas(limitPaisas),
        0,
      ]
    );
    return this.getCustomerById(id, companyId, c);
  }

  public static async getRoutes(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM routes WHERE company_id = ? ORDER BY name ASC', [companyId]);
  }

  public static async createRoute(
    input: { name: string; code: string; notes?: string | null; deliveryDays?: string[] },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    await c.execute(
      `INSERT INTO routes (id, company_id, name, code, notes, delivery_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        companyId,
        input.name,
        input.code,
        input.notes || null,
        JSON.stringify(input.deliveryDays || []),
      ]
    );
    return c.queryOne('SELECT * FROM routes WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  public static async getStaff(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM staff_members WHERE company_id = ? ORDER BY name ASC', [companyId]);
  }

  public static async createStaff(
    input: { name: string; role: string; phone?: string; employeeCode?: string; routeId?: string; notes?: string },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    await c.execute(
      `INSERT INTO staff_members (id, company_id, employee_code, name, role, phone, route_id, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        companyId,
        input.employeeCode || null,
        input.name,
        input.role,
        input.phone || null,
        input.routeId || null,
        input.notes || null,
      ]
    );
    return c.queryOne('SELECT * FROM staff_members WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  // ==========================================================
  // 6. INVENTORY, PRODUCTS, CATEGORIES & BRANDS
  // ==========================================================
  public static async getCategories(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM categories WHERE company_id = ? ORDER BY name ASC', [companyId]);
  }

  public static async getBrands(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM brands WHERE company_id = ? ORDER BY name ASC', [companyId]);
  }

  public static async getProducts(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT p.*, c.name as category_name, b.name as brand_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
       LEFT JOIN brands b ON p.brand_id = b.id AND b.company_id = p.company_id
       WHERE p.company_id = ?
       ORDER BY p.name ASC`,
      [companyId]
    );
  }

  public static async getProductById(id: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.queryOne('SELECT * FROM products WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  public static async createProduct(
    input: {
      name: string;
      sku: string;
      categoryId?: string;
      brandId?: string;
      costPricePaisas: number;
      tradePricePaisas?: number;
      salePricePaisas?: number;
      initialStock?: number;
      uomBase?: string;
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    const stock = input.initialStock || 0;
    const tpPaisas = input.tradePricePaisas ?? input.salePricePaisas ?? 0;
    await c.execute(
      `INSERT INTO products (
        id, company_id, name, sku, category_id, category, brand_id, uom_base,
        cost_price_paisas, cost_price, trade_price_paisas, selling_price,
        current_stock, current_stock_base, is_active
      ) VALUES (?, ?, ?, ?, ?, 'General', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        companyId,
        input.name,
        input.sku,
        input.categoryId || null,
        input.brandId || null,
        input.uomBase || 'PCS',
        input.costPricePaisas,
        fromPaisas(input.costPricePaisas),
        tpPaisas,
        fromPaisas(tpPaisas),
        stock,
        stock,
      ]
    );
    return this.getProductById(id, companyId, c);
  }

  // ==========================================================
  // 7. SALES ORDERS & DIRECT INVOICES
  // ==========================================================
  public static async getOrders(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT so.*, c.name as customer_name
       FROM sales_orders so
       JOIN customers c ON so.customer_id = c.id AND c.company_id = so.company_id
       WHERE so.company_id = ?
       ORDER BY so.created_at DESC`,
      [companyId]
    );
  }

  public static async getOrderById(id: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    const order = await c.queryOne('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!order) return null;
    const items = await c.query(
      `SELECT soi.*, p.name as product_name, p.sku
       FROM sales_order_items soi
       JOIN products p ON soi.product_id = p.id AND p.company_id = soi.company_id
       WHERE soi.order_id = ? AND soi.company_id = ?`,
      [id, companyId]
    );
    return { ...order, total_amount_paisas: order.grand_total_paisas, items };
  }

  public static async createSalesOrder(
    input: {
      customerId: string;
      routeId?: string;
      orderDate?: string;
      deliveryDate?: string;
      notes?: string;
      sourceChannel?: string;
      items: {
        productId: string;
        quantity: number;
        unitPricePaisas: number;
      }[];
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);

    const runner = async (tx: ITransactionClient) => {
      // Validate customer
      const cust = await tx.queryOne('SELECT id FROM customers WHERE id = ? AND company_id = ?', [input.customerId, companyId]);
      if (!cust) throw new Error('Customer not found in this company');

      // Generate order number
      const dateStr = (input.orderDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
      const prefix = `SO-${dateStr}-`;
      const last = await tx.queryOne(
        'SELECT order_number FROM sales_orders WHERE company_id = ? AND order_number LIKE ? ORDER BY order_number DESC LIMIT 1',
        [companyId, `${prefix}%`]
      );
      let seq = 1;
      if (last?.order_number) {
        const parts = last.order_number.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
      }
      const orderNumber = `${prefix}${String(seq).padStart(4, '0')}`;
      const orderId = generateUUID();

      let totalPaisas = 0;
      for (const item of input.items) {
        const prod = await tx.queryOne('SELECT id, current_stock FROM products WHERE id = ? AND company_id = ?', [item.productId, companyId]);
        if (!prod) throw new Error(`Product ${item.productId} not found`);
        const lineTotal = item.quantity * item.unitPricePaisas;
        totalPaisas += lineTotal;
      }

      // 1. Insert parent sales_orders record first
      await tx.execute(
        `INSERT INTO sales_orders (
          id, company_id, order_number, customer_id, route_id,
          order_date, delivery_date, status, subtotal_paisas, grand_total_paisas,
          remaining_balance_paisas, subtotal, grand_total, remaining_balance,
          notes, source_channel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          companyId,
          orderNumber,
          input.customerId,
          input.routeId || null,
          input.orderDate || new Date().toISOString().slice(0, 10),
          input.deliveryDate || null,
          totalPaisas,
          totalPaisas,
          totalPaisas,
          fromPaisas(totalPaisas),
          fromPaisas(totalPaisas),
          fromPaisas(totalPaisas),
          input.notes || null,
          input.sourceChannel || 'OFFICE',
        ]
      );

      // 2. Insert child items and deduct stock
      for (const item of input.items) {
        const lineTotal = item.quantity * item.unitPricePaisas;
        await tx.execute(
          `INSERT INTO sales_order_items (
            id, company_id, order_id, product_id, quantity_base,
            unit_price_paisas, unit_price, line_total_paisas, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateUUID(),
            companyId,
            orderId,
            item.productId,
            item.quantity,
            item.unitPricePaisas,
            fromPaisas(item.unitPricePaisas),
            lineTotal,
            fromPaisas(lineTotal),
          ]
        );

        // Deduct inventory stock
        await tx.execute(
          'UPDATE products SET current_stock = current_stock - ?, current_stock_base = current_stock_base - ? WHERE id = ? AND company_id = ?',
          [item.quantity, item.quantity, item.productId, companyId]
        );
      }

      return this.getOrderById(orderId, companyId, tx);
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  public static async getInvoices(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query(
      `SELECT si.*, c.name as customer_name
       FROM sales_invoices si
       JOIN customers c ON si.customer_id = c.id AND c.company_id = si.company_id
       WHERE si.company_id = ?
       ORDER BY si.created_at DESC`,
      [companyId]
    );
  }

  public static async getInvoiceById(id: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    const inv = await c.queryOne('SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!inv) return null;
    const items = await c.query(
      `SELECT sii.*, p.name as product_name, p.sku
       FROM sales_invoice_items sii
       JOIN products p ON sii.product_id = p.id AND p.company_id = sii.company_id
       WHERE sii.invoice_id = ? AND sii.company_id = ?`,
      [id, companyId]
    );
    return { ...inv, items };
  }

  // ==========================================================
  // 8. PURCHASE & VENDORS
  // ==========================================================
  public static async getVendors(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM vendors WHERE company_id = ? ORDER BY name ASC', [companyId]);
  }

  public static async getVendorById(id: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.queryOne('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  public static async createVendor(
    input: { name: string; companyName?: string; contactPerson?: string; phone?: string; email?: string; address?: string; city?: string },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    await c.execute(
      `INSERT INTO vendors (id, company_id, name, company_name, contact_person, phone, email, address, city, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, companyId, input.name, input.companyName || null, input.contactPerson || null, input.phone || null, input.email || null, input.address || null, input.city || null]
    );
    return this.getVendorById(id, companyId, c);
  }

  public static async createPurchaseBill(
    input: {
      vendorId: string;
      billNumber: string;
      billDate?: string;
      dueDate?: string;
      subtotalPaisas: number;
      netAmountPaisas: number;
      items: {
        productId: string;
        quantity: number;
        ratePerPiecePaisas: number;
        lineTotalPaisas: number;
      }[];
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const runner = async (tx: ITransactionClient) => {
      const billId = generateUUID();
      const bDate = input.billDate || new Date().toISOString().slice(0, 10);
      const dDate = input.dueDate || bDate;

      await tx.execute(
        `INSERT INTO purchase_bills (
          id, company_id, bill_number, vendor_id, bill_date, due_date,
          vendor_invoice_number, subtotal_paisas, net_amount_paisas,
          remaining_balance_paisas, subtotal, net_amount, remaining_balance,
          status, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', 'UNPAID')`,
        [
          billId,
          companyId,
          input.billNumber,
          input.vendorId,
          bDate,
          dDate,
          (input as any).vendorInvoiceNumber || input.billNumber,
          input.subtotalPaisas,
          input.netAmountPaisas,
          input.netAmountPaisas,
          fromPaisas(input.subtotalPaisas),
          fromPaisas(input.netAmountPaisas),
          fromPaisas(input.netAmountPaisas),
        ]
      );

      for (const item of input.items) {
        const itemId = generateUUID();
        await tx.execute(
          `INSERT INTO purchase_bill_items (
            id, company_id, bill_id, product_id, total_pieces,
            rate_per_piece_paisas, line_total_paisas, rate_per_piece, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            companyId,
            billId,
            item.productId,
            item.quantity,
            item.ratePerPiecePaisas,
            item.lineTotalPaisas,
            fromPaisas(item.ratePerPiecePaisas),
            fromPaisas(item.lineTotalPaisas),
          ]
        );

        // Increment stock
        await tx.execute(
          'UPDATE products SET current_stock = current_stock + ? WHERE id = ? AND company_id = ?',
          [item.quantity, item.productId, companyId]
        );
      }

      return tx.queryOne('SELECT * FROM purchase_bills WHERE id = ? AND company_id = ?', [billId, companyId]);
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  // ==========================================================
  // 9. SALES RETURNS
  // ==========================================================
  public static async createSalesReturn(
    input: {
      customerId: string;
      returnDate?: string;
      subtotalPaisas: number;
      totalRefundPaisas: number;
      items: {
        productId: string;
        quantity: number;
        unitPricePaisas: number;
        lineTotalPaisas: number;
      }[];
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const runner = async (tx: ITransactionClient) => {
      const returnId = generateUUID();
      const rDate = input.returnDate || new Date().toISOString().slice(0, 10);
      const prefix = `SR-${rDate.replace(/-/g, '')}-`;
      const last = await tx.queryOne(
        'SELECT return_number FROM sales_returns WHERE company_id = ? AND return_number LIKE ? ORDER BY return_number DESC LIMIT 1',
        [companyId, `${prefix}%`]
      );
      let seq = 1;
      if (last?.return_number) {
        const parts = last.return_number.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
      }
      const returnNumber = `${prefix}${String(seq).padStart(4, '0')}`;

      // Post GL entry
      const glRes = await this.postJournalEntry({
        companyId,
        description: `Sales Return: ${returnNumber}`,
        sourceModule: 'sales_returns',
        sourceDocumentId: returnId,
        entryDate: rDate,
        lines: [
          { accountId: '4030', debitPaisas: input.totalRefundPaisas, creditPaisas: 0 },
          { accountId: '1030', debitPaisas: 0, creditPaisas: input.totalRefundPaisas, entityType: 'CUSTOMER', entityId: input.customerId },
        ],
      }, tx);

      await tx.execute(
        `INSERT INTO sales_returns (
          id, company_id, return_number, customer_id, return_date,
          subtotal_paisas, total_refund_paisas, subtotal, total_refund,
          journal_entry_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')`,
        [
          returnId,
          companyId,
          returnNumber,
          input.customerId,
          rDate,
          input.subtotalPaisas,
          input.totalRefundPaisas,
          fromPaisas(input.subtotalPaisas),
          fromPaisas(input.totalRefundPaisas),
          glRes.journalId,
        ]
      );

      for (const item of input.items) {
        const itemId = generateUUID();
        await tx.execute(
          `INSERT INTO sales_return_items (
            id, company_id, return_id, product_id, total_base_qty,
            unit_rate_paisas, line_total_paisas, unit_rate, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            companyId,
            returnId,
            item.productId,
            item.quantity,
            item.unitPricePaisas,
            item.lineTotalPaisas,
            fromPaisas(item.unitPricePaisas),
            fromPaisas(item.lineTotalPaisas),
          ]
        );

        // Re-stock inventory
        await tx.execute(
          'UPDATE products SET current_stock = current_stock + ? WHERE id = ? AND company_id = ?',
          [item.quantity, item.productId, companyId]
        );
      }

      return tx.queryOne('SELECT * FROM sales_returns WHERE id = ? AND company_id = ?', [returnId, companyId]);
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  // ==========================================================
  // 10. PAYMENTS (CUSTOMER)
  // ==========================================================
  public static async recordCustomerPayment(
    input: {
      customerId: string;
      paymentDate?: string;
      amountPaisas: number;
      paymentMethod?: string;
      referenceNote?: string;
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const runner = async (tx: ITransactionClient) => {
      const paymentId = generateUUID();
      const pDate = input.paymentDate || new Date().toISOString().slice(0, 10);
      const prefix = `RCP-${pDate.replace(/-/g, '')}-`;
      const last = await tx.queryOne(
        'SELECT payment_number FROM customer_payments WHERE company_id = ? AND payment_number LIKE ? ORDER BY payment_number DESC LIMIT 1',
        [companyId, `${prefix}%`]
      );
      let seq = 1;
      if (last?.payment_number) {
        const parts = last.payment_number.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
      }
      const paymentNumber = `${prefix}${String(seq).padStart(4, '0')}`;

      // GL entry
      const glRes = await this.postJournalEntry({
        companyId,
        description: `Customer Receipt: ${paymentNumber}`,
        sourceModule: 'customer_payments',
        sourceDocumentId: paymentId,
        entryDate: pDate,
        lines: [
          { accountId: '1010', debitPaisas: input.amountPaisas, creditPaisas: 0 },
          { accountId: '1030', debitPaisas: 0, creditPaisas: input.amountPaisas, entityType: 'CUSTOMER', entityId: input.customerId },
        ],
      }, tx);

      await tx.execute(
        `INSERT INTO customer_payments (
          id, company_id, payment_number, payment_date, customer_id,
          account_id, payment_method, amount_paisas, amount,
          unallocated_amount_paisas, unallocated_amount, reference_note,
          journal_id, status
        ) VALUES (?, ?, ?, ?, ?, '1010', ?, ?, ?, ?, ?, ?, ?, 'POSTED')`,
        [
          paymentId,
          companyId,
          paymentNumber,
          pDate,
          input.customerId,
          input.paymentMethod || 'CASH',
          input.amountPaisas,
          fromPaisas(input.amountPaisas),
          input.amountPaisas,
          fromPaisas(input.amountPaisas),
          input.referenceNote || null,
          glRes.journalId,
        ]
      );

      return tx.queryOne('SELECT * FROM customer_payments WHERE id = ? AND company_id = ?', [paymentId, companyId]);
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  // ==========================================================
  // 11. EXPENSES
  // ==========================================================
  public static async getExpenses(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM expenses WHERE company_id = ? ORDER BY expense_date DESC', [companyId]);
  }

  public static async createExpense(
    input: {
      expenseAccountId?: string;
      categoryAccountId?: string;
      paidFromAccountId?: string;
      paymentAccountId?: string;
      amountPaisas: number;
      payeeName?: string;
      payee?: string;
      description: string;
      expenseDate?: string;
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);

    const runner = async (tx: ITransactionClient) => {
      const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
      const prefix = `EXP-${yearMonth}-`;
      const last = await tx.queryOne(
        'SELECT voucher_number FROM expenses WHERE company_id = ? AND voucher_number LIKE ? ORDER BY voucher_number DESC LIMIT 1',
        [companyId, `${prefix}%`]
      );
      let seq = 1;
      if (last?.voucher_number) {
        const parts = last.voucher_number.split('-');
        seq = parseInt(parts[parts.length - 1], 10) + 1;
      }
      const voucherNumber = `${prefix}${String(seq).padStart(4, '0')}`;
      const expenseId = generateUUID();
      const expenseDate = input.expenseDate || new Date().toISOString().slice(0, 10);
      const expAcc = input.expenseAccountId || input.categoryAccountId || '5050';
      const paidAcc = input.paidFromAccountId || input.paymentAccountId || '1010';

      // Post GL entry
      const glRes = await this.postJournalEntry({
        companyId,
        description: `Expense: ${input.description}`,
        sourceModule: 'expenses',
        sourceDocumentId: expenseId,
        entryDate: expenseDate,
        lines: [
          { accountId: expAcc, debitPaisas: input.amountPaisas, creditPaisas: 0 },
          { accountId: paidAcc, debitPaisas: 0, creditPaisas: input.amountPaisas },
        ],
      }, tx);

      await tx.execute(
        `INSERT INTO expenses (
          id, company_id, voucher_number, expense_date, expense_account_id,
          paid_from_account_id, amount_paisas, amount, description,
          journal_entry_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')`,
        [
          expenseId,
          companyId,
          voucherNumber,
          expenseDate,
          expAcc,
          paidAcc,
          input.amountPaisas,
          fromPaisas(input.amountPaisas),
          input.description,
          glRes.journalId,
        ]
      );

      const row = await tx.queryOne('SELECT * FROM expenses WHERE id = ? AND company_id = ?', [expenseId, companyId]);
      return row ? { ...row, expense_number: row.voucher_number } : null;
    };

    if ('transaction' in c && typeof c.transaction === 'function') {
      return (c as IDatabaseClient).transaction(runner);
    }
    return runner(c as ITransactionClient);
  }

  // ==========================================================
  // 12. BANK ACCOUNTS & LIQUIDITY
  // ==========================================================
  public static async getBankAccounts(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT * FROM bank_accounts WHERE company_id = ? ORDER BY account_title ASC', [companyId]);
  }

  public static async createBankAccount(
    input: {
      accountTitle: string;
      accountNumber: string;
      bankName: string;
      branchName?: string;
      accountId?: string;
      glAccountId?: string;
      openingBalancePaisas?: number;
    },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    const balance = input.openingBalancePaisas || 0;
    await c.execute(
      `INSERT INTO bank_accounts (
        id, company_id, account_title, account_number, bank_name,
        branch_name, account_id, opening_balance_paisas,
        opening_balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        companyId,
        input.accountTitle,
        input.accountNumber,
        input.bankName,
        input.branchName || null,
        input.accountId || input.glAccountId || null,
        balance,
        fromPaisas(balance),
      ]
    );
    return c.queryOne('SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  // ==========================================================
  // 13. DAILY CLOSINGS
  // ==========================================================
  public static async isDayClosed(date: string, companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    const row = await c.queryOne(
      'SELECT status FROM daily_closings WHERE company_id = ? AND closing_date = ?',
      [companyId, date]
    );
    return row ? row.status === 'CLOSED' : false;
  }

  public static async finalizeDailyClosing(
    dateOrInput: any,
    closedByOrCompanyId?: any,
    notesOrClient?: any,
    companyIdArg?: any,
    clientArg?: any
  ) {
    let date: string;
    let closedBy = 'Admin';
    let notes = '';
    let companyId = DEFAULT_COMPANY_ID;
    let expectedCashPaisas = 0;
    let physicalCashPaisas = 0;
    let variancePaisas = 0;
    let denominationsJson = '{}';
    let client: IDatabaseClient | ITransactionClient | undefined;

    if (typeof dateOrInput === 'string') {
      date = dateOrInput;
      closedBy = closedByOrCompanyId || 'Admin';
      notes = typeof notesOrClient === 'string' ? notesOrClient : '';
      companyId = companyIdArg || DEFAULT_COMPANY_ID;
      client = clientArg;
    } else {
      date = dateOrInput.closingDate || dateOrInput.date || new Date().toISOString().slice(0, 10);
      expectedCashPaisas = dateOrInput.expectedCashPaisas || 0;
      physicalCashPaisas = dateOrInput.physicalCashPaisas || 0;
      variancePaisas = dateOrInput.variancePaisas || 0;
      denominationsJson = dateOrInput.denominationsJson || '{}';
      closedBy = dateOrInput.closedBy || 'Admin';
      notes = dateOrInput.notes || '';
      companyId = closedByOrCompanyId || DEFAULT_COMPANY_ID;
      client = (notesOrClient && typeof notesOrClient === 'object' && ('query' in notesOrClient)) ? notesOrClient : undefined;
    }

    const c = this.getClient(client);
    const id = generateUUID();
    await c.execute(
      `INSERT INTO daily_closings (
        id, company_id, closing_date, opening_cash_paisas, spot_cash_sales_paisas,
        debt_recoveries_paisas, spot_cash_purchases_paisas, daily_expenses_paisas,
        bank_deposits_paisas, expected_cash_paisas, physical_cash_paisas,
        variance_paisas, denominations_json, status, closed_by, closed_at, notes
      ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, 'CLOSED', ?, CURRENT_TIMESTAMP::text, ?)
      ON CONFLICT (company_id, closing_date) DO UPDATE SET
        physical_cash_paisas = EXCLUDED.physical_cash_paisas,
        variance_paisas = EXCLUDED.variance_paisas,
        status = 'CLOSED',
        closed_by = EXCLUDED.closed_by,
        closed_at = CURRENT_TIMESTAMP::text,
        notes = EXCLUDED.notes`,
      [
        id,
        companyId,
        date,
        expectedCashPaisas,
        physicalCashPaisas,
        variancePaisas,
        denominationsJson,
        closedBy,
        notes || null,
      ]
    );
    const row = await c.queryOne('SELECT * FROM daily_closings WHERE id = ? AND company_id = ?', [id, companyId]);
    return row ? { ...row, is_closed: row.status === 'CLOSED' ? 1 : 0 } : null;
  }

  // ==========================================================
  // 14. APP USERS & AUTH
  // ==========================================================
  public static async getAppUsers(companyId: string, client?: IDatabaseClient | ITransactionClient) {
    const c = this.getClient(client);
    return c.query('SELECT id, company_id, username, full_name, role, is_active, created_at FROM app_users WHERE company_id = ?', [companyId]);
  }

  public static async createAppUser(
    input: { username: string; password: string; fullName: string; role?: string; staffId?: string },
    companyId: string,
    client?: IDatabaseClient | ITransactionClient
  ) {
    const c = this.getClient(client);
    const id = generateUUID();
    const pHash = hashPassword(input.password);
    await c.execute(
      `INSERT INTO app_users (id, company_id, username, password_hash, full_name, role, staff_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, companyId, input.username.trim(), pHash, input.fullName, input.role || 'SALESMAN', input.staffId || null]
    );
    return c.queryOne('SELECT id, company_id, username, full_name, role, is_active FROM app_users WHERE id = ? AND company_id = ?', [id, companyId]);
  }

  // ==========================================================
  // 15. ADVANCED UNIVERSAL DAL REPORTING & DOMAIN QUERIES
  // ==========================================================

  public static async getAccountsWithBalances(companyId: string = DEFAULT_COMPANY_ID, client?: IDatabaseClient | ITransactionClient): Promise<any[]> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT 
        coa.*,
        p.code as parent_code,
        p.name as parent_name,
        COALESCE(sums.total_debit_paisas, 0) as sum_debit_paisas,
        COALESCE(sums.total_credit_paisas, 0) as sum_credit_paisas,
        COALESCE(sums.tx_count, 0) as transaction_count,
        (SELECT COUNT(*) FROM chart_of_accounts child WHERE child.parent_id = coa.id AND child.company_id = coa.company_id) as sub_account_count
      FROM chart_of_accounts coa
      LEFT JOIN chart_of_accounts p ON coa.parent_id = p.id
      LEFT JOIN (
        SELECT 
          jl.account_id,
          SUM(jl.debit_paisas) as total_debit_paisas,
          SUM(jl.credit_paisas) as total_credit_paisas,
          COUNT(jl.id) as tx_count
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
        WHERE jl.company_id = ? AND je.status = 'POSTED'
        GROUP BY jl.account_id
      ) sums ON coa.id = sums.account_id
      WHERE coa.company_id = ?
      ORDER BY coa.code ASC
    `, [companyId, companyId]);

    return rows.map((row) => {
      const dPaisas = Number(row.sum_debit_paisas) || 0;
      const cPaisas = Number(row.sum_credit_paisas) || 0;
      const netPaisas = row.normal_balance === 'DEBIT' ? dPaisas - cPaisas : cPaisas - dPaisas;
      return {
        ...row,
        total_debits: fromPaisas(dPaisas),
        total_credits: fromPaisas(cPaisas),
        total_debits_paisas: dPaisas,
        total_credits_paisas: cPaisas,
        balance: fromPaisas(netPaisas),
        balance_paisas: netPaisas,
        transaction_count: Number(row.transaction_count) || 0,
        sub_account_count: Number(row.sub_account_count) || 0,
      };
    });
  }

  public static async getTrialBalance(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: IDatabaseClient | ITransactionClient
  ): Promise<{ rows: any[]; totalDebits: number; totalCredits: number }> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT 
        coa.id as account_id,
        coa.code,
        coa.name,
        coa.type,
        coa.normal_balance as normal_balance,
        COALESCE(sums.total_debit, 0) as total_debit_paisas,
        COALESCE(sums.total_credit, 0) as total_credit_paisas
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT 
          jl.account_id,
          SUM(jl.debit_paisas) as total_debit,
          SUM(jl.credit_paisas) as total_credit
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
        WHERE jl.company_id = ? AND je.status = 'POSTED'
        GROUP BY jl.account_id
      ) sums ON coa.id = sums.account_id
      WHERE coa.is_active = 1 AND coa.company_id = ?
      ORDER BY coa.code ASC
    `, [companyId, companyId]);

    let totalDebitsPaisas = 0;
    let totalCreditsPaisas = 0;

    const formattedRows = rows.map((r) => {
      const dPaisas = Number(r.total_debit_paisas ?? r.totaldebitpaisas) || 0;
      const cPaisas = Number(r.total_credit_paisas ?? r.totalcreditpaisas) || 0;
      totalDebitsPaisas += dPaisas;
      totalCreditsPaisas += cPaisas;

      const d = fromPaisas(dPaisas);
      const c = fromPaisas(cPaisas);
      const normalBal = r.normal_balance ?? r.normalbalance ?? 'DEBIT';
      const netBalance = normalBal === 'DEBIT' ? d - c : c - d;

      return {
        accountId: r.account_id ?? r.accountid ?? r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        normalBalance: normalBal,
        totalDebit: d,
        totalCredit: c,
        netBalance: fromPaisas(toPaisas(netBalance)),
      };
    });

    return {
      rows: formattedRows,
      totalDebits: fromPaisas(totalDebitsPaisas),
      totalCredits: fromPaisas(totalCreditsPaisas),
    };
  }

  public static async getEntries(limit: number = 50, companyId: string = DEFAULT_COMPANY_ID, client?: IDatabaseClient | ITransactionClient): Promise<any[]> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT * FROM journal_entries 
      WHERE company_id = ? 
      ORDER BY entry_date DESC, created_at DESC LIMIT ?
    `, [companyId, limit]);

    if (rows.length === 0) return [];

    const journalIds = rows.map((r) => r.id);
    const placeholders = journalIds.map(() => '?').join(',');
    const allLines = await c.query<any>(`
      SELECT jl.*, coa.code as account_code, coa.name as account_name
      FROM journal_lines jl
      JOIN chart_of_accounts coa ON jl.account_id = coa.id AND jl.company_id = coa.company_id
      WHERE jl.journal_id IN (${placeholders}) AND jl.company_id = ?
      ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
    `, [...journalIds, companyId]);

    const linesByJournal = new Map<string, any[]>();
    for (const line of allLines) {
      const arr = linesByJournal.get(line.journal_id) || [];
      arr.push(line);
      linesByJournal.set(line.journal_id, arr);
    }

    for (const entry of rows) {
      entry.lines = linesByJournal.get(entry.id) || [];
    }

    return rows;
  }

  public static async getEntityBalances(
    entityType: 'CUSTOMER' | 'VENDOR',
    companyId: string = DEFAULT_COMPANY_ID,
    entityIds?: string[],
    client?: IDatabaseClient | ITransactionClient
  ): Promise<Map<string, { balance: number; balancePaisas: number }>> {
    const c = this.getClient(client);
    let query = `
      SELECT 
        jl.entity_id,
        SUM(jl.debit_paisas) as total_debit,
        SUM(jl.credit_paisas) as total_credit
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND jl.company_id = je.company_id
      WHERE jl.company_id = ? AND jl.entity_type = ? AND je.status = 'POSTED'
    `;
    const params: any[] = [companyId, entityType];

    if (entityIds && entityIds.length > 0) {
      const placeholders = entityIds.map(() => '?').join(',');
      query += ` AND jl.entity_id IN (${placeholders})`;
      params.push(...entityIds);
    }

    query += ` GROUP BY jl.entity_id`;

    const rows = await c.query<any>(query, params);
    const map = new Map<string, { balance: number; balancePaisas: number }>();
    for (const row of rows) {
      if (!row.entity_id) continue;
      const d = Number(row.total_debit) || 0;
      const cPaisas = Number(row.total_credit) || 0;
      const balancePaisas = entityType === 'CUSTOMER' ? (d - cPaisas) : (cPaisas - d);
      map.set(row.entity_id, {
        balancePaisas,
        balance: fromPaisas(balancePaisas),
      });
    }
    return map;
  }

  public static async getCustomersWithBalances(companyId: string = DEFAULT_COMPANY_ID, client?: IDatabaseClient | ITransactionClient): Promise<any[]> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT 
        c.*,
        r.name as r_name,
        r.code as r_code,
        r.delivery_days as r_days
      FROM customers c
      LEFT JOIN routes r ON c.route_id = r.id AND r.company_id = c.company_id
      WHERE c.company_id = ?
      ORDER BY c.name ASC
    `, [companyId]);

    const balancesMap = await this.getEntityBalances('CUSTOMER', companyId, undefined, c);

    return rows.map((cust) => {
      const balanceInfo = balancesMap.get(cust.id);
      const liveBalance = balanceInfo !== undefined ? balanceInfo.balance : Number(cust.balance || 0);
      const liveBalancePaisas = balanceInfo !== undefined ? balanceInfo.balancePaisas : toPaisas(Number(cust.balance || 0));

      let deliveryDays: string[] = [];
      try {
        deliveryDays = typeof cust.r_days === 'string' ? JSON.parse(cust.r_days || '[]') : (cust.r_days || []);
      } catch {
        deliveryDays = [];
      }

      return {
        id: cust.id,
        company_id: cust.company_id,
        name: cust.name,
        shop_name: cust.shop_name,
        contact_person: cust.contact_person,
        phone: cust.phone,
        email: cust.email,
        address: cust.address,
        city: cust.city,
        cnic_or_ntn: cust.cnic_or_ntn,
        route_id: cust.route_id,
        route_name: cust.r_name || cust.route_name || 'Unassigned',
        route_code: cust.r_code || null,
        delivery_days: deliveryDays,
        credit_limit_paisas: Number(cust.credit_limit_paisas) || toPaisas(Number(cust.credit_limit || 0)),
        credit_limit: fromPaisas(Number(cust.credit_limit_paisas) || toPaisas(Number(cust.credit_limit || 0))),
        credit_days: Number(cust.credit_days) || 0,
        live_balance_paisas: liveBalancePaisas,
        live_balance: liveBalance,
        is_active: Number(cust.is_active) ?? 1,
      };
    });
  }

  public static async getProductsDetailed(
    options?: { maskCost?: boolean; categoryId?: string; categoryIds?: string[]; brandId?: string; brandIds?: string[]; companyId?: string },
    client?: IDatabaseClient | ITransactionClient
  ): Promise<any[]> {
    const c = this.getClient(client);
    const maskCost = !!options?.maskCost;
    const companyId = options?.companyId || DEFAULT_COMPANY_ID;

    let query = `
      SELECT 
        p.*,
        c.name as cat_name,
        b.name as b_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
      LEFT JOIN brands b ON p.brand_id = b.id AND b.company_id = p.company_id
      WHERE p.company_id = ?
    `;
    const params: any[] = [companyId];

    if (options?.categoryIds && options.categoryIds.length > 0) {
      const placeholders = options.categoryIds.map(() => '?').join(', ');
      query += ` AND p.category_id IN (${placeholders})`;
      params.push(...options.categoryIds);
    } else if (options?.categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(options.categoryId);
    }

    if (options?.brandIds && options.brandIds.length > 0) {
      const placeholders = options.brandIds.map(() => '?').join(', ');
      query += ` AND p.brand_id IN (${placeholders})`;
      params.push(...options.brandIds);
    } else if (options?.brandId) {
      query += ` AND p.brand_id = ?`;
      params.push(options.brandId);
    }

    query += ` ORDER BY p.name ASC`;

    const rows = await c.query<any>(query, params);
    const { breakdownStock, formatPackagingRatio } = await import('../../shared/utils/uom');

    return rows.map((p) => {
      const boxesPerCarton = Math.max(1, Number(p.boxes_per_carton) || 1);
      const piecesPerBox = Math.max(1, Number(p.pieces_per_box) || Number(p.bulk_conversion_factor) || 1);
      const totalPiecesPerCarton = Math.max(1, Number(p.total_pieces_per_carton) || (boxesPerCarton * piecesPerBox));

      const stockBase = Number(p.current_stock_base ?? p.current_stock) || 0;
      const breakdown = breakdownStock(stockBase, boxesPerCarton, piecesPerBox);

      const bulkName = p.uom_bulk || 'CARTON';
      const baseName = p.uom_base || 'PIECE';

      const costPaisas = Number(p.cost_price_paisas) || toPaisas(Number(p.cost_price) || 0);
      const tpPaisas = Number(p.trade_price_paisas) || toPaisas(Number(p.selling_price) || 0);
      const mrpPaisas = Number(p.mrp_paisas) || Math.round(tpPaisas * 1.12);

      const costDecimal = fromPaisas(costPaisas);
      const tpDecimal = fromPaisas(tpPaisas);
      const mrpDecimal = fromPaisas(mrpPaisas);

      const margin = tpDecimal > 0 ? ((tpDecimal - costDecimal) / tpDecimal) * 100 : 0;
      const isLowStock = Number(p.min_stock_alert) > 0 && stockBase <= Number(p.min_stock_alert);
      const rawBaseRatePaisas = Number(p.base_rate_per_piece_paisas) || costPaisas;

      return {
        id: p.id,
        company_id: p.company_id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        category_id: p.category_id,
        category_name: p.cat_name || p.category || 'General',
        brand_id: p.brand_id,
        brand_name: p.b_name || p.brand_name || 'Generic / Unbranded',
        uom_base: baseName,
        uom_bulk: bulkName,
        bulk_conversion_factor: totalPiecesPerCarton,
        boxes_per_carton: boxesPerCarton,
        pieces_per_box: piecesPerBox,
        total_pieces_per_carton: totalPiecesPerCarton,
        packaging_ratio: formatPackagingRatio(boxesPerCarton, piecesPerBox),
        base_rate_per_piece_paisas: maskCost ? 0 : rawBaseRatePaisas,
        base_rate_per_piece: maskCost ? 0 : fromPaisas(rawBaseRatePaisas),
        item_type: p.item_type || 'STANDARD',
        costing_method: p.costing_method || 'FIFO',
        cost_price_paisas: maskCost ? 0 : costPaisas,
        trade_price_paisas: tpPaisas,
        mrp_paisas: mrpPaisas,
        cost_price: maskCost ? 0 : costDecimal,
        trade_price: tpDecimal,
        mrp: mrpDecimal,
        margin_percentage: maskCost ? 0 : Math.round(margin * 10) / 10,
        current_stock_base: stockBase,
        stock_cartons: breakdown.cartons,
        stock_boxes: breakdown.boxes,
        stock_pieces: breakdown.pieces,
        formatted_stock: breakdown.formatted,
        stock_summary: `${breakdown.cartons} CTN + ${breakdown.boxes} BOX + ${breakdown.pieces} PCS`,
        min_stock_alert: Number(p.min_stock_alert) || 0,
        is_low_stock: isLowStock,
        is_active: Number(p.is_active) ?? 1,
      };
    });
  }

  public static async getProfitAndLoss(
    filter?: { fromDate?: string; toDate?: string; companyId?: string },
    client?: IDatabaseClient | ITransactionClient
  ): Promise<any> {
    const c = this.getClient(client);
    const companyId = filter?.companyId || DEFAULT_COMPANY_ID;
    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter?.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter?.toDate || today;

    const accountRows = await c.query<any>(`
      SELECT 
        coa.id,
        coa.code,
        coa.name,
        coa.type,
        coa.normal_balance,
        COALESCE(SUM(jl.debit_paisas), 0) as total_debit_paisas,
        COALESCE(SUM(jl.credit_paisas), 0) as total_credit_paisas
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl ON coa.id = jl.account_id AND coa.company_id = jl.company_id
      LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = coa.company_id AND je.status = 'POSTED'
        AND je.entry_date >= ? AND je.entry_date <= ?
      WHERE coa.type IN ('REVENUE', 'EXPENSE') AND coa.is_active = 1 AND coa.company_id = ?
      GROUP BY coa.id, coa.code, coa.name, coa.type, coa.normal_balance
      ORDER BY coa.code ASC
    `, [fromDate, toDate, companyId]);

    const row4010 = accountRows.find((r) => r.code === '4010');
    const grossSalesPaisas = Math.max(0, (Number(row4010?.total_credit_paisas) || 0) - (Number(row4010?.total_debit_paisas) || 0));

    const row4030 = accountRows.find((r) => r.code === '4030');
    const salesReturnsPaisas = Math.max(0, (Number(row4030?.total_debit_paisas) || 0) - (Number(row4030?.total_credit_paisas) || 0));

    const netSalesPaisas = Math.max(0, grossSalesPaisas - salesReturnsPaisas);

    const row5010 = accountRows.find((r) => r.code === '5010');
    const cogsPaisas = Math.max(0, (Number(row5010?.total_debit_paisas) || 0) - (Number(row5010?.total_credit_paisas) || 0));

    const grossProfitPaisas = netSalesPaisas - cogsPaisas;
    const grossMarginPercentage = netSalesPaisas > 0 ? Math.round((grossProfitPaisas / netSalesPaisas) * 1000) / 10 : 0;

    const operatingExpenses: any[] = [];
    let totalOperatingExpensesPaisas = 0;

    for (const r of accountRows) {
      if (r.type === 'EXPENSE' && r.code !== '5010') {
        const expensePaisas = Math.max(0, (Number(r.total_debit_paisas) || 0) - (Number(r.total_credit_paisas) || 0));
        if (expensePaisas > 0) {
          totalOperatingExpensesPaisas += expensePaisas;
          const pct = netSalesPaisas > 0 ? Math.round((expensePaisas / netSalesPaisas) * 1000) / 10 : 0;
          operatingExpenses.push({
            code: r.code,
            name: r.name,
            amount: fromPaisas(expensePaisas),
            amountPaisas: expensePaisas,
            percentageOfRevenue: pct,
          });
        }
      }
    }

    const netProfitPaisas = grossProfitPaisas - totalOperatingExpensesPaisas;
    const netMarginPercentage = netSalesPaisas > 0 ? Math.round((netProfitPaisas / netSalesPaisas) * 1000) / 10 : 0;

    return {
      fromDate,
      toDate,
      grossSales: fromPaisas(grossSalesPaisas),
      grossSalesPaisas,
      salesReturns: fromPaisas(salesReturnsPaisas),
      salesReturnsPaisas,
      netSales: fromPaisas(netSalesPaisas),
      netSalesPaisas,
      costOfGoodsSold: fromPaisas(cogsPaisas),
      costOfGoodsSoldPaisas: cogsPaisas,
      grossProfit: fromPaisas(grossProfitPaisas),
      grossProfitPaisas,
      grossMarginPercentage,
      operatingExpenses,
      totalOperatingExpenses: fromPaisas(totalOperatingExpensesPaisas),
      totalOperatingExpensesPaisas,
      netProfit: fromPaisas(netProfitPaisas),
      netProfitPaisas,
      netMarginPercentage,
    };
  }

  public static async getPurchaseBills(
    filters?: {
      companyId?: string;
      search?: string;
      vendorId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    companyIdOverride?: string,
    client?: IDatabaseClient | ITransactionClient
  ): Promise<any[]> {
    const c = this.getClient(client);
    const companyId = filters?.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    let baseQuery = `
      FROM purchase_bills pb
      JOIN vendors v ON pb.vendor_id = v.id AND v.company_id = pb.company_id
      WHERE pb.company_id = ?
    `;
    const params: any[] = [companyId];

    if (filters?.search) {
      baseQuery += ` AND (pb.bill_number LIKE ? OR pb.vendor_invoice_number LIKE ? OR pb.reference_number LIKE ? OR pb.broker LIKE ? OR v.name LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term, term);
    }

    if (filters?.vendorId) {
      baseQuery += ` AND pb.vendor_id = ?`;
      params.push(filters.vendorId);
    }

    if (filters?.status) {
      const statuses = (Array.isArray(filters.status) ? filters.status : filters.status.split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        baseQuery += ` AND pb.status = ?`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        baseQuery += ` AND pb.status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
      }
    }

    if (filters?.from) {
      baseQuery += ` AND pb.bill_date >= ?`;
      params.push(filters.from);
    }

    if (filters?.to) {
      baseQuery += ` AND pb.bill_date <= ?`;
      params.push(filters.to);
    }

    const isPaginated = filters?.page !== undefined || filters?.limit !== undefined;
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));

    let total = 0;
    if (isPaginated) {
      const countRow = await c.queryOne<any>(`SELECT COUNT(*) as count ${baseQuery}`, params);
      total = Number(countRow?.count) || 0;
    }

    let query = `
      SELECT 
        pb.*,
        v.name as vendor_name,
        v.company_name
      ${baseQuery}
      ORDER BY pb.bill_date DESC, pb.created_at DESC
    `;

    const queryParams = [...params];
    if (isPaginated) {
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(limit, (page - 1) * limit);
    }

    const rows = await c.query<any>(query, queryParams);

    if (isPaginated) {
      const totalPages = Math.ceil(total / limit) || 1;
      return Object.assign(rows, {
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    }

    return rows;
  }

  public static async getPaymentsReceived(
    filters?: {
      from?: string;
      to?: string;
      customerId?: string;
      accountId?: string;
      paymentMethod?: string;
      status?: string;
      search?: string;
    },
    companyIdOverride?: string,
    client?: IDatabaseClient | ITransactionClient
  ): Promise<any[]> {
    const c = this.getClient(client);
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;

    let query = `
      SELECT 
        p.*,
        c.name as customer_name,
        c.shop_name,
        coa.code as account_code,
        coa.name as account_name,
        (SELECT COUNT(*) FROM customer_payment_allocations a WHERE a.payment_id = p.id AND a.company_id = p.company_id) as allocations_count,
        (SELECT COALESCE(SUM(a.allocated_amount), 0) FROM customer_payment_allocations a WHERE a.payment_id = p.id AND a.company_id = p.company_id) as allocated_total
      FROM customer_payments p
      JOIN customers c ON p.customer_id = c.id AND c.company_id = p.company_id
      LEFT JOIN chart_of_accounts coa ON p.account_id = coa.id AND coa.company_id = p.company_id
      WHERE p.company_id = ?
    `;
    const params: any[] = [companyId];

    if (filters?.search) {
      query += ` AND (p.payment_number LIKE ? OR c.name LIKE ? OR c.shop_name LIKE ? OR p.reference_note LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    if (filters?.customerId) {
      query += ` AND p.customer_id = ?`;
      params.push(filters.customerId);
    }

    if (filters?.accountId) {
      query += ` AND p.account_id = ?`;
      params.push(filters.accountId);
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
      query += ` AND p.payment_method = ?`;
      params.push(filters.paymentMethod);
    }

    if (filters?.status && filters.status !== 'ALL') {
      query += ` AND p.status = ?`;
      params.push(filters.status);
    }

    if (filters?.from) {
      query += ` AND p.payment_date >= ?`;
      params.push(filters.from);
    }

    if (filters?.to) {
      query += ` AND p.payment_date <= ?`;
      params.push(filters.to);
    }

    query += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

    return c.query<any>(query, params);
  }

  public static async getInvoicesDetailed(companyId: string, client?: IDatabaseClient | ITransactionClient): Promise<any[]> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT 
        i.*,
        c.name as customer_name,
        c.shop_name,
        r.name as route_name,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code,
        (SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id = i.id AND company_id = i.company_id) as item_count
      FROM sales_invoices i
      LEFT JOIN customers c ON i.customer_id = c.id AND c.company_id = i.company_id
      LEFT JOIN routes r ON i.route_id = r.id AND r.company_id = i.company_id
      LEFT JOIN staff_members s ON i.salesman_id = s.id AND s.company_id = i.company_id
      LEFT JOIN staff_members p ON i.supply_person_id = p.id AND p.company_id = i.company_id
      WHERE i.company_id = ?
      ORDER BY i.created_at DESC
    `, [companyId]);

    return rows.map((r) => ({
      ...r,
      subtotal: fromPaisas(Number(r.subtotal_paisas) || toPaisas(Number(r.subtotal) || 0)),
      grand_total: fromPaisas(Number(r.grand_total_paisas) || toPaisas(Number(r.grand_total) || 0)),
      cash_received: fromPaisas(Number(r.cash_received_paisas) || toPaisas(Number(r.amount_paid) || 0)),
      remaining_balance: fromPaisas(Number(r.remaining_balance_paisas) || toPaisas(Number(r.grand_total || 0) - Number(r.amount_paid || 0))),
    }));
  }

  public static async getInvoiceByIdDetailed(invoiceId: string, companyId: string, client?: IDatabaseClient | ITransactionClient): Promise<any> {
    const c = this.getClient(client);
    const invoice = await c.queryOne<any>(`
      SELECT 
        i.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        c.address as customer_address,
        c.city as customer_city,
        c.cnic_or_ntn,
        r.name as route_name,
        r.code as route_code,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code
      FROM sales_invoices i
      LEFT JOIN customers c ON i.customer_id = c.id AND c.company_id = i.company_id
      LEFT JOIN routes r ON i.route_id = r.id AND r.company_id = i.company_id
      LEFT JOIN staff_members s ON i.salesman_id = s.id AND s.company_id = i.company_id
      LEFT JOIN staff_members p ON i.supply_person_id = p.id AND p.company_id = i.company_id
      WHERE i.id = ? AND i.company_id = ?
    `, [invoiceId, companyId]);

    if (!invoice) return null;

    const items = await c.query<any>(`
      SELECT 
        sii.*,
        p.name as product_name,
        p.sku,
        p.uom_base,
        p.uom_bulk,
        p.bulk_conversion_factor,
        p.boxes_per_carton,
        p.pieces_per_box,
        p.total_pieces_per_carton,
        p.item_type
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id AND p.company_id = sii.company_id
      WHERE sii.invoice_id = ? AND sii.company_id = ?
    `, [invoiceId, companyId]);

    return {
      ...invoice,
      subtotal: fromPaisas(Number(invoice.subtotal_paisas) || toPaisas(Number(invoice.subtotal) || 0)),
      grand_total: fromPaisas(Number(invoice.grand_total_paisas) || toPaisas(Number(invoice.grand_total) || 0)),
      cash_received: fromPaisas(Number(invoice.cash_received_paisas) || toPaisas(Number(invoice.amount_paid) || 0)),
      remaining_balance: fromPaisas(Number(invoice.remaining_balance_paisas) || toPaisas(Number(invoice.grand_total || 0) - Number(invoice.amount_paid || 0))),
      items,
    };
  }

  public static async getUsersDetailed(companyId: string = DEFAULT_COMPANY_ID, client?: IDatabaseClient | ITransactionClient): Promise<any[]> {
    const c = this.getClient(client);
    const rows = await c.query<any>(`
      SELECT 
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.staff_id,
        s.name as staff_name,
        u.is_active,
        u.permissions_json,
        u.created_at,
        u.updated_at,
        u.company_id
      FROM app_users u
      LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
      WHERE u.company_id = ?
      ORDER BY (CASE WHEN u.username = 'admin' THEN 0 ELSE 1 END), u.full_name ASC
    `, [companyId]);

    return rows.map((u) => {
      let permissions: string[] = [];
      try {
        permissions = typeof u.permissions_json === 'string' ? JSON.parse(u.permissions_json || '[]') : (u.permissions_json || []);
      } catch {
        permissions = [];
      }
      return {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        staff_id: u.staff_id || null,
        staff_name: u.staff_name || null,
        is_active: Number(u.is_active) ?? 1,
        permissions_json: u.permissions_json || null,
        permissions,
        created_at: u.created_at,
        updated_at: u.updated_at,
        company_id: u.company_id || companyId,
      };
    });
  }
}

