'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SaleFlowIcon } from './logo';

export interface BrandIdentityProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'dark' | 'light';
  surface?: 'light' | 'dark' | 'login' | 'sidebar' | 'auto';
  // Logo inputs (resolved by priority)
  uploadedLogo?: string | null;
  uploadedLogoVersion?: number | string | null;
  companyLogo?: string | null;
  tenantLogo?: string | null;
  tenantLogoVersion?: number | string | null;
  globalLogo?: string | null;
  globalLogoVersion?: number | string | null;
  // Sidebar logo inputs
  isSidebar?: boolean;
  collapsed?: boolean;
  uploadedSidebarLogo?: string | null;
  uploadedSidebarLogoVersion?: number | string | null;
  sidebarLogoAsset?: string | null;
  sidebarLogoVersion?: number | string | null;
  tenantSidebarLogo?: string | null;
  tenantSidebarLogoVersion?: number | string | null;
  globalSidebarLogo?: string | null;
  globalSidebarLogoVersion?: number | string | null;
  isSuperAdmin?: boolean;
  // Display name inputs
  displayName?: string | null;
  tenantName?: string | null;
  // Options
  subtitle?: string;
  showSubtitle?: boolean;
  badge?: string;
  showBadge?: boolean;
  showIconFallback?: boolean;
  imageMaxHeight?: number;
  priorityLogoUrl?: string | null;
  onClick?: () => void;
}

/**
 * Centralized SaleFlow Brand Identity Component
 *
 * Implements strict branding role architecture:
 *
 * LIGHT SURFACES:
 * Tenant: Tenant Main Logo -> Global Main Logo -> Tenant Sidebar -> Global Sidebar -> Fallback
 * Super Admin: Global Main Logo -> Global Sidebar -> Fallback
 *
 * DARK / SIDEBAR / LOGIN SURFACES:
 * Tenant: Tenant Sidebar Logo -> Tenant Main Logo -> Global Sidebar -> Global Main -> Fallback
 * Super Admin: Global Sidebar Logo -> Global Main Logo -> Fallback
 *
 * Guaranteed zero broken-image state: automatically steps through candidate queue on onError.
 */
