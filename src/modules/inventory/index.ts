import { AppModule } from '../../core/registry/module.interface';

export const inventoryModule: AppModule = {
  id: 'inventory',
  name: 'Stock & Inventory',
  description: 'SKU tracking, warehouse inventory, reorder alerts, and unit pricing.',
  version: '1.0.0',
  icon: 'Package',
  dependencies: [],
  navItems: [
    { title: 'Products & Pricing', href: '/inventory/products', icon: 'Package' },
  ],
};
