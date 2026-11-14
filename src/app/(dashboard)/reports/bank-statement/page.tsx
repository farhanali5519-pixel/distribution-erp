'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { formatBusinessReference } from '@/shared/utils/reference';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import {
  Landmark,
  FileText,
  Calendar,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Download,
  RefreshCw,
  CreditCard,
  Building2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowLeft
} from 'lucide-react';

interface BankAccountOption {
  id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string | null;
  branch_name: string | null;
  branch_code: string | null;
  account_type: string;
  currency: string;
  current_balance: number;
  gl_account_code?: string;
  gl_account_name?: string;
}

interface BankStatementLine {
  date: string;
  voucherNumber: string;
  entryNumber?: string;
  businessReference?: string;
  sourceModule: string;
  transactionType: string;
  description: string;
  memo: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
}

interface StatementReport {
  bankAccount: BankAccountOption;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netMovement: number;
  closingBalance: number;
  lines: BankStatementLine[];
}

function BankStatementContent() {
  const searchParams = useSearchParams();
  const initialBankId = searchParams.get('bankAccountId') || '';

  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>(initialBankId);

  // Date filters
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = `${today.slice(0, 7)}-01`;
  const [fromDate, setFromDate] = useState<string>(firstDayOfMonth);
  const [toDate, setToDate] = useState<string>(today);

  const [loading, setLoading] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [statement, setStatement] = useState<StatementReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all bank accounts for dropdown
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await fetch('/api/banking/accounts');
        const data = await res.json();
        if (data.success && data.accounts) {
          setBankAccounts(data.accounts);
          if (!selectedBankId && data.accounts.length > 0) {
            setSelectedBankId(data.accounts[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load bank accounts', err);
      } finally {
        setLoadingBanks(false);
      }
    };
    fetchBanks();
  }, []);

  const bankAccountOptions = useMemo(() => {
    return bankAccounts.map((b) => ({
      value: b.id,
      label: `${b.bank_name} - ${b.account_number}`,
      subLabel: `${b.account_title} • ${b.account_type || 'Checking'} • Bal: ${formatCurrency(b.current_balance, b.currency)}`,
      badge: b.currency && b.currency !== 'PKR' ? b.currency : undefined,
      badgeColor: 'blue' as const,
      keywords: [b.bank_name, b.account_number, b.account_title, b.iban || '', b.branch_name || ''],
    }));
  }, [bankAccounts]);

  // Fetch statement when bank or dates change
  const fetchStatement = async (bankIdToFetch?: string) => {
    const targetId = bankIdToFetch || selectedBankId;
    if (!targetId) return;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/banking/statement?bankAccountId=${targetId}&fromDate=${fromDate}&toDate=${toDate}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch bank statement.');
      }

      setStatement(data.statement);
    } catch (err: any) {
      setError(err.message || 'Error generating statement.');
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBankId) {
      fetchStatement(selectedBankId);
    }
  }, [selectedBankId]);

  // Quick Date Preset Handlers
  const handlePreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'ALL_TIME') => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    if (preset === 'THIS_MONTH') {
      const start = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      const end = today;
      setFromDate(start);
      setToDate(end);
    } else if (preset === 'LAST_MONTH') {
      const start = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
      const end = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
      setFromDate(start);
      setToDate(end);
    } else if (preset === 'LAST_30') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setFromDate(thirtyDaysAgo);
      setToDate(today);
    } else if (preset === 'THIS_YEAR') {
      const start = `${currentYear}-01-01`;
      setFromDate(start);
      setToDate(today);
    } else if (preset === 'ALL_TIME') {
      setFromDate('2020-01-01');
      setToDate(today);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedBank = useMemo(() => {
    return bankAccounts.find((b) => b.id === selectedBankId);
  }, [bankAccounts, selectedBankId]);

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'PAYMENT_RECEIVED':
      case 'CUSTOMER_COLLECTION':
        return (
          <span className="badge badge-success flex items-center gap-1 w-fit">
            <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> Inflow / Receipt
          </span>
        );
      case 'PAYMENT_MADE':
        return (
          <span className="badge badge-primary flex items-center gap-1 w-fit">
            <ArrowUpRight className="w-3 h-3 text-blue-600" /> Outflow / Vendor
          </span>
        );
      case 'EXPENSE_PAYMENT':
        return (
          <span className="badge badge-warning flex items-center gap-1 w-fit">
            <CreditCard className="w-3 h-3 text-amber-600" /> Expense Paid
          </span>
        );
      case 'OPENING_BALANCE':
        return (
          <span className="badge badge-muted flex items-center gap-1 w-fit">
            <Landmark className="w-3 h-3 text-slate-500" /> Opening Bal
          </span>
        );
      default:
        return (
          <span className="badge badge-muted flex items-center gap-1 w-fit">
            <FileText className="w-3 h-3 text-slate-500" /> Journal Entry
          </span>
        );
    }
  };

  return (
    <ListPageContainer className="space-y-4 pb-16 print:p-0 print:m-0 print:max-w-none">
      {/* Header Banner - hidden in print */}
      <div className="print:hidden bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/accounting/banks"
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Bank Accounts Master"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[var(--text-heading)]">Bank-wise Ledger &amp; Statement</h1>
              <span className="badge badge-primary text-[10px]">Report</span>
            </div>
            <p className="text-xs text-slate-500">
              Chronological bank account statement, deposits, withdrawals, and live running balance ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchStatement()}
            disabled={loading}
            className="btn btn-outline btn-sm text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Statement
          </button>
        </div>
      </div>

      {/* Filter Toolbar - hidden in print */}
      <div className="print:hidden filter-section-card p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Statement Filters
            </span>
          </div>

          {/* Quick Date Range Pills */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mr-1">Quick Range:</span>
            <button
              onClick={() => handlePreset('THIS_MONTH')}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => handlePreset('LAST_MONTH')}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              Last Month
            </button>
            <button
              onClick={() => handlePreset('LAST_30')}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => handlePreset('THIS_YEAR')}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              This Year
            </button>
            <button
              onClick={() => handlePreset('ALL_TIME')}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              All Time
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Select Bank */}
          <div className="md:col-span-6">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
              Select Bank Account <span className="text-rose-500">*</span>
            </label>
            <SearchableSelect
              options={bankAccountOptions}
              value={selectedBankId}
              onChange={(val) => {
                setSelectedBankId(val);
                fetchStatement(val);
              }}
              placeholder={loadingBanks ? "Loading accounts..." : "-- Select Bank Account --"}
              className="w-full"
            />
          </div>

          {/* Date Range */}
          <div className="md:col-span-4">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
              Date Range (From → To)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <button
              onClick={() => fetchStatement()}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Landmark className="w-3.5 h-3.5" />
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="card p-4 bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Statement Sheet / printable report */}
      {statement && (
        <div className="space-y-4 print:space-y-3">
          {/* Bank Profile Header Card */}
          <div className="card p-4 bg-gradient-to-r from-blue-50/50 via-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-slate-800 border-blue-200/60 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text-heading)]">
                    {statement.bankAccount.bank_name}
                  </h2>
                  <span className="badge badge-primary text-[10px]">
                    {statement.bankAccount.account_type}
                  </span>
                  <span className="numeric-text text-xs text-blue-600 font-semibold">
                    [{statement.bankAccount.gl_account_code || '1020'}]
                  </span>
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5">
                  Title: {statement.bankAccount.account_title}
                </div>
                <div className="text-xs text-slate-500 numeric-text mt-0.5 flex items-center gap-3 flex-wrap">
                  <span>A/C: <b className="text-slate-700 dark:text-slate-300">{statement.bankAccount.account_number}</b></span>
                  {statement.bankAccount.iban && <span>IBAN: {statement.bankAccount.iban}</span>}
                  {statement.bankAccount.branch_name && <span>Branch: {statement.bankAccount.branch_name}</span>}
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-[11px] text-slate-500 block">Statement Period</span>
                <span className="table-date text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {statement.fromDate} &mdash; {statement.toDate}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Currency: {statement.bankAccount.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Statement Financial KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Opening Balance */}
            <div className="card p-3">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Opening Balance
              </span>
              <div className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(statement.openingBalance, statement.bankAccount.currency)}
              </div>
              <span className="text-[10px] text-slate-400">As of {statement.fromDate}</span>
            </div>

            {/* Total Deposits (Debits) */}
            <div className="card p-3 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Total Deposits
                </span>
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatCurrency(statement.totalDeposits, statement.bankAccount.currency)}
              </div>
              <span className="text-[10px] text-emerald-600/80">Inflows during period</span>
            </div>

            {/* Total Withdrawals (Credits) */}
            <div className="card p-3 bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                  Total Withdrawals
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-base font-bold tabular-nums text-blue-700 dark:text-blue-300">
                {formatCurrency(statement.totalWithdrawals, statement.bankAccount.currency)}
              </div>
              <span className="text-[10px] text-blue-600/80">Outflows during period</span>
            </div>

            {/* Net Movement */}
            <div className="card p-3">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Net Period Change
              </span>
              <div className={`text-base font-bold tabular-nums ${
                statement.netMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {statement.netMovement > 0 ? '+' : ''}{formatCurrency(statement.netMovement, statement.bankAccount.currency)}
              </div>
              <span className="text-[10px] text-slate-400">Deposits - Withdrawals</span>
            </div>

            {/* Closing Balance */}
            <div className="card p-3 bg-gradient-to-br from-indigo-50/60 to-blue-50/40 dark:from-indigo-950/30 dark:to-blue-950/20 border-indigo-200/60 col-span-2 lg:col-span-1">
              <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                Closing Ledger Balance
              </span>
              <div className={`text-lg font-bold tabular-nums tracking-tight ${
                statement.closingBalance >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600'
              }`}>
                {formatCurrency(statement.closingBalance, statement.bankAccount.currency)}
              </div>
              <span className="text-[10px] text-indigo-600/80">As of {statement.toDate}</span>
            </div>
          </div>

          {/* Statement Transaction Ledger Table */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-heading)]">
                Chronological Bank Statement &amp; Running Ledger
              </h3>
              <span className="text-[11px] text-slate-400">
                <span className="numeric-text font-bold">{statement.lines.length}</span> transaction(s)
              </span>
            </div>

            <div className="table-container">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th className="w-24">Date</th>
                    <th className="w-32">Voucher / Ref #</th>
                    <th>Type</th>
                    <th>Description &amp; Narrative</th>
                    <th className="text-right w-28">Deposits (+)</th>
                    <th className="text-right w-28">Withdrawals (-)</th>
                    <th className="text-right w-32 font-bold text-slate-800 dark:text-slate-200">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="bg-slate-50/80 dark:bg-slate-800/40 font-semibold border-b">
                    <td className="table-date text-slate-600">{statement.fromDate}</td>
                    <td className="doc-identifier text-slate-500">OPENING</td>
                    <td>
                      <span className="badge badge-muted">Balance B/F</span>
                    </td>
                    <td className="italic text-slate-600 dark:text-slate-400">
                      Brought forward opening balance prior to {statement.fromDate}
                    </td>
                    <td className="text-right text-slate-400">&mdash;</td>
                    <td className="text-right text-slate-400">&mdash;</td>
                    <td className="text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(statement.openingBalance, statement.bankAccount.currency)}
                    </td>
                  </tr>

                  {/* Transaction lines */}
                  {statement.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 italic">
                        No transactions recorded for this bank account in the selected date range.
                      </td>
                    </tr>
                  ) : (
                    statement.lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="table-date text-[11px] text-slate-600 dark:text-slate-400">
                          {line.date}
                        </td>
                        <td className="doc-identifier font-semibold">
                          <BusinessReferenceLink
                            businessReference={line.businessReference || line.voucherNumber}
                            entryNumber={line.entryNumber}
                            sourceDocumentId={line.sourceDocumentId}
                            journalEntryId={line.journalEntryId}
                            sourceModule={line.sourceModule}
                            transactionType={line.transactionType}
                          >
                            {formatBusinessReference(line.businessReference || line.voucherNumber, line.entryNumber, line.description)}
                          </BusinessReferenceLink>
                        </td>
                        <td>{getTransactionBadge(line.transactionType)}</td>
                        <td>
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            <DescriptionWithReference
                              text={line.description}
                              sourceModule={line.sourceModule}
                              sourceDocumentId={line.sourceDocumentId}
                              journalEntryId={line.journalEntryId}
                            />
                          </div>
                          {line.memo && (
                            <div className="text-[10px] text-slate-400 italic mt-0.5">
                              <DescriptionWithReference
                                text={line.memo}
                                sourceModule={line.sourceModule}
                                sourceDocumentId={line.sourceDocumentId}
                                journalEntryId={line.journalEntryId}
                              />
                            </div>
                          )}
                        </td>
                        <td className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                          {line.debit > 0 ? formatCurrency(line.debit, statement.bankAccount.currency) : <span className="text-slate-300 font-normal">&mdash;</span>}
                        </td>
                        <td className="text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {line.credit > 0 ? formatCurrency(line.credit, statement.bankAccount.currency) : <span className="text-slate-300 font-normal">&mdash;</span>}
                        </td>
                        <td className="text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(line.runningBalance, statement.bankAccount.currency)}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Closing Balance Row */}
                  <tr className="bg-slate-100/80 dark:bg-slate-800/70 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                    <td colSpan={4} className="text-right uppercase tracking-wider text-slate-700 dark:text-slate-300 text-[11px]">
                      Totals &amp; Closing Balance ({statement.toDate}):
                    </td>
                    <td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400 text-xs">
                      {formatCurrency(statement.totalDeposits, statement.bankAccount.currency)}
                    </td>
                    <td className="text-right tabular-nums text-blue-700 dark:text-blue-400 text-xs">
                      {formatCurrency(statement.totalWithdrawals, statement.bankAccount.currency)}
                    </td>
                    <td className="text-right tabular-nums text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      {formatCurrency(statement.closingBalance, statement.bankAccount.currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}

export default function BankStatementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Bank Statement...</div>}>
      <BankStatementContent />
    </Suspense>
  );
}
