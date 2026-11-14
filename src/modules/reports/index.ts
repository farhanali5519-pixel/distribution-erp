import { AppModule } from '../../core/registry/module.interface';

export * from './types';
export * from './service';
export * from './sales-analysis.service';
export * from './stock-analysis.service';

export const reportsModule: AppModule = {
  id: 'reports',
  name: 'Reports & Analytics',
  description: 'Party khata statements, Profit & Loss statement, warehouse stock valuation, and salesman recovery metrics.',
  version: '1.0.0',
  icon: 'BarChart3',
  dependencies: ['sales', 'purchase', 'inventory', 'expenses'],
  navItems: [
    { title: 'Sales Analysis Report', href: '/reports/sales-analysis', icon: 'BarChart3' },
    { title: 'Stock & Booking Analysis', href: '/reports/stock-analysis', icon: 'Package' },
    { title: 'Party Ledgers (Khata)', href: '/reports/ledgers', icon: 'BookOpen' },
    { title: 'Profit & Loss Statement', href: '/reports/profit-and-loss', icon: 'TrendingUp' },
    { title: 'Stock Valuation', href: '/reports/stock-valuation', icon: 'Package' },
    { title: 'Salesman Recovery', href: '/reports/salesman-performance', icon: 'Users' },
  ],
};
