'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export interface BulkDeleteResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  deletedCount: number;
  skippedCount: number;
  skippedItems: Array<{ id: string; number: string; reason: string }>;
  itemTypeLabel?: string;
}

export function BulkDeleteResultModal({
  isOpen,
  onClose,
  deletedCount,
  skippedCount,
  skippedItems,
  itemTypeLabel = 'Transactions',
}: BulkDeleteResultModalProps) {
  if (!isOpen) return null;

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
          maxWidth: '540px',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              Bulk Delete Complete
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Execution summary & safeguard report
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Counts Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={20} style={{ color: '#10b981' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Deleted / Reversed</div>
              <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                {deletedCount}
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: skippedCount > 0 ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-panel)',
              border: `1px solid ${skippedCount > 0 ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-subtle)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangle size={20} style={{ color: skippedCount > 0 ? '#f59e0b' : 'var(--text-muted)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Skipped (Protected)</div>
              <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 800, color: skippedCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                {skippedCount}
              </div>
            </div>
          </div>
        </div>

        {/* Skipped Details List if any */}
        {skippedItems.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
              Skipped Records ({skippedItems.length}):
            </div>
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              {skippedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.35rem 0.5rem',
                    background: 'var(--bg-surface)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span className="font-mono font-bold" style={{ color: 'var(--text-heading)' }}>
                    {item.number}
                  </span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>
                    {item.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
