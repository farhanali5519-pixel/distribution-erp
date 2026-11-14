'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { Button } from '@/shared/components/Button';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Calendar, 
  Search, 
  DollarSign, 
  Truck, 
  User, 
  FileText, 
  ArrowRight,
  RefreshCw,
  XCircle,
  Clock,
  Filter
} from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { AdminPinModal } from '@/shared/components/AdminPinModal';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface StaffOption {
  id: string;
  name: string;
  role: string;
  phone: string | null;
}

interface ExpenseItem {
  id: string;
  voucher_number: string;
  expense_date: string;
  expense_account_id: string;
  expense_account_name?: string;
  expense_account_code?: string;
  paid_from_account_id: string;
  paid_from_account_name?: string;
  paid_from_account_code?: string;
  amount: number;
  staff_id?: string | null;
  staff_name?: string | null;
  vehicle_number?: string | null;
  description: string;
  journal_entry_id: string;
  journal_entry_number?: string;
  status: 'POSTED' | 'VOID';
  created_at: string;
}

export default function ExpensesPage() {
  const { isEnabled } = useFeatureFlags();
  const expensesEnabled = isEnabled('expenses.enable_daily_expenses');

  // Form State
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [paidFromAccountId, setPaidFromAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [staffId, setStaffId] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');

  // Dropdown Metadata
  const [expenseAccounts, setExpenseAccounts] = useState<AccountOption[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<AccountOption[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffOption[]>([]);

  // List & Filter State
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);

  // Notifications
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Void Modal State
  const [voidModalExpense, setVoidModalExpense] = useState<ExpenseItem | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);
  const [showPinModal, setShowPinModal] = useState<boolean>(false);

  // Delete & Reverse Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    number: string;
    date: string;
    endpoint: string;
  } | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Fetch Metadata and Initial List
  const loadData = async (dateParam?: string) => {
    try {
      setLoading(true);
      const queryDate = dateParam !== undefined ? dateParam : selectedDateFilter;
      const url = queryDate ? `/api/expenses?date=${queryDate}` : '/api/expenses';

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setExpenses(data.expenses || []);
        if (data.expenseAccounts) setExpenseAccounts(data.expenseAccounts);
        if (data.paymentAccounts) {
          setPaymentAccounts(data.paymentAccounts);
          // Default to 1010 Cash in Hand if not selected
          if (!paidFromAccountId) {
            const cashAcc = data.paymentAccounts.find((a: AccountOption) => a.code === '1010');
            if (cashAcc) setPaidFromAccountId(cashAcc.id);
          }
        }
        if (data.staffMembers) setStaffMembers(data.staffMembers);

        // Default to first expense head if not set
        if (!expenseAccountId && data.expenseAccounts && data.expenseAccounts.length > 0) {
          setExpenseAccountId(data.expenseAccounts[0].id);
        }
      } else {
        throw new Error(data.message || 'Failed to load expenses data.');
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error loading expenses', isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDateFilter]);

  const expenseAccountOptions = useMemo(() => {
    return expenseAccounts.map((acc) => ({
      value: acc.id,
      label: `[${acc.code}] ${acc.name}`,
      badge: 'Expense',
      badgeColor: 'rose' as const,
      subLabel: acc.description || undefined,
      keywords: [acc.code, acc.name, acc.description || ''],
    }));
  }, [expenseAccounts]);

  const paymentAccountOptions = useMemo(() => {
    return paymentAccounts.map((acc) => ({
      value: acc.id,
      label: `[${acc.code}] ${acc.name}`,
      badge: acc.code === '1010' ? 'Cash' : 'Bank',
      badgeColor: 'blue' as const,
      keywords: [acc.code, acc.name],
    }));
  }, [paymentAccounts]);

  const staffOptions = useMemo(() => [
    { value: '', label: '-- No Staff Assigned --' },
    ...staffMembers.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.role,
      badgeColor: 'indigo' as const,
      keywords: [s.name, s.role, s.phone || ''],
    })),
  ], [staffMembers]);

  // Handle Create Expense
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setStatusMessage({ text: 'Please enter a valid expense amount.', isError: true });
      amountInputRef.current?.focus();
      return;
    }

    if (!description.trim()) {
      setStatusMessage({ text: 'Please enter a description for this expense.', isError: true });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseDate,
          expenseAccountId,
          paidFromAccountId,
          amount: numAmount,
          description: description.trim(),
          staffId: staffId || null,
          vehicleNumber: vehicleNumber.trim() || null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save expense.');
      }

      setStatusMessage({
        text: `Expense voucher ${data.expense.voucher_number} saved and posted to General Ledger!`,
        isError: false,
      });

      // Reset form fields while preserving date & payment account for fast continuous entry
      setAmount('');
      setDescription('');
      setVehicleNumber('');

      // Reload list
      loadData();

      // Refocus amount input for fast entry
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'An error occurred.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Void Expense
  const handleConfirmVoid = async () => {
    if (!voidModalExpense) return;
    if (!voidReason.trim()) {
      alert('Please provide an audit reason for voiding this voucher.');
      return;
    }

    const requirePin = isEnabled('auth.require_admin_pin_for_void', true);
    if (requirePin) {
      setShowPinModal(true);
      return;
    }

    await executeVoidExpense();
  };

  const executeVoidExpense = async (adminPin?: string) => {
    if (!voidModalExpense) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/expenses/${voidModalExpense.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: voidReason.trim(),
          adminPin: adminPin || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to void expense voucher.');
      }

      setStatusMessage({
        text: `Voucher ${voidModalExpense.voucher_number} voided and reversed in GL!`,
        isError: false,
      });

      setShowPinModal(false);
      setVoidModalExpense(null);
      setVoidReason('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to void voucher.');
    } finally {
      setVoiding(false);
    }
  };

  // Filtered List
  const filteredExpenses = expenses.filter((exp) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      exp.voucher_number.toLowerCase().includes(term) ||
      exp.description.toLowerCase().includes(term) ||
      (exp.expense_account_name && exp.expense_account_name.toLowerCase().includes(term)) ||
      (exp.vehicle_number && exp.vehicle_number.toLowerCase().includes(term)) ||
      (exp.staff_name && exp.staff_name.toLowerCase().includes(term))
    );
  });


  // If Feature Flag is Disabled
  if (!expensesEnabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', background: '#ffffff', border: '1px solid #e2e8f0' }}>
        <ShieldAlert size={48} color="#f59e0b" style={{ margin: '0 auto 1.5rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>
          Daily Operational Expenses Workflow is Disabled
        </h2>
        <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto 1.75rem' }}>
          The feature flag <code className="font-mono">expenses.enable_daily_expenses</code> is currently toggled OFF in system settings.
        </p>
        <Link href="/settings/features" className="btn btn-primary">
          Open Settings & Enable Workflow
        </Link>
      </div>
    );
  }

  const expensesPagination = usePagination(filteredExpenses);

  return (
    <ListPageContainer style={{ paddingBottom: '3rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Daily Expenses
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/closing/daily-summary" className="btn btn-outline btn-sm" style={{ background: '#ffffff' }}>
            Daily Cash Closing <ArrowRight size={14} style={{ marginLeft: '4px' }} />
          </Link>
          <Link href="/accounting/journal" className="btn btn-outline btn-sm" style={{ background: '#ffffff' }}>
            GL Vouchers
          </Link>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div
          style={{
            background: statusMessage.isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${statusMessage.isError ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            color: statusMessage.isError ? '#b91c1c' : '#15803d',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* SECTION 1: Fast Expense Entry Form */}
      <div
        style={{
          padding: '1.5rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={18} style={{ color: '#0284c7' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Expense Entry
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            {/* Expense Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Voucher Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                required
                className="input tabular-nums"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            {/* Expense Head (Account) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Expense Category <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <SearchableSelect
                options={expenseAccountOptions}
                value={expenseAccountId}
                onChange={(val) => setExpenseAccountId(val)}
                placeholder="Select Expense Head..."
                className="w-full"
              />
            </div>

            {/* Paid From (Cash / Bank) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Paid From (Credit) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <SearchableSelect
                options={paymentAccountOptions}
                value={paidFromAccountId}
                onChange={(val) => setPaidFromAccountId(val)}
                placeholder="Select Payment Account..."
                className="w-full"
              />
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Amount <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                ref={amountInputRef}
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '1rem', fontWeight: 700, textAlign: 'right', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0284c7' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* Staff / Driver */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Staff Member / Driver (Optional)
              </label>
              <SearchableSelect
                options={staffOptions}
                value={staffId}
                onChange={(val) => setStaffId(val)}
                placeholder="-- No Staff Assigned --"
                className="w-full"
              />
            </div>

            {/* Vehicle Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Vehicle # (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. LES-4412 / Van #3"
                className="input"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>
                Description / Memo <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Fuel for Murree Route Van, driver lunch, tire puncture repair..."
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => {
                setAmount('');
                setDescription('');
                setVehicleNumber('');
              }}
              className="btn btn-outline btn-sm"
              style={{ padding: '0.5rem 1rem', background: '#ffffff' }}
            >
              Clear Form
            </button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              icon={<Receipt size={16} />}
            >
              {submitting ? 'Posting Voucher...' : 'Save & Post Expense'}
            </Button>
          </div>
        </form>
      </div>



      {/* SECTION 3: Expense Log & Filters */}
      {/* Distinct Filter Section Card */}
      <div className="filter-section-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Expense Log Filters
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Filter expense vouchers by date or keyword.
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredExpenses.length}</strong> of{' '}
            <strong className="font-bold text-slate-900 dark:text-slate-100">{expenses.length}</strong> vouchers
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Filter & Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Voucher Date:
            </span>
            <input
              type="date"
              className="filter-input-control text-xs py-1.5 px-2.5 rounded-lg tabular-nums text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setSelectedDateFilter(new Date().toISOString().split('T')[0])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                selectedDateFilter === new Date().toISOString().split('T')[0]
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateFilter('')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                selectedDateFilter === ''
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              All Dates
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <label className="sr-only">Search Expenses</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search memo, voucher, van..."
              className="filter-input-control pl-9 pr-3 py-1.5 text-xs rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 w-64 focus:ring-1 focus:ring-blue-500"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">

        {/* Table */}
        <div className="table-container">
          <table className="table" style={{ minWidth: '950px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '130px' }}>Voucher #</th>
                <th style={{ width: '95px' }}>Date</th>
                <th style={{ width: '190px' }}>Expense Head</th>
                <th style={{ width: '140px' }}>Paid From</th>
                <th>Description / Reason</th>
                <th style={{ width: '160px' }}>Staff / Vehicle</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Amount</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    Loading expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No expense vouchers recorded for the selected filter.
                  </td>
                </tr>
              ) : (
                expensesPagination.paginatedItems.map((exp) => (
                  <tr key={exp.id}>
                    <td>
                      <span className="payment-id">
                        <BusinessReferenceLink
                          businessReference={exp.voucher_number}
                          sourceDocumentId={exp.id}
                          sourceModule="expenses"
                          transactionType="Expense Voucher"
                        />
                      </span>
                    </td>
                    <td className="table-date">
                      {exp.expense_date}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>
                        {exp.expense_account_name || 'Expense Head'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }} className="font-mono">
                        Code: {exp.expense_account_code}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: exp.paid_from_account_code === '1010' ? '#fef2f2' : '#f0f9ff',
                          color: exp.paid_from_account_code === '1010' ? '#b91c1c' : '#0369a1',
                          border: `1px solid ${exp.paid_from_account_code === '1010' ? '#fecaca' : '#bae6fd'}`,
                        }}
                      >
                        {exp.paid_from_account_code === '1010' ? 'Cash in Hand' : 'Bank Transfer'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        <DescriptionWithReference text={exp.description} />
                      </div>
                      {exp.journal_entry_number && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          GL Entry:{' '}
                          <BusinessReferenceLink
                            businessReference={exp.journal_entry_number}
                            journalEntryId={exp.journal_entry_id}
                            sourceModule="journal"
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {exp.staff_name && (
                        <div>
                          <User size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          {exp.staff_name}
                        </div>
                      )}
                      {exp.vehicle_number && (
                        <div className="font-mono" style={{ color: '#0284c7', fontWeight: 600 }}>
                          <Truck size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          {exp.vehicle_number}
                        </div>
                      )}
                      {!exp.staff_name && !exp.vehicle_number && <span style={{ color: '#94a3b8' }}>--</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: exp.status === 'VOID' ? '#94a3b8' : 'var(--text-primary)' }} className="tabular-nums">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {exp.status === 'POSTED' ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                          }}
                        >
                          POSTED
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                          }}
                        >
                          VOID
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        {exp.status === 'POSTED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setVoidModalExpense(exp);
                              setVoidReason('');
                            }}
                            className="btn btn-outline btn-sm"
                            style={{
                              padding: '0.2rem 0.45rem',
                              fontSize: '0.7rem',
                              color: '#e11d48',
                              borderColor: '#fecdd3',
                              background: '#ffffff',
                            }}
                            title="Void Voucher"
                          >
                            Void
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              id: exp.id,
                              number: exp.voucher_number,
                              date: exp.expense_date,
                              endpoint: `/api/expenses/${exp.id}`,
                            })
                          }
                          className="btn btn-outline btn-sm"
                          style={{
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.7rem',
                            color: '#b91c1c',
                            borderColor: '#fecaca',
                            background: '#fff1f2',
                          }}
                          title="Delete & Reverse Expense"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={expensesPagination} />
      </div>

      {/* VOID AUDIT MODAL */}
      {voidModalExpense && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: '480px',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#b91c1c', marginBottom: '0.75rem' }}>
              <AlertCircle size={22} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Void Expense Voucher</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              You are voiding voucher <strong>{voidModalExpense.voucher_number}</strong> for{' '}
              <strong className="tabular-nums">{formatCurrency(voidModalExpense.amount)}</strong>. An offsetting reversal
              voucher will be immediately posted to the General Ledger to credit back the cash/bank account.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Audit Void Reason <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Duplicate entry, incorrect receipt amount, voucher entered by mistake..."
                className="input"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                style={{ width: '100%', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVoidModalExpense(null)}
                disabled={voiding}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmVoid}
                loading={voiding}
              >
                {voiding ? 'Reversing...' : 'Confirm & Reverse GL Entry'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Security PIN Verification Modal */}
      <AdminPinModal
        isOpen={showPinModal}
        title={`Void Expense Voucher ${voidModalExpense?.voucher_number}`}
        description={`Authorizing void of voucher ${voidModalExpense?.voucher_number}. This will post an offsetting reversal journal entry and cancel this expense disbursement.`}
        actionButtonText="Verify PIN & Void Voucher"
        onConfirm={(pin) => executeVoidExpense(pin)}
        onCancel={() => setShowPinModal(false)}
        loading={voiding}
      />

      {/* Delete & Reverse Modal */}
      {deleteTarget && (
        <DeleteTransactionModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadData(selectedDateFilter);
          }}
          transaction={{
            id: deleteTarget.id,
            type: 'Expense Voucher',
            number: deleteTarget.number,
            date: deleteTarget.date,
            endpoint: deleteTarget.endpoint,
          }}
        />
      )}
    </ListPageContainer>
  );
}
