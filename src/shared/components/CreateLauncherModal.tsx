'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/context/auth-context';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import {
  Plus,
  X,
  TrendingUp,
  ClipboardList,
  Truck,
  Smartphone,
  RotateCcw,
  CreditCard,
  PlusCircle,
  Undo2,
  Package,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Coins,
  FileText,
  Users,
  Building2,
  Landmark,
  UserCheck,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

interface CreateActionItem {
  id: string;
  title: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  bgLight: string;
  moduleId?: string;
  permissionSlug?: string;
  adminOnly?: boolean;
  featureFlag?: string;
}

interface CreateActionGroup {
  id: string;
  title: string;
  items: CreateActionItem[];
}

export const CreateLauncherModal: React.FC = () => {
  const router = useRouter();
  const { isModuleEnabled, canUser, isAdmin, hasPermission } = useAuth();
  const { isEnabled } = useFeatureFlags();

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerNavId = useRef('header-create-launcher-modal');

  // Safe client-side mount check for createPortal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // ESC key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Global dropdown coordination: close if another dropdown opens
  useEffect(() => {
    const handleGlobalClose = (e: Event) => {
      const customEvent = e as CustomEvent<{ sourceId?: string }>;
      if (customEvent.detail?.sourceId !== triggerNavId.current) {
        setIsOpen(false);
      }
    };
    window.addEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
    return () => window.removeEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
  }, []);

  const toggleModal = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('saleflow:close-all-dropdowns', {
          detail: { sourceId: triggerNavId.current },
        })
      );
    }
    setIsOpen((prev) => !prev);
  };

  // ERP Create Action Registry - Genuine creation workflows
  const ALL_GROUPS: CreateActionGroup[] = useMemo(() => [
    {
      id: 'sales',
      title: 'SALES',
      items: [
        {
          id: 'sale',
          title: 'Sale',
          href: '/sales/direct-sale',
          icon: <TrendingUp size={16} strokeWidth={2.2} />,
          color: '#059669',
          bgLight: 'rgba(5, 150, 105, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'direct-sale',
        },
        {
          id: 'sale-order',
          title: 'Sale Order',
          href: '/sales/order-booking',
          icon: <ClipboardList size={16} strokeWidth={2.2} />,
          color: '#10b981',
          bgLight: 'rgba(16, 185, 129, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'order-booking',
        },
        {
          id: 'direct-van-sale',
          title: 'Direct Van Sale',
          href: '/sales/direct-sale',
          icon: <Truck size={16} strokeWidth={2.2} />,
          color: '#0284c7',
          bgLight: 'rgba(2, 132, 199, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'direct-sale',
        },
        {
          id: 'field-order',
          title: 'Field Order',
          href: '/sales/field-order-booking',
          icon: <Smartphone size={16} strokeWidth={2.2} />,
          color: '#6366f1',
          bgLight: 'rgba(99, 102, 241, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'field-order-booking',
        },
        {
          id: 'customer-return',
          title: 'Customer Return',
          href: '/sales/returns',
          icon: <RotateCcw size={16} strokeWidth={2.2} />,
          color: '#f59e0b',
          bgLight: 'rgba(245, 158, 11, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'customer-returns',
        },
        {
          id: 'route-collection',
          title: 'Collection',
          href: '/sales/collections?new=1',
          icon: <CreditCard size={16} strokeWidth={2.2} />,
          color: '#10b981',
          bgLight: 'rgba(16, 185, 129, 0.12)',
          moduleId: 'sales',
          permissionSlug: 'route-collections',
        },
      ],
    },
    {
      id: 'purchases',
      title: 'PURCHASES',
      items: [
        {
          id: 'purchase',
          title: 'Purchase',
          href: '/purchase/new-bill',
          icon: <PlusCircle size={16} strokeWidth={2.2} />,
          color: '#0ea5e9',
          bgLight: 'rgba(14, 165, 233, 0.12)',
          moduleId: 'purchase',
          permissionSlug: 'new-purchase-bill',
        },
        {
          id: 'vendor-return',
          title: 'Vendor Return',
          href: '/purchase/returns',
          icon: <Undo2 size={16} strokeWidth={2.2} />,
          color: '#f43f5e',
          bgLight: 'rgba(244, 63, 94, 0.12)',
          moduleId: 'purchase',
          permissionSlug: 'vendor-returns',
        },
      ],
    },
    {
      id: 'inventory',
      title: 'INVENTORY',
      items: [
        {
          id: 'product',
          title: 'Product',
          href: '/inventory/products?new=1',
          icon: <Package size={16} strokeWidth={2.2} />,
          color: '#10b981',
          bgLight: 'rgba(16, 185, 129, 0.12)',
          moduleId: 'inventory',
          permissionSlug: 'products-master',
        },
        {
          id: 'stock-transfer',
          title: 'Stock Transfer',
          href: '/inventory/audit-ledger?transfer=1',
          icon: <History size={16} strokeWidth={2.2} />,
          color: '#0284c7',
          bgLight: 'rgba(2, 132, 199, 0.12)',
          moduleId: 'inventory',
          permissionSlug: 'inventory-audit-ledger',
        },
      ],
    },
    {
      id: 'payments',
      title: 'PAYMENTS & CASH',
      items: [
        {
          id: 'payment-received',
          title: 'Payment Received',
          href: '/payments/received?new=1',
          icon: <ArrowDownLeft size={16} strokeWidth={2.2} />,
          color: '#10b981',
          bgLight: 'rgba(16, 185, 129, 0.12)',
        },
        {
          id: 'payment-made',
          title: 'Payment Made',
          href: '/payments/made?new=1',
          icon: <ArrowUpRight size={16} strokeWidth={2.2} />,
          color: '#f59e0b',
          bgLight: 'rgba(245, 158, 11, 0.12)',
        },
        {
          id: 'daily-expense',
          title: 'Daily Expense',
          href: '/expenses',
          icon: <Receipt size={16} strokeWidth={2.2} />,
          color: '#ec4899',
          bgLight: 'rgba(236, 72, 153, 0.12)',
          moduleId: 'expenses',
          permissionSlug: 'daily-expenses',
        },
        {
          id: 'cash-closing',
          title: 'Cash Closing',
          href: '/closing/daily-summary',
          icon: <Coins size={16} strokeWidth={2.2} />,
          color: '#eab308',
          bgLight: 'rgba(234, 179, 8, 0.12)',
          moduleId: 'closing',
          permissionSlug: 'cash-closing',
        },
      ],
    },
    {
      id: 'accounts',
      title: 'ACCOUNTS',
      items: [
        {
          id: 'general-voucher',
          title: 'General Voucher',
          href: '/accounting/journal?new=1',
          icon: <FileText size={16} strokeWidth={2.2} />,
          color: '#3b82f6',
          bgLight: 'rgba(59, 130, 246, 0.12)',
          moduleId: 'accounting',
          permissionSlug: 'journal-entries',
        },
      ],
    },
    {
      id: 'masters',
      title: 'ACCOUNT SETUP / MASTERS',
      items: [
        {
          id: 'customer',
          title: 'Customer',
          href: '/customers?new=1',
          icon: <Users size={16} strokeWidth={2.2} />,
          color: '#10b981',
          bgLight: 'rgba(16, 185, 129, 0.12)',
          permissionSlug: 'customers',
        },
        {
          id: 'vendor',
          title: 'Vendor',
          href: '/purchase/vendors?new=1',
          icon: <Building2 size={16} strokeWidth={2.2} />,
          color: '#0284c7',
          bgLight: 'rgba(2, 132, 199, 0.12)',
          permissionSlug: 'vendors-master',
        },
        {
          id: 'bank-account',
          title: 'Bank Account',
          href: '/accounting/banks?new=1',
          icon: <Landmark size={16} strokeWidth={2.2} />,
          color: '#6366f1',
          bgLight: 'rgba(99, 102, 241, 0.12)',
          permissionSlug: 'bank-accounts',
        },
        {
          id: 'staff',
          title: 'Staff',
          href: '/settings/staff?new=1',
          icon: <UserCheck size={16} strokeWidth={2.2} />,
          color: '#14b8a6',
          bgLight: 'rgba(20, 184, 166, 0.12)',
          adminOnly: true,
        },
        {
          id: 'route',
          title: 'Route',
          href: '/settings/routes?new=1',
          icon: <MapPin size={16} strokeWidth={2.2} />,
          color: '#f59e0b',
          bgLight: 'rgba(245, 158, 11, 0.12)',
          adminOnly: true,
        },
      ],
    },
    {
      id: 'admin',
      title: 'ADMINISTRATION',
      items: [
        {
          id: 'user-management',
          title: 'User',
          href: '/settings/users?new=1',
          icon: <ShieldCheck size={16} strokeWidth={2.2} />,
          color: '#6366f1',
          bgLight: 'rgba(99, 102, 241, 0.12)',
          adminOnly: true,
        },
      ],
    },
  ], []);

  // Filter groups dynamically by module enablement and permissions
  const filteredGroups = useMemo(() => {
    return ALL_GROUPS.map((group) => {
      const allowedItems = group.items.filter((item) => {
        // 1. Module check
        if (item.moduleId && !isModuleEnabled(item.moduleId)) {
          return false;
        }

        // 2. Feature flag check
        if (item.featureFlag && !isEnabled(item.featureFlag)) {
          return false;
        }

        // 3. Admin-only check
        if (item.adminOnly && !isAdmin) {
          return false;
        }

        // 4. Granular permission check
        if (item.permissionSlug) {
          if (!canUser(item.permissionSlug, 'access') && !isAdmin) {
            return false;
          }
        }

        // 5. Route fallback permission check (check base path before query params)
        const basePath = item.href.split('?')[0];
        if (!hasPermission(basePath) && !isAdmin) {
          return false;
        }

        return true;
      });

      return {
        ...group,
        items: allowedItems,
      };
    }).filter((g) => g.items.length > 0);
  }, [ALL_GROUPS, isModuleEnabled, isEnabled, isAdmin, canUser, hasPermission]);

  const handleItemClick = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  // Render modal in React Portal at document.body level to bypass topbar containing block
  const modalContent = isOpen && mounted ? (
    <div
      className="create-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '1.25rem',
        margin: 0,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div
        ref={modalRef}
        className="create-modal-card"
        style={{
          maxWidth: '520px',
          width: '100%',
          maxHeight: '74vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          padding: 0,
          overflow: 'hidden',
          animation: 'modalSlideUp 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Compact Header */}
        <div
          style={{
            padding: '0.85rem 1.15rem',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: 'var(--text-heading, #091326)',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Create
            </h2>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted, #64748b)',
                margin: '0.15rem 0 0 0',
                lineHeight: 1.2,
              }}
            >
              What would you like to create?
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: 'var(--radius-sm, 6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-heading, #091326)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted, #64748b)';
            }}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.85rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-surface, #ffffff)',
          }}
        >
          {filteredGroups.map((group) => (
            <div key={group.id}>
              {/* Section Title */}
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--text-muted, #64748b)',
                  marginBottom: '0.4rem',
                }}
              >
                {group.title}
              </div>

              {/* 3-Column Compact Grid */}
              <div
                className="create-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '0.5rem',
                }}
              >
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.href)}
                    className="create-action-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.5rem 0.65rem',
                      height: '52px',
                      borderRadius: '11px',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      backgroundColor: 'var(--bg-card, #ffffff)',
                      cursor: 'pointer',
                      transition: 'all 0.14s ease',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-strong, #cbd5e1)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-card-hover, #f8fafc)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle, #e2e8f0)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-card, #ffffff)';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Icon Box */}
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '7px',
                        backgroundColor: item.bgLight,
                        color: item.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>

                    {/* Title Only */}
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--text-heading, #091326)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.25,
                        flex: 1,
                      }}
                      title={item.title}
                    >
                      {item.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tiny Footer */}
        <div
          style={{
            padding: '0.5rem 1.15rem',
            borderTop: '1px solid var(--border-subtle, #e2e8f0)',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.68rem',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span
              style={{
                backgroundColor: 'var(--bg-main, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: '3px',
                padding: '0px 4px',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.62rem',
              }}
            >
              ESC
            </span>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Top Header "+ Create" Button */}
      <button
        type="button"
        onClick={toggleModal}
        className="btn btn-emerald btn-sm"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontWeight: 700,
          padding: '0.42rem 0.9rem',
          boxShadow: '0 1px 3px rgba(16, 185, 129, 0.25)',
          letterSpacing: '-0.01em',
          borderRadius: 'var(--radius-sm)',
        }}
        title="Open Create Launcher"
      >
        <Plus size={15} strokeWidth={2.6} />
        <span>Create</span>
      </button>

      {/* Render via Portal at document.body root */}
      {mounted && typeof document !== 'undefined' && createPortal(modalContent, document.body)}

      <style>{`
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @media (max-width: 580px) {
          .create-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 380px) {
          .create-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
};
