'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { useAuth } from '@/shared/context/auth-context';
import { AdminPinModal } from '@/shared/components/AdminPinModal';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { BulkActionToolbar } from '@/shared/components/BulkActionToolbar';
import { BulkDeleteConfirmModal } from '@/shared/components/BulkDeleteConfirmModal';
import { BulkDeleteResultModal } from '@/shared/components/BulkDeleteResultModal';
import { BatchPrintPurchaseModal } from '@/modules/purchase/components/BatchPrintPurchaseModal';
import { IndeterminateCheckbox } from '@/shared/components/IndeterminateCheckbox';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Ban,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Building2,
  Layers,
  X,
  Truck,
  RotateCcw
} from 'lucide-react';

interface PurchaseBillItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  item_type: 'STANDARD' | 'BATCH' | 'SERVICE';
  uom_base: string;
  uom_bulk: string;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  item_reference: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  cartons_qty: number;
  boxes_qty: number;
  loose_pieces_qty: number;
  total_pieces: number;
  rate_per_piece: number;
  gross_amount_paisas: number;
  discount_percent: number;
  discount_paisas: number;
  tax_percent: number;
  tax_paisas: number;
  line_total: number;
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string | null;
  entity_type: string | null;
}

interface PurchaseBillDetail {
  id: string;
  bill_number: string;
  vendor_id: string;
  vendor_name: string;
  company_name: string | null;
  vendor_phone: string | null;
  vendor_address: string | null;
  cnic_or_ntn: string | null;
  bill_date: string;
  due_date: string | null;
  warehouse: string;
  broker: string | null;
  vendor_invoice_number: string;
  reference_number: string | null;
  freight_treatment: 'LANDED_COST' | 'DIRECT_EXPENSE' | 'NONE';
  freight_amount: number;
  subtotal: number;
  tax: number;
  discount: number;
  net_amount: number;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  journal_id: string | null;
  notes: string | null;
  created_at: string;
  items: PurchaseBillItem[];
  journalLines: JournalLine[];
}

