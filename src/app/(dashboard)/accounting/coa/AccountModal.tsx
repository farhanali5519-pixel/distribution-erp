'use client';

import React, { useState, useEffect } from 'react';
import { ChartOfAccount, AccountType, NormalBalance } from '@/core/accounting/types';
import { X, PlusCircle, Edit3, AlertCircle } from 'lucide-react';
import { MAIN_HEADS, resolveAccountHead } from './types';

interface AccountModalProps {
  account: ChartOfAccount | null; // If null, creating new account; otherwise editing
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedAccount: ChartOfAccount) => void;
}

export function AccountModal({
  account,
  isOpen,
  onClose,
  onSuccess,
}: AccountModalProps) {
  const isEditing = !!account;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('ASSET');
  const [normalBalance, setNormalBalance] = useState<NormalBalance>('DEBIT');
  const [accountGroup, setAccountGroup] = useState('Assets');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setType(account.type);
      setNormalBalance(account.normal_balance);
      setAccountGroup((account as any).account_group || resolveAccountHead(account));
      setDescription(account.description || '');
      setIsActive(account.is_active);
    } else {
      setCode('');
      setName('');
      setType('ASSET');
      setNormalBalance('DEBIT');
      setAccountGroup('Assets');
      setDescription('');
      setIsActive(1);
    }
    setError(null);
  }, [account, isOpen]);

  // When type changes on create, automatically adjust normal balance and head group
  const handleTypeChange = (newType: AccountType) => {
    setType(newType);
    if (newType === 'ASSET' || newType === 'EXPENSE') {
      setNormalBalance('DEBIT');
    } else {
      setNormalBalance('CREDIT');
    }

    if (newType === 'ASSET') setAccountGroup('Assets');
    else if (newType === 'LIABILITY') setAccountGroup('Liabilities');
    else if (newType === 'EQUITY') setAccountGroup('Equity');
    else if (newType === 'REVENUE') setAccountGroup('Revenue / Income');
    else if (newType === 'EXPENSE') setAccountGroup('Expenses');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide an account title.');
      return;
    }
    if (!isEditing && !code.trim()) {
      setError('Please provide an account code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditing) {
        const res = await fetch(`/api/accounting/coa/${account.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            account_group: accountGroup,
            is_active: isActive,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to update account.');
        }

        onSuccess(data.account);
        onClose();
      } else {
        const res = await fetch('/api/accounting/coa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim(),
            name: name.trim(),
            type,
            normal_balance: normalBalance,
            account_group: accountGroup,
            description: description.trim() || null,
            is_active: isActive,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to create account.');
        }

        onSuccess(data.account);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the account.');
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
              {isEditing ? <Edit3 size={20} /> : <PlusCircle size={20} />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `Edit Account [${account.code}]` : 'Create Master Account'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing ? 'Modify account title, notes, and activity status' : 'Add a new root ledger account in the Chart of Accounts'}
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

          <div className="grid grid-cols-2 gap-3">
            {/* Account Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1026"
                disabled={isEditing}
                required
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border ${
                  isEditing 
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500'
                }`}
              />
            </div>

            {/* Main Head Group */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Main Head Group <span className="text-rose-500">*</span>
              </label>
              <select
                value={accountGroup}
                onChange={(e) => {
                  const g = e.target.value;
                  setAccountGroup(g);
                  if (g === 'Cost of Sales') {
                    setType('EXPENSE');
                    setNormalBalance('DEBIT');
                  }
                }}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                {MAIN_HEADS.map(h => (
                  <option key={h.key} value={h.key}>{h.title} ({h.codePrefix})</option>
                ))}
              </select>
            </div>
          </div>

          {!isEditing && (
            <div className="grid grid-cols-2 gap-3">
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Classification / Type
                </label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="ASSET">ASSET</option>
                  <option value="LIABILITY">LIABILITY</option>
                  <option value="EQUITY">EQUITY</option>
                  <option value="REVENUE">REVENUE</option>
                  <option value="EXPENSE">EXPENSE</option>
                </select>
              </div>

              {/* Normal Balance */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Normal Balance
                </label>
                <select
                  value={normalBalance}
                  onChange={(e) => setNormalBalance(e.target.value as NormalBalance)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
            </div>
          )}

          {/* Account Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Account Title / Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vehicle Insurance Expense"
              required
              className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description / Business Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the ledger usage, statutory rules or reconciliation guidance"
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
                Active for Double-Entry Journal Posting
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
              {loading ? 'Saving...' : isEditing ? 'Update Account' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
