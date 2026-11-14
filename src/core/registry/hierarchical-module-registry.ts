/**
 * CANONICAL HIERARCHICAL MODULE & SUB-MODULE REGISTRY
 * 
 * Single source of truth for:
 * 1. Super Admin Main Module & Sub-Module Entitlement UI
 * 2. Tenant Sidebar Dynamic Navigation Filtering
 * 3. RouteAccessGuard direct URL runtime protection (403 Module Disabled)
 * 4. API Entitlement Guards
 * 5. Plan Presets (Starter, Standard, Commercial, Professional, Enterprise)
 * 
 * Strict Constraint: All definitions map directly to REAL existing SaleFlow routes and features.
 */

export interface SubModuleDefinition {
  /** Unique technical submodule identifier, format: 'parentId:childKey' e.g. 'sales:field_order_booking' */
  id: string;
  /** Short key within parent, e.g. 'field_order_booking' */
  key: string;
  /** User-facing display title */
  label: string;
  /** User-facing brief description */
  description: string;
  /** Real existing frontend routes covered by this submodule */
  routes: string[];
  /** Real backend API endpoint prefixes that belong exclusively to this submodule */
  apiScope?: string[];
  /** Legacy module identifier for backward compatibility */
  legacyModuleId?: string;
  /** Lucide icon name */
  icon?: string;
}

export interface MainModuleDefinition {
  /** Unique technical main module identifier, e.g. 'sales' */
  id: string;
  /** User-facing display title */
  label: string;
  /** User-facing brief description */
  description: string;
  /** Lucide icon name */
  icon: string;
  /** Granular submodules belonging to this main module */
  children: SubModuleDefinition[];
  /** Legacy module IDs associated with this group */
  legacyModuleIds?: string[];
}

