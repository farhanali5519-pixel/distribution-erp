import React from 'react';
import type { Metadata } from 'next';
import { getSuperAdminSession } from '@/core/auth/superadmin-session';
import { SuperAdminSidebar } from './SuperAdminSidebar';
import { SuperAdminHeader } from './SuperAdminHeader';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { ThemeStyleInjector } from '@/core/branding/ThemeStyleInjector';
import { ApplicationPreloader } from '@/core/branding/ApplicationPreloader';
import { DynamicDocumentTitle } from '@/core/branding/DynamicDocumentTitle';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'SaleFlow ERP';
  try {
    const config = await getBrandingConfig('SYSTEM');
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
  } catch {}

  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: `${appName} Multi-Tenant Company Provisioning and Lifecycle Management`,
    applicationName: appName,
    openGraph: {
      siteName: appName,
      title: appName,
      description: `${appName} Multi-Tenant Company Provisioning and Lifecycle Management`,
    },
    twitter: {
      title: appName,
      description: `${appName} Multi-Tenant Company Provisioning and Lifecycle Management`,
    },
  };
}

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSuperAdminSession();

  let branding = null;
  try {
    branding = await getBrandingConfig('SYSTEM');
  } catch {}

  const appName = branding?.displayName || 'SaleFlow ERP';

  // If there's no session, let children (like login page) render in full view
  if (!session) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[#172033] font-sans antialiased selection:bg-[#16A46A]/20">
        <DynamicDocumentTitle initialAppName={appName} isSuperAdmin={true} />
        <ThemeStyleInjector config={branding} />
        <ApplicationPreloader config={branding} isSuperAdmin={true} />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[#172033] flex font-sans antialiased selection:bg-[#16A46A]/20">
      <DynamicDocumentTitle initialAppName={appName} isSuperAdmin={true} />
      <ThemeStyleInjector config={branding} />
      <ApplicationPreloader config={branding} isSuperAdmin={true} />
      {/* Deep Navy Sidebar */}
      <SuperAdminSidebar user={session} branding={branding} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto min-h-screen bg-[var(--bg-main)]">
        <SuperAdminHeader user={session} branding={branding} />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

