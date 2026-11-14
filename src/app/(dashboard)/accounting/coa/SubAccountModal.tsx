'use client';

import React, { useState, useEffect } from 'react';
import { ChartOfAccount } from '@/core/accounting/types';
import { X, PlusCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SubAccountModalProps {
  parentAccount: ChartOfAccount | null;
  allAccounts: ChartOfAccount[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAccount: ChartOfAccount) => void;
}

export function SubAccountModal({
  parentAccount,
  allAccounts,
  isOpen,
  onClose,
  onSuccess,
}: SubAccountModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-suggest next sub-account code based on parent
  useEffect(() => {
    if (parentAccount) {
      // Find existing direct children of this parent
      const directChildren = allAccounts.filter(a => a.parent_id === parentAccount.id);
      
      if (directChildren.length > 0) {
        // Look for highest numerical suffix or next number
        const childCodes = directChildren.map(c => c.code);
        // If parent is 1020, children might be 1021, 1022, 1023...
        // Or if code has dash like 1020-01, 1020-02
        const numericCodes = childCodes
          .map(c => parseInt(c.replace(/[^0-9]/g, ''), 10))
          .filter(n => !isNaN(n));
        
        if (numericCodes.length > 0) {
          const maxNum = Math.max(...numericCodes);
          setCode(String(maxNum + 1));
        } else {
          setCode(`${parentAccount.code}-01`);
        }
      } else {
        // No direct children yet. Try parentCode + 1 or parentCode-01
        const parentNum = parseInt(parentAccount.code.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parentNum)) {
          // Check if parentNum + 1 is already taken by another account
          const candidate = String(parentNum + 1);
          const candidateTaken = allAccounts.some(a => a.code === candidate);
          if (!candidateTaken) {
            setCode(candidate);
          } else {
            setCode(`${parentAccount.code}-01`);
          }
        } else {
          setCode(`${parentAccount.code}-01`);
        }
      }

      setName('');
      setDescription('');
      setIsActive(1);
      setError(null);
    }
  }, [parentAccount, allAccounts]);

  if (!isOpen || !parentAccount) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please provide a sub-account code.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide an account title/name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/accounting/coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          parent_id: parentAccount.id,
          type: parentAccount.type,
          normal_balance: parentAccount.normal_balance,
          account_group: (parentAccount as any).account_group || null,
          description: description.trim() || null,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create sub-account.');
      }

      onSuccess(data.account);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the sub-account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <PlusCircle size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add Sub-Account
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create a child account nested under parent master
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Locked Parent Details */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Parent Master Account (Locked)
            </span>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  {parentAccount.code}
                </span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {parentAccount.name}
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                {parentAccount.type}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Sub-Account Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sub-Account Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1026"
                required
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Inherent Classification */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Normal Balance (Inherited)
              </label>
              <input
                type="text"
                value={`${parentAccount.normal_balance} (${parentAccount.type})`}
                disabled
                className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 font-medium cursor-not-allowed"
              />
            </div>
          </div>

          {/* Sub-Account Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sub-Account Title / Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank Alfalah Islamic (Main Branch)"
              required
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-semibold"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Operational branch details, specific purpose, etc."
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-3 pt-1">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive === 1}
                onChange={(e) => setIsActive(e.target.checked ? 1 : 0)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              <span className="ml-2.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                Active for Journal Postings
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Save Sub-Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
