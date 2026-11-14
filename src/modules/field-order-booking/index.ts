import { AppModule } from '../../core/registry/module.interface';

export const fieldOrderBookingModule: AppModule = {
  id: 'field_order_booking',
  name: 'Field Order Booking',
  description: 'Mobile and tablet-friendly order booking portal for market order bookers with route locking and atomic server sync.',
  version: '1.0.0',
  icon: 'Smartphone',
  dependencies: ['sales', 'customers'],
  isCore: false,
  navItems: [
    { title: 'Field Order Booking', href: '/sales/field-order-booking', icon: 'Smartphone' },
  ],
};
