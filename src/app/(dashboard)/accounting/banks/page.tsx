'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';

const bankTypeFilterOptions = [
  { value: 'ALL', label: 'All Account Types' },
  { value: 'CURRENT', label: 'Current Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'OTHER', label: 'Other Account' },
];

const bankStatusFilterOptions = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active Only' },
  { value: 'INACTIVE', label: 'Inactive Only' },
];

const bankAccountTypeOptions = [
  { value: 'CURRENT', label: 'Current Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'OTHER', label: 'Other Account' },
];

const currencyOptions = [
  { value: 'PKR', label: 'PKR - Pakistani Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'AED', label: 'AED - UAE Dirham' },
];
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import {
  Landmark,
  Plus,
  Search,
  Building2,
  FileText,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CreditCard,
  Hash,
  ShieldCheck,
  HelpCircle,
  Copy,
  Check,
  Filter
} from 'lucide-react';

interface BankAccount {
  id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string | null;
  branch_name: string | null;
  branch_code: string | null;
  account_type: 'CURRENT' | 'SAVINGS' | 'OTHER';
  currency: string;
  opening_balance: number;
  account_id: string;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  gl_account_code?: string;
  gl_account_name?: string;
  current_balance: number;
}

interface CoaOption {
  id: string;
  code: string;
  name: string;
  normal_balance: string;
}

export default function BankAccountsPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [coaOptions, setCoaOptions] = useState<CoaOption[]>([]);

  const coaSelectOptions = useMemo(() => [
    { value: '', label: '-- Choose Account from COA --' },
    ...coaOptions.map((coa) => ({
      value: coa.id,
      label: `[${coa.code}] ${coa.name}`,
      keywords: [coa.code, coa.name],
    })),
  ], [coaOptions]);
  const [nextSuggestedCode, setNextSuggestedCode] = useState('1021');
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);

  // Form State for Add / Edit
  const [formBankName, setFormBankName] = useState('');
  const [formAccountTitle, setFormAccountTitle] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formIban, setFormIban] = useState('');
  const [formBranchName, setFormBranchName] = useState('');
  const [formBranchCode, setFormBranchCode] = useState('');
  const [formAccountType, setFormAccountType] = useState<'CURRENT' | 'SAVINGS' | 'OTHER'>('CURRENT');
  const [formCurrency, setFormCurrency] = useState('PKR');
  const [formOpeningBalance, setFormOpeningBalance] = useState<number | ''>(0);
  const [formGlChoice, setFormGlChoice] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [formAccountId, setFormAccountId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Deletion Check State
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [deletionInfo, setDeletionInfo] = useState<{
    canDelete: boolean;
    message?: string;
    summary?: any;
    linkedItems?: any;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Banner Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchBankData = async () => {
    try {
      const [banksRes, coaRes, cashRes] = await Promise.all([
        fetch('/api/banking/accounts'),
        fetch('/api/banking/coa-options'),
        fetch('/api/banking/accounts?paymentDropdown=true'),
      ]);

      const banksData = await banksRes.json();
      const coaData = await coaRes.json();
      const cashData = await cashRes.json();

      if (banksData.success) {
        setBankAccounts(banksData.accounts || []);
      }
      if (coaData.success) {
        setCoaOptions(coaData.coaAccounts || []);
        if (coaData.nextSuggestedCode) {
          setNextSuggestedCode(coaData.nextSuggestedCode);
        }
      }
      if (cashData.success && cashData.cashAccounts && cashData.cashAccounts.length > 0) {
        setCashBalance(cashData.cashAccounts[0].currentBalance || 0);
      }
    } catch (err) {
      console.error('Failed to load bank data', err);
      setNotification({ type: 'error', message: 'Failed to load bank accounts.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBankData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBankData();
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  // Filtered List
  const filteredAccounts = useMemo(() => {
    return bankAccounts.filter((b) => {
      const term = search.toLowerCase();
      const matchesSearch =
        b.bank_name.toLowerCase().includes(term) ||
        b.account_title.toLowerCase().includes(term) ||
        b.account_number.toLowerCase().includes(term) ||
        (b.iban && b.iban.toLowerCase().includes(term)) ||
        (b.branch_name && b.branch_name.toLowerCase().includes(term));

      if (!matchesSearch) return false;
      if (statusFilter === 'ACTIVE' && b.is_active !== 1) return false;
      if (statusFilter === 'INACTIVE' && b.is_active !== 0) return false;
      if (typeFilter !== 'ALL' && b.account_type !== typeFilter) return false;

      return true;
    });
  }, [bankAccounts, search, statusFilter, typeFilter]);

  // Open Create Modal
  const openCreateModal = () => {
    setFormBankName('');
    setFormAccountTitle('');
    setFormAccountNumber('');
    setFormIban('');
    setFormBranchName('');
    setFormBranchCode('');
    setFormAccountType('CURRENT');
    setFormCurrency('PKR');
    setFormOpeningBalance(0);
    setFormGlChoice('AUTO');
    setFormAccountId('');
    setFormIsActive(true);
    setFormNotes('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const openEditModal = (acc: BankAccount) => {
    setSelectedAccount(acc);
    setFormBankName(acc.bank_name);
    setFormAccountTitle(acc.account_title);
    setFormAccountNumber(acc.account_number);
    setFormIban(acc.iban || '');
    setFormBranchName(acc.branch_name || '');
    setFormBranchCode(acc.branch_code || '');
    setFormAccountType(acc.account_type);
    setFormCurrency(acc.currency || 'PKR');
    setFormAccountId(acc.account_id);
    setFormIsActive(acc.is_active === 1);
    setFormNotes(acc.notes || '');
    setShowEditModal(true);
  };

  // Open View Modal
  const openViewModal = (acc: BankAccount) => {
    setSelectedAccount(acc);
    setShowViewModal(true);
  };

  // Open Delete Modal & check linked transactions
  const openDeleteModal = async (acc: BankAccount) => {
    setSelectedAccount(acc);
    setShowDeleteModal(true);
    setCheckingDependencies(true);
    setDeletionInfo(null);

    try {
      const res = await fetch(`/api/banking/accounts/${acc.id}`);
      const data = await res.json();
      if (data.success && data.dependencies) {
        setDeletionInfo(data.dependencies);
      } else {
        setDeletionInfo({
          canDelete: false,
          message: 'Could not verify transaction dependencies.',
        });
      }
    } catch (err: any) {
      setDeletionInfo({
        canDelete: false,
        message: err.message || 'Failed to check bank transaction dependencies.',
      });
    } finally {
      setCheckingDependencies(false);
    }
  };

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setNotification(null);

    try {
      const payload: any = {
        bankName: formBankName,
        accountTitle: formAccountTitle,
        accountNumber: formAccountNumber,
        iban: formIban || null,
        branchName: formBranchName || null,
        branchCode: formBranchCode || null,
        accountType: formAccountType,
        currency: formCurrency,
        openingBalance: Number(formOpeningBalance) || 0,
        isActive: formIsActive,
        notes: formNotes || null,
      };

      if (formGlChoice === 'MANUAL' && formAccountId) {
        payload.accountId = formAccountId;
      }

      const res = await fetch('/api/banking/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create bank account.');
      }

      setNotification({
        type: 'success',
        message: data.message || `Bank account "${data.bankAccount.bank_name}" created successfully!`,
      });
      setShowAddModal(false);
      await fetchBankData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error creating bank account.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setSubmitting(true);
    setNotification(null);

    try {
      const payload = {
        bankName: formBankName,
        accountTitle: formAccountTitle,
        accountNumber: formAccountNumber,
        iban: formIban || null,
        branchName: formBranchName || null,
        branchCode: formBranchCode || null,
        accountType: formAccountType,
        currency: formCurrency,
        accountId: formAccountId,
        isActive: formIsActive,
        notes: formNotes || null,
      };

      const res = await fetch(`/api/banking/accounts/${selectedAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update bank account.');
      }

      setNotification({
        type: 'success',
        message: data.message || `Bank account updated successfully!`,
      });
      setShowEditModal(false);
      await fetchBankData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error updating bank account.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!selectedAccount) return;
    setDeleting(true);
    setNotification(null);

    try {
      const res = await fetch(`/api/banking/accounts/${selectedAccount.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Deletion blocked or failed.');
      }

      setNotification({
        type: 'success',
        message: data.message || `Bank account deleted successfully.`,
      });
      setShowDeleteModal(false);
      setSelectedAccount(null);
      await fetchBankData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete bank account.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ListPageContainer className="space-y-4 pb-16">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3 rounded-md flex items-center justify-between text-xs font-medium border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[var(--text-heading)]">Bank Accounts Master</h1>
              <span className="badge badge-primary text-[10px]">Accounts &amp; Cash</span>
            </div>
            <p className="text-xs text-slate-500">
              Commercial bank master, IBANs, branch details, GL linkages, and live ledger balances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-outline btn-sm text-xs flex items-center gap-1.5"
            title="Refresh bank balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Bank Account
          </button>
        </div>
      </div>



      {/* Filter & Search Bar */}
      <div className="filter-section-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Bank Account Filters
            </span>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredAccounts.length}</strong> of{' '}
            <strong className="font-bold text-slate-900 dark:text-slate-100">{bankAccounts.length}</strong> accounts
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <label className="sr-only">Search Bank Accounts</label>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search bank name, title, account #, IBAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <div className="min-w-[160px]">
              <SearchableSelect
                value={typeFilter}
                onChange={(val) => setTypeFilter(val)}
                options={bankTypeFilterOptions}
                placeholder="All Account Types"
                searchPlaceholder="Search type..."
                size="sm"
              />
            </div>

            <div className="min-w-[130px]">
              <SearchableSelect
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as any)}
                options={bankStatusFilterOptions}
                placeholder="All Statuses"
                searchPlaceholder="Search status..."
                size="sm"
              />
            </div>

            <Link
              href="/reports/bank-statement"
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Bank Statements
            </Link>
          </div>
        </div>
      </div>

      {/* Bank Accounts Table */}
      <div className="card overflow-hidden">
        <div className="table-container">
          <table className="table text-xs">
            <thead>
              <tr>
                <th className="w-12 text-center">#</th>
                <th>Bank &amp; Account Details</th>
                <th>Account Type</th>
                <th>Linked GL Head</th>
                <th>Branch / Location</th>
                <th>Status</th>
                <th className="text-right">Opening Bal</th>
                <th className="text-right font-bold text-slate-800 dark:text-slate-200">Current Ledger Balance</th>
                <th className="w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading bank accounts...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <Landmark className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 dark:text-slate-300">No bank accounts found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {search ? 'Try adjusting your search criteria.' : 'Click "Add Bank Account" above to register your first bank.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc, index) => (
                  <tr key={acc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="text-center font-mono text-slate-400 text-[11px]">
                      {index + 1}
                    </td>

                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-[var(--text-heading)] text-xs flex items-center gap-1.5">
                            {acc.bank_name}
                            <span className="text-[11px] font-normal text-slate-500">
                              ({acc.currency})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                            {acc.account_title}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded font-semibold text-slate-700 dark:text-slate-300">
                              {acc.account_number}
                            </span>
                            <button
                              onClick={() => handleCopy(acc.account_number, acc.id)}
                              className="text-slate-400 hover:text-slate-600"
                              title="Copy account number"
                            >
                              {copiedId === acc.id ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${
                        acc.account_type === 'CURRENT'
                          ? 'badge-primary'
                          : acc.account_type === 'SAVINGS'
                          ? 'badge-success'
                          : 'badge-muted'
                      }`}>
                        {acc.account_type}
                      </span>
                    </td>

                    <td>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          [{acc.gl_account_code || '1020'}]
                        </span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={acc.gl_account_name}>
                          {acc.gl_account_name || 'Bank Account'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="text-[11px]">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {acc.branch_name || 'Main Branch'}
                        </div>
                        {acc.branch_code && (
                          <div className="font-mono text-[10px] text-slate-400">
                            Code: {acc.branch_code}
                          </div>
                        )}
                        {acc.iban && (
                          <div className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={acc.iban}>
                            {acc.iban}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      {acc.is_active === 1 ? (
                        <span className="badge badge-success flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="badge badge-muted flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </td>

                    <td className="text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {formatCurrency(acc.opening_balance || 0, acc.currency)}
                    </td>

                    <td className="text-right tabular-nums">
                      <span className={`font-bold text-sm ${
                        acc.current_balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {formatCurrency(acc.current_balance || 0, acc.currency)}
                      </span>
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/reports/bank-statement?bankAccountId=${acc.id}`}
                          className="btn btn-outline btn-xs p-1 text-blue-600 hover:bg-blue-50"
                          title="View Bank Statement"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => openViewModal(acc)}
                          className="btn btn-outline btn-xs p-1 text-slate-600 hover:bg-slate-100"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(acc)}
                          className="btn btn-outline btn-xs p-1 text-amber-600 hover:bg-amber-50"
                          title="Edit Bank"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(acc)}
                          className="btn btn-outline btn-xs p-1 text-rose-600 hover:bg-rose-50"
                          title="Delete Bank"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ADD BANK ACCOUNT MODAL */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl my-8">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-heading)]">Add Bank Account</h2>
                  <p className="text-[11px] text-slate-500">
                    Register a new commercial bank account and connect to General Ledger.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bank Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meezan Bank, HBL, MCB..."
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Account Title */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Title / Company Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Farhan Distribution Pvt Ltd"
                    value={formAccountTitle}
                    onChange={(e) => setFormAccountTitle(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 010203040506"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    className="input w-full font-mono text-xs"
                  />
                </div>

                {/* IBAN */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    IBAN (24 Characters)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PK36MEZN0001020304050601"
                    value={formIban}
                    onChange={(e) => setFormIban(e.target.value)}
                    className="input w-full font-mono text-xs uppercase"
                  />
                </div>

                {/* Branch Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main Market Gulberg Branch"
                    value={formBranchName}
                    onChange={(e) => setFormBranchName(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Branch Code */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Branch Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0123"
                    value={formBranchCode}
                    onChange={(e) => setFormBranchCode(e.target.value)}
                    className="input w-full font-mono text-xs"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Type <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formAccountType}
                    onChange={(val) => setFormAccountType(val as any)}
                    options={bankAccountTypeOptions}
                    size="sm"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Currency <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formCurrency}
                    onChange={(val) => setFormCurrency(val)}
                    options={currencyOptions}
                    size="sm"
                  />
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Opening Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formOpeningBalance}
                    onChange={(e) => setFormOpeningBalance(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input w-full tabular-nums text-right text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    If &gt; 0, automatically credited to Owner&apos;s Capital (3010).
                  </p>
                </div>

                {/* Active / Inactive Toggle */}
                <div className="flex flex-col justify-center">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Status
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Active (Appear in payment dropdowns)
                    </span>
                  </label>
                </div>
              </div>

              {/* Chart of Accounts Linkage Card */}
              <div className="p-3 rounded-lg border border-blue-200/80 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Chart of Accounts (GL) Linkage
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="glChoice"
                        checked={formGlChoice === 'AUTO'}
                        onChange={() => setFormGlChoice('AUTO')}
                        className="text-blue-600"
                      />
                      <span>Auto-Generate GL Head</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer ml-2">
                      <input
                        type="radio"
                        name="glChoice"
                        checked={formGlChoice === 'MANUAL'}
                        onChange={() => setFormGlChoice('MANUAL')}
                        className="text-blue-600"
                      />
                      <span>Select Existing Account</span>
                    </label>
                  </div>
                </div>

                {formGlChoice === 'AUTO' ? (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Will automatically create a dedicated GL Asset account with code{' '}
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">[{nextSuggestedCode}]</span>{' '}
                    named &ldquo;{formBankName || 'Bank Name'} ({formAccountNumber ? formAccountNumber.slice(-4) : 'XXXX'})&rdquo;.
                  </p>
                ) : (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Select Existing GL Asset Account <span className="text-rose-500">*</span>
                    </label>
                    <SearchableSelect
                      value={formAccountId}
                      onChange={(val) => setFormAccountId(val)}
                      options={coaSelectOptions}
                      placeholder="-- Choose Account from COA --"
                      searchPlaceholder="Search COA..."
                      size="sm"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Notes / Operating Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional account notes, authorized signatories, online portal details..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-outline btn-sm text-xs"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Save Bank Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EDIT BANK ACCOUNT MODAL */}
      {/* ======================================================== */}
      {showEditModal && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl my-8">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-heading)]">Edit Bank Account</h2>
                  <p className="text-[11px] text-slate-500">
                    Modify bank details, branch info, or change active status.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bank Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Account Title */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formAccountTitle}
                    onChange={(e) => setFormAccountTitle(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    className="input w-full font-mono text-xs"
                  />
                </div>

                {/* IBAN */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    IBAN
                  </label>
                  <input
                    type="text"
                    value={formIban}
                    onChange={(e) => setFormIban(e.target.value)}
                    className="input w-full font-mono text-xs uppercase"
                  />
                </div>

                {/* Branch Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={formBranchName}
                    onChange={(e) => setFormBranchName(e.target.value)}
                    className="input w-full text-xs"
                  />
                </div>

                {/* Branch Code */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Branch Code
                  </label>
                  <input
                    type="text"
                    value={formBranchCode}
                    onChange={(e) => setFormBranchCode(e.target.value)}
                    className="input w-full font-mono text-xs"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Account Type <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formAccountType}
                    onChange={(val) => setFormAccountType(val as any)}
                    options={bankAccountTypeOptions}
                    size="sm"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Currency <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formCurrency}
                    onChange={(val) => setFormCurrency(val)}
                    options={currencyOptions}
                    size="sm"
                  />
                </div>

                {/* Linked GL Account */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Linked GL Account <span className="text-rose-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formAccountId}
                    onChange={(val) => setFormAccountId(val)}
                    options={coaSelectOptions}
                    placeholder="-- Choose Account from COA --"
                    searchPlaceholder="Search COA..."
                    size="sm"
                  />
                </div>

                {/* Active / Inactive Toggle */}
                <div className="flex flex-col justify-center">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Status
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Active (Appear in payment dropdowns)
                    </span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-outline btn-sm text-xs"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Update Bank Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW BANK ACCOUNT MODAL */}
      {/* ======================================================== */}
      {showViewModal && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-heading)]">{selectedAccount.bank_name}</h2>
                  <p className="text-[11px] text-slate-500">Account Details &amp; GL Status</p>
                </div>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Current Live Balance</span>
                  <span className={`text-lg font-bold tabular-nums ${
                    selectedAccount.current_balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {formatCurrency(selectedAccount.current_balance, selectedAccount.currency)}
                  </span>
                </div>
                <Link
                  href={`/reports/bank-statement?bankAccountId=${selectedAccount.id}`}
                  className="btn btn-primary btn-xs text-xs flex items-center gap-1"
                  onClick={() => setShowViewModal(false)}
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Statement
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block text-[11px]">Account Title</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedAccount.account_title}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Account Number</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedAccount.account_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">IBAN</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{selectedAccount.iban || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Account Type</span>
                  <span className="badge badge-primary">{selectedAccount.account_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Branch Name</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedAccount.branch_name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Branch Code</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{selectedAccount.branch_code || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Linked GL Head</span>
                  <span className="font-mono font-bold text-blue-600">[{selectedAccount.gl_account_code}] {selectedAccount.gl_account_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Opening Balance</span>
                  <span className="tabular-nums font-medium">{formatCurrency(selectedAccount.opening_balance, selectedAccount.currency)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Status</span>
                  {selectedAccount.is_active === 1 ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-muted">Inactive</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Created At</span>
                  <span className="text-slate-500">{new Date(selectedAccount.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {selectedAccount.notes && (
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <span className="text-slate-400 block text-[11px] mb-0.5">Notes</span>
                  <p className="text-slate-600 dark:text-slate-400 text-xs italic">{selectedAccount.notes}</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[var(--border-subtle)] flex justify-end">
              <button
                onClick={() => setShowViewModal(false)}
                className="btn btn-outline btn-sm text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DELETE CONFIRMATION & DEPENDENCY BLOCK MODAL (Requirement 4) */}
      {/* ======================================================== */}
      {showDeleteModal && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-base text-[var(--text-heading)]">Delete Bank Account</h3>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {checkingDependencies ? (
                <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                  Checking transaction links for &ldquo;{selectedAccount.bank_name}&rdquo;...
                </div>
              ) : deletionInfo && !deletionInfo.canDelete ? (
                /* DELETION BLOCKED: Linked Transactions Exist */
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-800 dark:text-rose-300">
                    <p className="font-bold text-sm mb-1 flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                      <XCircle className="w-4 h-4" /> Deletion Strictly Blocked
                    </p>
                    <p className="leading-relaxed">
                      Bank account <b>&ldquo;{selectedAccount.bank_name} - {selectedAccount.account_number}&rdquo;</b> cannot be deleted because it is actively referenced in existing financial transactions.
                    </p>
                    <p className="mt-2 font-semibold">
                      Please delete or reverse these linked transactions first:
                    </p>
                  </div>

                  {/* Breakdown of linked items */}
                  <div className="max-h-52 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 bg-slate-50/50 dark:bg-slate-900/30 text-xs">
                    {deletionInfo.linkedItems?.customerPayments?.length > 0 && (
                      <div>
                        <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1 flex items-center gap-1">
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                          Customer Receipts ({deletionInfo.linkedItems.customerPayments.length}):
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {deletionInfo.linkedItems.customerPayments.slice(0, 5).map((p: any) => (
                            <li key={p.id}>
                              <span className="font-mono font-semibold">{p.number}</span> ({p.date}) &mdash; {formatCurrency(p.amount, 'PKR')} from {p.party}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {deletionInfo.linkedItems?.vendorPayments?.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1 flex items-center gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                          Vendor Payments ({deletionInfo.linkedItems.vendorPayments.length}):
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {deletionInfo.linkedItems.vendorPayments.slice(0, 5).map((p: any) => (
                            <li key={p.id}>
                              <span className="font-mono font-semibold">{p.number}</span> ({p.date}) &mdash; {formatCurrency(p.amount, 'PKR')} to {p.party}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {deletionInfo.linkedItems?.expenses?.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1 flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                          Daily Expenses ({deletionInfo.linkedItems.expenses.length}):
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {deletionInfo.linkedItems.expenses.slice(0, 5).map((e: any) => (
                            <li key={e.id}>
                              <span className="font-mono font-semibold">{e.number}</span> ({e.date}) &mdash; {formatCurrency(e.amount, 'PKR')} ({e.description})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {deletionInfo.linkedItems?.journalEntries?.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-purple-600" />
                          General Journals ({deletionInfo.linkedItems.journalEntries.length}):
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {deletionInfo.linkedItems.journalEntries.slice(0, 5).map((j: any) => (
                            <li key={j.id}>
                              <span className="font-mono font-semibold">{j.number}</span> ({j.date}) &mdash; {j.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* CAN DELETE SAFELY */
                <div className="space-y-2 text-xs">
                  <p className="text-slate-700 dark:text-slate-300">
                    Are you sure you want to delete bank account <b>&ldquo;{selectedAccount.bank_name} - {selectedAccount.account_number}&rdquo;</b>?
                  </p>
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[11px]">
                    <CheckCircle2 className="w-4 h-4 inline mr-1 text-emerald-600" />
                    No active transactions are linked to this bank account. It can be safely removed.
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-outline btn-sm text-xs"
                disabled={deleting}
              >
                Close
              </button>
              {deletionInfo?.canDelete && (
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="btn btn-sm text-xs bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
                >
                  {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Permanent Deletion
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
