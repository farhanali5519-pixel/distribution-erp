'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, KeyRound, X, CheckCircle2 } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  actionButtonText?: string;
  onConfirm: (pin: string) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  title = 'Admin Authorization Required',
  description = 'Please enter your 4-digit Admin Security PIN to authorize this financial voiding/reversal transaction.',
  actionButtonText = 'Authorize & Void Transaction',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    setError(null);
    try {
      await onConfirm(pin);
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    }
  };

  return (
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
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Security Audit Control</span>
          </div>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          {description}
        </p>

        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.8rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '0.4rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Enter 4-Digit Admin PIN
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="password"
                maxLength={4}
                autoComplete="off"
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="input font-mono"
                style={{
                  width: '100%',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                  textAlign: 'center',
                  padding: '0.65rem 1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  color: '#0f172a',
                  background: '#f8fafc',
                }}
              />
              <KeyRound
                size={18}
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.35rem', textAlign: 'center' }}>
              Default system PIN is 1234
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn btn-outline"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="btn"
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                opacity: loading || pin.length !== 4 ? 0.6 : 1,
                cursor: loading || pin.length !== 4 ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Verifying & Reversing...' : actionButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
