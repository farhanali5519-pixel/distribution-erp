'use client';

import React from 'react';
import { Printer, Trash2, X, CheckSquare } from 'lucide-react';

export interface BulkActionToolbarProps {
  selectedCount: number;
  onPrint?: () => void;
  onDelete?: () => void;
  onClear: () => void;
  canPrint?: boolean;
  canDelete?: boolean;
  itemTypeLabel?: string;
  isProcessing?: boolean;
}

export function BulkActionToolbar({
  selectedCount,
  onPrint,
  onDelete,
  onClear,
  canPrint = true,
  canDelete = true,
  itemTypeLabel = 'Items',
  isProcessing = false,
}: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="bulk-action-toolbar animate-in fade-in slide-in-from-top-2 duration-200"
      style={{
        background: 'var(--primary)',
        color: '#ffffff',
        borderRadius: 'var(--radius-md)',
        padding: '0.65rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <CheckSquare size={18} style={{ color: '#38bdf8' }} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
          <span className="tabular-nums font-extrabold">{selectedCount}</span> {itemTypeLabel} Selected
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {canPrint && onPrint && (
          <button
            type="button"
            onClick={onPrint}
            disabled={isProcessing}
            className="btn btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            <Printer size={15} />
            <span>Print Batch</span>
          </button>
        )}

        {canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isProcessing}
            className="btn btn-sm"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={15} />
            <span>Delete / Reverse</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={isProcessing}
          className="btn btn-sm"
          style={{
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.8)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
            padding: '0.35rem 0.5rem',
          }}
          title="Clear all selections"
        >
          <X size={15} />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
}
