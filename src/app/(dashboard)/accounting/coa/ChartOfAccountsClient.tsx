'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChartOfAccount } from '@/core/accounting/types';
import { 
  MainAccountHead, 
  MAIN_HEADS, 
  resolveAccountHead, 
  EnrichedAccount 
} from './types';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { AccountLedgerModal } from './AccountLedgerModal';
import { SubAccountModal } from './SubAccountModal';
import { AccountModal } from './AccountModal';
import { ImportAccountsModal } from './ImportAccountsModal';
import {
  BookOpen,
  PlusCircle,
  Upload,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Shield,
  Edit2,
  Trash2,
  Power,
  RotateCw,
  FolderTree,
  ArrowDownLeft,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  CornerDownRight,
  AlertTriangle,
  Info
} from 'lucide-react';

interface ChartOfAccountsClientProps {
  initialAccounts: ChartOfAccount[];
}

export function ChartOfAccountsClient({ initialAccounts }: ChartOfAccountsClientProps) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>(initialAccounts);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Expand / Collapse state for heads and parent accounts
  const [collapsedHeads, setCollapsedHeads] = useState<Record<string, boolean>>({});
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Modals state
  const [ledgerAccount, setLedgerAccount] = useState<ChartOfAccount | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  const [subAccountParent, setSubAccountParent] = useState<ChartOfAccount | null>(null);
  const [isSubAccountOpen, setIsSubAccountOpen] = useState(false);

  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);

  // Delete modal/prompt state
  const [deletingAccount, setDeletingAccount] = useState<ChartOfAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Re-fetch accounts from API
  const refreshAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/coa');
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (e) {
      console.error('Failed to refresh chart of accounts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle Head group collapse
  const toggleHead = (headKey: string) => {
    setCollapsedHeads(prev => ({ ...prev, [headKey]: !prev[headKey] }));
  };

  // Toggle parent account collapse in tree
  const toggleParent = (accId: string) => {
    setExpandedParents(prev => ({ ...prev, [accId]: !prev[accId] }));
  };

  // Expand All / Collapse All
  const handleExpandAll = () => {
    setCollapsedHeads({});
    const allParentIds: Record<string, boolean> = {};
    accounts.forEach(a => {
      allParentIds[a.id] = true;
    });
    setExpandedParents(allParentIds);
  };

  const handleCollapseAll = () => {
    const allHeads: Record<string, boolean> = {};
    MAIN_HEADS.forEach(h => {
      allHeads[h.key] = true;
    });
    setCollapsedHeads(allHeads);
    setExpandedParents({});
  };

  // Toggle Active / Deactivate account
  const handleToggleActive = async (acc: ChartOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newStatus = acc.is_active === 1 ? 0 : 1;
      const res = await fetch(`/api/accounting/coa/${acc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, is_active: newStatus } : a));
      }
    } catch (err) {
      console.error('Failed to toggle active status:', err);
    }
  };

  // Handle Delete Confirmation
  const confirmDelete = async () => {
    if (!deletingAccount) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/accounting/coa/${deletingAccount.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete account.');
      }
      setAccounts(prev => prev.filter(a => a.id !== deletingAccount.id));
      setDeletingAccount(null);
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during deletion.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Export visible chart to CSV
  const handleExportChart = () => {
    if (accounts.length === 0) return;

    const headers = [
      'Account Code',
      'Account Name',
      'Parent Account',
      'Main Head Group',
      'Account Type',
      'Normal Balance',
      'Live Balance',
      'Total Debits',
      'Total Credits',
      'Transactions Count',
      'Sub-Accounts Count',
      'Is System Account',
      'Active Status',
      'Description',
    ];

    const rows = accounts.map(a => {
      const head = resolveAccountHead(a);
      return [
        `"${a.code}"`,
        `"${a.name.replace(/"/g, '""')}"`,
        a.parent_code ? `"[${a.parent_code}] ${(a.parent_name || '').replace(/"/g, '""')}"` : '""',
        `"${head}"`,
        `"${a.type}"`,
        `"${a.normal_balance}"`,
        (a.balance || 0).toFixed(2),
        (a.total_debits || 0).toFixed(2),
        (a.total_credits || 0).toFixed(2),
        (a.transaction_count || 0).toString(),
        (a.sub_account_count || 0).toString(),
        a.is_system === 1 ? 'YES' : 'NO',
        a.is_active === 1 ? 'ACTIVE' : 'INACTIVE',
        `"${(a.description || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Chart_of_Accounts_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group accounts by Head and build visual tree
  const groupedTree = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    // Map all accounts with head
    const enriched: EnrichedAccount[] = accounts.map(a => ({
      ...a,
      head: resolveAccountHead(a),
    }));

    // Filter by search term if provided
    let filtered = enriched;
    if (term) {
      filtered = enriched.filter(a => 
        a.code.toLowerCase().includes(term) ||
        a.name.toLowerCase().includes(term) ||
        (a.description && a.description.toLowerCase().includes(term)) ||
        (a.parent_code && a.parent_code.toLowerCase().includes(term)) ||
        a.type.toLowerCase().includes(term) ||
        a.head.toLowerCase().includes(term)
      );
    }

    // Build hierarchy within each head
    const result: Record<MainAccountHead, {
      accounts: EnrichedAccount[];
      count: number;
      totalDebits: number;
      totalCredits: number;
      totalBalance: number;
    }> = {
      'Assets': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
      'Liabilities': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
      'Equity': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
      'Revenue / Income': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
      'Cost of Sales': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
      'Expenses': { accounts: [], count: 0, totalDebits: 0, totalCredits: 0, totalBalance: 0 },
    };

    // Index all accounts by ID
    const accountMap = new Map<string, EnrichedAccount>();
    enriched.forEach(a => accountMap.set(a.id, { ...a, children: [] }));

    // Group accounts
    filtered.forEach(acc => {
      const headGroup = result[acc.head];
      if (headGroup) {
        headGroup.count++;
        headGroup.totalDebits += (acc.total_debits || 0);
        headGroup.totalCredits += (acc.total_credits || 0);
        headGroup.totalBalance += (acc.balance || 0);
      }
    });

    // Populate tree for each head
    MAIN_HEADS.forEach(h => {
      const headAccs = filtered.filter(a => a.head === h.key);
      const headAccMap = new Map<string, EnrichedAccount>();
      headAccs.forEach(a => headAccMap.set(a.id, { ...a, children: [] }));

      const roots: EnrichedAccount[] = [];

      headAccs.forEach(a => {
        const item = headAccMap.get(a.id)!;
        if (a.parent_id && headAccMap.has(a.parent_id)) {
          headAccMap.get(a.parent_id)!.children!.push(item);
        } else {
          roots.push(item);
        }
      });

      result[h.key].accounts = roots;
    });

    return result;
  }, [accounts, searchTerm]);

  // Open Ledger for account
  const handleOpenLedger = (acc: ChartOfAccount) => {
    setLedgerAccount(acc);
    setIsLedgerOpen(true);
  };

  // Open Add Sub-Account modal
  const handleAddSubAccount = (parentAcc: ChartOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setSubAccountParent(parentAcc);
    setIsSubAccountOpen(true);
  };

  // Open Edit modal
  const handleEditAccount = (acc: ChartOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAccount(acc);
    setIsAccountModalOpen(true);
  };

  // Prompt delete
  const handleDeleteClick = (acc: ChartOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingAccount(acc);
    setDeleteError(null);
  };

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

  // Recursive renderer for account rows with nesting
  const renderAccountNode = (acc: EnrichedAccount, depth: number = 0) => {
    const hasChildren = acc.children && acc.children.length > 0;
    const isExpanded = expandedParents[acc.id] ?? (depth === 0 ? true : false);
    const isDebitNormal = acc.normal_balance === 'DEBIT';
    const liveBal = acc.balance || 0;
    const isOpposite = liveBal < 0;
    const balNature = isDebitNormal
      ? (liveBal >= 0 ? 'Dr' : 'Cr')
      : (liveBal >= 0 ? 'Cr' : 'Dr');

    const canDelete = acc.is_system !== 1 && (acc.transaction_count || 0) === 0 && (acc.sub_account_count || 0) === 0;

    return (
      <React.Fragment key={acc.id}>
        <tr
          onClick={() => handleOpenLedger(acc)}
          className={`cursor-pointer transition-colors group ${
            depth > 0 
              ? 'bg-slate-50/50 dark:bg-slate-800/30 hover:bg-sky-50/60 dark:hover:bg-sky-950/30' 
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
          } ${acc.is_active === 0 ? 'opacity-60 bg-slate-100/40 dark:bg-slate-900/40' : ''}`}
        >
          {/* Account Code & Hierarchy Toggle */}
          <td className="py-2.5 px-3">
            <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
              {depth > 0 && (
                <CornerDownRight size={13} className="text-slate-400 shrink-0" />
              )}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleParent(acc.id);
                  }}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition shrink-0"
                  title={isExpanded ? 'Collapse sub-accounts' : 'Expand sub-accounts'}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <span 
                className="numeric-text font-bold text-xs tracking-tight"
                style={{ color: getTypeColor(acc.type) }}
              >
                {acc.code}
              </span>
            </div>
          </td>

          {/* Account Title & Subtitle */}
          <td className="py-2.5 px-3">
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-xs ${
                depth === 0 ? 'text-slate-900 dark:text-white text-[13px]' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {acc.name}
              </span>
              {hasChildren && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {acc.children!.length} {acc.children!.length === 1 ? 'sub-account' : 'sub-accounts'}
                </span>
              )}
              {acc.is_active === 0 && (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Inactive
                </span>
              )}
            </div>
            {acc.description && (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-sm mt-0.5">
                {acc.description}
              </div>
            )}
          </td>

          {/* Classification Badge */}
          <td className="py-2.5 px-3">
            <span 
              className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${getTypeColor(acc.type)}12`,
                color: getTypeColor(acc.type),
                border: `1px solid ${getTypeColor(acc.type)}30`
              }}
            >
              {acc.type}
            </span>
          </td>

          {/* Normal Balance */}
          <td className="py-2.5 px-3">
            {acc.normal_balance === 'DEBIT' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                <ArrowDownLeft size={11} /> DEBIT
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                <ArrowUpRight size={11} /> CREDIT
              </span>
            )}
          </td>

          {/* LIVE BALANCE PILL */}
          <td className="py-2.5 px-4 text-right">
            <div className="inline-flex items-center justify-end gap-1.5 tabular-nums font-semibold text-xs">
              <span className={isOpposite ? 'text-rose-600 font-extrabold' : 'text-slate-900 dark:text-white'}>
                {isOpposite && '('}
                {formatCurrency(Math.abs(liveBal))}
                {isOpposite && ')'}
              </span>
              <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                isOpposite 
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                  : balNature === 'Dr'
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              }`}>
                {balNature}
              </span>
            </div>
          </td>

          {/* System Account Indicator */}
          <td className="py-2.5 px-3">
            {acc.is_system === 1 ? (
              <span 
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                title="System protected account: Required for core ERP postings"
              >
                <Shield size={11} className="text-slate-500" /> Core Locked
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                Custom
              </span>
            )}
          </td>

          {/* ROW ACTIONS (Right-side) */}
          <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
              {/* Add Sub-Account */}
              <button
                type="button"
                onClick={(e) => handleAddSubAccount(acc, e)}
                className="p-1.5 rounded-md hover:bg-sky-50 dark:hover:bg-sky-950/60 text-slate-500 hover:text-sky-600 transition"
                title="Add sub-account under this parent"
              >
                <PlusCircle size={14} />
              </button>

              {/* Open Ledger */}
              <button
                type="button"
                onClick={() => handleOpenLedger(acc)}
                className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-500 hover:text-indigo-600 transition"
                title="Open detailed general ledger"
              >
                <BookOpen size={14} />
              </button>

              {/* Edit */}
              <button
                type="button"
                onClick={(e) => handleEditAccount(acc, e)}
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                title="Edit account title & notes"
              >
                <Edit2 size={13} />
              </button>

              {/* Active / Deactivate Toggle */}
              <button
                type="button"
                onClick={(e) => handleToggleActive(acc, e)}
                className={`p-1.5 rounded-md transition ${
                  acc.is_active === 1 
                    ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60' 
                    : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={acc.is_active === 1 ? 'Deactivate account' : 'Activate account'}
              >
                <Power size={13} />
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={(e) => handleDeleteClick(acc, e)}
                disabled={acc.is_system === 1}
                className={`p-1.5 rounded-md transition ${
                  acc.is_system === 1
                    ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60'
                }`}
                title={
                  acc.is_system === 1 
                    ? 'System account cannot be deleted' 
                    : (acc.transaction_count || 0) > 0 
                      ? 'Account has recorded transactions — deactivate instead' 
                      : 'Delete custom account'
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </td>
        </tr>

        {/* Render child accounts if expanded */}
        {hasChildren && isExpanded && acc.children!.map((child) => renderAccountNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <ListPageContainer>
      <div className="space-y-5">
        {/* PAGE HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Chart of Accounts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enterprise general ledger master, visual account hierarchy, and interactive balance ledgers.
            </p>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refreshAccounts}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Refresh chart of accounts"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportChart}
              disabled={accounts.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Export all accounts to CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setIsImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Import accounts from CSV"
            >
              <Upload size={13} />
              <span>Import CSV</span>
            </button>

            <button
              onClick={() => {
                setEditingAccount(null);
                setIsAccountModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition"
            >
              <PlusCircle size={14} />
              <span>Add Account</span>
            </button>
          </div>
        </div>

        {/* SEARCH & GLOBAL TREE CONTROLS */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by account code, title, or classification..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExpandAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <Maximize2 size={12} />
              <span>Expand All</span>
            </button>

            <button
              onClick={handleCollapseAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <Minimize2 size={12} />
              <span>Collapse All</span>
            </button>
          </div>
        </div>

        {/* MAIN HEADS ACCORDION SECTIONS */}
        <div className="space-y-4">
          {MAIN_HEADS.map((headDef) => {
            const headData = groupedTree[headDef.key];
            const isCollapsed = !!collapsedHeads[headDef.key];
            const accountCount = headData?.count || 0;
            const rootAccounts = headData?.accounts || [];

            return (
              <div
                key={headDef.key}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition"
              >
                {/* HEAD SECTION HEADER */}
                <div
                  onClick={() => toggleHead(headDef.key)}
                  className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 cursor-pointer flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 transition select-none"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
                    >
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>

                    <div className="flex items-center gap-2">
                      <span 
                        className="text-xs px-2 py-0.5 rounded font-mono font-bold tracking-tight"
                        style={{
                          backgroundColor: headDef.badgeBg,
                          color: headDef.badgeColor,
                          border: `1px solid ${headDef.badgeBorder}`
                        }}
                      >
                        {headDef.codePrefix}
                      </span>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {headDef.title}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300">
                        {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
                      </span>
                    </div>

                    <span className="hidden md:inline-block text-xs text-slate-400 dark:text-slate-500 truncate max-w-md">
                      — {headDef.description}
                    </span>
                  </div>

                  {/* Group Net Balance Rollup */}
                  <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                    <span className="text-slate-400 font-normal">Head Balance:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-[13px]">
                      {formatCurrency(Math.abs(headData?.totalBalance || 0))}
                    </span>
                  </div>
                </div>

                {/* HEAD SECTION BODY TABLE */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    {rootAccounts.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 italic">
                        No accounts currently active under {headDef.title}.
                      </div>
                    ) : (
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                            <th className="py-2.5 px-4 w-44">Code</th>
                            <th className="py-2.5 px-3">Account Title / Details</th>
                            <th className="py-2.5 px-3 w-28">Classification</th>
                            <th className="py-2.5 px-3 w-28">Normal Balance</th>
                            <th className="py-2.5 px-4 text-right w-40">Live Balance</th>
                            <th className="py-2.5 px-3 w-32">Protection</th>
                            <th className="py-2.5 px-3 text-right w-36">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {rootAccounts.map((acc) => renderAccountNode(acc, 0))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* MODALS */}
        {/* 1. Account Ledger Modal */}
        <AccountLedgerModal
          account={ledgerAccount}
          isOpen={isLedgerOpen}
          onClose={() => {
            setIsLedgerOpen(false);
            setLedgerAccount(null);
          }}
        />

        {/* 2. Sub-Account Modal */}
        <SubAccountModal
          parentAccount={subAccountParent}
          allAccounts={accounts}
          isOpen={isSubAccountOpen}
          onClose={() => {
            setIsSubAccountOpen(false);
            setSubAccountParent(null);
          }}
          onSuccess={(newAcc) => {
            setAccounts(prev => [...prev, newAcc]);
            // Auto-expand the parent node
            if (subAccountParent) {
              setExpandedParents(p => ({ ...p, [subAccountParent.id]: true }));
            }
          }}
        />

        {/* 3. Account Master Modal (Create Root / Edit) */}
        <AccountModal
          account={editingAccount}
          isOpen={isAccountModalOpen}
          onClose={() => {
            setIsAccountModalOpen(false);
            setEditingAccount(null);
          }}
          onSuccess={(savedAcc) => {
            setAccounts(prev => {
              const idx = prev.findIndex(a => a.id === savedAcc.id);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = savedAcc;
                return next;
              }
              return [...prev, savedAcc];
            });
          }}
        />

        {/* 4. CSV Import Modal */}
        <ImportAccountsModal
          existingAccounts={accounts}
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            refreshAccounts();
          }}
        />

        {/* 5. Safe Deletion Confirmation Alert */}
        {deletingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950/60">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Delete Account [{deletingAccount.code}]
                  </h3>
                  <p className="text-xs text-slate-500">Confirm account deletion check</p>
                </div>
              </div>

              {deleteError ? (
                <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
                  {deleteError}
                </div>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Are you sure you want to delete account <strong>[{deletingAccount.code}] {deletingAccount.name}</strong>?
                  {deletingAccount.is_system === 1 && (
                    <span className="block mt-2 font-semibold text-rose-600">
                      System default accounts cannot be deleted.
                    </span>
                  )}
                  {(deletingAccount.transaction_count || 0) > 0 && (
                    <span className="block mt-2 font-semibold text-amber-600">
                      This account has {deletingAccount.transaction_count} journal transactions. The system requires deactivation instead to preserve ledger audit trail.
                    </span>
                  )}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingAccount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                {!deleteError && deletingAccount.is_system !== 1 && (
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deleteLoading}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
                  >
                    {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ListPageContainer>
  );
}
