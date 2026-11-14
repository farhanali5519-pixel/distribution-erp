'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChartOfAccount } from '@/core/accounting/types';
import { LedgerEntry, LedgerResponse } from './types';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { formatBusinessReference } from '@/shared/utils/reference';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { 
  X, 
  RotateCw, 
  Download, 
  Search, 
  Filter, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  BookOpen, 
  CheckCircle2, 
  Receipt,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AccountLedgerModalProps {
  account: ChartOfAccount | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AccountLedgerModal({ account, isOpen, onClose }: AccountLedgerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [kpi, setKpi] = useState<LedgerResponse['kpi'] | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sourceModule, setSourceModule] = useState('ALL');

  // Pagination state
  const [pageSize, setPageSize] = useState<number | 'ALL'>(50);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLedger = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (sourceModule !== 'ALL') params.set('sourceModule', sourceModule);

      const url = `/api/accounting/coa/${account.id}/ledger?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load ledger data.');
      }
      setEntries(data.entries || []);
      setKpi(data.kpi || null);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err.message || 'Unable to fetch account ledger.');
    } finally {
      setLoading(false);
    }
  }, [account, searchTerm, startDate, endDate, sourceModule]);

  useEffect(() => {
    if (isOpen && account) {
      fetchLedger();
    } else {
      setEntries([]);
      setKpi(null);
      setSearchTerm('');
      setStartDate('');
      setEndDate('');
      setSourceModule('ALL');
      setCurrentPage(1);
    }
  }, [isOpen, account]);

  // Export filtered entries to CSV
  const handleExportCSV = () => {
    if (!account || entries.length === 0) return;

    const headers = [
      'Date',
      'Entry Number',
      'Module / Type',
      'Reference / Voucher',
      'Description / Memo',
      'Debit',
      'Credit',
      'Running Balance',
    ];

    const rows = entries.map(e => {
      const ref = e.businessReference || e.referenceDisplay || formatBusinessReference(e.sourceDocumentId, e.entryNumber, e.description);
      return [
        `"${e.entryDate}"`,
        `"${e.entryNumber}"`,
        `"${(e.sourceModule || '').toUpperCase()}"`,
        `"${ref.replace(/"/g, '""')}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        e.debit.toFixed(2),
        e.credit.toFixed(2),
        e.runningBalance.toFixed(2),
      ];
    });

    // Summary row
    const totalDebit = kpi?.totalDebits || 0;
    const totalCredit = kpi?.totalCredits || 0;
    const netBal = kpi?.netBalance || 0;
    rows.push([
      '"TOTALS"',
      '""',
      '""',
      '""',
      '"Summary Total"',
      totalDebit.toFixed(2),
      totalCredit.toFixed(2),
      netBal.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Account_Ledger_${account.code}_${account.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pagination calculation
  const totalEntries = entries.length;
  const paginatedEntries = useMemo(() => {
    if (pageSize === 'ALL') return entries;
    const start = (currentPage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, currentPage, pageSize]);

  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalEntries / pageSize);

  if (!isOpen || !account) return null;

  const isDebitNormal = account.normal_balance === 'DEBIT';
  const liveBalance = kpi?.currentBalance ?? (account.balance || 0);
  const isOpposite = liveBalance < 0;
  const balanceNature = isDebitNormal
    ? (liveBalance >= 0 ? 'Dr' : 'Cr')
    : (liveBalance >= 0 ? 'Cr' : 'Dr');

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'ASSET': return '#0284c7';
      case 'LIABILITY': return '#d97706';
      case 'EQUITY': return '#6366f1';
      case 'REVENUE': return '#16a34a';
      case 'EXPENSE': return '#dc2626';
      default: return '#64748b';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="relative flex flex-col w-full max-w-6xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center justify-center w-11 h-11 rounded-lg font-mono font-bold text-base shadow-sm"
              style={{
                backgroundColor: `${getTypeColor(account.type)}15`,
                color: getTypeColor(account.type),
                border: `1px solid ${getTypeColor(account.type)}35`
              }}
            >
              {account.code}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {account.name}
                </h2>
                <span 
                  className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: `${getTypeColor(account.type)}15`,
                    color: getTypeColor(account.type),
                    border: `1px solid ${getTypeColor(account.type)}30`
                  }}
                >
                  {account.type}
                </span>
                {account.is_system === 1 && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                    System Core
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Account Ledger Browser</span>
                <span>•</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {isDebitNormal ? 'Normal Debit Balance (Assets & Expenses)' : 'Normal Credit Balance (Liabilities, Equity & Revenue)'}
                </span>
                {account.parent_code && (
                  <>
                    <span>•</span>
                    <span>Parent: [{account.parent_code}] {account.parent_name}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLedger}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Refresh ledger postings"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={loading || entries.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
              title="Export filtered ledger to CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* TOP KPI CARDS */}
        <div className="px-6 py-3.5 bg-slate-50/40 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. Live Balance */}
          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/70 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Current Live Balance</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                isOpposite 
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                  : balanceNature === 'Dr' 
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}>
                {balanceNature}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold tracking-tight tabular-nums ${
                isOpposite ? 'text-rose-600 font-extrabold' : 'text-slate-900 dark:text-white'
              }`}>
                {isOpposite && '('}
                {formatCurrency(Math.abs(liveBalance))}
                {isOpposite && ')'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Live posted GL position
            </div>
          </div>

          {/* 2. Total Debits */}
          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/70 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Total Debits</span>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold bg-sky-50 dark:bg-sky-950/40 px-1 rounded">Dr</span>
            </div>
            <div className="text-xl font-bold tracking-tight tabular-nums text-sky-700 dark:text-sky-400">
              {formatCurrency(kpi?.totalDebits || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Cumulative debit turnover
            </div>
          </div>

          {/* 3. Total Credits */}
          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/70 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Total Credits</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">Cr</span>
            </div>
            <div className="text-xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(kpi?.totalCredits || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Cumulative credit turnover
            </div>
          </div>

          {/* 4. Total Transactions */}
          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/70 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Total Transactions</span>
              <Receipt size={12} className="text-slate-400" />
            </div>
            <div className="text-xl font-bold tracking-tight tabular-nums text-slate-800 dark:text-slate-100">
              {formatInteger(kpi?.totalTransactions || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Matching posted journal lines
            </div>
          </div>
        </div>

        {/* FILTERS & SEARCH BAR */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search entry #, reference, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLedger()}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-sky-500 text-slate-900 dark:text-white"
              />
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300"
                title="Date From"
              />
              <span className="text-xs text-slate-400 font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300"
                title="Date To"
              />
            </div>

            {/* Transaction Type Filter */}
            <select
              value={sourceModule}
              onChange={(e) => setSourceModule(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 focus:outline-hidden"
            >
              <option value="ALL">All Modules</option>
              <option value="sales">Sales & Invoicing</option>
              <option value="purchase">Purchase & Vendor</option>
              <option value="expenses">Expense Vouchers</option>
              <option value="returns">Sales / Purchase Returns</option>
              <option value="closing">Cash Closing / Roznamcha</option>
              <option value="manual">Manual Journal Entries</option>
            </select>

            <button
              onClick={fetchLedger}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 transition"
            >
              Apply Filter
            </button>

            {(searchTerm || startDate || endDate || sourceModule !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStartDate('');
                  setEndDate('');
                  setSourceModule('ALL');
                }}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Rows:</span>
            <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              {[50, 100, 150, 200, 'ALL'].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setPageSize(size as any);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold ${
                    pageSize === size
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LEDGER TABLE */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 min-h-[350px]">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <RotateCw className="animate-spin text-sky-600" size={28} />
              <p className="text-sm font-medium text-slate-500">Loading ledger transactions...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600">
              <p className="font-semibold text-sm">{error}</p>
              <button onClick={fetchLedger} className="mt-3 px-3 py-1.5 text-xs bg-slate-100 rounded-md font-semibold text-slate-800">
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
              <BookOpen size={36} className="text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-base font-semibold text-slate-600 dark:text-slate-300">No ledger entries found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                No posted journal transactions matched the selected filters or date period for this account.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 backdrop-blur-xs">
                <tr>
                  <th className="py-2.5 px-4 font-semibold w-28">Date</th>
                  <th className="py-2.5 px-3 font-semibold w-36">Entry #</th>
                  <th className="py-2.5 px-3 font-semibold w-24">Type</th>
                  <th className="py-2.5 px-3 font-semibold w-36">Reference</th>
                  <th className="py-2.5 px-4 font-semibold">Description / Memo</th>
                  <th className="py-2.5 px-4 font-semibold text-right w-32">Debit</th>
                  <th className="py-2.5 px-4 font-semibold text-right w-32">Credit</th>
                  <th className="py-2.5 px-4 font-semibold text-right w-36">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
                {paginatedEntries.map((row) => {
                  const isRunBalNeg = row.runningBalance < 0;
                  const runBalNature = isDebitNormal
                    ? (row.runningBalance >= 0 ? 'Dr' : 'Cr')
                    : (row.runningBalance >= 0 ? 'Cr' : 'Dr');

                  return (
                    <tr 
                      key={row.id} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 tabular-nums">
                        {row.entryDate}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        <BusinessReferenceLink
                          businessReference={row.entryNumber}
                          journalEntryId={row.journalId}
                          sourceModule="journal"
                          showIcon={false}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {row.sourceModule}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold truncate max-w-[160px]" title={row.businessReference || row.referenceDisplay || formatBusinessReference(row.sourceDocumentId, row.entryNumber, row.description)}>
                        <BusinessReferenceLink
                          businessReference={row.businessReference || row.referenceDisplay}
                          sourceDocumentId={row.sourceDocumentId}
                          sourceModule={row.sourceModule}
                          journalEntryId={row.journalId}
                          showIcon={true}
                        >
                          {row.businessReference || row.referenceDisplay || formatBusinessReference(row.sourceDocumentId, row.entryNumber, row.description)}
                        </BusinessReferenceLink>
                      </td>
                      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        <DescriptionWithReference
                          text={row.description}
                          sourceModule={row.sourceModule}
                          sourceDocumentId={row.sourceDocumentId}
                          journalEntryId={row.journalId}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={isRunBalNeg ? 'text-rose-600 font-bold' : 'text-slate-900 dark:text-white'}>
                            {isRunBalNeg && '('}
                            {formatCurrency(Math.abs(row.runningBalance))}
                            {isRunBalNeg && ')'}
                          </span>
                          <span className={`text-[9px] uppercase font-bold px-1 rounded ${
                            isRunBalNeg 
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' 
                              : runBalNature === 'Dr'
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}>
                            {runBalNature}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* BOTTOM PAGINATION & SUMMARY BAR */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {totalEntries > 0 ? (
              <span>
                Showing <strong className="text-slate-800 dark:text-slate-200">{pageSize === 'ALL' ? 1 : ((currentPage - 1) * pageSize) + 1}</strong> to{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {pageSize === 'ALL' ? totalEntries : Math.min(currentPage * pageSize, totalEntries)}
                </strong> of{' '}
                <strong className="text-slate-800 dark:text-slate-200">{totalEntries}</strong> entries
              </span>
            ) : (
              <span>0 entries</span>
            )}
          </div>

          {/* BOTTOM TOTAL SUMMARY CARDS */}
          {kpi && (
            <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-normal">Total Debit:</span>
                <span className="font-bold text-sky-700 dark:text-sky-400">{formatCurrency(kpi.totalDebits)}</span>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-normal">Total Credit:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(kpi.totalCredits)}</span>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-normal">Net Period:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(Math.abs(kpi.netBalance))}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                  (isDebitNormal ? kpi.netBalance >= 0 : kpi.netBalance < 0)
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                  {isDebitNormal ? (kpi.netBalance >= 0 ? 'Dr' : 'Cr') : (kpi.netBalance >= 0 ? 'Cr' : 'Dr')}
                </span>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {pageSize !== 'ALL' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
