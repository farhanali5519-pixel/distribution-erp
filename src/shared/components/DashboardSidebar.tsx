'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/context/auth-context';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { SidebarUserProfile } from './SidebarUserProfile';
import { findSubmoduleByRoute } from '@/core/registry/hierarchical-module-registry';
import { 
  TrendingUp, 
  ShoppingCart, 
  PieChart, 
  CreditCard, 
  Package, 
  BarChart3, 
  Sliders, 
  ClipboardList, 
  FileText, 
  Truck, 
  RotateCcw, 
  Users, 
  UserCheck,
  PlusCircle, 
  Undo2, 
  BookOpen, 
  CheckCircle2, 
  Receipt, 
  ToggleLeft, 
  Building2, 
  Database, 
  ShieldCheck, 
  Layers, 
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Coins,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Settings2,
  MapPin,
  History,
  Smartphone,
  Menu,
  X
} from 'lucide-react';

import { BrandIdentity } from '@/core/branding/BrandIdentity';
import type { BrandingConfig } from '@/core/branding/theme';

interface DashboardSidebarProps {
  allModules: any[];
  activeModules: any[];
  branding?: BrandingConfig | null;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  requiredModule?: string;
  badge?: string;
}

interface NavGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({ allModules, activeModules, branding }) => {
  const pathname = usePathname();
  const { role, isAdmin, hasPermission, isModuleEnabled, enabledModules } = useAuth();
  const { isEnabled } = useFeatureFlags();

  const rbacEnabled = isEnabled('auth.enable_rbac', true);

