'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/shared/context/auth-context';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { ShieldAlert, ArrowLeft, Sparkles, AlertTriangle, Lock } from 'lucide-react';
import Link from 'next/link';
import { findSubmoduleByRoute } from '@/core/registry/hierarchical-module-registry';

interface RouteRequirement {
  prefix: string;
  moduleId: string;
  moduleName: string;
  featureFlag?: string;
  featureName?: string;
}

const ROUTE_REQUIREMENTS: RouteRequirement[] = [
  { prefix: '/sales/field-order-booking', moduleId: 'field_order_booking', moduleName: 'Field Order Booking' },
  { prefix: '/sales/order-booking', moduleId: 'sales', moduleName: 'Sales & Distribution', featureFlag: 'sales.enable_order_booking', featureName: 'Order Booking' },
  { prefix: '/sales/direct-sale', moduleId: 'sales', moduleName: 'Sales & Distribution', featureFlag: 'sales.enable_direct_sale', featureName: 'Direct Van Sale' },
  { prefix: '/sales/returns', moduleId: 'returns', moduleName: 'Sales & Purchase Returns' },
  { prefix: '/sales/collections', moduleId: 'sales', moduleName: 'Sales & Distribution' },
  { prefix: '/sales', moduleId: 'sales', moduleName: 'Sales & Distribution' },
  { prefix: '/dispatch', moduleId: 'sales', moduleName: 'Sales & Distribution' },
  { prefix: '/purchase/returns', moduleId: 'returns', moduleName: 'Sales & Purchase Returns' },
  { prefix: '/purchase', moduleId: 'purchase', moduleName: 'Purchase & Bills' },
  { prefix: '/returns', moduleId: 'returns', moduleName: 'Sales & Purchase Returns' },
  { prefix: '/inventory', moduleId: 'inventory', moduleName: 'Inventory & Products' },
  { prefix: '/accounting/banks', moduleId: 'banking', moduleName: 'Banking & Accounts' },
  { prefix: '/accounting', moduleId: 'accounts', moduleName: 'General Ledger & Accounts' },
  { prefix: '/payments', moduleId: 'payments', moduleName: 'Payments & Cash Management' },
  { prefix: '/reports/bank-statement', moduleId: 'banking', moduleName: 'Banking & Accounts' },
  { prefix: '/reports', moduleId: 'reports', moduleName: 'Reports & Analytics' },
  { prefix: '/expenses', moduleId: 'expenses', moduleName: 'Daily Expenses' },
  { prefix: '/closing', moduleId: 'closing', moduleName: 'Daily Cash Closing', featureFlag: 'closing.enable_daily_closing', featureName: 'Daily Closing' },
  { prefix: '/customers', moduleId: 'customers', moduleName: 'Customers & Retail Outlets' },
  { prefix: '/settings/users', moduleId: 'auth', moduleName: 'User Management & Security' },
  { prefix: '/settings', moduleId: 'settings', moduleName: 'System Settings' },
  { prefix: '/modules', moduleId: 'settings', moduleName: 'System Settings' },
];