export const HIERARCHICAL_MODULES: MainModuleDefinition[] = [
  // =========================================================================
  // 1. SALES & DISTRIBUTION
  // =========================================================================
  {
    id: 'sales',
    label: 'Sales & Distribution',
    description: 'Order booking, van distribution, delivery invoicing, customer khata, and field sync.',
    icon: 'TrendingUp',
    legacyModuleIds: ['sales', 'field_order_booking', 'returns'],
    children: [
      {
        id: 'sales:field_order_booking',
        key: 'field_order_booking',
        label: 'Field Order Booking',
        description: 'Mobile and tablet order booking portal for field sales bookers.',
        routes: ['/sales/field-order-booking'],
        apiScope: ['/api/sales/field-order-booking'],
        legacyModuleId: 'field_order_booking',
        icon: 'Smartphone',
      },
      {
        id: 'sales:order_booking',
        key: 'order_booking',
        label: 'Order Booking',
        description: 'Counter order booking, 3-tier UOM conversions, and direct invoice printing.',
        routes: ['/sales/order-booking'],
        apiScope: ['/api/sales/order-booking'],
        icon: 'ClipboardList',
      },
      {
        id: 'sales:orders',
        key: 'orders',
        label: 'Orders & Commercial Bills',
        description: 'Sales orders register, commercial billing history, and delivery status.',
        routes: ['/sales'],
        apiScope: ['/api/sales/orders', '/api/sales'],
        icon: 'FileText',
      },
      {
        id: 'sales:direct_sale',
        key: 'direct_sale',
        label: 'Direct Van Sale',
        description: 'Instant spot cash sales with real-time stock deduction from delivery vehicles.',
        routes: ['/sales/direct-sale'],
        apiScope: ['/api/sales/direct'],
        icon: 'TrendingUp',
      },
      {
        id: 'sales:customer_returns',
        key: 'customer_returns',
        label: 'Customer Sales Returns',
        description: 'Customer return credit notes with historical invoice verification.',
        routes: ['/sales/returns', '/returns/sales', '/returns'],
        apiScope: ['/api/returns/sales'],
        legacyModuleId: 'returns',
        icon: 'RotateCcw',
      },
      {
        id: 'sales:load_sheet',
        key: 'load_sheet',
        label: 'Route Load Sheet',
        description: 'Generate delivery van loading sheets, driver gate passes, and carton tallies.',
        routes: ['/dispatch/load-sheet', '/dispatch'],
        apiScope: ['/api/dispatch'],
        icon: 'Truck',
      },
    ],
  },

  // =========================================================================
  // 2. PURCHASE & VENDOR BILLS
  // =========================================================================
  {
    id: 'purchase',
    label: 'Purchase & Vendor Bills',
    description: 'Inward goods intake, supplier bills, vendor returns, and AP tracking.',
    icon: 'ShoppingCart',
    legacyModuleIds: ['purchase', 'returns'],
    children: [
      {
        id: 'purchase:new_bill',
        key: 'new_bill',
        label: 'New Purchase Bill',
        description: 'Inward purchase bills intake with landed freight cost allocations.',
        routes: ['/purchase/new-bill'],
        apiScope: ['/api/purchase/bills'],
        icon: 'PlusCircle',
      },
      {
        id: 'purchase:orders_detail',
        key: 'orders_detail',
        label: 'Purchase Bills Detail',
        description: 'Audit vendor purchase bills, void records, and inspect landed cost postings.',
        routes: ['/purchase/orders-detail', '/purchase'],
        apiScope: ['/api/purchase/bills'],
        icon: 'FileText',
      },
      {
        id: 'purchase:vendor_returns',
        key: 'vendor_returns',
        label: 'Vendor Purchase Returns',
        description: 'Return damaged or defective stock to suppliers with debit notes.',
        routes: ['/purchase/returns', '/returns/purchase'],
        apiScope: ['/api/returns/purchase'],
        legacyModuleId: 'returns',
        icon: 'Undo2',
      },
    ],
  },

  // =========================================================================
  // 3. STOCK & INVENTORY MASTER
  // =========================================================================
  {
    id: 'inventory',
    label: 'Stock & Inventory Master',
    description: 'Warehouse balances, multi-tier UOM units, stock adjustments, and product pricing (valuation reports under Reports & BI).',
    icon: 'Package',
    legacyModuleIds: ['inventory', 'reports'],
    children: [
      {
        id: 'inventory:products',
        key: 'products',
        label: 'Products & Pricing Master',
        description: 'Product catalog, barcode lookup, category/brand classification, and prices.',
        routes: ['/inventory/products', '/inventory'],
        apiScope: ['/api/inventory'],
        icon: 'Package',
      },
      {
        id: 'inventory:audit_ledger',
        key: 'audit_ledger',
        label: 'Inventory Audit & Stock Ledger',
        description: 'Chronological stock movement audit, running balances, and physical counts.',
        routes: ['/inventory/audit-ledger'],
        apiScope: ['/api/inventory/audit'],
        icon: 'History',
      },
    ],
  },

  // =========================================================================
  // 4. GENERAL LEDGER / ACCOUNTS
  // =========================================================================
  {
    id: 'accounts',
    label: 'General Ledger / Accounts',
    description: '5-digit double-entry Chart of Accounts, manual journal entries, and trial balance (P&L under Reports & BI).',
    icon: 'PieChart',
    legacyModuleIds: ['accounts'],
    children: [
      {
        id: 'accounts:coa',
        key: 'coa',
        label: 'Chart of Accounts',
        description: 'Double-entry chart of accounts with 5-digit standard codes.',
        routes: ['/accounting/coa'],
        apiScope: ['/api/accounting/coa'],
        icon: 'BookOpen',
      },
      {
        id: 'accounts:journal',
        key: 'journal',
        label: 'General Ledger & Journals',
        description: 'Inspect double-entry journal vouchers and account ledger postings.',
        routes: ['/accounting/journal'],
        apiScope: ['/api/accounting/journal'],
        icon: 'FileText',
      },
      {
        id: 'accounts:trial_balance',
        key: 'trial_balance',
        label: 'Trial Balance',
        description: 'Balanced debit-credit ledger verification across all active heads.',
        routes: ['/accounting/trial-balance'],
        apiScope: ['/api/accounting/trial-balance'],
        icon: 'CheckCircle2',
      },
    ],
  },

  // =========================================================================
  // 5. PAYMENTS & CASH MANAGEMENT
  // =========================================================================
  {
    id: 'payments',
    label: 'Payments & Cash Management',
    description: 'Customer collection receipts, vendor payouts, daily expenses, and daily cash closing (recovery reports under Reports & BI).',
    icon: 'CreditCard',
    legacyModuleIds: ['payments', 'expenses', 'closing'],
    children: [
      {
        id: 'payments:received',
        key: 'received',
        label: 'Payment Received',
        description: 'Receive cash, cheques, and online bank payments from customers.',
        routes: ['/payments/received'],
        apiScope: ['/api/payments/received'],
        icon: 'ArrowDownLeft',
      },
      {
        id: 'payments:made',
        key: 'made',
        label: 'Payment Made',
        description: 'Record payments made to vendors, suppliers, and service providers.',
        routes: ['/payments/made'],
        apiScope: ['/api/payments/made'],
        icon: 'ArrowUpRight',
      },
      {
        id: 'payments:collections',
        key: 'collections',
        label: 'Route Collections',
        description: 'Delivery route recovery vouchers and customer cash settlement.',
        routes: ['/sales/collections'],
        apiScope: ['/api/sales/collections'],
        icon: 'Coins',
      },
      {
        id: 'payments:expenses',
        key: 'expenses',
        label: 'Daily Expenses',
        description: 'Operating expense vouchers (fuel, tea, freight, vehicle repair).',
        routes: ['/expenses'],
        apiScope: ['/api/expenses'],
        legacyModuleId: 'expenses',
        icon: 'Receipt',
      },
      {
        id: 'payments:closing',
        key: 'closing',
        label: 'Daily Cash Closing',
        description: 'Cash drawer denomination counting, shortage/excess, and day-end lock.',
        routes: ['/closing/daily-summary', '/closing'],
        apiScope: ['/api/closing'],
        legacyModuleId: 'closing',
        icon: 'Wallet',
      },
    ],
  },

  // =========================================================================
  // 6. REPORTS & BUSINESS INTELLIGENCE
  // =========================================================================
  {
    id: 'reports',
    label: 'Reports & Business Intelligence',
    description: 'Sales analysis, stock movement, party ledgers, and financial statements.',
    icon: 'BarChart3',
    legacyModuleIds: ['reports', 'banking'],
    children: [
      {
        id: 'reports:sales_analysis',
        key: 'sales_analysis',
        label: 'Sales Analysis Report',
        description: 'Revenue breakdowns by customer, route, salesman, product, and territory.',
        routes: ['/reports/sales-analysis'],
        apiScope: ['/api/reports/sales-analysis'],
        icon: 'BarChart3',
      },
      {
        id: 'reports:stock_analysis',
        key: 'stock_analysis',
        label: 'Stock & Booking Analysis',
        description: 'Product movement, slow-moving items, and stock reorder warnings.',
        routes: ['/reports/stock-analysis'],
        apiScope: ['/api/reports/stock-analysis'],
        icon: 'Package',
      },
      {
        id: 'reports:bank_statement',
        key: 'bank_statement',
        label: 'Bank Statement',
        description: 'Bank transaction logs, deposits, withdrawals, and reconciliation.',
        routes: ['/reports/bank-statement'],
        apiScope: ['/api/reports/bank-statement', '/api/banking/statement'],
        legacyModuleId: 'banking',
        icon: 'FileText',
      },
      {
        id: 'reports:ledgers',
        key: 'ledgers',
        label: 'Party Ledgers (Khata)',
        description: 'Customer and supplier running balance statements with running debit/credit.',
        routes: ['/reports/ledgers'],
        apiScope: ['/api/reports/ledgers'],
        icon: 'BookOpen',
      },
      {
        id: 'reports:profit_loss',
        key: 'profit_loss',
        label: 'Profit & Loss Statement',
        description: 'Executive profit & loss statement with revenue and cost breakdowns.',
        routes: ['/reports/profit-and-loss'],
        apiScope: ['/api/reports/profit-and-loss'],
        icon: 'TrendingUp',
      },
      {
        id: 'reports:stock_valuation',
        key: 'stock_valuation',
        label: 'Stock Valuation Report',
        description: 'Comprehensive closing stock valuation report by warehouse and category.',
        routes: ['/reports/stock-valuation'],
        apiScope: ['/api/reports/stock-valuation'],
        icon: 'Layers',
      },
      {
        id: 'reports:salesman_performance',
        key: 'salesman_performance',
        label: 'Salesman Recovery Performance',
        description: 'Salesman booking vs delivery vs recovery KPIs and commission audit.',
        routes: ['/reports/salesman-performance'],
        apiScope: ['/api/reports/salesman-performance'],
        icon: 'Users',
      },
    ],
  },

  // =========================================================================
  // 7. CUSTOMER & ROUTE MANAGEMENT (ACCOUNT SETUP)
  // =========================================================================
  {
    id: 'customers',
    label: 'Customer & Route Management',
    description: 'Customer directory, area delivery routes, staff master, and banking setups.',
    icon: 'Users',
    legacyModuleIds: ['customers', 'banking', 'settings'],
    children: [
      {
        id: 'customers:banks',
        key: 'banks',
        label: 'Bank Accounts Master',
        description: 'Company bank accounts, IBANs, branch details, and GL account linkages.',
        routes: ['/accounting/banks', '/settings/banks', '/payments/banks'],
        apiScope: ['/api/accounting/banks'],
        legacyModuleId: 'banking',
        icon: 'Landmark',
      },
      {
        id: 'customers:routes',
        key: 'routes',
        label: 'Route & Territory Master',
        description: 'Geographic sales routes, territories, delivery day schedules, and sectors.',
        routes: ['/settings/routes', '/routes'],
        apiScope: ['/api/routes'],
        icon: 'MapPin',
      },
      {
        id: 'customers:customers',
        key: 'customers',
        label: 'Customers & Retail Outlets',
        description: 'Retail customer database, GPS locations, credit limits, and credit terms.',
        routes: ['/customers'],
        apiScope: ['/api/customers'],
        icon: 'Users',
      },
      {
        id: 'customers:vendors',
        key: 'vendors',
        label: 'Vendor / Supplier Master',
        description: 'Supplier directory, manufacturer profiles, and opening credit balances.',
        routes: ['/purchase/vendors'],
        apiScope: ['/api/purchase/vendors'],
        icon: 'ShoppingCart',
      },
      {
        id: 'customers:staff',
        key: 'staff',
        label: 'Sales & Delivery Team',
        description: 'Order bookers, van drivers, delivery officers, and staff designations.',
        routes: ['/settings/staff'],
        apiScope: ['/api/staff'],
        icon: 'UserCheck',
      },
      {
        id: 'customers:company',
        key: 'company',
        label: 'Company Profile & Print Setup',
        description: 'Company branding, NTN/STRN, invoice print templates, and thermal receipts.',
        routes: ['/settings/company'],
        apiScope: ['/api/settings/company'],
        icon: 'Building2',
      },
    ],
  },

  // =========================================================================
  // 8. SYSTEM SETTINGS & ADMINISTRATION
  // =========================================================================
  {
    id: 'settings',
    label: 'System Settings & Administration',
    description: 'Platform users, security roles, system diagnostics, and database backups.',
    icon: 'Sliders',
    legacyModuleIds: ['settings', 'auth'],
    children: [
      {
        id: 'settings:users',
        key: 'users',
        label: 'User Management & Security',
        description: 'ERP user accounts, role-based access control, and password resets.',
        routes: ['/settings/users'],
        apiScope: ['/api/users', '/api/settings/users'],
        legacyModuleId: 'auth',
        icon: 'Users',
      },
      {
        id: 'settings:modules',
        key: 'modules',
        label: 'Module Registry',
        description: 'Inspect active ERP modules, dependencies, and system manifests.',
        routes: ['/modules'],
        apiScope: ['/api/modules'],
        icon: 'Sliders',
      },
      {
        id: 'settings:features',
        key: 'features',
        label: 'Feature Flags',
        description: 'Toggle operational feature flags and system workflow rules.',
        routes: ['/settings/features'],
        apiScope: ['/api/features'],
        icon: 'ToggleLeft',
      },
      {
        id: 'settings:backup',
        key: 'backup',
        label: 'Database Backup & Recovery',
        description: '1-click database backup snapshots and point-in-time recovery.',
        routes: ['/settings/backup'],
        apiScope: ['/api/backup'],
        icon: 'Database',
      },
      {
        id: 'settings:system_info',
        key: 'system_info',
        label: 'System & Commercial Licensing',
        description: 'System health diagnostics, environment parameters, and commercial licensing.',
        routes: ['/settings/system-info'],
        apiScope: ['/api/system-info'],
        icon: 'ShieldCheck',
      },
    ],
  },
];

