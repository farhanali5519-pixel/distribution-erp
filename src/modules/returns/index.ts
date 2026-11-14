import { AppModule } from '../../core/registry/module.interface';

export * from './types';
export * from './service';

export const returnsModule: AppModule = {
  id: 'returns',
  name: 'Returns Engine',
  description: 'Customer sales returns, credit notes, vendor debit notes, and damage quarantine management.',
  version: '1.0.0',
  icon: 'RotateCcw',
  dependencies: ['sales', 'purchase', 'inventory', 'customers'],
  navItems: [
    { title: 'Customer Sales Returns', href: '/sales/returns', icon: 'RotateCcw' },
    { title: 'Vendor Purchase Returns', href: '/purchase/returns', icon: 'Undo2' },
  ],
};
