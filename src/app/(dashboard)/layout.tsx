import type { Metadata } from 'next';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { initializeSystemModules } from '@/modules/init';
import { FeatureFlagsProvider } from '@/shared/context/feature-flags-context';
import { AuthProvider } from '@/shared/context/auth-context';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { CreateLauncherModal } from '@/shared/components/CreateLauncherModal';
import { DashboardSidebar, MobileNavToggle } from '@/shared/components/DashboardSidebar';
import { RouteAccessGuard } from '@/shared/components/RouteAccessGuard';
import { getTenantContext } from '@/core/tenancy/context';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { ThemeStyleInjector } from '@/core/branding/ThemeStyleInjector';
import { ApplicationPreloader } from '@/core/branding/ApplicationPreloader';
import { DynamicDocumentTitle } from '@/core/branding/DynamicDocumentTitle';
import { TenantLogoutButton } from '@/shared/components/TenantLogoutButton';
import { TransactionViewerProvider } from '@/shared/context/transaction-viewer-context';

function isBuildPhase(): boolean {
  return process.env.SALEFLOW_BUILD_PHASE === 'true' || process.env.NEXT_PHASE === 'phase-production-build';
}

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'SaleFlow ERP';
  try {
    const tenant = await getTenantContext();
    const config = await getBrandingConfig(tenant.companyId);
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
  } catch {}

  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: `${appName} distribution and business management workspace.`,
    applicationName: appName,
    openGraph: {
      siteName: appName,
      title: appName,
      description: `${appName} distribution and business management workspace.`,
    },
    twitter: {
      title: appName,
      description: `${appName} distribution and business management workspace.`,
    },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  initializeSystemModules();


  // Check if first-run setup is required (runtime only)
  if (!isBuildPhase()) {
    try {
      const { getDatabaseClient } = await import('@/core/database/factory');
      const client = getDatabaseClient();
      const adminRow = await client.queryOne<{ c: number }>("SELECT count(*) as c FROM app_users WHERE is_active = 1 AND role = 'ADMIN'");
      if (!adminRow || Number(adminRow.c) === 0) {
        const { redirect } = await import('next/navigation');
        redirect('/setup');
      }
    } catch (err: any) {
      if (err?.digest?.startsWith('NEXT_REDIRECT') || err?.message?.includes('NEXT_REDIRECT')) {
        throw err;
      }
    }
  }

  const tenant = await getTenantContext();

  if (tenant.status === 'APEX_PLATFORM') {
    const { redirect } = await import('next/navigation');
    redirect('/superadmin');
  }

  if (tenant.status === 'NOT_FOUND' || tenant.status === 'SUSPENDED' || tenant.status === 'EXPIRED') {
    const { TenantStatusBlock } = await import('@/shared/components/TenantStatusBlock');
    return (
      <TenantStatusBlock
        status={tenant.status}
        companyName={tenant.companyName}
        companySlug={tenant.companySlug}
      />
    );
  }

  if (!tenant.isAuthenticated) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  await ModuleRegistry.loadCompanyModules(tenant.companyId);
  const allModules = ModuleRegistry.getAllModules(tenant.companyId);
  const activeModules = allModules.filter((m) => m.isEnabled);
  const activeModuleIds = activeModules.map((m) => m.id);

  let branding = null;
  try {
    branding = await getBrandingConfig(tenant.companyId);
  } catch {}

  return (
    <FeatureFlagsProvider>
      <AuthProvider initialEnabledModules={activeModuleIds}>
        <TransactionViewerProvider>
          <div className="app-container">
            <DynamicDocumentTitle initialAppName={branding?.displayName?.trim() || 'SaleFlow ERP'} />
            <ThemeStyleInjector config={branding} />
            <ApplicationPreloader config={branding} />
            {/* Role-Filtered Dynamic Sidebar */}
            <DashboardSidebar allModules={allModules} activeModules={activeModules} branding={branding} />

            {/* Main Content Area */}
            <main className="main-content">
              {/* Topbar */}
              <header className="topbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <MobileNavToggle />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                      {branding?.displayName?.trim() || 'SaleFlow ERP'}
                    </span>
                    <span style={{ color: 'var(--border-strong)', fontSize: '0.85rem' }}>/</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                      Distribution Portal
                    </span>
                  </div>
                  <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                    Live Data
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CreateLauncherModal />
                  <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 0.15rem' }} />
                  <ThemeToggle />
                  <TenantLogoutButton />
                </div>
              </header>

              {/* Inner Page Wrapped in Route Guard */}
              <div className="page-wrapper">
                <RouteAccessGuard>
                  {children}
                </RouteAccessGuard>
              </div>
            </main>

            <style>{`
              .sidebar-link {
                display: flex;
                align-items: center;
                gap: 0.65rem;
                padding: 0.48rem 0.75rem;
                color: var(--text-secondary);
                text-decoration: none;
                font-size: 0.825rem;
                font-weight: 500;
                border-radius: var(--radius-sm);
                transition: all 0.15s ease;
                position: relative;
              }
              .sidebar-link:hover {
                color: var(--text-primary);
                background: var(--bg-card-hover);
              }
              .sidebar-link.active {
                color: var(--text-heading);
                background: var(--bg-card-hover);
                font-weight: 600;
              }
              .sidebar-link.active svg {
                color: var(--accent-emerald);
              }
            `}</style>
          </div>
        </TransactionViewerProvider>
      </AuthProvider>
    </FeatureFlagsProvider>
  );
}
