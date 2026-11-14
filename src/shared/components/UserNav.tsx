'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/shared/context/auth-context';
import { UserRole, AppUser } from '@/modules/auth/types';
import { 
  User, 
  ChevronDown, 
  ShieldCheck, 
  Users, 
  KeyRound, 
  Check, 
  TrendingUp, 
  CreditCard, 
  Package, 
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export const UserNav: React.FC = () => {
  const { currentUser, allUsers, switchUser, role, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const userNavId = useRef('user-nav-dropdown');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key closes UserNav
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

  // Global dropdown coordination: close if another dropdown opens
  useEffect(() => {
    const handleGlobalClose = (e: Event) => {
      const customEvent = e as CustomEvent<{ sourceId?: string }>;
      if (customEvent.detail?.sourceId !== userNavId.current) {
        setIsOpen(false);
      }
    };
    window.addEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
    return () => window.removeEventListener('saleflow:close-all-dropdowns', handleGlobalClose);
  }, []);

  const toggleUserNav = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('saleflow:close-all-dropdowns', {
            detail: { sourceId: userNavId.current },
          })
        );
      }
      return next;
    });
  };

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe', label: 'ADMIN' };
      case 'SALESMAN':
        return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'SALESMAN' };
      case 'CASHIER':
        return { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: 'CASHIER' };
      case 'WAREHOUSE':
        return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'WAREHOUSE' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: r };
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

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Top Navbar Trigger */}
      <button
        type="button"
        onClick={toggleUserNav}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.35rem 0.65rem',
          borderRadius: '0.5rem',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          cursor: 'pointer',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          transition: 'all 0.15s ease',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: badge.bg,
            color: badge.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.8rem',
          }}
        >
          {currentUser?.full_name?.charAt(0) || 'U'}
        </div>

        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
            {currentUser?.full_name || 'Administrator'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '1px' }}>
            <span
              style={{
                fontSize: '0.65rem',
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
        </div>

        <ChevronDown size={14} style={{ color: '#94a3b8', marginLeft: '0.25rem' }} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '290px',
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* User Header */}
          <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
              Active Session
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {currentUser?.full_name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>
              Username: <span className="font-mono" style={{ color: '#0284c7' }}>@{currentUser?.username}</span>
            </div>
            {currentUser?.staff_name && (
              <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '2px' }}>
                Linked Staff: <strong>{currentUser.staff_name}</strong>
              </div>
            )}
          </div>

          {/* Quick Role Switcher */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.725rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <Sparkles size={12} color="#0284c7" /> Quick Switch Role
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {allUsers.map((u) => {
                const b = getRoleBadgeStyle(u.role);
                const isCurrent = currentUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      switchUser(u);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '0.375rem',
                      border: isCurrent ? `1px solid ${b.border}` : '1px solid transparent',
                      backgroundColor: isCurrent ? b.bg : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.backgroundColor = '#f1f5f9';
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: b.bg,
                          color: b.text,
                          border: `1px solid ${b.border}`,
                        }}
                      >
                        {b.label}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                        {u.full_name}
                      </span>
                    </div>
                    {isCurrent && <Check size={14} style={{ color: b.text }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Administrative Links */}
          <div style={{ padding: '0.5rem' }}>
            {isAdmin && (
              <Link
                href="/settings/users"
                onClick={() => setIsOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  color: '#334155',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Users size={16} style={{ color: '#0284c7' }} />
                <span>User Management</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setShowPinModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                color: '#334155',
                fontSize: '0.825rem',
                fontWeight: 600,
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <KeyRound size={16} style={{ color: '#f59e0b' }} />
              <span>Change Admin Security PIN</span>
            </button>
          </div>
        </div>
      )}

      {/* Change Admin PIN Modal */}
      {showPinModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
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
              maxWidth: '420px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Change Admin PIN
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Used for transaction voiding authorization</span>
              </div>
            </div>

            {pinError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {pinError}
              </div>
            )}
            {pinSuccess && (
              <div style={{ backgroundColor: '#f0fdf4', color: '#16a34a', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {pinSuccess}
              </div>
            )}

            <form onSubmit={handleUpdatePin}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
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

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
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

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  disabled={pinLoading}
                  className="btn btn-outline"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinLoading || newPin.length !== 4}
                  className="btn btn-primary"
                  style={{ fontSize: '0.85rem' }}
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
