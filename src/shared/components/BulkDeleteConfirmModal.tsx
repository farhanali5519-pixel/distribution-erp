'use client';

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Lock, KeyRound } from 'lucide-react';

export interface BulkDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, adminPin: string) => Promise<void>;
  count: number;
  itemTypeLabel: string;
  isProcessing?: boolean;
}

export function BulkDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  count,
  itemTypeLabel,
  isProcessing = false,
}: BulkDeleteConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(reason.trim(), adminPin.trim());
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-modal-overlay)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '520px',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Trash2 size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                Delete {count} Selected {itemTypeLabel}?
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Batch reversal & safety check
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Warning callout */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.825rem',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.35rem' }}>
            <AlertTriangle size={16} />
            <span>Permanent Business & Accounting Reversal</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            For each selected transaction, this action will automatically:
          </p>
          <ul style={{ paddingLeft: '1.2rem', marginTop: '0.35rem', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
            <li>Reverse physical inventory movements and replenish/restore warehouse stock</li>
            <li>Cancel associated general ledger journal entries</li>
            <li>Restore customer / vendor receivable & payable balances</li>
            <li>Roll back payment allocations</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Reason Input */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.35rem' }}>
              Deletion / Reversal Reason
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Bulk correction / User data entry error"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isProcessing}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          {/* Admin Override PIN (Optional unless day closed) */}
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setShowPinInput(!showPinInput)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.775rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                padding: 0,
                marginBottom: showPinInput ? '0.5rem' : '0',
              }}
            >
              <KeyRound size={13} />
              <span>{showPinInput ? 'Hide Admin Override PIN' : 'Closed Day Override? Enter Admin PIN'}</span>
            </button>

            {showPinInput && (
              <div style={{ marginTop: '0.35rem' }}>
                <input
                  type="password"
                  maxLength={6}
                  className="input font-mono w-full"
                  placeholder="Enter 4-digit Admin PIN"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  disabled={isProcessing}
                  style={{ fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Required only if one or more transactions fall on an already closed accounting day.
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="btn"
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
              }}
            >
              {isProcessing ? 'Processing Reversals...' : `Delete / Reverse ${count} ${itemTypeLabel}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
