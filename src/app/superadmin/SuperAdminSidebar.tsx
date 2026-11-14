'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Boxes,
  Settings,
  Palette,
  ShieldCheck,
  History,
  KeyRound,
  ChevronRight,
  ChevronDown,
  LogOut,
  X,
} from 'lucide-react';
import type { SuperAdminSessionData } from '@/core/auth/superadmin-session';
import { SaleFlowIcon } from '@/core/branding/logo';
import { BrandIdentity } from '@/core/branding/BrandIdentity';
import type { BrandingConfig } from '@/core/branding/theme';

interface PrimarySidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

interface SubSidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV_ITEMS: PrimarySidebarItem[] = [
  { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard, exact: true },
  { label: 'User Management', href: '/superadmin/users', icon: Users },
  { label: 'Customer Management', href: '/superadmin/companies', icon: Building2 },
  { label: 'Module Management', href: '/superadmin/modules', icon: Boxes },
];

const SETTINGS_SUB_ITEMS: SubSidebarItem[] = [
  { label: 'System Branding', href: '/superadmin/branding', icon: Palette },
  { label: 'System Security', href: '/superadmin/security', icon: ShieldCheck },
  { label: 'Activity & Logs', href: '/superadmin/audit', icon: History },
  { label: 'System Licensing', href: '/superadmin/licensing', icon: KeyRound },
];

export function SuperAdminSidebar({
  user,
  branding,
}: {
  user: SuperAdminSessionData;
  branding?: BrandingConfig | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Check if any settings child route is active
  const isSettingsChildActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isAnySettingsChildActive =
    SETTINGS_SUB_ITEMS.some((sub) => isSettingsChildActive(sub.href)) ||
    pathname === '/superadmin/settings' ||
    pathname.startsWith('/superadmin/settings/');

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => isAnySettingsChildActive);

  // Auto-expand System Settings if navigating to any settings child route
  useEffect(() => {
    if (isAnySettingsChildActive) {
      setIsSettingsOpen(true);
    }
  }, [pathname, isAnySettingsChildActive]);

  // Mobile drawer listener
  useEffect(() => {
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    window.addEventListener('toggle-superadmin-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-superadmin-sidebar', handleToggle);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/superadmin/auth/logout', { method: 'POST' });
      router.push('/superadmin/login');
      router.refresh();
    } catch {
      window.location.href = '/superadmin/login';
    }
  };

  const isPrimaryActive = (item: PrimarySidebarItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Deep Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#081A2F] border-r border-[#172A45] flex flex-col shrink-0 select-none min-h-screen transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#172A45]">
          <Link
            href="/superadmin"
            onClick={() => setIsMobileOpen(false)}
            className="block focus:outline-none focus:ring-2 focus:ring-[#16A46A]/40 rounded-lg max-w-[200px] overflow-hidden"
          >
            <BrandIdentity
              isSidebar={true}
              isSuperAdmin={true}
              uploadedSidebarLogo={branding?.uploadedSidebarLogo}
              uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
              sidebarLogoAsset={branding?.sidebarLogoAsset}
              sidebarLogoVersion={branding?.sidebarLogoVersion}
              uploadedLogo={branding?.uploadedLogo}
              uploadedLogoVersion={branding?.uploadedLogoVersion}
              companyLogo={branding?.companyLogo}
              displayName={branding?.displayName || 'SaleFlow ERP'}
              size="sm"
              theme="dark"
            />
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 md:hidden cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Platform Management
          </div>

          {/* 1 to 4: Primary items */}
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isPrimaryActive(item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${
                  active
                    ? 'bg-[#16A46A]/15 text-white font-semibold border-l-4 border-[#16A46A] shadow-xs'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      active ? 'text-[#16A46A]' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {active && <ChevronRight className="w-3.5 h-3.5 text-[#16A46A] shrink-0" />}
              </Link>
            );
          })}

          {/* 5. System Settings Collapsible Dropdown */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group cursor-pointer ${
                isAnySettingsChildActive
                  ? 'bg-white/10 text-white font-semibold border-l-4 border-[#16A46A] shadow-xs'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
              }`}
              aria-expanded={isSettingsOpen}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Settings
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isAnySettingsChildActive ? 'text-[#16A46A]' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className="truncate">System Settings</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                  isSettingsOpen ? 'rotate-180 text-[#16A46A]' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />
            </button>

            {/* Child Links */}
            {isSettingsOpen && (
              <div className="ml-3 pl-3 border-l border-[#172A45] space-y-1 mt-1 transition-all">
                {SETTINGS_SUB_ITEMS.map((subItem) => {
                  const subActive = isSettingsChildActive(subItem.href);
                  const SubIcon = subItem.icon;

                  return (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all group ${
                        subActive
                          ? 'bg-[#16A46A]/20 text-white font-semibold border-l-2 border-[#16A46A] shadow-xs'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SubIcon
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            subActive ? 'text-[#16A46A]' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        <span className="truncate">{subItem.label}</span>
                      </div>
                      {subActive && <span className="w-1.5 h-1.5 rounded-full bg-[#16A46A] shrink-0" />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* User & Logout Footer */}
        <div className="p-3 border-t border-[#172A45] bg-[#061424]">
          <div className="p-2.5 rounded-xl bg-[#081A2F] border border-[#172A45] flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {user.fullName || user.username}
              </div>
              <div className="text-[10px] text-[#12A594] font-mono truncate">@{user.username}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out of Super Admin"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
