import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTenantContext } from '@/core/tenancy/context';
import { getBaseDomain } from '@/core/tenancy/subdomain';
import { TenantStatusBlock } from '@/shared/components/TenantStatusBlock';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { initializeSystemModules } from '@/modules/init';
import { TenantLoginClient } from './TenantLoginClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'SaleFlow ERP';
  try {
    const tenant = await getTenantContext();
    const config = await getBrandingConfig(tenant.companyId);
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
  } catch {}

  return {
    title: `Sign In | ${appName}`,
    description: `Sign in to your ${appName} workspace.`,
    applicationName: appName,
    openGraph: {
      siteName: appName,
      title: `Sign In | ${appName}`,
      description: `Sign in to your ${appName} workspace.`,
    },
    twitter: {
      title: `Sign In | ${appName}`,
      description: `Sign in to your ${appName} workspace.`,
    },
  };
}


export default async function TenantLoginPage() {
  const tenant = await getTenantContext();

  // 1. Apex domain redirects to Super Admin login
  if (tenant.status === 'APEX_PLATFORM') {
    redirect('/superadmin/login');
  }

  // 2. Organization lifecycle status blocks
  if (tenant.status === 'NOT_FOUND' || tenant.status === 'SUSPENDED' || tenant.status === 'EXPIRED') {
    return (
      <TenantStatusBlock
        status={tenant.status}
        companyName={tenant.companyName}
        companySlug={tenant.companySlug}
      />
    );
  }

  // 3. If already authenticated for this exact tenant, proceed directly to ERP dashboard
  if (tenant.isAuthenticated) {
    redirect('/');
  }

  // 4. Resolve hostname
  let hostname = `${tenant.companySlug || 'erp'}.${getBaseDomain().split(':')[0]}`;
  try {
    const headerStore = await headers();
    const hostHeader = headerStore.get('host') || headerStore.get('x-forwarded-host');
    if (hostHeader) {
      hostname = hostHeader.split(':')[0];
    }
  } catch {}

  // 5. Load tenant-specific branding and enabled modules
  initializeSystemModules();
  const branding = await getBrandingConfig(tenant.companyId);
  const companyModules = await ModuleRegistry.loadCompanyModules(tenant.companyId);

  // Single Source of Truth: Only modules enabled for this tenant
  const enabledModules = companyModules
    .filter((m) => m.isEnabled)
    .map((m) => ({
      id: m.id,
      name: m.name,
    }));

  return (
    <TenantLoginClient
      companyName={tenant.companyName || branding.displayName || 'SaleFlow Organization'}
      companySlug={tenant.companySlug || 'erp'}
      hostname={hostname}
      branding={{
        companyLogo: branding.companyLogo,
        uploadedLogo: branding.uploadedLogo,
        uploadedLogoVersion: branding.uploadedLogoVersion,
        uploadedSidebarLogo: branding.uploadedSidebarLogo,
        uploadedSidebarLogoVersion: branding.uploadedSidebarLogoVersion,
        sidebarLogoAsset: branding.sidebarLogoAsset,
        sidebarLogoVersion: branding.sidebarLogoVersion,
        preloaderEnabled: branding.preloaderEnabled,
        displayName: branding.displayName,
        primaryColor: branding.primaryColor,
        fontFamily: branding.fontFamily,
      }}
      enabledModules={enabledModules}
    />
  );
}