export const RouteAccessGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const {
    role,
    currentUser,
    hasPermission,
    switchRole,
    isModuleEnabled,
    enabledModules,
    loading,
    sessionResolved,
    modulesLoaded,
    isInitializing,
  } = useAuth();
  const { isEnabled, loading: flagsLoading } = useFeatureFlags();

  // 1. UNKNOWN / RESOLVING STATE
  // Explicit 3-State Access Model:
  // State 1: LOADING / UNKNOWN -> session, user role, module entitlements, or feature flags are resolving
  // State 2: ALLOWED -> confirmed valid permissions -> render children
  // State 3: DENIED -> confirmed invalid permissions -> render genuine 403 denial
  //
  // CRITICAL RULE: NEVER collapse UNKNOWN into DENIED.
  // While permissions are resolving:
  // - Do NOT render permission error (no flash)
  // - Do NOT leak protected content
  // - Render neutral layout-preserving boundary
  const isResolving = loading || !sessionResolved || flagsLoading;

  if (isResolving) {
    return (
      <div
        className="route-access-loading-boundary"
        style={{
          minHeight: '55vh',
          width: '100%',
        }}
      />
    );
  }

  // If session finished resolving but no active user session, do not leak protected content
  if (!currentUser) {
    return null;
  }

  // Canonical Submodule & Main Module Direct URL Enforcement
  const foundSubmodule = findSubmoduleByRoute(pathname);
  if (foundSubmodule) {
    const isMainOn = typeof isModuleEnabled === 'function' ? isModuleEnabled(foundSubmodule.mainModule.id) : true;
    const isChildOn = typeof isModuleEnabled === 'function' ? isModuleEnabled(foundSubmodule.submodule.id) : true;
    if (!isMainOn || !isChildOn) {
      const isSubDisabledOnly = isMainOn && !isChildOn;
      const disabledTitle = isSubDisabledOnly
        ? `Sub-Module "${foundSubmodule.submodule.label}" Disabled`
        : `Module "${foundSubmodule.mainModule.label}" Disabled`;
      const disabledDesc = isSubDisabledOnly
        ? `The sub-module "${foundSubmodule.submodule.label}" (${foundSubmodule.submodule.id}) under ${foundSubmodule.mainModule.label} is turned OFF for your company.`
        : `The main module "${foundSubmodule.mainModule.label}" (${foundSubmodule.mainModule.id}) is turned OFF for your company.`;

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '65vh',
            padding: '2rem 1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              border: '1px solid #fca5a5',
              padding: '2rem',
              boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.1)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <Lock size={30} />
            </div>

            <span
              style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                marginBottom: '0.75rem',
              }}
            >
              403 Module Disabled
            </span>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              {disabledTitle}
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {disabledDesc} Direct access to{' '}
              <code className="font-mono" style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0284c7' }}>
                {pathname}
              </code>{' '}
              is blocked.
            </p>

            <div
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: '0.5rem',
                border: '1px solid #fecaca',
                padding: '0.85rem',
                marginBottom: '1.5rem',
                fontSize: '0.8rem',
                color: '#7f1d1d',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={15} />
              Administrative roles cannot bypass disabled company modules.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-outline"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <ArrowLeft size={14} /> Go Back
              </button>
              <Link href="/" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                Go to Executive Overview
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  // Find most specific legacy route match (sorted by longest prefix first)
  const matchedRequirement = [...ROUTE_REQUIREMENTS]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));

  // 1. Strict Module Runtime Enforcement:
  // If the module is disabled for this company, block immediately regardless of role.
  // User role (including ADMIN) must NOT bypass a disabled module!
  if (matchedRequirement) {
    const isModOn = typeof isModuleEnabled === 'function' ? isModuleEnabled(matchedRequirement.moduleId) : true;
    if (!isModOn) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '65vh',
            padding: '2rem 1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              border: '1px solid #fca5a5',
              padding: '2rem',
              boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.1)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <Lock size={30} />
            </div>

            <span
              style={{
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                marginBottom: '0.75rem',
              }}
            >
              403 Module Disabled
            </span>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              Module Disabled for this Company
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              The module <strong style={{ color: '#dc2626' }}>{matchedRequirement.moduleName}</strong> ({matchedRequirement.moduleId}) is turned OFF for your company.
              Direct access to <code className="font-mono" style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0284c7' }}>{pathname}</code> is blocked.
            </p>

            <div
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: '0.5rem',
                border: '1px solid #fecaca',
                padding: '0.85rem',
                marginBottom: '1.5rem',
                fontSize: '0.8rem',
                color: '#7f1d1d',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={15} />
              Administrative roles cannot bypass disabled company modules.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-outline"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <ArrowLeft size={14} /> Go Back
              </button>
              <Link href="/" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                Go to Executive Overview
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // 2. Strict Feature Flag Enforcement:
    if (matchedRequirement.featureFlag) {
      const isFeatureOn = isEnabled(matchedRequirement.featureFlag, true);
      if (!isFeatureOn) {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '65vh',
              padding: '2rem 1rem',
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: '560px',
                width: '100%',
                backgroundColor: '#ffffff',
                borderRadius: '0.75rem',
                border: '1px solid #fcd34d',
                padding: '2rem',
                boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.1)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}
              >
                <Lock size={30} />
              </div>

              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  marginBottom: '0.75rem',
                }}
              >
                403 Feature Disabled
              </span>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                Feature Disabled for this Company
              </h2>

              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                The feature <strong style={{ color: '#b45309' }}>{matchedRequirement.featureName || matchedRequirement.featureFlag}</strong> is disabled in your company settings.
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                >
                  <ArrowLeft size={14} /> Go Back
                </button>
                <Link href="/" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                  Go to Executive Overview
                </Link>
              </div>
            </div>
          </div>
        );
      }
    }
  }

  // 3. RBAC Role Permission Check
  const rbacEnabled = isEnabled('auth.enable_rbac', true);
  if (!rbacEnabled) {
    return <>{children}</>;
  }

  const allowed = hasPermission(pathname);
  if (allowed) {
    return <>{children}</>;
  }

  // Fallback destination based on role
  const getSafeFallback = () => {
    if (role === 'ORDER_BOOKER') return { href: '/sales/field-order-booking', label: 'Field Order Booking' };
    if (role === 'SALESMAN') return { href: '/sales/order-booking', label: 'Sale Order Booking' };
    if (role === 'CASHIER') return { href: '/closing/daily-summary', label: 'Daily Cash Closing' };
    if (role === 'WAREHOUSE') return { href: '/inventory/products', label: 'Inventory & Products' };
    return { href: '/', label: 'Executive Overview' };
  };

  const fallback = getSafeFallback();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '65vh',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #fed7aa',
          padding: '2rem',
          boxShadow: '0 10px 25px -5px rgba(249, 115, 22, 0.1)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#ffedd5',
            color: '#ea580c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <ShieldAlert size={30} />
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: '#fed7aa',
            color: '#9a3412',
            marginBottom: '0.75rem',
          }}
        >
          403 Access Restricted
        </span>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
          Restricted by Role Permissions
        </h2>

        <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Your active profile <strong style={{ color: '#0f172a' }}>{currentUser?.full_name}</strong> has the role{' '}
          <strong style={{ color: '#ea580c' }}>[{role}]</strong>, which does not have authorization to view{' '}
          <code className="font-mono" style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0284c7' }}>
            {pathname}
          </code>.
        </p>

        {/* Quick Role Switcher for Fast Testing */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e2e8f0',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            <Sparkles size={13} color="#0284c7" /> Switch to Authorized Role for Testing:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => switchRole('ADMIN')}
              className="btn btn-outline btn-sm"
              style={{ justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#4338ca' }}
            >
              Switch to ADMIN (Full Access)
            </button>
            <button
              type="button"
              onClick={() => switchRole('CASHIER')}
              className="btn btn-outline btn-sm"
              style={{ justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}
            >
              Switch to CASHIER
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={14} /> Go Back
          </button>
          <Link
            href={fallback.href}
            className="btn btn-primary"
            style={{ fontSize: '0.85rem' }}
          >
            Go to {fallback.label}
          </Link>
        </div>
      </div>
    </div>
  );
};