/** Flattened lookup map of all submodules keyed by unique submodule id */
export const SUBMODULES_BY_ID = new Map<string, { mainModule: MainModuleDefinition; submodule: SubModuleDefinition }>();

/** Reverse lookup from route path to submodule */
export const SUBMODULES_BY_ROUTE: { prefix: string; mainModule: MainModuleDefinition; submodule: SubModuleDefinition }[] = [];

/** Reverse lookup by legacy module id */
export const SUBMODULES_BY_LEGACY_ID = new Map<string, { mainModule: MainModuleDefinition; submodule: SubModuleDefinition }>();

for (const mainMod of HIERARCHICAL_MODULES) {
  for (const sub of mainMod.children) {
    SUBMODULES_BY_ID.set(sub.id, { mainModule: mainMod, submodule: sub });
    if (sub.legacyModuleId) {
      SUBMODULES_BY_LEGACY_ID.set(sub.legacyModuleId, { mainModule: mainMod, submodule: sub });
    }
    for (const r of sub.routes) {
      SUBMODULES_BY_ROUTE.push({ prefix: r, mainModule: mainMod, submodule: sub });
    }
  }
}

// Sort route requirements by descending prefix length for most-specific route matching
SUBMODULES_BY_ROUTE.sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Finds the canonical submodule definition that governs a given URL route path.
 * Guarantee: Two-pass deterministic resolution.
 * Pass 1: Deterministic exact match lookup (prevents any ambiguity between parent route and nested route).
 * Pass 2: Longest-prefix match for parameterized or sub-page routes.
 */
