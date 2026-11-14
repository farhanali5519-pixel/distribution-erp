import { AppModule } from '../../core/registry/module.interface';

export * from './service';

export const paymentsModule: AppModule = {
  id: 'payments',
  name: 'Payments & Cash Mgmt',
  description: 'Cash, Cheque, Bank Collection Receipts, Customer and Vendor payment allocations.',
  version: '1.0.0',
  icon: 'CreditCard',
  dependencies: [],
  navItems: [
    { title: 'Payment Received', href: '/payments/received', icon: 'ArrowDownLeft' },
    { title: 'Payment Made', href: '/payments/made', icon: 'ArrowUpRight' },
  ],
};
