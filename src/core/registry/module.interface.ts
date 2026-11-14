export interface ModuleNavItem {
  title: string;
  href: string;
  icon: string;
  badge?: string;
}

export interface AppModule {
  id: string; // Unique slug: 'sales', 'customers', 'inventory', 'expenses', 'purchase'
  name: string;
  description: string;
  version: string;
  icon: string; // Icon identifier
  dependencies: string[]; // List of required module IDs
  navItems: ModuleNavItem[];
  isCore?: boolean; // Core modules (like Accounting) cannot be disabled
}

export interface SystemModuleRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  is_enabled: number; // 0 or 1 for SQLite
  dependencies: string; // JSON string
  settings: string; // JSON string
  installed_at: string;
  updated_at: string;
}
