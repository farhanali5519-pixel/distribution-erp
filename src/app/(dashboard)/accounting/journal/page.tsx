'use client';

import { useState, useEffect, Fragment, useMemo } from 'react';
import { formatCurrency, formatInteger, roundCurrency, areBalancesEqual } from '@/shared/utils/currency';
import { formatBusinessReference } from '@/shared/utils/reference';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { AdminPinModal } from '@/shared/components/AdminPinModal';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { DateRangeFilter, isDateInRange } from '@/shared/components/DateRangeFilter';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { 
  FileText, 
  PlusCircle, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  UserCheck,
  Search,
  BookOpen,
  Receipt,
  X,
  Filter
} from 'lucide-react';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface FormLine {
  accountId: string;
  debit: number | '';
  credit: number | '';
  entityId?: string;
  entityType?: 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE';
  memo: string;
}

export default function JournalPage() {
  const { isEnabled } = useFeatureFlags();
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'POSTED' | 'VOID'>('ALL');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Void PIN state
  const [voidTargetEntry, setVoidTargetEntry] = useState<any | null>(null);
  const [voidTargetReason, setVoidTargetReason] = useState<string>('');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [voidingLoading, setVoidingLoading] = useState<boolean>(false);

  // Delete & Reverse state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    number: string;
    date: string;
    endpoint: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<FormLine[]>([
    { accountId: '', debit: '', credit: '', memo: '' },
    { accountId: '', debit: '', credit: '', memo: '' },
  ]);

  const fetchEntriesAndAccounts = async () => {
    try {
      const [resEntries, resAccounts, resCustomers] = await Promise.all([
        fetch('/api/accounting/journal'),
        fetch('/api/accounting/coa'),
        fetch('/api/customers'),
      ]);
      const dataEntries = await resEntries.json();
      const dataAccounts = await resAccounts.json();
      const dataCustomers = await resCustomers.json();

      if (dataEntries.success) setEntries(dataEntries.entries);
      if (dataAccounts.success) setAccounts(dataAccounts.accounts);
      if (dataCustomers.success) setCustomers(dataCustomers.customers);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntriesAndAccounts();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowForm(true);
      }
    }
  }, []);

  const accountOptions = useMemo(() => {
    return accounts.map((acc) => ({
      value: acc.id,
      label: `${acc.code} - ${acc.name}`,
      badge: acc.type,
      badgeColor: 'blue' as const,
      keywords: [acc.code, acc.name, acc.type],
    }));
  }, [accounts]);

  const customerOptions = useMemo(() => [
    { value: '', label: 'None (General)' },
    ...customers.map((c) => ({
      value: c.id,
      label: c.name,
      badge: 'Customer',
      badgeColor: 'indigo' as const,
      keywords: [c.name],
    })),
  ], [customers]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalCount = entries.length;
    const postedCount = entries.filter((e) => e.status === 'POSTED').length;
    const voidedCount = entries.filter((e) => e.status === 'VOID').length;
    const totalVolume = entries.reduce(
      (sum, e) => sum + (e.status === 'POSTED' ? (Number(e.total_amount) || 0) : 0),
      0
    );
    const modulesCount = new Set(entries.map((e) => e.source_module)).size;
    return { totalCount, postedCount, voidedCount, totalVolume, modulesCount };
  }, [entries]);

  // Filtered Entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];
    if (activeTab !== 'ALL') {
      result = result.filter((e) => e.status === activeTab);
    }
    if (moduleFilter !== 'ALL') {
      result = result.filter((e) => (e.source_module || '').toLowerCase() === moduleFilter.toLowerCase());
    }
    if (fromDate || toDate) {
      result = result.filter((e) => isDateInRange(e.entry_date, fromDate, toDate));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((e) =>
        (e.entry_number && e.entry_number.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.source_module && e.source_module.toLowerCase().includes(q))
      );
    }
    return result;
  }, [entries, activeTab, moduleFilter, searchTerm, fromDate, toDate]);

  const journalPagination = usePagination(filteredEntries);

  // Unique modules for filter
  const availableModules = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.source_module) set.add(e.source_module.toUpperCase());
    });
    return Array.from(set);
  }, [entries]);

  const moduleOptions = useMemo(() => [
    { value: 'ALL', label: 'All Modules' },
    ...availableModules.map((m) => ({
      value: m,
      label: m,
      keywords: [m],
    })),
  ], [availableModules]);

  // Compute live debit and credit totals
  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const isBalanced = areBalancesEqual(totalDebit, totalCredit) && totalDebit > 0;
  const variance = Math.abs(roundCurrency(totalDebit) - roundCurrency(totalCredit));

  const addLine = () => {
    setLines([...lines, { accountId: '', debit: '', credit: '', memo: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) {
      alert('A double-entry journal requires at least two lines.');
      return;
    }
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof FormLine, value: any) => {
    const updated = [...lines];
    if (field === 'debit' && value !== '') {
      updated[idx].credit = '';
    } else if (field === 'credit' && value !== '') {
      updated[idx].debit = '';
    }
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setActionNotice(null);

    if (!isBalanced) {
      setErrorMessage(`Unbalanced entry! Debit (${totalDebit.toFixed(2)}) must equal Credit (${totalCredit.toFixed(2)}).`);
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].accountId) {
        setErrorMessage(`Line ${i + 1} does not have an account selected.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate,
          description,
          sourceModule: 'manual',
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            memo: l.memo || undefined,
            entityId: l.entityId || undefined,
            entityType: l.entityType || undefined,
          })),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.message);
        return;
      }

      setActionNotice(`Journal voucher ${data.entry.entry_number} successfully posted with strict Paisa precision!`);
      setDescription('');
      setLines([
        { accountId: '', debit: '', credit: '', memo: '' },
        { accountId: '', debit: '', credit: '', memo: '' },
      ]);
      setShowForm(false);
      await fetchEntriesAndAccounts();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to post entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidEntry = (entry: any) => {
    const reason = prompt(`Enter audit reason for voiding voucher "${entry.entry_number}":`);
    if (!reason || reason.trim() === '') return;

    setVoidTargetEntry(entry);
    setVoidTargetReason(reason.trim());

    const requirePin = isEnabled('auth.require_admin_pin_for_void', true);
    if (requirePin) {
      setShowPinModal(true);
    } else {
      executeVoidJournal(entry, reason.trim());
    }
  };

  const executeVoidJournal = async (entry: any, reason: string, adminPin?: string) => {
    setErrorMessage(null);
    setActionNotice(null);
    setVoidingLoading(true);

    try {
      const res = await fetch('/api/accounting/journal/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journalId: entry.id,
          reason,
          adminPin: adminPin || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(`Failed to void: ${data.message}`);
        return;
      }

      setShowPinModal(false);
      setVoidTargetEntry(null);
      setActionNotice(`Entry ${entry.entry_number} voided! Offsetting reversal entry ${data.reversalEntry.entry_number} posted.`);
      await fetchEntriesAndAccounts();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setVoidingLoading(false);
    }
  };

  return (
    <ListPageContainer className="space-y-3.5">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-1 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-slate-900 text-white dark:bg-emerald-600">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-heading)]">
              Journal Entries & Vouchers
            </h1>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              <span className="numeric-text font-bold">{metrics.totalCount}</span> Vouchers
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Double-entry ledger vouchers, automated postings from sales & expenses, and manual journal entries.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="h-8 px-3 text-xs font-medium rounded-md bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 flex items-center gap-1.5 shadow-xs transition-opacity"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{showForm ? 'Close Entry Form' : 'New Journal Voucher'}</span>
        </button>
      </div>

      {/* Global Action Banner */}
      {actionNotice && (
        <div className="p-2.5 rounded-md border text-xs flex items-center justify-between shadow-xs bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}



      {/* Filter Toolbar */}
      <div className="filter-section-card p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          {/* Status Tabs */}
          <div className="inline-flex items-center bg-slate-200/70 dark:bg-slate-800/90 p-0.5 rounded-lg text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({metrics.totalCount})
            </button>
            <button
              onClick={() => setActiveTab('POSTED')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'POSTED'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Posted ({metrics.postedCount})
            </button>
            <button
              onClick={() => setActiveTab('VOID')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'VOID'
                  ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Voided ({metrics.voidedCount})
            </button>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredEntries.length}</strong> of {entries.length} vouchers</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          {/* Search Box */}
          <div className="relative sm:col-span-5">
            <label className="sr-only">Search Vouchers</label>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by Voucher #, Description, or Source Module..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-all outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Date Range Filter */}
          <div className="sm:col-span-4">
            <DateRangeFilter
              fromDate={fromDate}
              toDate={toDate}
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
              onClear={() => { setFromDate(''); setToDate(''); }}
            />
          </div>

          {/* Module Filter */}
          <div className="sm:col-span-3">
            <label className="sr-only">Filter by Module</label>
            <SearchableSelect
              options={moduleOptions}
              value={moduleFilter}
              onChange={(val) => setModuleFilter(val)}
              placeholder="All Modules"
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Manual Journal Entry Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-heading)' }}>Post New Journal Voucher</h2>
            <span className="badge badge-primary">Integer Minor-Unit Validation</span>
          </div>

          {errorMessage && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Entry Date
                </label>
                <input
                  type="date"
                  className="input"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Narration / Description
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Capital investment or owner loan adjustment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Line items table */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 110px 110px 1.2fr 1.2fr 40px', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                <div>Control Account</div>
                <div>Debit</div>
                <div>Credit</div>
                <div>Sub-Ledger Entity</div>
                <div>Memo</div>
                <div></div>
              </div>

              {lines.map((line, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.8fr 110px 110px 1.2fr 1.2fr 40px', gap: '0.5rem', padding: '0.5rem 0', alignItems: 'center' }}>
                  <SearchableSelect
                    options={accountOptions}
                    value={line.accountId}
                    onChange={(val) => updateLine(idx, 'accountId', val)}
                    placeholder="Select Account..."
                    className="w-full"
                  />

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="input font-mono"
                    value={line.debit}
                    onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                  />

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="input font-mono"
                    value={line.credit}
                    onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                  />

                  <SearchableSelect
                    options={customerOptions}
                    value={line.entityId || ''}
                    onChange={(val) => {
                      updateLine(idx, 'entityId', val || undefined);
                      updateLine(idx, 'entityType', val ? 'CUSTOMER' : undefined);
                    }}
                    placeholder="None (General)"
                    className="w-full"
                  />

                  <input
                    type="text"
                    placeholder="Optional memo"
                    className="input"
                    value={line.memo}
                    onChange={(e) => updateLine(idx, 'memo', e.target.value)}
                  />

                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" onClick={addLine} className="btn btn-outline btn-sm">
                + Add Transaction Line
              </button>

              {/* Balance Summary & Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Debit: <span className="numeric-text tabular-nums" style={{ color: '#38bdf8', fontWeight: 600 }}>{formatCurrency(totalDebit)}</span></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Credit: <span className="numeric-text tabular-nums" style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(totalCredit)}</span></div>
                </div>

                {isBalanced ? (
                  <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={14} /> BALANCED
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={14} /> Variance: {formatCurrency(variance)}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={!isBalanced || submitting}
                  className="btn btn-primary"
                  style={{ opacity: isBalanced ? 1 : 0.5 }}
                >
                  {submitting ? 'Posting...' : 'Commit Journal Entry'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Journal Entries Master Data Table - Clean, Compact ERP View */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-xs">
        {loading ? (
          <div className="text-center py-10 text-[var(--text-muted)] text-xs">
            Loading ledger entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-10 text-[var(--text-muted)]">
            <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
            <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">No journal vouchers found</p>
            <p className="text-[11px] text-slate-400">Try adjusting your search or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                  <th className="py-2.5 px-3 w-8 text-center"></th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Voucher #</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Narration</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Module</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Amount</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {journalPagination.paginatedItems.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const isVoided = entry.status === 'VOID';
                  const isReversal = entry.source_module === 'reversal';

                  return (
                    <Fragment key={entry.id}>
                      <tr 
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          isVoided ? 'opacity-60 bg-slate-50/30' : ''
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <td className="py-2 px-2 text-center text-slate-400 align-middle">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 mx-auto" /> : <ChevronRight className="w-3.5 h-3.5 mx-auto" />}
                        </td>
                        <td className="py-2 px-3 align-middle doc-identifier text-xs font-semibold whitespace-nowrap">
                          <div>
                            <BusinessReferenceLink
                              businessReference={entry.entry_number}
                              journalEntryId={entry.id}
                              sourceModule="journal"
                              showIcon={false}
                            />
                          </div>
                          {entry.businessReference && entry.businessReference !== entry.entry_number && (
                            <div className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
                              <BusinessReferenceLink
                                businessReference={entry.businessReference}
                                sourceDocumentId={entry.source_document_id}
                                sourceModule={entry.source_module}
                                journalEntryId={entry.id}
                                showIcon={true}
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 align-middle table-date text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {entry.entry_date}
                        </td>
                        <td className="py-2 px-3 align-middle max-w-[280px]">
                          <div className="font-medium text-xs text-slate-900 dark:text-slate-100 truncate" title={entry.description}>
                            <DescriptionWithReference
                              text={entry.description}
                              sourceModule={entry.source_module}
                              sourceDocumentId={entry.source_document_id}
                              journalEntryId={entry.id}
                            />
                          </div>
                          {isReversal && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200">
                              REVERSAL
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 align-middle whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {entry.source_module.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 align-middle text-right tabular-nums text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatCurrency(entry.total_amount)}
                        </td>
                        <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                          {isVoided ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              VOIDED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              POSTED
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 align-middle text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {!isVoided && entry.status === 'POSTED' && (
                              <button
                                onClick={() => handleVoidEntry(entry)}
                                className="h-7 px-2 text-[11px] rounded border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-medium inline-flex items-center gap-1 transition-colors"
                                title="Void and post offsetting reversal entry"
                              >
                                <RotateCcw className="w-3 h-3" /> Void
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  id: entry.id,
                                  number: entry.entry_number,
                                  date: entry.entry_date,
                                  endpoint: `/api/accounting/journal/${entry.id}`,
                                })
                              }
                              className="h-7 px-2 text-[11px] rounded border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-medium inline-flex items-center gap-1 transition-colors"
                              title="Delete & Reverse Journal Voucher"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Line Items Breakdown */}
                      {isExpanded && entry.lines && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/70 dark:bg-slate-900/40 p-3 border-y border-[var(--border-subtle)]">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Voucher Lines Breakdown (Paisa Precision)
                              </span>
                              {entry.reversal_of_id && (
                                <span className="text-[11px] text-amber-600 tabular-nums font-mono font-medium">
                                  Linked Reversal Of: {formatBusinessReference(entry.businessReference || entry.reversal_of_id, entry.entry_number, entry.description)}
                                </span>
                              )}
                            </div>
                            <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-[var(--border-subtle)] text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                    <th className="py-1.5 px-2.5">Control Account</th>
                                    <th className="py-1.5 px-2.5">Sub-Ledger Entity</th>
                                    <th className="py-1.5 px-2.5 text-right">Debit</th>
                                    <th className="py-1.5 px-2.5 text-right">Credit</th>
                                    <th className="py-1.5 px-2.5">Memo</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                  {entry.lines.map((l: any) => (
                                    <tr key={l.id}>
                                      <td className="py-1.5 px-2.5 tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200">
                                        {l.account_code || '—'} - {l.account_name || '—'}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-xs text-slate-600 dark:text-slate-400">
                                        {l.entity_type ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] tabular-nums bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200">
                                            {l.entity_name ? `${l.entity_type}: ${l.entity_name}` : l.entity_type}
                                          </span>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-right tabular-nums text-xs text-blue-600 dark:text-blue-400 font-medium">
                                        {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-right tabular-nums text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                        {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-xs text-slate-500">
                                        {l.memo || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls pagination={journalPagination} />
      </div>

      {/* Admin Security PIN Verification Modal */}
      <AdminPinModal
        isOpen={showPinModal}
        title={`Void Journal Voucher ${voidTargetEntry?.entry_number}`}
        description={`Authorizing void of General Ledger voucher ${voidTargetEntry?.entry_number}. This will post an offsetting reversal journal voucher.`}
        actionButtonText="Verify PIN & Void Voucher"
        onConfirm={(pin) => executeVoidJournal(voidTargetEntry, voidTargetReason, pin)}
        onCancel={() => setShowPinModal(false)}
        loading={voidingLoading}
      />

      {/* Delete & Reverse Modal */}
      {deleteTarget && (
        <DeleteTransactionModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            fetchEntriesAndAccounts();
          }}
          transaction={{
            id: deleteTarget.id,
            type: 'Journal Voucher',
            number: deleteTarget.number,
            date: deleteTarget.date,
            endpoint: deleteTarget.endpoint,
          }}
        />
      )}
    </ListPageContainer>
  );
}
