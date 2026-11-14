'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/shared/context/auth-context';
import { 
  Trash2, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  Lock, 
  KeyRound,
  FileText
} from 'lucide-react';

export interface DeleteTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message?: string) => void;
  title?: string;
  transactionType?: string;
  transactionNumber?: string;
  transactionDate?: string;
  deleteUrl?: string;
  detailsSummary?: { label: string; value: string }[];
  transaction?: {
    id?: string;
    type?: string;
    number?: string;
    date?: string;
    endpoint?: string;
  };
}

export const DeleteTransactionModal: React.FC<DeleteTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title,
  transactionType,
  transactionNumber,
  transactionDate,
  deleteUrl,
  detailsSummary,
  transaction,
}) => {
  const { currentUser, role, isAdmin, verifyPin } = useAuth();

  const effectiveType = transaction?.type || transactionType || 'Transaction';
  const effectiveNumber = transaction?.number || transactionNumber || '';
  const effectiveDate = transaction?.date || transactionDate || '';
  const effectiveUrl = transaction?.endpoint || deleteUrl || '';
  const effectiveTitle = title || `Delete & Reverse ${effectiveType}`;

  const [checkingDayClose, setCheckingDayClose] = useState(true);
  const [isClosedDay, setIsClosedDay] = useState(false);
  const [closedBy, setClosedBy] = useState<string | null>(null);

  const [reason, setReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setAdminPin('');
      setErrorMessage(null);
      return;
    }

    const checkClosing = async () => {
      setCheckingDayClose(true);
      setErrorMessage(null);
      try {
        const cleanDate = (effectiveDate || '').slice(0, 10);
        const res = await fetch(`/api/closing/check?date=${cleanDate}`);
        const data = await res.json();
        if (data.success) {
          setIsClosedDay(data.isClosed);
          setClosedBy(data.closedBy);
        }
      } catch (err) {
        console.error('Failed to check closing date', err);
      } finally {
        setCheckingDayClose(false);
      }
    };

    checkClosing();
  }, [isOpen, effectiveDate]);

  if (!isOpen) return null;

  const userCanDelete = isAdmin || (adminPin.length === 4);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    if (isClosedDay) {
      if (!isAdmin && !adminPin) {
        setErrorMessage("This transaction belongs to a closed day and can only be deleted by an Administrator.");
        return;
      }
      if (!reason || !reason.trim()) {
        setErrorMessage("A mandatory deletion reason is required for administrative override on a closed day.");
        return;
      }
    }

    setSubmitting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (adminPin) headers['x-admin-pin'] = adminPin;
      if (role) headers['x-user-role'] = role;
      if (currentUser?.id) headers['x-user-id'] = currentUser.id;
      if (currentUser?.full_name || currentUser?.username) {
        headers['x-user-name'] = currentUser.full_name || currentUser.username;
      }
      if (reason) headers['x-delete-reason'] = reason;

      const res = await fetch(effectiveUrl, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          reason: reason.trim(),
          adminPin: adminPin.trim(),
          userRole: role,
          userId: currentUser?.id,
          userName: currentUser?.full_name || currentUser?.username,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || data.error || 'Failed to delete transaction.');
        return;
      }

      onSuccess(data.message || `${effectiveType} ${effectiveNumber} deleted & reversed successfully.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="modal-solid-panel bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 my-6 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-900/40">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-heading)]">{effectiveTitle}</h3>
              <p className="text-[10px] text-slate-400">Complete reversal of GL, stock & ledger records</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Details Summary */}
        <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Transaction:</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{effectiveNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Transaction Date:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{effectiveDate}</span>
          </div>
          {detailsSummary &&
            detailsSummary.map((d, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-slate-500">{d.label}:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{d.value}</span>
              </div>
            ))}
        </div>

        {/* Closed Day Alert & Logic */}
        {checkingDayClose ? (
          <div className="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto mb-1 text-blue-500" />
            <span>Checking day closing status for {effectiveDate}...</span>
          </div>
        ) : isClosedDay ? (
          <div className="space-y-2.5">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded text-xs">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900 dark:text-amber-200">
                    Closed Accounting Day
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                    This transaction belongs to a closed day and can only be deleted by an Administrator.
                  </p>
                  {closedBy && (
                    <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                      Finalized by: <span className="font-semibold">{closedBy}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* If not logged in as Admin, show Admin PIN unlock */}
            {!isAdmin && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded border border-slate-200 dark:border-slate-800 space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                  <span>Admin Security PIN Required</span>
                </label>
                <input
                  type="password"
                  maxLength={4}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 font-mono text-center tracking-widest text-sm text-[var(--text-primary)] outline-none"
                  placeholder="••••"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                />
                <p className="text-[10px] text-slate-400">
                  Enter 4-digit master Admin PIN to authorize deletion after day close.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Open day: Deletion & full reversal permitted.</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Form Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-0.5 block">
              {isClosedDay ? 'Mandatory Deletion Reason *' : 'Reason for Deletion & Reversal (Optional)'}
            </label>
            <textarea
              rows={2}
              required={isClosedDay}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-rose-500 rounded p-2 text-xs text-[var(--text-primary)] outline-none"
              placeholder={
                isClosedDay
                  ? 'Explain why this transaction is being reversed after day close...'
                  : 'e.g. Billed in error, customer requested cancellation, wrong items...'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 p-2 rounded border border-slate-200 dark:border-slate-800">
            <strong>Reversal Guarantee:</strong> Physical warehouse stock will be replenished/deducted, general ledger journal entries and lines will be reversed, and invoice/bill allocations will be restored without leaving orphan records.
          </div>

          <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || checkingDayClose || (isClosedDay && !userCanDelete)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-xs transition-colors"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Reversing & Deleting...</span>
                </>
              ) : isClosedDay ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Admin Override & Delete</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete & Reverse</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