  // Group definitions conforming exactly to requested structure
  const rawGroups: NavGroup[] = [
    {
      id: 'sales',
      title: 'Sales',
      icon: <TrendingUp size={16} strokeWidth={2} />,
      items: [
        { title: 'Field Sale', href: '/sales/field-order-booking', icon: <Smartphone size={15} strokeWidth={1.8} />, requiredModule: 'field_order_booking' },
        { title: 'Sale', href: '/sales/order-booking', icon: <ClipboardList size={15} strokeWidth={1.8} />, requiredModule: 'sales' },
        { title: 'Orders Detail', href: '/sales', icon: <FileText size={15} strokeWidth={1.8} />, requiredModule: 'sales' },
        { title: 'Van Sale', href: '/sales/direct-sale', icon: <TrendingUp size={15} strokeWidth={1.8} />, requiredModule: 'sales' },
        { title: 'Sale Return', href: '/sales/returns', icon: <RotateCcw size={15} strokeWidth={1.8} />, requiredModule: 'returns' },
        { title: 'Load Sheet', href: '/dispatch/load-sheet', icon: <Truck size={15} strokeWidth={1.8} />, requiredModule: 'sales' },
      ],
    },
    {
      id: 'purchase',
      title: 'Purchase',
      icon: <ShoppingCart size={16} strokeWidth={2} />,
      items: [
        { title: 'Purchase', href: '/purchase/new-bill', icon: <PlusCircle size={15} strokeWidth={1.8} />, requiredModule: 'purchase' },
        { title: 'Purchase Detail', href: '/purchase/orders-detail', icon: <FileText size={15} strokeWidth={1.8} />, requiredModule: 'purchase' },
        { title: 'Purchase Return', href: '/purchase/returns', icon: <Undo2 size={15} strokeWidth={1.8} />, requiredModule: 'returns' },
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory',
      icon: <Package size={16} strokeWidth={2} />,
      items: [
        { title: 'Products & Pricing', href: '/inventory/products', icon: <Package size={15} strokeWidth={1.8} />, requiredModule: 'inventory' },
        { title: 'Inventory Audit & Stock Ledger', href: '/inventory/audit-ledger', icon: <History size={15} strokeWidth={1.8} />, requiredModule: 'inventory' },
      ],
    },
    {
      id: 'accounts',
      title: 'Accounts',
      icon: <PieChart size={16} strokeWidth={2} />,
      items: [
        { title: 'Chart of Accounts', href: '/accounting/coa', icon: <BookOpen size={15} strokeWidth={1.8} />, requiredModule: 'accounts' },
        { title: 'General Ledger & Journals', href: '/accounting/journal', icon: <FileText size={15} strokeWidth={1.8} />, requiredModule: 'accounts' },
        { title: 'Trial Balance', href: '/accounting/trial-balance', icon: <CheckCircle2 size={15} strokeWidth={1.8} />, requiredModule: 'accounts' },
      ],
    },
    {
      id: 'payments',
      title: 'Payments & Cash',
      icon: <CreditCard size={16} strokeWidth={2} />,
      items: [
        { title: 'Payment Received', href: '/payments/received', icon: <ArrowDownLeft size={15} strokeWidth={1.8} />, requiredModule: 'payments' },
        { title: 'Payment Made', href: '/payments/made', icon: <ArrowUpRight size={15} strokeWidth={1.8} />, requiredModule: 'payments' },
        { title: 'Route Collections', href: '/sales/collections', icon: <Coins size={15} strokeWidth={1.8} />, requiredModule: 'payments' },
        { title: 'Daily Expenses', href: '/expenses', icon: <Receipt size={15} strokeWidth={1.8} />, requiredModule: 'expenses' },
        { title: 'Daily Cash Closing', href: '/closing/daily-summary', icon: <Wallet size={15} strokeWidth={1.8} />, requiredModule: 'closing' },
      ],
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: <BarChart3 size={16} strokeWidth={2} />,
      items: [
        { title: 'Sales Analysis Report', href: '/reports/sales-analysis', icon: <BarChart3 size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
        { title: 'Stock & Booking Analysis', href: '/reports/stock-analysis', icon: <Package size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
        { title: 'Bank Statement', href: '/reports/bank-statement', icon: <FileText size={15} strokeWidth={1.8} />, requiredModule: 'banking' },
        { title: 'Party Ledgers (Khata)', href: '/reports/ledgers', icon: <BookOpen size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
        { title: 'Profit & Loss Statement', href: '/reports/profit-and-loss', icon: <TrendingUp size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
        { title: 'Stock Valuation Report', href: '/reports/stock-valuation', icon: <Layers size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
        { title: 'Salesman Recovery', href: '/reports/salesman-performance', icon: <Users size={15} strokeWidth={1.8} />, requiredModule: 'reports' },
      ],
    },
    {
      id: 'account_setup',
      title: 'Account Setup',
      icon: <Settings2 size={16} strokeWidth={2} />,
      items: [
        { title: 'Bank Accounts Master', href: '/accounting/banks', icon: <Landmark size={15} strokeWidth={1.8} />, requiredModule: 'banking' },
        { title: 'Route & Territory Master', href: '/settings/routes', icon: <MapPin size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
        { title: 'Customers & Retail Outlets', href: '/customers', icon: <Users size={15} strokeWidth={1.8} />, requiredModule: 'customers' },
        { title: 'Vendor / Supplier Master', href: '/purchase/vendors', icon: <Users size={15} strokeWidth={1.8} />, requiredModule: 'purchase' },
        { title: 'Sales & Delivery Team', href: '/settings/staff', icon: <UserCheck size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
        { title: 'Company Profile & Print Setup', href: '/settings/company', icon: <Building2 size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
      ],
    },
    {
      id: 'settings',
      title: 'Administration',
      icon: <Sliders size={16} strokeWidth={2} />,
      items: [
        { title: 'User Management', href: '/settings/users', icon: <UserCheck size={15} strokeWidth={1.8} />, requiredModule: 'auth' },
        { title: 'Module Registry', href: '/modules', icon: <Sliders size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
        { title: 'Feature Flags', href: '/settings/features', icon: <ToggleLeft size={15} strokeWidth={1.8} />, badge: 'Live', requiredModule: 'settings' },
        { title: 'Database Backup', href: '/settings/backup', icon: <Database size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
        { title: 'System & Licensing', href: '/settings/system-info', icon: <ShieldCheck size={15} strokeWidth={1.8} />, requiredModule: 'settings' },
      ],
    },
  ];

  // Helper to check item active status
  const isItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/sales') return pathname === '/sales';
    if (href === '/inventory/products') {
      return pathname === '/inventory/products' || pathname === '/inventory';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Helper to check if item is permitted & module is enabled
  const isItemVisible = (item: NavItem) => {
    // 1. Canonical hierarchical submodule & parent module entitlement check
    const found = findSubmoduleByRoute(item.href);
    if (found) {
      const isParentOn = typeof isModuleEnabled === 'function' ? isModuleEnabled(found.mainModule.id) : true;
      const isChildOn = typeof isModuleEnabled === 'function' ? isModuleEnabled(found.submodule.id) : true;
      if (!isParentOn || !isChildOn) {
        return false;
      }
    } else if (item.requiredModule) {
      if (Array.isArray(enabledModules) && enabledModules.length > 0) {
        if (!enabledModules.includes(item.requiredModule)) return false;
      } else if (typeof isModuleEnabled === 'function') {
        if (!isModuleEnabled(item.requiredModule)) return false;
      } else if (Array.isArray(activeModules)) {
        const isModActive = activeModules.some(
          (m: any) => m.id === item.requiredModule && m.isEnabled === true
        );
        if (!isModActive) return false;
      } else {
        return false;
      }
    }

    if (rbacEnabled && !hasPermission(item.href)) {
      return false;
    }
    return true;
  };

  // Filter groups by user permissions and active module configurations
  const visibleGroups = rawGroups
    .map((grp) => ({
      ...grp,
      items: grp.items.filter(isItemVisible),
    }))
    .filter((grp) => grp.items.length > 0);

  // Single state for accordion: only one section can be open at a time
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Track mount status to prevent hydration / first-load animation flash
  const [isMounted, setIsMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Floating tooltip for collapsed icons
  const [tooltip, setTooltip] = useState<{ title: string; top: number } | null>(null);

  // Mobile drawer listener
  useEffect(() => {
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    const handleOpen = () => setIsMobileOpen(true);
    const handleClose = () => setIsMobileOpen(false);

    window.addEventListener('saleflow:toggle-mobile-sidebar', handleToggle);
    window.addEventListener('saleflow:open-mobile-sidebar', handleOpen);
    window.addEventListener('saleflow:close-mobile-sidebar', handleClose);

    return () => {
      window.removeEventListener('saleflow:toggle-mobile-sidebar', handleToggle);
      window.removeEventListener('saleflow:open-mobile-sidebar', handleOpen);
      window.removeEventListener('saleflow:close-mobile-sidebar', handleClose);
    };
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Initialize collapse preference from localStorage or screen width
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saleflow_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      } else if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
        setIsCollapsed(true);
      }
    } catch (e) {}

    // Enable smooth transitions only after initial hydration/mount is settled
    requestAnimationFrame(() => {
      setIsMounted(true);
    });
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('saleflow_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
    setTooltip(null);
  };

  const expandSidebar = () => {
    setIsCollapsed(false);
    try {
      localStorage.setItem('saleflow_sidebar_collapsed', 'false');
    } catch (e) {}
    setTooltip(null);
  };

  // Ensure active group is automatically expanded on navigation or initial render
  useEffect(() => {
    const matchingGroup = visibleGroups.find((grp) =>
      grp.items.some((item) => isItemActive(item.href))
    );
    if (matchingGroup) {
      setOpenSection(matchingGroup.id);
    }
  }, [pathname]);

  const handleGroupClick = (groupId: string) => {
    if (isCollapsed) {
      expandSidebar();
      setOpenSection(groupId);
    } else {
      setOpenSection((prev) => (prev === groupId ? null : groupId));
    }
  };

  return (
    <>
      {/* Mobile Drawer Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: isCollapsed ? '68px' : '260px',
          transition: isMounted
            ? 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, border-color 0.2s ease'
            : 'none',
        }}
      >
        {/* Unified Stable Brand Header - Fixed Anchor Slot */}
        <div
          className="sidebar-header"
          style={{
            height: '64px',
            padding: '0 0.85rem',
            borderBottom: '1px solid var(--sidebar-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Brand Area */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              opacity: isCollapsed ? 0 : 1,
              pointerEvents: isCollapsed ? 'none' : 'auto',
              transition: isMounted ? 'opacity 0.18s ease' : 'none',
            }}
          >
            <BrandIdentity
              isSidebar={true}
              collapsed={false}
              uploadedSidebarLogo={branding?.uploadedSidebarLogo}
              uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
              sidebarLogoAsset={branding?.sidebarLogoAsset}
              sidebarLogoVersion={branding?.sidebarLogoVersion}
              uploadedLogo={branding?.uploadedLogo}
              uploadedLogoVersion={branding?.uploadedLogoVersion}
              companyLogo={branding?.companyLogo}
              tenantLogo={branding?.tenantLogo}
              tenantLogoVersion={branding?.tenantLogoVersion}
              tenantSidebarLogo={branding?.tenantSidebarLogo}
              tenantSidebarLogoVersion={branding?.tenantSidebarLogoVersion}
              globalLogo={branding?.globalLogo}
              globalLogoVersion={branding?.globalLogoVersion}
              globalSidebarLogo={branding?.globalSidebarLogo}
              globalSidebarLogoVersion={branding?.globalSidebarLogoVersion}
              displayName={branding?.displayName || 'SaleFlow ERP'}
              size="sm"
            />
          </div>

          {/* Mobile Drawer Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="sidebar-mobile-close-btn"
            title="Close navigation menu"
            aria-label="Close navigation"
          >
            <X size={16} strokeWidth={2} />
          </button>

          {/* Stable Collapse/Expand Toggle Button - Locked Position */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="sidebar-desktop-collapse-btn"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-main)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
              e.currentTarget.style.color = 'var(--text-heading)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-main)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={15} strokeWidth={2} />
            ) : (
              <PanelLeftClose size={15} strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Navigation Groups Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: isCollapsed ? '0.75rem 0.5rem' : '0.85rem 0.65rem',
            transition: isMounted ? 'padding 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        >
          {/* System Status Indicator - Smoothly Collapsible */}
          <div
            style={{
              overflow: 'hidden',
              maxHeight: isCollapsed ? '0px' : '36px',
              opacity: isCollapsed ? 0 : 1,
              marginBottom: isCollapsed ? '0' : '0.65rem',
              transition: isMounted
                ? 'max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, margin-bottom 0.2s ease'
                : 'none',
              pointerEvents: isCollapsed ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.3rem 0.6rem',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--accent-emerald)',
                    boxShadow: '0 0 6px var(--accent-emerald)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  System Operational
                </span>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                v2.4
              </span>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {/* Permanent Core Dashboard Link - Unified Stable DOM */}
            <div style={{ marginBottom: '0.15rem' }}>
              <Link
                href="/"
                onClick={() => setIsMobileOpen(false)}
                title={isCollapsed ? 'Executive Overview' : undefined}
                onMouseEnter={(e) => {
                  if (isCollapsed) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ title: 'Executive Overview', top: rect.top + rect.height / 2 });
                  }
                  if (pathname !== '/') {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    e.currentTarget.style.color = 'var(--text-heading)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (isCollapsed) {
                    setTooltip(null);
                  }
                  if (pathname !== '/') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: isCollapsed ? '0.52rem 0.55rem' : '0.52rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.825rem',
                  fontWeight: pathname === '/' ? 600 : 500,
                  color: pathname === '/' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                  backgroundColor: pathname === '/' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  border: pathname === '/' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid transparent',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, padding 0.2s ease',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                {/* Stable Fixed Icon Slot */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <PieChart size={16} strokeWidth={pathname === '/' ? 2.2 : 1.8} />
                </div>

                {/* Smooth Label Reveal/Hide */}
                <span
                  style={{
                    marginLeft: '0.65rem',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    opacity: isCollapsed ? 0 : 1,
                    maxWidth: isCollapsed ? 0 : '180px',
                    transition: isMounted
                      ? 'opacity 0.18s ease, max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.2s ease'
                      : 'none',
                    pointerEvents: isCollapsed ? 'none' : 'auto',
                  }}
                >
                  Executive Overview
                </span>
              </Link>
            </div>

            {/* Navigation Groups - Unified Stable DOM */}
            {visibleGroups.map((group) => {
              const hasActiveChild = group.items.some((item) => isItemActive(item.href));
              const isOpen = openSection === group.id;

              return (
                <div key={group.id} style={{ marginBottom: '0.15rem' }}>
                  {/* Group Accordion Trigger Header */}
                  <button
                    type="button"
                    onClick={() => handleGroupClick(group.id)}
                    title={isCollapsed ? group.title : undefined}
                    onMouseEnter={(e) => {
                      if (isCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ title: group.title, top: rect.top + rect.height / 2 });
                      }
                      e.currentTarget.style.background = 'var(--bg-card-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      if (isCollapsed) {
                        setTooltip(null);
                      }
                      e.currentTarget.style.background = hasActiveChild && (!isOpen || isCollapsed) ? 'var(--bg-card-hover)' : 'transparent';
                      e.currentTarget.style.color = hasActiveChild ? 'var(--text-heading)' : 'var(--text-secondary)';
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      padding: isCollapsed ? '0.5rem 0.55rem' : '0.5rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: hasActiveChild && (!isOpen || isCollapsed) ? 'var(--bg-card-hover)' : 'transparent',
                      cursor: 'pointer',
                      color: hasActiveChild ? 'var(--text-heading)' : 'var(--text-secondary)',
                      transition: 'background-color 0.15s ease, color 0.15s ease, padding 0.2s ease',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Stable Fixed Icon Slot */}
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: hasActiveChild ? 'var(--accent-emerald)' : 'var(--text-muted)',
                        position: 'relative',
                        transition: 'color 0.15s ease',
                      }}
                    >
                      {group.icon}
                      {/* Active Child Dot on Icon when collapsed */}
                      {hasActiveChild && isCollapsed && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--accent-emerald)',
                          }}
                        />
                      )}
                    </div>

                    {/* Group Title */}
                    <span
                      style={{
                        marginLeft: '0.55rem',
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        fontSize: '0.825rem',
                        fontWeight: hasActiveChild ? 700 : 600,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        opacity: isCollapsed ? 0 : 1,
                        maxWidth: isCollapsed ? 0 : '160px',
                        transition: isMounted
                          ? 'opacity 0.18s ease, max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.2s ease'
                          : 'none',
                        pointerEvents: isCollapsed ? 'none' : 'auto',
                      }}
                    >
                      {group.title}
                    </span>

                    {/* Trailing Active Dot & Chevron */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        flexShrink: 0,
                        opacity: isCollapsed ? 0 : 1,
                        maxWidth: isCollapsed ? 0 : '40px',
                        overflow: 'hidden',
                        transition: isMounted
                          ? 'opacity 0.18s ease, max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
                          : 'none',
                        pointerEvents: isCollapsed ? 'none' : 'auto',
                      }}
                    >
                      {hasActiveChild && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--accent-emerald)',
                          }}
                        />
                      )}
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          color: 'var(--text-muted)',
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <ChevronRight size={13} strokeWidth={2.4} />
                      </span>
                    </div>
                  </button>

                  {/* Collapsible Child Navigation Links with smooth height transition */}
                  {isOpen && (
                    <div
                      style={{
                        paddingLeft: isCollapsed ? 0 : '0.55rem',
                        marginLeft: isCollapsed ? 0 : '0.9rem',
                        borderLeft: isCollapsed ? '1.5px solid transparent' : '1.5px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem',
                        marginTop: isCollapsed ? 0 : '0.15rem',
                        marginBottom: isCollapsed ? 0 : '0.35rem',
                        maxHeight: isCollapsed ? '0px' : '500px',
                        opacity: isCollapsed ? 0 : 1,
                        overflow: 'hidden',
                        transition: isMounted
                          ? 'max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease, margin 0.2s ease, padding 0.2s ease'
                          : 'none',
                        pointerEvents: isCollapsed ? 'none' : 'auto',
                      }}
                    >
                      {group.items.map((item) => {
                        const isActive = isItemActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileOpen(false)}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                            title={item.title}
                            style={{
                              padding: '0.42rem 0.65rem',
                              fontSize: '0.8rem',
                            }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                color: isActive ? 'var(--accent-emerald)' : 'inherit',
                              }}
                            >
                              {item.icon}
                            </span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className="badge badge-emerald" style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem' }}>
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

      {/* Floating Tooltip for Collapsed Sidebar Icons */}
      {isCollapsed && tooltip && (
        <div
          style={{
            position: 'fixed',
            left: '74px',
            top: tooltip.top,
            transform: 'translateY(-50%)',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '0.35rem 0.65rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            pointerEvents: 'none',
          }}
        >
          {tooltip.title}
        </div>
      )}

      {/* Redesigned Profile Card Footer */}
      <div
        style={{
          padding: isCollapsed ? '0.65rem 0.35rem' : '0.65rem 0.85rem',
          borderTop: '1px solid var(--sidebar-border)',
          background: 'var(--bg-main)',
          position: 'relative',
        }}
      >
        <SidebarUserProfile isCollapsed={isCollapsed} onExpand={expandSidebar} />
      </div>
    </aside>
  </>
  );
};

export const MobileNavToggle: React.FC = () => {
  return (
    <button
      type="button"
      className="mobile-sidebar-toggle-btn"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('saleflow:toggle-mobile-sidebar'));
        }
      }}
      aria-label="Toggle navigation menu"
      title="Toggle menu"
    >
      <Menu size={20} strokeWidth={2} />
    </button>
  );
};
