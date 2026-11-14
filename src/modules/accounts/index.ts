import { AppModule } from '../../core/registry/module.interface';

export const accountsModule: AppModule = {
  id: 'accounts',
  name: 'General Ledger',
  description: 'Double-entry Chart of Accounts, Journal Entries, and Trial Balance.',
  version: '1.0.0',
  icon: 'BookOpen',
  dependencies: [],
  navItems: [
    { title: 'Chart of Accounts', href: '/accounting/coa', icon: 'BookOpen' },
    { title: 'General Ledger & Journals', href: '/accounting/journal', icon: 'FileText' },
    { title: 'Trial Balance', href: '/accounting/trial-balance', icon: 'CheckCircle2' },
  ],
};
