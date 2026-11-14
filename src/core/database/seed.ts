import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas } from '@/shared/utils/currency';
import { ensureDefaultChartOfAccounts } from '@/core/accounting/default-coa';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export function seedInitialData(db: DatabaseSync): void {
  // 1. Seed Chart of Accounts if empty for default company
  ensureDefaultChartOfAccounts(DEFAULT_COMPANY_ID, { db });

  // 2. Seed / Synchronize System Modules permanently
  const modules = [
    {
      id: 'sales',
      name: 'Sales & Distribution',
      description: 'Order booking, van distribution, delivery invoicing, sub-ledger customer tracking, and perpetual inventory.',
      version: '1.1.0',
      dependencies: JSON.stringify(['customers', 'inventory']),
    },
    {
      id: 'customers',
      name: 'Customer & Route Management',
      description: 'Retail stores, credit limits, distribution routes, and real-time sub-ledger statements.',
      version: '1.1.0',
      dependencies: JSON.stringify([]),
    },
    {
      id: 'inventory',
      name: 'Stock & Inventory Master',
      description: 'SKU tracking, bulk cartons + loose piece conversion, TP/MRP pricing, and opening stock reconciliations.',
      version: '1.1.0',
      dependencies: JSON.stringify([]),
    },
    {
      id: 'expenses',
      name: 'Expense Management',
      description: 'Distribution van fuel, driver per diem, rent, and utility vouchers.',
      version: '1.2.0',
      dependencies: JSON.stringify([]),
    },
    {
      id: 'purchase',
      name: 'Purchase & Vendor Bills',
      description: 'Manufacturer POs, vendor bills, and supplier ledger payments.',
      version: '1.1.0',
      dependencies: JSON.stringify(['inventory']),
    },
    {
      id: 'closing',
      name: 'Daily Cash Closing & Roznamcha',
      description: 'Daily cash reconciliation, Pakistani currency denomination counter, and day-end audit locking.',
      version: '1.0.0',
      dependencies: JSON.stringify(['sales', 'expenses']),
    },
    {
      id: 'returns',
      name: 'Sales & Purchase Returns',
      description: 'Customer credit notes with sales history audit, damage quarantine, and supplier debit notes.',
      version: '1.0.0',
      dependencies: JSON.stringify(['sales', 'purchase', 'inventory', 'customers']),
    },
    {
      id: 'reports',
      name: 'Reports & Business Intelligence',
      description: 'Customer & vendor party ledgers, Profit & Loss (Munaffa), stock valuation, and salesman recovery metrics.',
      version: '1.0.0',
      dependencies: JSON.stringify(['sales', 'purchase', 'inventory', 'expenses']),
    },
    {
      id: 'auth',
      name: 'Users, Roles & Security Access',
      description: 'Multi-user role-based access control (ADMIN, SALESMAN, CASHIER, WAREHOUSE), route guards, and admin PIN verification.',
      version: '1.0.0',
      dependencies: JSON.stringify([]),
    },
    {
      id: 'settings',
      name: 'System Settings & Company Branding',
      description: 'Manage company profile, business branding, print preferences, and dynamic feature toggles.',
      version: '1.0.0',
      dependencies: JSON.stringify([]),
    },
  ];

  const insertModule = db.prepare(`
    INSERT INTO system_modules (id, name, description, version, is_enabled, dependencies, settings, installed_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, '{}', datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      version = excluded.version,
      dependencies = excluded.dependencies,
      updated_at = datetime('now')
  `);

  for (const mod of modules) {
    insertModule.run(mod.id, mod.name, mod.description, mod.version, mod.dependencies);
  }

  // 3. Seed Categories if empty
  const catCountRow = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (!catCountRow || catCountRow.count === 0) {
    const categories = ['Beverages', 'Cooking Essentials', 'Packaged Foods', 'Snacks & Confectionery'];
    const insertCat = db.prepare('INSERT INTO categories (id, name, is_active) VALUES (?, ?, 1)');
    for (const cat of categories) {
      insertCat.run(generateUUID(), cat);
    }
  }

  // 4. Seed Distribution Routes if empty
  const routeCountRow = db.prepare('SELECT COUNT(*) as count FROM routes').get() as { count: number };
  if (!routeCountRow || routeCountRow.count === 0) {
    const routes = [
      {
        name: 'Route 1 - North Sector A',
        code: 'R-NORTH-A',
        days: JSON.stringify(['Monday', 'Thursday']),
      },
      {
        name: 'Route 2 - Central Commercial Hub',
        code: 'R-CENTRAL',
        days: JSON.stringify(['Tuesday', 'Friday']),
      },
    ];

    const insertRoute = db.prepare('INSERT INTO routes (id, name, code, delivery_days, is_active) VALUES (?, ?, ?, ?, 1)');
    for (const r of routes) {
      insertRoute.run(generateUUID(), r.name, r.code, r.days);
    }
  }

  // 5. Seed Feature Configuration Flags if empty or missing
  const defaultFlags = [
    {
      key: 'sales.enable_order_booking',
      moduleId: 'sales',
      value: 'true',
      label: 'Field Order Booking Workflow',
      description: 'Enables field route order booking page (Orders saved with status BOOKED, no inventory decrement or GL debits).',
    },
    {
      key: 'sales.enable_direct_sale',
      moduleId: 'sales',
      value: 'true',
      label: 'Direct / Van Sale Workflow',
      description: 'Enables direct spot sales with immediate real-time stock deduction and perpetual GL posting.',
    },
    {
      key: 'sales.enable_line_discount',
      moduleId: 'sales',
      value: 'true',
      label: 'Item Line Discounts',
      description: 'Allows percentage and PKR discounts on individual sales item rows with two-way reactive calculation.',
    },
    {
      key: 'sales.enable_bill_discount',
      moduleId: 'sales',
      value: 'true',
      label: 'Overall Bill / Footer Discount',
      description: 'Allows flat or percentage discount on entire invoice footer.',
    },
    {
      key: 'sales.enable_scheme_bonus',
      moduleId: 'sales',
      value: 'true',
      label: 'Trade Scheme & Bonus Units',
      description: 'Enables free sample/scheme bonus units (0 PKR to retailer, Dr. Scheme Expense / Cr. Inventory at cost).',
    },
    {
      key: 'sales.enable_salesman_tracking',
      moduleId: 'sales',
      value: 'true',
      label: 'Salesman Assignment Tracking',
      description: 'Enables salesman selector in sticky top session and tracks sales commission attribution.',
    },
    {
      key: 'sales.enable_supply_person_tracking',
      moduleId: 'sales',
      value: 'true',
      label: 'Supply / Delivery Staff Tracking',
      description: 'Enables delivery officer selector in sticky top session and delivery dispatch attribution.',
    },
    {
      key: 'sales.enable_spot_cash_collection',
      moduleId: 'sales',
      value: 'true',
      label: 'Spot Cash Recovery on Invoice',
      description: 'Allows recording partial or full cash payment directly on direct sale invoice creation.',
    },
    {
      key: 'sales.enable_credit_limit_lock',
      moduleId: 'sales',
      value: 'true',
      label: 'Credit Limit Hard Enforcement',
      description: 'Strictly blocks invoice generation if live customer balance plus new order amount breaches credit limit.',
    },
    {
      key: 'sales.default_print_format',
      moduleId: 'sales',
      value: 'THERMAL',
      label: 'Default Print Layout',
      description: 'Default layout for receipt generation: THERMAL (80mm roll) or A4 (standard corporate sheet).',
    },
    {
      key: 'purchase.enable_freight_landed_cost',
      moduleId: 'purchase',
      value: 'true',
      label: 'Freight Landed Cost Capitalization',
      description: 'Allows toggling between capitalizing freight into inventory asset vs separate direct expense.',
    },
    {
      key: 'purchase.enable_3tier_uom',
      moduleId: 'purchase',
      value: 'true',
      label: '3-Tier UOM Entry (CTN / Box / Pcs)',
      description: 'Enables Carton, Inner Box, and Loose Pieces breakdown for wholesale goods receipt.',
    },
    {
      key: 'purchase.enable_batch_tracking',
      moduleId: 'purchase',
      value: 'true',
      label: 'Batch & Expiry Date Tracking',
      description: 'Requires batch numbers and expiry dates on batch-controlled perishable items.',
    },
    {
      key: 'inventory.enable_low_stock_warning',
      moduleId: 'inventory',
      value: 'true',
      label: 'Low Stock Alert Badges',
      description: 'Shows prominent warning badges when warehouse stock drops below minimum threshold.',
    },
    {
      key: 'accounting.strict_audit_void',
      moduleId: 'accounting',
      value: 'true',
      label: 'Strict Journal Void & Audit Trail',
      description: 'Requires reason prompt and posts offsetting reversal voucher when voiding general ledger entries.',
    },
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
    {
      key: 'settings.enable_custom_branding',
      moduleId: 'settings',
      value: 'true',
      label: 'Custom Business Branding & Prints',
      description: 'Enables dynamic business logo, contact information, custom footer, and terms on print templates.',
    },
  ];

  const insertFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const f of defaultFlags) {
    insertFlag.run(f.key, f.moduleId, f.value, f.label, f.description);
  }

  // 6. Seed Default Admin Security PIN in app_settings (Default: 1234)
  const pinRow = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_security_pin'").get();
  if (!pinRow) {
    const defaultPinHash = crypto.createHash('sha256').update('saleflow_admin_pin_1234').digest('hex');
    db.prepare(`
      INSERT INTO app_settings (key, value, description, updated_at)
      VALUES ('admin_security_pin', ?, 'Hashed 4-digit security PIN for void authorization', datetime('now'))
    `).run(defaultPinHash);
  }

  // 7. Seed Default App Users if empty (Only ONE working ADMIN user in DEV mode)
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM app_users').get() as { count: number };
  if (!userCountRow || userCountRow.count === 0) {
    const isInstalledMode = process.env.SALEFLOW_INSTALLED_MODE === '1';
    if (!isInstalledMode) {
      const hashPassword = (pwd: string) => crypto.createHash('sha256').update('saleflow_user_salt_' + pwd).digest('hex');

      db.prepare(`
        INSERT INTO app_users (id, username, password_hash, full_name, role, staff_id, is_active, created_at, updated_at)
        VALUES (?, 'admin', ?, 'System Administrator', 'ADMIN', NULL, 1, datetime('now'), datetime('now'))
      `).run(generateUUID(), hashPassword('admin'));
    }
  }

  // 8. Seed Default Company Profile & Print Preferences if empty
  const profileCountRow = db.prepare('SELECT COUNT(*) as count FROM company_profile').get() as { count: number };
  if (!profileCountRow || profileCountRow.count === 0) {
    db.prepare(`
      INSERT INTO company_profile (
        id, business_name, tagline, phone_primary, phone_secondary, email, address, city, ntn_strn,
        currency_symbol, thermal_footer_note, invoice_terms, show_logo_on_prints, show_ntn_on_invoices,
        show_customer_previous_balance, updated_at
      ) VALUES (
        'default-company-profile',
        'Farhan Distribution',
        'Wholesale & FMCG Distribution',
        '',
        '',
        '',
        '',
        '',
        '',
        'PKR',
        'Computer Generated Bill. Software Powered by SaleFlow.',
        '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
        1, 1, 1, datetime('now')
      )
    `).run();
  }
}

