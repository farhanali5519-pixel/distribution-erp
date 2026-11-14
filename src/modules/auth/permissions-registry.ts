import { UserRole } from './types';

export interface SubModuleCapability {
  slug: string;
  name: string;
  icon: string;
  description: string;
  routePrefixes: string[];
  supportsAccess: true;
  supportsEdit: boolean;
  supportsVoid: boolean;
  supportsDelete: boolean;
}

export interface ModuleGroup {
  id: string;
  name: string;
  icon: string;
  description: string;
  subModules: SubModuleCapability[];
}

export interface SubModulePermission {
  access: boolean;
  edit: boolean;
  void: boolean;
  delete: boolean;
}

export type UserPermissionsMap = Record<string, SubModulePermission>;

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'sales-distribution',
    name: 'Sales & Distribution',
    icon: 'TrendingUp',
    description: 'Order booking, direct van distribution, commercial billing & customer route khata',
    subModules: [
      {
        slug: 'field-order-booking',
        name: 'Field Order Booking',
        icon: 'Smartphone',
        description: 'Mobile & tablet order booking for market field bookers with auto staff sync',
        routePrefixes: ['/sales/field-order-booking'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'order-booking',
        name: 'Order Booking',
        icon: 'ClipboardList',
        description: 'Book new sales orders with 3-tier UOM conversions and direct thermal print',
        routePrefixes: ['/sales/order-booking'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'direct-sale',
        name: 'Direct Van Sale',
        icon: 'Truck',
        description: 'Instant spot cash sales with vehicle inventory deduction',
        routePrefixes: ['/sales/direct-sale'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: false,
      },
      {
        slug: 'sales-history',
        name: 'Commercial Bills & History',
        icon: 'Receipt',
        description: 'Sales order register, commercial bill audit, delivery statuses & cancellation logs',
        routePrefixes: ['/sales'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'route-collections',
        name: 'Route Collections',
        icon: 'CreditCard',
        description: 'Receive customer cash payments, cheque collections & deposit vouchers',
        routePrefixes: ['/sales/collections'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'customer-returns',
        name: 'Customer Sales Returns',
        icon: 'RotateCcw',
        description: 'Book sales return credit notes with historical invoice audit verification',
        routePrefixes: ['/returns/sales', '/returns'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'customers',
        name: 'Customers & Routes',
        icon: 'Users',
        description: 'Manage retail shop profiles, delivery routes & credit limit checks',
        routePrefixes: ['/customers', '/settings/routes', '/routes'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
    ],
  },
  {
    id: 'purchases-inward',
    name: 'Purchases & Inward',
    icon: 'ShoppingCart',
    description: 'Inward goods intake, supplier bills, vendor returns & AP accounting',
    subModules: [
      {
        slug: 'new-purchase-bill',
        name: 'New Purchase Bill',
        icon: 'PlusCircle',
        description: 'Inward purchase bills intake with landed freight cost allocations',
        routePrefixes: ['/purchase/new-bill'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'purchase-orders-detail',
        name: 'Purchase Bills Detail',
        icon: 'FileText',
        description: 'Audit vendor purchase bills, void records & inspect journal postings',
        routePrefixes: ['/purchase/orders-detail', '/purchase'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'vendor-returns',
        name: 'Vendor Purchase Returns',
        icon: 'Undo2',
        description: 'Return damaged or defective stock to suppliers with debit notes',
        routePrefixes: ['/returns/purchase'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'vendors-master',
        name: 'Vendors Master',
        icon: 'ShoppingCart',
        description: 'Manage supplier accounts, contact details & opening credit balances',
        routePrefixes: ['/purchase/vendors'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
    ],
  },
  {
    id: 'inventory-logistics',
    name: 'Inventory & Logistics',
    icon: 'Package',
    description: 'Product master, multi-tier packaging units, quarantine stock & vehicle load dispatch',
    subModules: [
      {
        slug: 'products-master',
        name: 'Products & Inventory Master',
        icon: 'Package',
        description: 'Manage catalog, wholesale cartons, intermediate packs & piece barcode master',
        routePrefixes: ['/inventory/products', '/inventory'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
      {
        slug: 'inventory-audit-ledger',
        name: 'Inventory Audit & Stock Ledger',
        icon: 'History',
        description: 'Single source of truth for chronological stock movements, running balances, and physical inventory reconciliation',
        routePrefixes: ['/inventory/audit-ledger'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'quarantine-stock',
        name: 'Damaged Quarantine Stock',
        icon: 'ShieldAlert',
        description: 'Segregated unsellable, damaged & expired stock buffer management',
        routePrefixes: ['/inventory/quarantine', '/returns/quarantine'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'stock-valuation',
        name: 'Stock Valuation & Summary',
        icon: 'BarChart3',
        description: 'Real-time inventory valuation by cost and stock movement reports',
        routePrefixes: ['/reports/stock-valuation'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'dispatch-load-sheet',
        name: 'Route Load Sheet & Dispatch',
        icon: 'Truck',
        description: 'Generate delivery van loading sheets, driver gate passes & carton tallies',
        routePrefixes: ['/dispatch/load-sheet', '/dispatch'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
    ],
  },
  {
    id: 'expenses-closing',
    name: 'Expenses & Closing',
    icon: 'Receipt',
    description: 'Petty cash expense vouchers, daily cash drawer denomination closing & day-end lock',
    subModules: [
      {
        slug: 'daily-expenses',
        name: 'Daily Operational Expenses',
        icon: 'Receipt',
        description: 'Record vehicle fuel, staff tea, labor, freight & maintenance expense vouchers',
        routePrefixes: ['/expenses', '/expenses/new'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'cash-closing',
        name: 'Cash Closing / Roznamcha',
        icon: 'CreditCard',
        description: 'Cash drawer denomination counter, shortage/excess calculations & day-end freeze',
        routePrefixes: ['/closing/daily-summary', '/closing'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
    ],
  },
  {
    id: 'core-accounting',
    name: 'Core Accounting',
    icon: 'BookOpen',
    description: '5-digit standard Chart of Accounts, manual general journals & trial balance ledger',
    subModules: [
      {
        slug: 'chart-of-accounts',
        name: 'Chart of Accounts',
        icon: 'BookOpen',
        description: 'View & maintain 5-digit standard double-entry account heads',
        routePrefixes: ['/accounting/coa'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'bank-accounts',
        name: 'Bank Accounts Master',
        icon: 'Landmark',
        description: 'Manage company bank accounts, IBANs, branch details, GL linkages & live balances',
        routePrefixes: ['/accounting/banks', '/settings/banks', '/payments/banks', '/reports/bank-statement'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
      {
        slug: 'journal-entries',
        name: 'General Ledger & Journals',
        icon: 'FileText',
        description: 'Inspect double-entry journal vouchers, ledger sub-accounts & transaction voiding',
        routePrefixes: ['/accounting/journal'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: true,
        supportsDelete: true,
      },
      {
        slug: 'trial-balance',
        name: 'Trial Balance',
        icon: 'CheckCircle2',
        description: 'Balanced debit-credit ledger verification across all active heads',
        routePrefixes: ['/accounting/trial-balance'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'party-ledgers',
        name: 'Party Ledgers & Khata',
        icon: 'FileText',
        description: 'Customer statement of account, vendor khata & running debit-credit balances',
        routePrefixes: ['/reports/ledgers'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
    ],
  },
  {
    id: 'reports-analytics',
    name: 'Reports & Analytics',
    icon: 'BarChart3',
    description: 'Financial profit & loss, salesman recovery KPIs & inventory movement analytics',
    subModules: [
      {
        slug: 'profit-and-loss',
        name: 'Profit & Loss Statement',
        icon: 'TrendingUp',
        description: 'Gross profit, operating expenses, net margin & gross margin percentages',
        routePrefixes: ['/reports/profit-loss', '/reports'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'salesman-recovery',
        name: 'Salesman Recovery Performance',
        icon: 'BarChart3',
        description: 'Track booking vs net delivery vs collection recovery percentages per salesman',
        routePrefixes: ['/reports/salesman-recovery'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'stock-summary',
        name: 'Stock Movement Summary',
        icon: 'Layers',
        description: 'Comprehensive opening balance, purchases, sales, returns & closing stock ledger',
        routePrefixes: ['/reports/stock-summary'],
        supportsAccess: true,
        supportsEdit: false,
        supportsVoid: false,
        supportsDelete: false,
      },
    ],
  },
  {
    id: 'administration-settings',
    name: 'Administration & Settings',
    icon: 'Sliders',
    description: 'User access control, feature toggle flags & system module configuration',
    subModules: [
      {
        slug: 'feature-flags',
        name: 'Feature Flags & Toggles',
        icon: 'ToggleLeft',
        description: 'Enable or disable operational features and business rules dynamically',
        routePrefixes: ['/settings/features'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'user-management',
        name: 'User Management',
        icon: 'Users',
        description: 'Manage ERP users, assign roles, reset passwords & set granular permissions',
        routePrefixes: ['/settings/users'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
      {
        slug: 'system-settings',
        name: 'System Module Registry',
        icon: 'Sliders',
        description: 'Inspect active system architecture modules and health diagnostics',
        routePrefixes: ['/modules'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'company-profile',
        name: 'Company Profile & Prints',
        icon: 'Building2',
        description: 'Configure business identity, logo, NTN/STRN, contact details & print formats',
        routePrefixes: ['/settings/company'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
      {
        slug: 'database-backup',
        name: 'Database Backup & Recovery',
        icon: 'Database',
        description: 'Offline SQLite database snapshots, automatic day-end archives & 1-click restore engine',
        routePrefixes: ['/settings/backup'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: true,
      },
      {
        slug: 'system-info',
        name: 'System & Commercial Licensing',
        icon: 'Server',
        description: 'Commercial deployment health, database diagnostics and cryptographic license management',
        routePrefixes: ['/settings/system-info'],
        supportsAccess: true,
        supportsEdit: true,
        supportsVoid: false,
        supportsDelete: false,
      },
    ],
  },
];

export const ALL_SUBMODULES: SubModuleCapability[] = MODULE_GROUPS.flatMap((g) => g.subModules);

/**
 * Returns default baseline permissions map for a given role
 */
export function getDefaultPermissionsForRole(role: UserRole): UserPermissionsMap {
  const map: UserPermissionsMap = {};

  for (const sm of ALL_SUBMODULES) {
    if (role === 'ADMIN') {
      map[sm.slug] = {
        access: true,
        edit: sm.supportsEdit,
        void: sm.supportsVoid,
        delete: sm.supportsDelete,
      };
    } else if (role === 'SALESMAN') {
      const isSalesMod = [
        'order-booking',
        'direct-sale',
        'sales-history',
        'route-collections',
        'customer-returns',
        'customers',
      ].includes(sm.slug);

      map[sm.slug] = {
        access: isSalesMod,
        edit: isSalesMod && sm.supportsEdit,
        void: sm.slug === 'order-booking', // requires pin
        delete: false,
      };
    } else if (role === 'CASHIER') {
      const isCashierMod = [
        'daily-expenses',
        'cash-closing',
        'route-collections',
        'party-ledgers',
        'chart-of-accounts',
        'bank-accounts',
        'trial-balance',
        'customers',
        'sales-history',
      ].includes(sm.slug);

      map[sm.slug] = {
        access: isCashierMod,
        edit: isCashierMod && sm.supportsEdit,
        void: sm.slug === 'daily-expenses' || sm.slug === 'journal-entries',
        delete: false,
      };
    } else if (role === 'WAREHOUSE') {
      const isWarehouseMod = [
        'new-purchase-bill',
        'purchase-orders-detail',
        'vendor-returns',
        'vendors-master',
        'products-master',
        'quarantine-stock',
        'stock-valuation',
        'inventory-audit-ledger',
        'dispatch-load-sheet',
        'customer-returns',
      ].includes(sm.slug);

      map[sm.slug] = {
        access: isWarehouseMod,
        edit: isWarehouseMod && sm.supportsEdit,
        void: sm.slug === 'purchase-orders-detail' || sm.slug === 'vendor-returns',
        delete: false,
      };
    } else if (role === 'ORDER_BOOKER') {
      const isBookerMod = ['field-order-booking', 'sales-history', 'customers'].includes(sm.slug);
      map[sm.slug] = {
        access: isBookerMod,
        edit: sm.slug === 'field-order-booking',
        void: false,
        delete: false,
      };
    } else {
      map[sm.slug] = {
        access: false,
        edit: false,
        void: false,
        delete: false,
      };
    }
  }

  return map;
}

/**
 * Merges raw stored permissions with full schema definitions, ensuring all keys exist
 */
export function normalizePermissions(stored: any, role: UserRole): UserPermissionsMap {
  const defaults = getDefaultPermissionsForRole(role);
  if (!stored || typeof stored !== 'object') return defaults;

  const result: UserPermissionsMap = { ...defaults };

  for (const sm of ALL_SUBMODULES) {
    if (stored[sm.slug]) {
      const val = stored[sm.slug];
      result[sm.slug] = {
        access: Boolean(val.access),
        edit: sm.supportsEdit ? Boolean(val.edit) : false,
        void: sm.supportsVoid ? Boolean(val.void) : false,
        delete: sm.supportsDelete ? Boolean(val.delete) : false,
      };
    }
  }

  return result;
}
