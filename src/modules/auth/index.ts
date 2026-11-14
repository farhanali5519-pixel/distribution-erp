import { AppModule } from '../../core/registry/module.interface';

export * from './types';
export * from './service';

export const authModule: AppModule = {
  id: 'auth',
  name: 'Users, Roles & Security Access',
  description: 'Multi-user role-based access control (ADMIN, SALESMAN, CASHIER, WAREHOUSE), route guards, and admin PIN verification.',
  version: '1.0.0',
  icon: 'ShieldCheck',
  dependencies: [],
  navItems: [
    { title: 'User Management', href: '/settings/users', icon: 'Users' },
  ],
};
