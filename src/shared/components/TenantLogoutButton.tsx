'use client';

import React, { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

export function TenantLogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      localStorage.removeItem('saleflow_active_user');
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <button
      onClick={handleLogout}
      type="button"
      disabled={loggingOut}
      title="Sign out of workspace"
      aria-label="Sign out of workspace"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.38rem 0.75rem',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
        cursor: loggingOut ? 'not-allowed' : 'pointer',
        fontSize: '0.78rem',
        fontWeight: 600,
        transition: 'all 0.15s ease',
        boxShadow: 'var(--shadow-xs)',
      }}
      onMouseEnter={(e) => {
        if (!loggingOut) {
          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          e.currentTarget.style.color = '#ef4444';
          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (!loggingOut) {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
        }
      }}
    >
      {loggingOut ? (
        <Loader2 size={14} className="animate-spin text-rose-500" />
      ) : (
        <LogOut size={14} />
      )}
      <span className="hidden xs:inline sm:inline">Logout</span>
    </button>
  );
}

export default TenantLogoutButton;