export function findSubmoduleByRoute(pathname: string): { mainModule: MainModuleDefinition; submodule: SubModuleDefinition } | undefined {
  if (!pathname) return undefined;
  const cleanPath = pathname.split('?')[0].toLowerCase();

  // Pass 1: Exact match
  for (const entry of SUBMODULES_BY_ROUTE) {
    if (cleanPath === entry.prefix.toLowerCase()) {
      return entry;
    }
  }

  // Pass 2: Longest prefix match
  for (const entry of SUBMODULES_BY_ROUTE) {
    const lowerPrefix = entry.prefix.toLowerCase();
    if (cleanPath.startsWith(lowerPrefix + '/')) {
      return entry;
    }
  }

  return undefined;
}

/**
 * Finds submodule by exact submodule id (e.g. 'sales:field_order_booking') or legacy id ('field_order_booking')
 */
export function findSubmoduleById(id: string): { mainModule: MainModuleDefinition; submodule: SubModuleDefinition } | undefined {
  const direct = SUBMODULES_BY_ID.get(id);
  if (direct) return direct;
  return SUBMODULES_BY_LEGACY_ID.get(id);
}

/**
 * Finds main module definition by main module ID.
 */
export function findMainModuleById(id: string): MainModuleDefinition | undefined {
  return HIERARCHICAL_MODULES.find((m) => m.id === id);
}

/**
 * Returns all submodule technical IDs
 */
export function getAllSubmoduleIds(): string[] {
  return Array.from(SUBMODULES_BY_ID.keys());
}

/**
 * Returns all main module technical IDs
 */
export function getAllMainModuleIds(): string[] {
  return HIERARCHICAL_MODULES.map((m) => m.id);
}
