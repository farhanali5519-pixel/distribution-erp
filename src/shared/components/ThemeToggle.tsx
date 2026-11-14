'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check stored preference or default to light
    const savedTheme = localStorage.getItem('saleflow_theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'light';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('saleflow_theme', nextTheme);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('saleflow-theme-changed', { detail: { theme: nextTheme } }));
    }
  };

  if (!mounted) {
    return (
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      />
    );
  }

  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className="theme-toggle-btn"
      title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
      aria-label={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.38rem 0.7rem',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.78rem',
        fontWeight: 500,
        transition: 'all 0.15s ease',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {isLight ? (
        <>
          <Sun size={15} color="#eab308" style={{ filter: 'drop-shadow(0 0 4px rgba(234, 179, 8, 0.4))' }} />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon size={15} color="#38bdf8" style={{ filter: 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.5))' }} />
          <span>Dark</span>
        </>
      )}
    </button>
  );
}
