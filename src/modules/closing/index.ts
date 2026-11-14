import { AppModule } from '../../core/registry/module.interface';

export * from './service';

export const closingModule: AppModule = {
  id: 'closing',
  name: 'Daily Cash Closing & Roznamcha',
  description: 'Daily cash drawer reconciliation, Pakistani currency denomination counter, and day-end audit locking.',
  version: '1.0.0',
  icon: 'CreditCard',
  dependencies: ['sales', 'expenses'],
  navItems: [
    { title: 'Daily Cash Closing', href: '/closing/daily-summary', icon: 'CreditCard' },
  ],
};
