import { AppModule } from '../../core/registry/module.interface';

export * from './service';
export * from './types';

export const bankingModule: AppModule = {
  id: 'banking',
  name: 'Banking & Accounts',
  description: 'Bank Accounts, Cheque Clearance, Statements, and Bank Reconciliations.',
  version: '1.0.0',
  icon: 'Landmark',
  dependencies: [],
  navItems: [
    { title: 'Bank Accounts Master', href: '/accounting/banks', icon: 'Landmark' },
    { title: 'Bank Statement', href: '/reports/bank-statement', icon: 'FileText' },
  ],
};
