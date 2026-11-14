/**
 * Centralized Route Title Mapping & Helpers
 *
 * Ensures every application page across Super Admin, Tenant ERP, and Auth
 * inherits the resolved ERP Display Name in the standard format:
 * "<Page Name> | <Resolved ERP Display Name>"
 */

export const SUPERADMIN_ROUTE_TITLES: Record<string, string> = {
  '/superadmin': 'Dashboard',
  '/superadmin/dashboard': 'Dashboard',
  '/superadmin/users': 'User Management',
  '/superadmin/companies': 'Customer Management',
  '/superadmin/modules': 'Module Management',
  '/superadmin/branding': 'System Branding',
  '/superadmin/security': 'System Security',
  '/superadmin/audit': 'Activity & Logs',
  '/superadmin/licensing': 'Licensing',
  '/superadmin/settings': 'System Settings',
  '/superadmin/login': 'Super Admin Login',
};

export const TENANT_ROUTE_TITLES: Record<string, string> = {
  // Core / Auth
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/login': 'Sign In',
  '/setup': 'First Run Setup',

  // Sales
  '/sales': 'Orders Detail',
  '/sales/order-booking': 'Sale',
  '/sales/field-order-booking': 'Field Sale',
  '/sales/direct-sale': 'Van Sale',
  '/sales/returns': 'Sale Return',
  '/sales/collections': 'Route Collections',
  '/dispatch': 'Dispatch',
  '/dispatch/load-sheet': 'Load Sheet',

  // Purchase
  '/purchase': 'Purchase Detail',
  '/purchase/new-bill': 'Purchase',
  '/purchase/orders-detail': 'Purchase Detail',
  '/purchase/returns': 'Purchase Return',
  '/purchase/vendors': 'Vendors',

  // Inventory
  '/inventory': 'Inventory',
  '/inventory/products': 'Products & Pricing',
  '/inventory/audit-ledger': 'Inventory Audit & Stock Ledger',

  // Accounts
  '/accounting': 'Accounts',
  '/accounting/coa': 'Chart of Accounts',
  '/accounting/journal': 'General Ledger & Journals',
  '/accounting/trial-balance': 'Trial Balance',
  '/accounting/banks': 'Bank Accounts',
  '/payments/banks': 'Bank Accounts',

  // Payments & Cash
  '/payments': 'Payments',
  '/payments/received': 'Payments Received',
  '/payments/made': 'Payments Made',
  '/expenses': 'Expenses',
  '/closing': 'Daily Closing',
  '/closing/daily-summary': 'Daily Closing',

  // Customers & Outlets
  '/customers': 'Customers',
  '/routes': 'Routes',

  // Reports
  '/reports': 'Reports',
  '/reports/sales-analysis': 'Sales Analysis',
  '/reports/stock-analysis': 'Stock Analysis',
  '/reports/bank-statement': 'Bank Statement',
  '/reports/ledgers': 'Party Ledgers',
  '/reports/profit-and-loss': 'Profit & Loss',
  '/reports/stock-valuation': 'Stock Valuation',
  '/reports/salesman-performance': 'Salesman Recovery',

  // Settings & Administration
  '/settings': 'System Settings',
  '/settings/users': 'User Management',
  '/settings/routes': 'Routes & Territories',
  '/settings/staff': 'Staff Management',
  '/settings/company': 'Company Profile',
  '/modules': 'Module Management',
  '/settings/features': 'Feature Flags',
  '/settings/backup': 'Database Backup',
  '/settings/system-info': 'System & Licensing',
  '/settings/banks': 'Bank Accounts',
};

/**
 * Resolves the user-facing page title for a given pathname.
 */
export function resolveRouteTitle(pathname: string, isSuperAdmin = false): string {
  if (!pathname) return '';

  const cleanPath = pathname.split('?')[0].replace(/\/$/, '') || '/';

  if (isSuperAdmin || cleanPath.startsWith('/superadmin')) {
    if (SUPERADMIN_ROUTE_TITLES[cleanPath]) {
      return SUPERADMIN_ROUTE_TITLES[cleanPath];
    }
    if (cleanPath.startsWith('/superadmin/companies/')) {
      return 'Customer Management';
    }
    for (const [route, title] of Object.entries(SUPERADMIN_ROUTE_TITLES)) {
      if (route !== '/superadmin' && cleanPath.startsWith(`${route}/`)) {
        return title;
      }
    }
    return 'Dashboard';
  }

  if (TENANT_ROUTE_TITLES[cleanPath]) {
    return TENANT_ROUTE_TITLES[cleanPath];
  }

  // Prefix matching for child views (e.g. /inventory/products/123)
  for (const [route, title] of Object.entries(TENANT_ROUTE_TITLES)) {
    if (route !== '/' && cleanPath.startsWith(`${route}/`)) {
      return title;
    }
  }

  return '';
}

/**
 * Formats a full browser document title:
 * - If pageTitle is provided: "<Page Name> | <Resolved ERP Display Name>"
 * - If no pageTitle: "<Resolved ERP Display Name>"
 */
export function formatFullPageTitle(pageTitle: string | null | undefined, appName: string): string {
  const resolvedName = appName?.trim() || 'SaleFlow ERP';
  const cleanTitle = pageTitle?.trim();

  if (!cleanTitle || cleanTitle === resolvedName) {
    return resolvedName;
  }

  // Avoid duplicate ERP name suffix if already present
  if (cleanTitle.endsWith(` | ${resolvedName}`)) {
    return cleanTitle;
  }

  // Strip any old hard-coded ' | SaleFlow' or ' | SaleFlow ERP' or prior suffix
  const baseTitle = cleanTitle.includes(' | ') ? cleanTitle.split(' | ')[0].trim() : cleanTitle;

  if (!baseTitle || baseTitle === resolvedName) {
    return resolvedName;
  }

  return `${baseTitle} | ${resolvedName}`;
}
