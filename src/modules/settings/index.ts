import { AppModule } from '../../core/registry/module.interface';

export * from './company-service';

export const settingsModule: AppModule = {
  id: 'settings',
  name: 'System Settings & Company Branding',
  description: 'Manage company profile, business branding, print preferences, and dynamic feature toggles.',
  version: '1.0.0',
  icon: 'Sliders',
  dependencies: [],
  navItems: [
    { title: 'Company Profile & Prints', href: '/settings/company', icon: 'Building2' },
    { title: 'Feature Flags', href: '/settings/features', icon: 'ToggleLeft' },
    { title: 'Database Backup', href: '/settings/backup', icon: 'Database' },
  ],
};
