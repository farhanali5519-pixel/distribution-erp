'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Globe, Lock, Menu, LogOut, Loader2 } from 'lucide-react';
import type { SuperAdminSessionData } from '@/core/auth/superadmin-session';
import type { BrandingConfig } from '@/core/branding/theme';

const ROUTE_TITLES: Record<string, { title: string; subtitle: (appName: string) => string }> = {
  '/superadmin': {
    title: 'Vendor Overview Dashboard',
    subtitle: (appName) => `${appName} Cloud Tenant Portfolio & Metrics`,
  },
  '/superadmin/companies': {
    title: 'Customer Management',
    subtitle: () => 'Tenant Organization Provisioning & Controls',
  },
  '/superadmin/users': {
    title: 'User Management',
    subtitle: () => 'Administrative Accounts & Permissions',
  },
  '/superadmin/modules': {
    title: 'Module Management',
    subtitle: () => 'Subscription Tiers & System Feature Registry',
  },
  '/superadmin/branding': {
    title: 'System Branding',
    subtitle: () => 'Global Appearance, Colors & Controlled Fonts',
  },
  '/superadmin/licensing': {
    title: 'System Licensing',
    subtitle: () => 'Account Life-Cycle, Expirations & Renewals',
  },
  '/superadmin/audit': {
    title: 'Activity & Logs',
    subtitle: () => 'Security Events, Changes & Sensitive Operation Logs',
  },
  '/superadmin/security': {
    title: 'System Security',
    subtitle: () => 'TOTP Authenticator, Email OTP & Recovery Codes',
  },
  '/superadmin/settings': {
    title: 'System Settings',
    subtitle: () => 'Vendor Base Domain, Network & Platform Configuration',
  },
};

export function SuperAdminHeader({
  user,
  branding,
}: {
  user: SuperAdminSessionData;
  branding?: BrandingConfig | null;
}) {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const appName = branding?.displayName?.trim() || 'SaleFlow ERP';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/superadmin/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Super Admin logout error:', err);
    } finally {
      window.location.href = '/superadmin/login';
    }
  };

  // Find matching title or default
  let currentTitle = 'Platform Control Panel';
  let currentSubtitle = `${appName} Multi-Tenant Cloud Architecture`;

  const matched = ROUTE_TITLES[pathname];
  if (matched) {
    currentTitle = matched.title;
    currentSubtitle = matched.subtitle(appName);
  } else if (pathname.startsWith('/superadmin/companies/')) {
    currentTitle = 'Company Details & Configuration';
    currentSubtitle = 'Tenant Workspace Orchestration';
  }

  return (
    <header className="h-16 px-4 md:px-6 bg-white border-b border-[#E4E7EC] flex items-center justify-between sticky top-0 z-40 shadow-xs">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-superadmin-sidebar'))}
          className="p-1.5 -ml-1 rounded-lg text-[#0F2747] hover:bg-slate-100 md:hidden cursor-pointer"
          aria-label="Toggle navigation menu"
          title="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-[#0F2747] flex items-center gap-2">
            <span>{currentTitle}</span>
          </h1>
          <p className="text-[11px] text-[#667085]">
            {currentSubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Domain Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F7FA] border border-[#E4E7EC] text-[11px] text-[#667085] font-mono">
          <Globe className="w-3 h-3 text-[#12A594]" />
          <span>salesflow.space</span>
        </div>

        {/* Super Admin Status */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF8F2] border border-[#A6F4C5] text-[11px] text-[#16A46A] font-semibold">
          <Shield className="w-3 h-3" />
          <span>Super Admin Active</span>
        </div>

        {/* Profile / Security Controls */}
        <Link
          href="/superadmin/security"
          title="Security & Two-Factor Auth Settings"
          className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg border border-[#E4E7EC] hover:bg-[#F5F7FA] text-xs text-[#172033] font-medium transition-all"
        >
          <div className="w-6 h-6 rounded-full bg-[#0F2747] text-white flex items-center justify-center font-bold text-[10px]">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <span className="hidden md:inline font-mono text-[11px] text-[#667085]">
            @{user.username}
          </span>
          <Lock className="w-3 h-3 text-[#667085] ml-0.5" />
        </Link>

        {/* Top-Bar Super Admin Logout Button */}
        <button
          onClick={handleLogout}
          type="button"
          disabled={isLoggingOut}
          title="Sign out of Super Admin"
          aria-label="Sign out of Super Admin"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-600 hover:text-rose-700 text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          {isLoggingOut ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