export function BrandIdentity({
  className = '',
  size = 'md',
  theme,
  surface = 'auto',
  uploadedLogo,
  uploadedLogoVersion,
  companyLogo,
  tenantLogo,
  tenantLogoVersion,
  globalLogo,
  globalLogoVersion,
  isSidebar = false,
  collapsed = false,
  uploadedSidebarLogo,
  uploadedSidebarLogoVersion,
  sidebarLogoAsset,
  sidebarLogoVersion,
  tenantSidebarLogo,
  tenantSidebarLogoVersion,
  globalSidebarLogo,
  globalSidebarLogoVersion,
  isSuperAdmin = false,
  displayName,
  tenantName,
  subtitle,
  showSubtitle = false,
  badge,
  showBadge = false,
  showIconFallback = true,
  imageMaxHeight,
  priorityLogoUrl,
  onClick,
}: BrandIdentityProps) {
  // Track active data-theme dynamically from DOM (defaults deterministically to 'light')
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const syncTheme = () => {
      if (typeof document === 'undefined') return;
      const current = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setActiveTheme(current);
    };
    syncTheme();

    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          syncTheme();
        }
      }
    });

    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('saleflow-theme-changed', syncTheme);
    }
    return () => {
      observer.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('saleflow-theme-changed', syncTheme);
      }
    };
  }, []);

  // Determine whether this surface is dark
  const isDarkSurface = useMemo(() => {
    // Explicit surface overrides
    if (surface === 'login' || surface === 'dark') return true;
    if (surface === 'light') return false;
    // Explicit theme override
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // Auto/sidebar: dynamically follow activeTheme from DOM/events (defaults to 'light')
    if (activeTheme === 'dark') return true;
    return false;
  }, [surface, theme, activeTheme]);

  // Build candidate logos queue according to surface and environment priority
  const candidates = useMemo(() => {
    const list: string[] = [];

    // 1. Tenant Main Logo (explicit tenant logo or custom uploaded logo)
    const rawTenantMain = tenantLogo || null;
    const tenantMainUrl = rawTenantMain
      ? tenantLogoVersion
        ? `${rawTenantMain}?v=${tenantLogoVersion}`
        : rawTenantMain
      : null;

    // 2. Global Main Logo (system uploaded logo or company logo)
    const rawGlobalMain = globalLogo || uploadedLogo || companyLogo || null;
    const globalMainUrl = rawGlobalMain
      ? (globalLogoVersion || uploadedLogoVersion)
        ? `${rawGlobalMain}?v=${globalLogoVersion || uploadedLogoVersion}`
        : rawGlobalMain
      : null;

    // 3. Tenant Sidebar Logo (explicit tenant sidebar logo)
    const rawTenantSidebar = tenantSidebarLogo || null;
    const tenantSidebarUrl = rawTenantSidebar
      ? (tenantSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion)
        ? `${rawTenantSidebar}?v=${tenantSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion}`
        : rawTenantSidebar
      : null;

    // 4. Global Sidebar Logo (system uploaded sidebar logo or sidebar logo asset)
    const rawGlobalSidebar = globalSidebarLogo || uploadedSidebarLogo || sidebarLogoAsset || null;
    const globalSidebarUrl = rawGlobalSidebar
      ? (globalSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion)
        ? `${rawGlobalSidebar}?v=${globalSidebarLogoVersion || uploadedSidebarLogoVersion || sidebarLogoVersion}`
        : rawGlobalSidebar
      : null;

    if (priorityLogoUrl) {
      list.push(priorityLogoUrl);
    }

    if (isSuperAdmin) {
      // Super Admin uses GLOBAL branding only
      if (isDarkSurface) {
        // DARK / SIDEBAR / LOGIN:
        // 1. Global Sidebar Logo
        // 2. Global Main ERP Logo fallback
        if (globalSidebarUrl) list.push(globalSidebarUrl);
        if (globalMainUrl) list.push(globalMainUrl);
      } else {
        // LIGHT:
        // 1. Global Main ERP Logo
        // 2. Global Sidebar Logo fallback
        if (globalMainUrl) list.push(globalMainUrl);
        if (globalSidebarUrl) list.push(globalSidebarUrl);
      }
    } else {
      // Tenant ERP / User environment
      if (isDarkSurface) {
        // TENANT DARK MODE:
        // 1. Tenant Sidebar Logo
        // 2. Tenant Main Logo
        // 3. Global Sidebar Logo
        // 4. Global Main Logo
        if (tenantSidebarUrl) list.push(tenantSidebarUrl);
        if (tenantMainUrl) list.push(tenantMainUrl);
        if (globalSidebarUrl) list.push(globalSidebarUrl);
        if (globalMainUrl) list.push(globalMainUrl);
      } else {
        // TENANT LIGHT MODE:
        // 1. Tenant Main Logo
        // 2. Global Main ERP Logo
        // 3. Tenant Sidebar Logo (fallback only if no Main Logo exists)
        // 4. Global Sidebar Logo (fallback only if no Main Logo exists)
        if (tenantMainUrl) list.push(tenantMainUrl);
        if (globalMainUrl) list.push(globalMainUrl);
        if (tenantSidebarUrl) list.push(tenantSidebarUrl);
        if (globalSidebarUrl) list.push(globalSidebarUrl);
      }
    }

    // Deduplicate consecutive identical URLs
    return list.filter((url, index, self) => Boolean(url) && self.indexOf(url) === index);
  }, [
    isSuperAdmin,
    isDarkSurface,
    tenantLogo,
    tenantLogoVersion,
    globalLogo,
    globalLogoVersion,
    tenantSidebarLogo,
    tenantSidebarLogoVersion,
    globalSidebarLogo,
    globalSidebarLogoVersion,
    uploadedSidebarLogo,
    sidebarLogoAsset,
    uploadedSidebarLogoVersion,
    sidebarLogoVersion,
    uploadedLogo,
    uploadedLogoVersion,
    companyLogo,
    priorityLogoUrl,
  ]);

  // Index in candidate queue currently being displayed
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Reset candidate index when candidate queue changes
  const candidatesKey = candidates.join('|');
  useEffect(() => {
    setCandidateIndex(0);
  }, [candidatesKey]);

  // Resolve current logo candidate
  const currentLogo = candidateIndex < candidates.length ? candidates[candidateIndex] : null;

  const handleImageError = () => {
    setCandidateIndex((prev) => prev + 1);
  };

  // Resolve Display Name fallback
  const resolvedDisplayName = (tenantName || displayName || 'SaleFlow ERP').trim();
  const isDark = isDarkSurface || theme === 'dark';

  // Responsive sizing map
  const heightClasses = {
    sm: 'h-7 md:h-8 max-h-[32px]',
    md: 'h-8 md:h-10 max-h-[40px]',
    lg: 'h-10 md:h-12 max-h-[46px]',
    xl: 'h-12 md:h-14 max-h-[56px]',
  };

  const textClasses = {
    sm: { title: 'text-sm', sub: 'text-[9px]' },
    md: { title: 'text-base', sub: 'text-[10px]' },
    lg: { title: 'text-lg', sub: 'text-[11px]' },
    xl: { title: 'text-2xl', sub: 'text-xs' },
  };

  const ts = textClasses[size] || textClasses.md;

  // 1. Collapsed Sidebar Mode
  if (collapsed) {
    if (currentLogo) {
      return (
        <div
          className={`flex items-center justify-center select-none w-9 h-9 p-0.5 rounded-lg overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
          onClick={onClick}
          title={resolvedDisplayName}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={currentLogo}
            src={currentLogo}
            alt={resolvedDisplayName}
            onError={handleImageError}
            className="w-full h-full max-w-[36px] max-h-[36px] object-contain transition-all duration-200"
          />
        </div>
      );
    }

    return (
      <div
        className={`flex items-center justify-center w-9 h-9 rounded-lg bg-linear-to-br from-[#0f172a] to-[#1e293b] text-[#10b981] border border-white/10 shadow-sm select-none shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
        title={resolvedDisplayName}
      >
        <SaleFlowIcon size="md" />
      </div>
    );
  }

  // 2. Expanded / Standard Mode with active Logo
  if (currentLogo) {
    return (
      <div
        className={`flex items-center gap-2.5 select-none min-w-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentLogo}
          src={currentLogo}
          alt={resolvedDisplayName}
          onError={handleImageError}
          style={imageMaxHeight ? { maxHeight: `${imageMaxHeight}px` } : undefined}
          className={`${heightClasses[size] || heightClasses.md} w-auto max-w-[190px] object-contain shrink-0 transition-all duration-200`}
        />
        {(!isSidebar && showSubtitle && subtitle) && (
          <div className="flex flex-col leading-none truncate">
            <span
              className={`text-[10px] uppercase tracking-wider font-medium truncate ${
                isDark ? 'text-slate-400' : 'text-[#667085]'
              }`}
            >
              {subtitle}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 3. Fallback: Display Name (and optional icon)
  return (
    <div
      className={`flex items-center gap-2.5 select-none min-w-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {showIconFallback && <SaleFlowIcon size={size} />}
      <div className="flex flex-col leading-none min-w-0" title={resolvedDisplayName}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`font-black tracking-tight truncate ${
              isDark ? 'text-white' : 'text-[#0F2747]'
            } ${ts.title}`}
          >
            {resolvedDisplayName}
          </span>
          {!isSidebar && showBadge && badge && (
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                isDark
                  ? 'bg-[#16A46A]/20 text-[#16A46A] border border-[#16A46A]/30'
                  : 'bg-[#EAF8F2] text-[#16A46A] border border-[#16A46A]/30'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {!isSidebar && showSubtitle && subtitle && (
          <span
            className={`font-semibold tracking-wider uppercase mt-1 truncate ${
              isDark ? 'text-slate-400' : 'text-[#667085]'
            } ${ts.sub}`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export default BrandIdentity;
