import { AppModule } from '../../core/registry/module.interface';

export const customersModule: AppModule = {
  id: 'customers',
  name: 'Customer Management',
  description: 'Retail stores, credit limits, routes, and customer ledger balances.',
  version: '1.0.0',
  icon: 'Users',
  dependencies: [],
  navItems: [
    { title: 'Customers', href: '/customers', icon: 'Users' },
  ],
};