export default function PurchaseOrdersDetailPage() {
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const { canUser, isAdmin } = useAuth();
  const canDelete = isAdmin || (canUser ? canUser('purchase', 'delete') : true);
  const canPrint = true;

  const [bills, setBills] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal View
  const [viewBill, setViewBill] = useState<PurchaseBillDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Action status
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [deleteModalBill, setDeleteModalBill] = useState<any | null>(null);

  // Bulk Selection & Actions State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<{
    deletedCount: number;
    skippedCount: number;
    skippedItems: Array<{ id: string; number: string; reason: string }>;
  } | null>(null);
  const [batchPrintBills, setBatchPrintBills] = useState<any[] | null>(null);

  // Load Bills & Vendors
  const loadBills = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedVendor) params.append('vendorId', selectedVendor);
      if (selectedStatuses.length > 0) params.append('status', selectedStatuses.join(','));
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const res = await fetch(`/api/purchase/bills?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBills(data.bills || []);
      }
    } catch (err) {
      console.error('Failed to load bills', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, [selectedVendor, selectedStatuses, fromDate, toDate]);

  useEffect(() => {
    fetch('/api/vendors')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setVendors(d.vendors || []);
      })
      .catch(console.error);
  }, []);

  const vendorOptions = useMemo(() => [
    { value: '', label: 'All Suppliers' },
    ...vendors.map((v) => ({
      value: v.id,
      label: v.name,
      subLabel: v.company_name ? `Co: ${v.company_name}` : undefined,
      keywords: [v.name, v.company_name || ''],
    })),
  ], [vendors]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadBills();
  };

  // Client-side pagination with persistent page size
  const billsPagination = usePagination(bills, 50, 'saleflow_purchase_bills_page_size');

  // Clear stale selections safely when major filters change, and reset to page 1
  useEffect(() => {
    setSelectedIds([]);
    billsPagination.setCurrentPage(1);
  }, [searchTerm, selectedVendor, selectedStatuses, fromDate, toDate]);

  // Visible IDs for current view (CURRENT VISIBLE PAGE ONLY for bulk actions)
  const visibleBillIds = billsPagination.paginatedItems.map((b) => b.id);
  const selectedBillCountOnPage = visibleBillIds.filter((id) => selectedIds.includes(id)).length;
  const isAllBillsSelected = visibleBillIds.length > 0 && selectedBillCountOnPage === visibleBillIds.length;
  const isBillsIndeterminate = selectedBillCountOnPage > 0 && !isAllBillsSelected;

  const toggleSelectAllBills = () => {
    if (isAllBillsSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleBillIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleBillIds])));
    }
  };

  const toggleSelectBill = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkPrint = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkPrinting(true);
    try {
      const detailedBills = await Promise.all(
        selectedIds.map(async (id) => {
          try {
            const res = await fetch(`/api/purchase/bills/${id}`);
            const data = await res.json();
            return data.bill || bills.find((b) => b.id === id);
          } catch {
            return bills.find((b) => b.id === id);
          }
        })
      );
      setBatchPrintBills(detailedBills.filter(Boolean));
    } catch (err) {
      console.error('Failed to load bills for batch print:', err);
    } finally {
      setIsBulkPrinting(false);
    }
  };

  const handleConfirmBulkDelete = async (reason: string, adminPin: string) => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/purchase/bills/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          reason,
          adminPin,
        }),
      });
      const data = await res.json();
      if (!data.success && !data.deletedCount) {
        setActionError(data.message || 'Bulk delete failed');
        return;
      }
      setIsBulkConfirmOpen(false);
      setSelectedIds([]);
      setBulkDeleteResult({
        deletedCount: data.deletedCount || 0,
        skippedCount: data.skippedCount || 0,
        skippedItems: data.skipped || [],
      });
      await loadBills();
    } catch (err: any) {
      setActionError(err.message || 'Error executing bulk delete');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // View Bill Modal
  const openViewModal = async (billId: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/purchase/bills/${billId}`);
      const data = await res.json();
      if (data.success && data.bill) {
        setViewBill(data.bill);
      }
    } catch (err) {
      console.error('Failed to load bill detail', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Trigger Void Modal
  const promptVoid = (bill: any) => {
    setVoidingId(bill.id);
    setVoidReason('');
    setIsVoidModalOpen(true);
  };

  // Confirm Void
  const confirmVoid = async () => {
    if (!voidingId) return;
    const requirePin = isEnabled('auth.require_admin_pin_for_void', true);
    if (requirePin) {
      setShowPinModal(true);
      return;
    }
    await executeVoid();
  };

  const executeVoid = async (adminPin?: string) => {
    if (!voidingId) return;
    try {
      setActionError(null);
      const res = await fetch(`/api/purchase/bills/${voidingId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: voidReason || 'Voided by operator',
          adminPin: adminPin || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || 'Failed to void bill');

      setActionSuccess(`Bill ${data.billNumber} has been successfully voided and inventory reversed.`);
      setShowPinModal(false);
      setIsVoidModalOpen(false);
      if (viewBill && viewBill.id === voidingId) {
        setViewBill(null);
      }
      loadBills();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Delete Draft
  const handleDeleteDraft = async (id: string, billNum: string) => {
    if (!confirm(`Are you sure you want to delete draft bill ${billNum}?`)) return;
    try {
      const res = await fetch(`/api/purchase/bills/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      setActionSuccess(`Draft bill ${billNum} deleted.`);
      loadBills();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <ListPageContainer style={{ paddingBottom: '3rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-heading)' }}>
            <ShoppingCart className="text-primary" size={26} />
            Purchase Detail
          </h1>
        </div>

        <Link href="/purchase/new-bill" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} />
          + New Purchase
        </Link>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
            <CheckCircle2 size={18} />
            {actionSuccess}
          </div>
          <button onClick={() => setActionSuccess(null)} style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {actionError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
            <AlertCircle size={18} />
            {actionError}
          </div>
          <button onClick={() => setActionError(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="filter-section-card space-y-3.5 mb-6">
        {/* Header Strip with Filter Icon */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <Filter size={13} />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">
              Purchase Filters
            </span>
          </div>
          {(searchTerm || selectedVendor || selectedStatuses.length > 0 || fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedVendor('');
                setSelectedStatuses([]);
                setFromDate('');
                setToDate('');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
              title="Reset filters"
            >
              <RotateCcw size={11} />
              Reset Filters
            </button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Keyword Search */}
          <div className="lg:col-span-3">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              <Search size={13} className="text-slate-500 dark:text-slate-400" />
              Keyword Search
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                className="filter-input-control w-full h-10 pl-9 pr-3 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                placeholder="Search Bill #, Inv #, Broker..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Vendor Filter */}
          <div className="lg:col-span-3">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              <Building2 size={13} className="text-slate-500 dark:text-slate-400" />
              Supplier / Vendor
            </label>
            <SearchableSelect
              options={vendorOptions}
              value={selectedVendor}
              onChange={(val) => setSelectedVendor(val)}
              placeholder="All Suppliers"
              className="w-full"
            />
          </div>

          {/* Date Range: Grouped From Date + To Date */}
          <div className="lg:col-span-3">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              <Calendar size={13} className="text-slate-500 dark:text-slate-400" />
              Date Range
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <input
                  type="date"
                  className="filter-input-control w-full h-10 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  title="From Date"
                />
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 px-0.5">→</span>
              <div className="flex-1">
                <input
                  type="date"
                  className="filter-input-control w-full h-10 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  title="To Date"
                />
              </div>
            </div>
          </div>

          {/* Status & Search Action */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <div className="flex-1">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                <Layers size={13} className="text-slate-500 dark:text-slate-400" />
                Status
              </label>
              <SearchableSelect
                mode="multiple"
                options={[
                  { value: 'POSTED', label: 'POSTED (Active GL)', badge: 'Active', badgeColor: 'emerald' },
                  { value: 'DRAFT', label: 'DRAFT', badge: 'Pending', badgeColor: 'amber' },
                  { value: 'VOID', label: 'VOID (Reversed)', badge: 'Voided', badgeColor: 'rose' },
                ]}
                value={selectedStatuses}
                onChange={(vals) => setSelectedStatuses(vals)}
                placeholder="All Statuses"
                size="sm"
                className="w-full"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors mt-auto shrink-0"
            >
              <Search size={14} /> Filter
            </button>
          </div>
        </form>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onPrint={handleBulkPrint}
        onDelete={() => setIsBulkConfirmOpen(true)}
        onClear={() => setSelectedIds([])}
        canPrint={canPrint}
        canDelete={canDelete}
        itemTypeLabel="Purchase Bills"
        isProcessing={isBulkPrinting || isBulkDeleting}
      />

      {/* Bills Data Table */}
      <div className="card" style={{ border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center', padding: '0.6rem 0.5rem' }}>
                  <IndeterminateCheckbox
                    checked={isAllBillsSelected}
                    indeterminate={isBillsIndeterminate}
                    onChange={toggleSelectAllBills}
                    title="Select all visible purchase bills"
                  />
                </th>
                <th>Bill #</th>
                <th>Date</th>
                <th>Vendor / Supplier</th>
                <th>Paper Inv #</th>
                <th>Warehouse</th>
                <th>Freight Mode</th>
                <th style={{ textAlign: 'right' }}>Net Payable</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Loading purchase records...
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No purchase bills found matching your criteria.
                  </td>
                </tr>
              ) : (
                billsPagination.paginatedItems.map((b) => {
                  const isVoid = b.status === 'VOID';
                  const isDraft = b.status === 'DRAFT';

                  return (
                    <tr key={b.id} style={{ opacity: isVoid ? 0.65 : 1, background: selectedIds.includes(b.id) ? 'rgba(56, 189, 248, 0.06)' : undefined }}>
                      {/* Checkbox */}
                      <td style={{ width: '40px', textAlign: 'center', padding: '0.6rem 0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(b.id)}
                          onChange={() => toggleSelectBill(b.id)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                            verticalAlign: 'middle',
                          }}
                          title={`Select ${b.bill_number}`}
                        />
                      </td>

                      {/* Bill # */}
                      <td>
                        <span className="doc-identifier" style={{ fontWeight: 700, color: isVoid ? 'var(--text-muted)' : 'var(--primary)' }}>
                          <BusinessReferenceLink
                            businessReference={b.bill_number}
                            sourceDocumentId={b.id}
                            sourceModule="purchase"
                            transactionType="Purchase Bill"
                          />
                        </span>
                        {b.reference_number && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Ref: <DescriptionWithReference text={b.reference_number} />
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="table-date" style={{ fontSize: '0.85rem' }}>{b.bill_date}</td>

                      {/* Vendor */}
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.vendor_name}</div>
                        {b.broker && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Broker: {b.broker}
                          </div>
                        )}
                      </td>

                      {/* Paper Inv # */}
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {b.vendor_invoice_number}
                      </td>

                      {/* Warehouse */}
                      <td style={{ fontSize: '0.85rem' }}>{b.warehouse}</td>

                      {/* Freight Mode */}
                      <td>
                        <span className={`badge ${b.freight_treatment === 'LANDED_COST' ? 'badge-primary' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                          {b.freight_treatment === 'LANDED_COST' ? 'Landed Cost' : b.freight_treatment === 'DIRECT_EXPENSE' ? 'Direct Exp' : 'None'}
                        </span>
                        {b.freight_amount > 0 && (
                          <div className="tabular-nums" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {formatCurrency(b.freight_amount)}
                          </div>
                        )}
                      </td>

                      {/* Net Amount */}
                      <td className="tabular-nums font-bold" style={{ textAlign: 'right', color: isVoid ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {formatCurrency(b.net_amount)}
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${b.status === 'POSTED' ? 'badge-success' : b.status === 'VOID' ? 'badge-danger' : 'badge-warning'}`}>
                          {b.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          {/* VIEW */}
                          <button
                            onClick={() => openViewModal(b.id)}
                            className="btn btn-sm btn-secondary"
                            title="View Full Breakdown & GL Voucher"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            <Eye size={14} />
                          </button>

                          {/* EDIT */}
                          {!isVoid && (
                            <Link
                              href={`/purchase/new-bill?editId=${b.id}`}
                              className="btn btn-sm btn-secondary"
                              title="Edit Bill (Atomic Reversal)"
                              style={{ padding: '0.35rem 0.6rem' }}
                            >
                              <Edit2 size={14} />
                            </Link>
                          )}

                          {/* VOID */}
                          {b.status === 'POSTED' && (
                            <button
                              onClick={() => promptVoid(b)}
                              className="btn btn-sm btn-secondary"
                              title="Void Bill & Reverse Stock"
                              style={{ padding: '0.35rem 0.6rem', color: '#ef4444' }}
                            >
                              <Ban size={14} />
                            </button>
                          )}

                          {/* DELETE & REVERSE */}
                          <button
                            onClick={() => setDeleteModalBill(b)}
                            className="btn btn-sm btn-secondary"
                            title="Delete & Reverse Purchase Bill"
                            style={{ padding: '0.35rem 0.6rem', color: '#ef4444' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Global Pagination Controls */}
        <PaginationControls
          currentPage={billsPagination.currentPage}
          totalRecords={billsPagination.totalRecords}
          pageSize={billsPagination.pageSize}
          onPageChange={billsPagination.setCurrentPage}
          onPageSizeChange={billsPagination.setPageSize}
          storageKey="saleflow_purchase_bills_page_size"
        />
      </div>

      {/* DETAIL VIEW MODAL */}
      {viewBill && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-modal-overlay)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            padding: '1.5rem',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                    Purchase Bill <span className="doc-identifier">{viewBill.bill_number}</span>
                  </h2>
                  <span className={`badge ${viewBill.status === 'POSTED' ? 'badge-success' : viewBill.status === 'VOID' ? 'badge-danger' : 'badge-warning'}`}>
                    {viewBill.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Supplier: <strong>{viewBill.vendor_name}</strong> {viewBill.company_name ? `(${viewBill.company_name})` : ''} | Paper Invoice: <strong>{viewBill.vendor_invoice_number}</strong>
                </div>
              </div>

              <button
                onClick={() => setViewBill(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Bill Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bill Date:</span>
                <div className="table-date" style={{ fontWeight: 600 }}>{viewBill.bill_date}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Warehouse:</span>
                <div style={{ fontWeight: 600 }}>{viewBill.warehouse}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Broker:</span>
                <div style={{ fontWeight: 600 }}>{viewBill.broker || 'Direct / None'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reference / Bilty:</span>
                <div style={{ fontWeight: 600 }}>{viewBill.reference_number || 'None'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Freight Treatment:</span>
                <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  {viewBill.freight_treatment === 'LANDED_COST' ? 'Capitalized to Landed Cost' : 'Separate Direct Expense'} ({formatCurrency(viewBill.freight_amount)})
                </div>
              </div>
            </div>

            {/* Items Breakdown Table */}
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} className="text-primary" />
              Received Line Items (3-Tier UOM Breakdown)
            </h3>

            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>CTN</th>
                    <th style={{ textAlign: 'right' }}>Box</th>
                    <th style={{ textAlign: 'right' }}>Pcs</th>
                    <th style={{ textAlign: 'right' }}>Total Base Pcs</th>
                    <th style={{ textAlign: 'right' }}>Rate/Pc</th>
                    <th style={{ textAlign: 'right' }}>Discount</th>
                    <th style={{ textAlign: 'right' }}>Tax</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewBill.items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          SKU: <span className="font-mono">{it.product_sku}</span> {it.batch_number ? `| Batch: ${it.batch_number}` : ''} {it.expiry_date ? `| Exp: ${it.expiry_date}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${it.item_type === 'SERVICE' ? 'badge-warning' : it.item_type === 'BATCH' ? 'badge-primary' : 'badge-secondary'}`} style={{ fontSize: '0.65rem' }}>
                          {it.item_type}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{it.cartons_qty ? formatInteger(it.cartons_qty) : '-'}</td>
                      <td className="text-right tabular-nums">{it.boxes_qty ? formatInteger(it.boxes_qty) : '-'}</td>
                      <td className="text-right tabular-nums">{it.loose_pieces_qty ? formatInteger(it.loose_pieces_qty) : '-'}</td>
                      <td className="text-right tabular-nums" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {formatInteger(it.total_pieces)} {it.uom_base}
                      </td>
                      <td className="text-right tabular-nums">{formatCurrency(it.rate_per_piece)}</td>
                      <td className="text-right tabular-nums" style={{ color: '#10b981' }}>
                        {it.discount_paisas > 0 ? `- ${formatCurrency(it.discount_paisas / 100)}` : '-'}
                      </td>
                      <td className="text-right tabular-nums">{it.tax_paisas > 0 ? `+ ${formatCurrency(it.tax_paisas / 100)}` : '-'}</td>
                      <td className="text-right tabular-nums" style={{ fontWeight: 700 }}>
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Linked Double-Entry GL Voucher */}
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} className="text-primary" />
              General Ledger Voucher Entries
            </h3>

            {viewBill.journalLines && viewBill.journalLines.length > 0 ? (
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Account Code</th>
                      <th>Account Name</th>
                      <th>Memo & Sub-Ledger</th>
                      <th style={{ textAlign: 'right' }}>Debit</th>
                      <th style={{ textAlign: 'right' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewBill.journalLines.map((jl, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{jl.account_code}</td>
                        <td style={{ fontWeight: 600 }}>{jl.account_name}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {jl.memo} {jl.entity_type ? `[${jl.entity_type}]` : ''}
                        </td>
                        <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: jl.debit > 0 ? 700 : 400, color: jl.debit > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {jl.debit > 0 ? formatCurrency(jl.debit) : '-'}
                        </td>
                        <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: jl.credit > 0 ? 700 : 400, color: jl.credit > 0 ? '#10b981' : 'var(--text-muted)' }}>
                          {jl.credit > 0 ? formatCurrency(jl.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-panel)', fontWeight: 800 }}>
                      <td colSpan={3} style={{ textAlign: 'right' }}>Voucher Total:</td>
                      <td className="tabular-nums font-bold" style={{ textAlign: 'right', color: 'var(--text-heading)' }}>
                        {formatCurrency(viewBill.journalLines.reduce((sum, l) => sum + (l.debit || 0), 0))}
                      </td>
                      <td className="tabular-nums font-bold" style={{ textAlign: 'right', color: 'var(--primary)' }}>
                        {formatCurrency(viewBill.journalLines.reduce((sum, l) => sum + (l.credit || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                No active general ledger lines (Draft or not posted).
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              {viewBill.status === 'POSTED' && (
                <button
                  onClick={() => promptVoid(viewBill)}
                  className="btn btn-secondary"
                  style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Ban size={16} /> Void Bill
                </button>
              )}

              {viewBill.status !== 'VOID' && (
                <Link
                  href={`/purchase/new-bill?editId=${viewBill.id}`}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Edit2 size={16} /> Edit & Re-post Bill
                </Link>
              )}

              <button onClick={() => setViewBill(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOID CONFIRMATION MODAL */}
      {isVoidModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-modal-overlay)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', border: '1px solid rgba(239,68,68,0.4)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444', marginBottom: '1rem' }}>
              <Ban size={28} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                Void Purchase Bill?
              </h3>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              This will execute an immutable reversing journal voucher in the General Ledger (swapping Debits and Credits), decrement warehouse inventory by the received quantities, and mark this bill as <strong>VOID</strong>.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Reason for Voiding:
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Wrong quantity entered / Supplier cancelled shipment"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setIsVoidModalOpen(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmVoid}
                className="btn btn-danger"
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer' }}
              >
                Confirm Void Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Security PIN Verification Modal */}
      <AdminPinModal
        isOpen={showPinModal}
        title="Void Purchase Bill"
        description="Authorizing void of this purchase bill. This will reverse the Accounts Payable journal entry and deduct the purchased quantities from warehouse stock."
        actionButtonText="Verify PIN & Void Bill"
        onConfirm={(pin) => executeVoid(pin)}
        onCancel={() => setShowPinModal(false)}
      />

      {/* Delete & Reverse Purchase Bill Modal */}
      {deleteModalBill && (
        <DeleteTransactionModal
          isOpen={!!deleteModalBill}
          onClose={() => setDeleteModalBill(null)}
          onSuccess={(msg) => {
            setActionSuccess(msg || 'Purchase bill deleted & reversed successfully.');
            loadBills();
          }}
          title="Delete & Reverse Purchase Bill"
          transactionType="Purchase Bill"
          transactionNumber={deleteModalBill.bill_number}
          transactionDate={deleteModalBill.bill_date}
          deleteUrl={`/api/purchase/bills/${deleteModalBill.id}`}
          detailsSummary={[
            { label: 'Vendor', value: deleteModalBill.vendor_name || 'Vendor' },
            { label: 'Net Amount', value: formatCurrency(deleteModalBill.net_amount || 0) },
            { label: 'Status', value: deleteModalBill.status },
          ]}
        />
      )}

      {/* Bulk Delete Confirm Modal */}
      <BulkDeleteConfirmModal
        isOpen={isBulkConfirmOpen}
        onClose={() => setIsBulkConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        count={selectedIds.length}
        itemTypeLabel="Purchase Bill(s)"
        isProcessing={isBulkDeleting}
      />

      {/* Bulk Delete Result Modal */}
      {bulkDeleteResult && (
        <BulkDeleteResultModal
          isOpen={!!bulkDeleteResult}
          onClose={() => setBulkDeleteResult(null)}
          deletedCount={bulkDeleteResult.deletedCount}
          skippedCount={bulkDeleteResult.skippedCount}
          skippedItems={bulkDeleteResult.skippedItems}
          itemTypeLabel="Purchase Bills"
        />
      )}

      {/* Batch Print Purchase Modal */}
      {batchPrintBills && (
        <BatchPrintPurchaseModal
          bills={batchPrintBills}
          defaultFormat="A4"
          onClose={() => setBatchPrintBills(null)}
        />
      )}
    </ListPageContainer>
  );
}
