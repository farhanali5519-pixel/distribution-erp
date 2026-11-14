import React from 'react';
import type { Metadata } from 'next';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { SuperAdminLoginClient } from './SuperAdminLoginClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'SaleFlow ERP';
  try {
    const config = await getBrandingConfig('SYSTEM');
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
  } catch {}

  return {
    title: 'Super Admin Login',
    description: `Super Administrator portal for ${appName}`,
    applicationName: appName,
    openGraph: {
      siteName: appName,
      title: `Super Admin Login | ${appName}`,
      description: `Super Administrator portal for ${appName}`,
    },
    twitter: {
      title: `Super Admin Login | ${appName}`,
      description: `Super Administrator portal for ${appName}`,
    },
  };
}

export default async function SuperAdminLoginPage() {
  let branding = null;
  try {
    branding = await getBrandingConfig('SYSTEM');
  } catch {}

  return <SuperAdminLoginClient branding={branding} />;
}