/**
 * Optional Demo Data Seeding
 * Call this only if explicitly populating sample test records.
 */
export function seedDemoData(db: DatabaseSync): void {
  const catMap = new Map<string, string>();
  const existingCats = db.prepare('SELECT id, name FROM categories').all() as { id: string; name: string }[];
  for (const c of existingCats) catMap.set(c.name, c.id);

  const routeMap = new Map<string, string>();
  const existingRoutes = db.prepare('SELECT id, name FROM routes').all() as { id: string; name: string }[];
  for (const r of existingRoutes) routeMap.set(r.name, r.id);

  // 1. Seed / Upgrade Customers
  const custCountRow = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
  if (!custCountRow || custCountRow.count === 0) {
    const route1Id = routeMap.get('Route 1 - North Sector A') || null;
    const route2Id = routeMap.get('Route 2 - Central Commercial Hub') || null;

    const sampleCustomers = [
      {
        name: 'Al-Madina Superstore',
        shop_name: 'Al-Madina Mart & Wholesale',
        contact: 'Tariq Mehmood',
        phone: '0300-1234567',
        address: 'Commercial Market, Block B',
        city: 'Lahore',
        cnic_or_ntn: '35201-1234567-1',
        route_id: route1Id,
        route_name: 'Route 1 - North Sector A',
        credit_limit: 150000,
        credit_days: 14,
      },
      {
        name: 'Bismillah General Store',
        shop_name: 'Bismillah Store #1',
        contact: 'Haji Aslam',
        phone: '0321-9876543',
        address: 'Main Bazar, Shop 14',
        city: 'Lahore',
        cnic_or_ntn: '35202-7654321-3',
        route_id: route1Id,
        route_name: 'Route 1 - North Sector A',
        credit_limit: 80000,
        credit_days: 7,
      },
      {
        name: 'Khan Cash & Carry',
        shop_name: 'Khan Hypermarket',
        contact: 'Farhan Khan',
        phone: '0333-5551234',
        address: 'Gulberg III, Main Boulevard',
        city: 'Lahore',
        cnic_or_ntn: 'NTN-9876543-0',
        route_id: route2Id,
        route_name: 'Route 2 - Central Commercial Hub',
        credit_limit: 300000,
        credit_days: 21,
      },
    ];

    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        id, name, shop_name, contact_person, phone, address, city, cnic_or_ntn,
        route_id, route_name, credit_limit_paisas, credit_limit, credit_days, balance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00)
    `);

    for (const c of sampleCustomers) {
      insertCustomer.run(
        generateUUID(),
        c.name,
        c.shop_name,
        c.contact,
        c.phone,
        c.address,
        c.city,
        c.cnic_or_ntn,
        c.route_id,
        c.route_name,
        toPaisas(c.credit_limit),
        c.credit_limit,
        c.credit_days
      );
    }
  }

  // 2. Seed / Upgrade Products with Multi-UOM Carton Conversion & Pricing Tiers
  const prodCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  if (!prodCountRow || prodCountRow.count === 0) {
    const bevId = catMap.get('Beverages') || null;
    const oilId = catMap.get('Cooking Essentials') || null;
    const teaId = catMap.get('Packaged Foods') || null;
    const snkId = catMap.get('Snacks & Confectionery') || null;

    const sampleProducts = [
      {
        sku: 'BEV-001',
        barcode: '896400010011',
        name: 'Premium Mineral Water 1.5L',
        category_id: bevId,
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
        category_id: oilId,
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
        category_id: teaId,
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
        category_id: snkId,
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
        category_id: bevId,
        category: 'Beverages',
        uom_base: 'CAN',
        uom_bulk: 'TRAY',
        conversion: 24,
        cost_pkr: 4320,
        tp_pkr: 5280,
        mrp_pkr: 6000,
        stock_base: 240,
        min_alert: 48,
      },
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (
        id, sku, barcode, name, category_id, category,
        uom_base, uom_bulk, bulk_conversion_factor,
        cost_price_paisas, trade_price_paisas, mrp_paisas,
        cost_price, selling_price, current_stock_base, current_stock, min_stock_alert
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of sampleProducts) {
      insertProduct.run(
        generateUUID(),
        p.sku,
        p.barcode,
        p.name,
        p.category_id,
        p.category,
        p.uom_base,
        p.uom_bulk,
        p.conversion,
        toPaisas(p.cost_pkr),
        toPaisas(p.tp_pkr),
        toPaisas(p.mrp_pkr),
        p.cost_pkr,
        p.tp_pkr,
        p.stock_base,
        p.stock_base,
        p.min_alert
      );
    }
  }

  // 3. Seed Staff Members
  const staffCountRow = db.prepare('SELECT COUNT(*) as count FROM staff_members').get() as { count: number };
  if (!staffCountRow || staffCountRow.count === 0) {
    const initialStaff = [
      { code: 'EMP-001', name: 'Tariq Mehmood', role: 'SALESMAN', phone: '0300-1112233' },
      { code: 'EMP-002', name: 'Imran Rafiq', role: 'SALESMAN', phone: '0321-4445566' },
      { code: 'EMP-003', name: 'Bilal Ahmed', role: 'SUPPLY_PERSON', phone: '0333-7778899' },
      { code: 'EMP-004', name: 'Kamran Ali', role: 'SUPPLY_PERSON', phone: '0345-0001122' },
      { code: 'EMP-005', name: 'Zubair Shah', role: 'BOTH', phone: '0312-9988776' },
    ];

    const insertStaff = db.prepare(`
      INSERT INTO staff_members (id, employee_code, name, role, phone, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    for (const s of initialStaff) {
      insertStaff.run(generateUUID(), s.code, s.name, s.role, s.phone);
    }
  }

  // 4. Seed Vendors
  const vendorCountRow = db.prepare('SELECT COUNT(*) as count FROM vendors').get() as { count: number };
  if (!vendorCountRow || vendorCountRow.count === 0) {
    const initialVendors = [
      {
        name: 'Nestlé Pakistan Limited',
        company_name: 'Nestlé Pakistan Ltd',
        contact_person: 'Asim Munir',
        phone: '0300-8889900',
        email: 'supply@nestle.com.pk',
        address: 'Plot 34, Industrial Estate',
        city: 'Lahore',
        cnic_or_ntn: '0801234-5',
        terms: 30,
      },
      {
        name: 'Shan Foods Private Limited',
        company_name: 'Shan Foods Pvt Ltd',
        contact_person: 'Zeeshan Ahmed',
        phone: '0321-7776655',
        email: 'orders@shanfoods.com',
        address: 'Sector 23, Korangi Industrial Area',
        city: 'Karachi',
        cnic_or_ntn: '1405678-9',
        terms: 21,
      },
      {
        name: 'National Foods Manufacturer',
        company_name: 'National Foods Ltd',
        contact_person: 'Usman Tariq',
        phone: '0333-5554433',
        email: 'sales@nfoods.com',
        address: '12-KM Bahawalpur Road',
        city: 'Multan',
        cnic_or_ntn: '2209876-1',
        terms: 15,
      },
    ];

    const insertVendor = db.prepare(`
      INSERT INTO vendors (id, name, company_name, contact_person, phone, email, address, city, cnic_or_ntn, payment_terms_days, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const v of initialVendors) {
      insertVendor.run(generateUUID(), v.name, v.company_name, v.contact_person, v.phone, v.email, v.address, v.city, v.cnic_or_ntn, v.terms);
    }
  }
}
