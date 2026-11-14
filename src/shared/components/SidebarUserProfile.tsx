'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/shared/context/auth-context';
import { UserRole } from '@/modules/auth/types';
import {
  KeyRound,
  ChevronsUpDown,
  LogOut,
  Building2,
  ShieldCheck,
  User,
  X
} from 'lucide-react';

export interface SidebarUserProfileProps {
  isCollapsed?: boolean;
  onExpand?: () => void;
}

export const SidebarUserProfile: React.FC<SidebarUserProfileProps> = ({ isCollapsed = false, onExpand }) => {
  const { currentUser, role, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarNavId = useRef('sidebar-user-profile');

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key closes popover
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Global dropdown coordination
  useEffect(() => {
    const handleGlobalClose = (e: Event) => {
      const customEvent = e as CustomEvent<{ sourceId?: string }>;
      if (customEvent.detail?.sourceId !== sidebarNavId.current) {
        setIsOpen(false);
      }
    };
    window.addEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
    return () => window.removeEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
  }, []);

  const toggleDropdown = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('saleflow:close-all-dropdowns', {
          detail: { sourceId: sidebarNavId.current },
        })
      );
    }
    setIsOpen((prev) => !prev);
  };

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.3)', label: 'ADMIN' };
      case 'SALESMAN':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)', label: 'SALESMAN' };
      case 'CASHIER':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)', label: 'CASHIER' };
      case 'WAREHOUSE':
        return { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9', border: 'rgba(14, 165, 233, 0.3)', label: 'WAREHOUSE' };
      case 'ORDER_BOOKER':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)', label: 'BOOKER' };
      default:
        return { bg: 'var(--bg-muted)', text: 'var(--text-secondary)', border: 'var(--border-subtle)', label: r };
    }
  };

  const badge = getRoleBadgeStyle(role);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinError('New PIN must be exactly 4 digits (0-9).');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and Confirm PIN do not match.');
      return;
    }

    setPinLoading(true);
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin, currentPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update PIN.');
      }
      setPinSuccess('Admin Security PIN updated successfully!');
      setTimeout(() => {
        setShowPinModal(false);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setPinSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPinError(err.message || 'Failed to update PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('saleflow_active_user');
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setIsOpen(false);
    window.location.href = '/';
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Popover Dropdown Menu (Pops UP above footer) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            width: '100%',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            border: '1px solid var(--border-subtle)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Active Session Header */}
          <div style={{ padding: '0.75rem 0.9rem', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Logged In User
              </span>
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  backgroundColor: badge.bg,
                  color: badge.text,
                  border: `1px solid ${badge.border}`,
                  letterSpacing: '0.04em',
                }}
              >
                {badge.label}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-heading)', marginTop: '3px' }}>
              {currentUser?.full_name || 'Administrator'}
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
              @{currentUser?.username || 'admin'}
            </div>
            {currentUser?.staff_name && (
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>
                Staff: <strong>{currentUser.staff_name}</strong>
              </div>
            )}
          </div>

          {/* Account Actions */}
          <div style={{ padding: '0.35rem' }}>
            <Link
              href="/settings/users"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.775rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                e.currentTarget.style.color = 'var(--text-heading)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <User size={14} color="var(--primary)" />
              <span>Profile / Account</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setShowPinModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.775rem',
                fontWeight: 600,
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                e.currentTarget.style.color = 'var(--text-heading)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <KeyRound size={14} color="#f59e0b" />
              <span>Change Security PIN</span>
            </button>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0.3rem 0.25rem' }} />

            <button
              type="button"
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                color: '#ef4444',
                fontSize: '0.775rem',
                fontWeight: 600,
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Redesigned Sidebar Footer Profile Card - Unified Stable DOM */}
      <button
        type="button"
        onClick={() => {
          if (isCollapsed) {
            if (onExpand) onExpand();
            setIsOpen(true);
          } else {
            toggleDropdown();
          }
        }}
        title={`${currentUser?.full_name || 'System Administrator'} • ${badge.label}`}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: isCollapsed ? 0 : '0.45rem',
          padding: isCollapsed ? '0.45rem 0.25rem' : '0.65rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: isOpen ? 'var(--bg-card-hover)' : 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background-color 0.15s ease, border-color 0.15s ease, padding 0.2s ease, gap 0.2s ease',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
          }
        }}
      >
        {/* Top: Company & Edition */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxHeight: isCollapsed ? '0px' : '24px',
            opacity: isCollapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease',
            pointerEvents: isCollapsed ? 'none' : 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Building2 size={12} color="var(--primary)" />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              Farhan Distribution
            </span>
          </div>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
            Enterprise Edition
          </span>
        </div>

        {/* Bottom: Current User Info + Role Badge + Chevron */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            width: '100%',
            paddingTop: isCollapsed ? 0 : '0.25rem',
            borderTop: isCollapsed ? 'none' : '1px solid var(--border-light)',
            transition: 'padding-top 0.2s ease, border-top 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : '0.5rem', minWidth: 0 }}>
            {/* Avatar Circle */}
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: badge.bg,
                color: badge.text,
                border: `1px solid ${badge.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                flexShrink: 0,
              }}
            >
              {currentUser?.full_name?.charAt(0) || 'A'}
            </div>

            <div
              style={{
                minWidth: 0,
                maxWidth: isCollapsed ? '0px' : '140px',
                opacity: isCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease',
                pointerEvents: isCollapsed ? 'none' : 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--text-heading)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                }}
              >
                {currentUser?.full_name || 'Administrator'}
              </div>
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  padding: '0px 4px',
                  borderRadius: '3px',
                  backgroundColor: badge.bg,
                  color: badge.text,
                  border: `1px solid ${badge.border}`,
                  letterSpacing: '0.04em',
                  display: 'inline-block',
                  marginTop: '1px',
                  whiteSpace: 'nowrap',
                }}
              >
                {badge.label}
              </span>
            </div>
          </div>

          <div
            style={{
              maxWidth: isCollapsed ? '0px' : '20px',
              opacity: isCollapsed ? 0 : 1,
              overflow: 'hidden',
              flexShrink: 0,
              marginLeft: isCollapsed ? 0 : '0.25rem',
              transition: 'max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, margin-left 0.2s ease',
              pointerEvents: isCollapsed ? 'none' : 'auto',
            }}
          >
            <ChevronsUpDown size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </button>

      {/* Change Admin PIN Modal */}
      {showPinModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '400px',
              width: '100%',
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border-subtle)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                    Change Admin PIN
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Used for voiding authorization</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={18} />
              </button>
            </div>

            {pinError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', marginBottom: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {pinError}
              </div>
            )}
            {pinSuccess && (
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', marginBottom: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                {pinSuccess}
              </div>
            )}

            <form onSubmit={handleUpdatePin}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Current PIN (Optional for Admin)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  className="input font-mono"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  New 4-Digit PIN *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  className="input font-mono"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  required
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Confirm New PIN *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  className="input font-mono"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  required
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  disabled={pinLoading}
                  className="btn btn-outline btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinLoading || newPin.length !== 4}
                  className="btn btn-primary btn-sm"
                >
                  {pinLoading ? 'Saving...' : 'Save New PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
