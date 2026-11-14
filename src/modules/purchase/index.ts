import { AppModule } from '../../core/registry/module.interface';

export const purchaseModule: AppModule = {
  id: 'purchase',
  name: 'Purchase & Vendor Bills',
  description: 'Manufacturer POs, vendor bills, and supplier ledger payments.',
  version: '1.0.0',
  icon: 'ShoppingCart',
  dependencies: ['inventory'],
  navItems: [
    { title: 'New Purchase Bill', href: '/purchase/new-bill', icon: 'PlusCircle' },
    { title: 'Purchase Bills Detail', href: '/purchase/orders-detail', icon: 'FileText' },
  ],
};
