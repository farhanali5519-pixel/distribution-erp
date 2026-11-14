'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import PrintInvoiceModal from '@/modules/sales/components/PrintInvoiceModal';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { useAuth } from '@/shared/context/auth-context';
import { AdminPinModal } from '@/shared/components/AdminPinModal';
import { 
  TrendingUp, 
  PlusCircle, 
  Printer, 
  Search, 
  ClipboardList, 
  CheckCircle2, 
  DollarSign, 
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Eye,
  Ban,
  Truck,
  X,
  FileText,
  AlertCircle,
  Trash2,
  Smartphone
} from 'lucide-react';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { BulkActionToolbar } from '@/shared/components/BulkActionToolbar';
import { BulkDeleteConfirmModal } from '@/shared/components/BulkDeleteConfirmModal';
import { BulkDeleteResultModal } from '@/shared/components/BulkDeleteResultModal';
import { BatchPrintSalesModal } from '@/modules/sales/components/BatchPrintSalesModal';
import { IndeterminateCheckbox } from '@/shared/components/IndeterminateCheckbox';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { DateRangeFilter, isDateInRange } from '@/shared/components/DateRangeFilter';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { BusinessReferenceLink } from '@/shared/components/BusinessReferenceLink';

export default function SalesOverviewPage() {
  const { isEnabled, getValue } = useFeatureFlags();
  const { canUser, isAdmin } = useAuth();
  const canDelete = isAdmin || (canUser ? canUser('sales', 'delete') : true);
  const canPrint = true;
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'INVOICES'>('ORDERS');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'FIELD_BOOKER' | 'OFFICE'>('ALL');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [printDoc, setPrintDoc] = useState<{ doc: any; type: 'INVOICE' | 'ORDER'; format?: 'THERMAL' | 'A4' } | null>(null);
  
  // Modals state
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [deleteModalDoc, setDeleteModalDoc] = useState<{ doc: any; type: 'SALES_ORDER' | 'DIRECT_SALE' } | null>(null);

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
  const [batchPrintData, setBatchPrintData] = useState<{
    docs: any[];
    type: 'ORDER' | 'INVOICE';
  } | null>(null);

  const orderBookingEnabled = isEnabled('sales.enable_order_booking', true);
  const directSaleEnabled = isEnabled('sales.enable_direct_sale', true);
  const fieldBookingEnabled = isEnabled('sales.enable_field_order_booking', true);
  const defaultPrintFormat = (getValue('sales.default_print_format') || 'THERMAL') as 'THERMAL' | 'A4';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resInv, resOrd] = await Promise.all([
        fetch('/api/sales'),
        fetch('/api/sales/orders'),
      ]);
      const dataInv = await resInv.json();
      const dataOrd = await resOrd.json();

      if (dataInv.success) setInvoices(dataInv.invoices);
      if (dataOrd.success) setOrders(dataOrd.orders);
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openPrint = async (docId: string, type: 'INVOICE' | 'ORDER', format: 'THERMAL' | 'A4' = defaultPrintFormat) => {
    try {
      if (type === 'INVOICE') {
        const res = await fetch(`/api/sales?id=${docId}`);
        const data = await res.json();
        const found = invoices.find((i) => i.id === docId);
        setPrintDoc({ doc: data.invoice || found, type: 'INVOICE', format });
      } else {
        const res = await fetch(`/api/sales/orders/${docId}`);
        const data = await res.json();
        const found = orders.find((o) => o.id === docId);
        setPrintDoc({ doc: data.order || found, type: 'ORDER', format });
      }
    } catch {
      const found = type === 'INVOICE' ? invoices.find((i) => i.id === docId) : orders.find((o) => o.id === docId);
      setPrintDoc({ doc: found, type, format });
    }
  };

  const handleOpenViewOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/sales/orders/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setViewOrder(data.order);
      }
    } catch (err) {
      console.error('Failed to load order details:', err);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancellingOrder) return;
    const requirePin = isEnabled('auth.require_admin_pin_for_void', true);
    if (requirePin) {
      setShowPinModal(true);
      return;
    }
    await executeCancelOrder();
  };

  const executeCancelOrder = async (adminPin?: string) => {
    if (!cancellingOrder) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sales/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: cancelReason || 'Order cancelled by user',
          adminPin: adminPin || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to cancel order');
      }
      setShowPinModal(false);
      setCancellingOrder(null);
      setCancelReason('');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertToInvoice = async (orderId: string) => {
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to convert order to commercial invoice');
      }
      alert(`Commercial Bill ${data.invoice?.invoice_number} generated successfully with permanent salesperson and supply person links!`);
      setActiveTab('INVOICES');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Error converting order to commercial invoice');
    }
  };

  const filteredInvoices = invoices.filter((i) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (
      i.invoice_number?.toLowerCase().includes(q) ||
      i.customer_name?.toLowerCase().includes(q) ||
      i.route_name?.toLowerCase().includes(q) ||
      i.salesman_name?.toLowerCase().includes(q)
    );
    const matchesDate = isDateInRange(i.invoice_date, fromDate, toDate);
    return matchesSearch && matchesDate;
  });

  const filteredOrders = orders.filter((o) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.route_name?.toLowerCase().includes(q) ||
      o.salesman_name?.toLowerCase().includes(q) ||
      o.booker_staff_name?.toLowerCase().includes(q) ||
      o.booker_employee_code?.toLowerCase().includes(q)
    );

    const matchesSource = sourceFilter === 'ALL' || (
      sourceFilter === 'FIELD_BOOKER' 
        ? o.source_channel === 'FIELD_BOOKER' 
        : o.source_channel !== 'FIELD_BOOKER'
    );

    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(o.status);
    const matchesDate = isDateInRange(o.order_date, fromDate, toDate);

    return matchesSearch && matchesSource && matchesStatus && matchesDate;
  });

  // Client-side pagination hooks with persistent page sizes
  const ordersPagination = usePagination(filteredOrders, 50, 'saleflow_sales_orders_page_size');
  const invoicesPagination = usePagination(filteredInvoices, 50, 'saleflow_sales_invoices_page_size');

  // Clear stale selections safely when activeTab or major filters change, and reset to page 1
  useEffect(() => {
    setSelectedIds([]);
    ordersPagination.setCurrentPage(1);
    invoicesPagination.setCurrentPage(1);
  }, [activeTab, sourceFilter, selectedStatuses, searchTerm, fromDate, toDate]);

  // Visible IDs for current active view (CURRENT VISIBLE PAGE ONLY for bulk actions)
  const visibleOrderIds = ordersPagination.paginatedItems.map((o) => o.id);
  const selectedOrderCountOnPage = visibleOrderIds.filter((id) => selectedIds.includes(id)).length;
  const isAllOrdersSelected = visibleOrderIds.length > 0 && selectedOrderCountOnPage === visibleOrderIds.length;
  const isOrdersIndeterminate = selectedOrderCountOnPage > 0 && !isAllOrdersSelected;

  const toggleSelectAllOrders = () => {
    if (isAllOrdersSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleOrderIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleOrderIds])));
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const visibleInvoiceIds = invoicesPagination.paginatedItems.map((i) => i.id);
  const selectedInvoiceCountOnPage = visibleInvoiceIds.filter((id) => selectedIds.includes(id)).length;
  const isAllInvoicesSelected = visibleInvoiceIds.length > 0 && selectedInvoiceCountOnPage === visibleInvoiceIds.length;
  const isInvoicesIndeterminate = selectedInvoiceCountOnPage > 0 && !isAllInvoicesSelected;

  const toggleSelectAllInvoices = () => {
    if (isAllInvoicesSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleInvoiceIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleInvoiceIds])));
    }
  };

  const toggleSelectInvoice = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkPrint = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkPrinting(true);
    try {
      if (activeTab === 'ORDERS') {
        const docs = await Promise.all(
          selectedIds.map(async (id) => {
            try {
              const res = await fetch(`/api/sales/orders/${id}`);
              const data = await res.json();
              return data.order || orders.find((o) => o.id === id);
            } catch {
              return orders.find((o) => o.id === id);
            }
          })
        );
        setBatchPrintData({ docs: docs.filter(Boolean), type: 'ORDER' });
      } else {
        const docs = await Promise.all(
          selectedIds.map(async (id) => {
            try {
              const res = await fetch(`/api/sales?id=${id}`);
              const data = await res.json();
              return data.invoice || invoices.find((i) => i.id === id);
            } catch {
              return invoices.find((i) => i.id === id);
            }
          })
        );
        setBatchPrintData({ docs: docs.filter(Boolean), type: 'INVOICE' });
      }
    } catch (err) {
      console.error('Failed to load documents for batch print:', err);
    } finally {
      setIsBulkPrinting(false);
    }
  };

  const handleConfirmBulkDelete = async (reason: string, adminPin: string) => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/sales/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          type: activeTab === 'ORDERS' ? 'SALES_ORDER' : 'DIRECT_SALE',
          reason,
          adminPin,
        }),
      });
      const data = await res.json();
      if (!data.success && !data.deletedCount) {
        alert(data.message || 'Bulk delete failed');
        return;
      }
      setIsBulkConfirmOpen(false);
      setSelectedIds([]);
      setBulkDeleteResult({
        deletedCount: data.deletedCount || 0,
        skippedCount: data.skippedCount || 0,
        skippedItems: data.skipped || [],
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Error executing bulk delete');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <ListPageContainer>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em', margin: 0 }}>
            Orders Detail
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/dispatch/load-sheet" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}>
            <Truck size={14} style={{ marginRight: '5px' }} /> Load Sheet
          </Link>
          {fieldBookingEnabled && (
            <Link 
              href="/sales/field-order-booking" 
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <Smartphone size={14} style={{ marginRight: '5px' }} /> Field Sale
            </Link>
          )}
          {orderBookingEnabled && (
            <Link href="/sales/order-booking" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', fontWeight: 600 }}>
              <PlusCircle size={15} style={{ marginRight: '5px' }} /> + New Sale
            </Link>
          )}
          {directSaleEnabled && (
            <Link href="/sales/direct-sale" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}>
              <TrendingUp size={14} style={{ marginRight: '5px' }} /> Van Sale
            </Link>
          )}
        </div>
      </div>

      {/* Clean Compact Filter Toolbar */}
      <div className="filter-section-card mb-4" style={{ padding: '0.65rem 0.85rem' }}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Tabs */}
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('ORDERS')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'ORDERS'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ClipboardList size={14} />
              <span>Sale Orders &amp; Bills</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 numeric-text font-bold">
                {formatInteger(orders.length)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INVOICES')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'INVOICES'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText size={14} />
              <span>Direct Counter Invoices</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 numeric-text font-bold">
                {formatInteger(invoices.length)}
              </span>
            </button>
          </div>

          {/* Filters: Source, Status, Dates, Search, Reset, Refresh */}
          <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
            {activeTab === 'ORDERS' && (
              <>
                <div style={{ minWidth: '130px' }} className="w-36 shrink-0">
                  <SearchableSelect
                    mode="single"
                    options={[
                      { value: 'ALL', label: 'All Sources' },
                      { value: 'FIELD_BOOKER', label: 'Field Booking', badge: 'Field', badgeColor: 'emerald' },
                      { value: 'OFFICE', label: 'Office / Store', badge: 'Office', badgeColor: 'slate' },
                    ]}
                    value={sourceFilter}
                    onChange={(val) => setSourceFilter(val || 'ALL')}
                    size="sm"
                    className="w-full"
                    autoFocusSearch={false}
                  />
                </div>

                <div style={{ minWidth: '145px' }} className="w-38 shrink-0">
                  <SearchableSelect
                    mode="multiple"
                    options={[
                      { value: 'POSTED', label: 'POSTED', badge: 'Active', badgeColor: 'emerald' },
                      { value: 'CONVERTED', label: 'CONVERTED', badge: 'Billed', badgeColor: 'blue' },
                      { value: 'CANCELLED', label: 'CANCELLED', badge: 'Cancelled', badgeColor: 'rose' },
                    ]}
                    value={selectedStatuses}
                    onChange={(vals) => setSelectedStatuses(vals)}
                    placeholder="All Statuses"
                    size="sm"
                    className="w-full"
                  />
                </div>
              </>
            )}

            <DateRangeFilter
              fromDate={fromDate}
              toDate={toDate}
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
              size="sm"
              label=""
            />

            <div className="relative w-56 min-w-[180px]">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search Bill #, Customer, Booker..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="filter-input-control w-full h-8 pl-8 pr-2.5 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {(searchTerm || fromDate || toDate || selectedStatuses.length > 0 || sourceFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFromDate('');
                  setToDate('');
                  setSelectedStatuses([]);
                  setSourceFilter('ALL');
                }}
                className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors shadow-2xs shrink-0"
                title="Reset Filters"
              >
                <X size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={fetchData}
              className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-2xs shrink-0"
              title="Refresh Data"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onPrint={handleBulkPrint}
        onDelete={() => setIsBulkConfirmOpen(true)}
        onClear={() => setSelectedIds([])}
        canPrint={canPrint}
        canDelete={canDelete}
        itemTypeLabel={activeTab === 'ORDERS' ? 'Sale Orders' : 'Direct Invoices'}
        isProcessing={isBulkPrinting || isBulkDeleting}
      />

      {/* Data Content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
        {loading ? (
          <div className="py-8 px-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin text-emerald-600" />
            <span>Loading sales records...</span>
          </div>
        ) : activeTab === 'ORDERS' ? (
          /* Orders Tab */
          filteredOrders.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                <ClipboardList size={18} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No sale orders found.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Create a new sale bill to get started.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                      <IndeterminateCheckbox
                        checked={isAllOrdersSelected}
                        indeterminate={isOrdersIndeterminate}
                        onChange={toggleSelectAllOrders}
                        title="Select all visible orders"
                      />
                    </th>
                    <th>Bill / Order #</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>Customer & Shop</th>
                    <th>Route / Salesman</th>
                    <th>Booked By</th>
                    <th style={{ textAlign: 'right' }}>Pieces</th>
                    <th style={{ textAlign: 'right' }}>Net Amount</th>
                    <th style={{ textAlign: 'right' }}>Paid / Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersPagination.paginatedItems.map((ord) => (
                    <tr key={ord.id} style={{ background: selectedIds.includes(ord.id) ? 'rgba(56, 189, 248, 0.06)' : undefined }}>
                      <td style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(ord.id)}
                          onChange={() => toggleSelectOrder(ord.id)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                            verticalAlign: 'middle',
                          }}
                          title={`Select ${ord.order_number}`}
                        />
                      </td>
                      <td>
                        <div className="doc-identifier text-primary font-semibold">
                          <BusinessReferenceLink
                            businessReference={ord.order_number}
                            sourceDocumentId={ord.id}
                            sourceModule="sales"
                            transactionType="Sale Order"
                          />
                        </div>
                      </td>
                      <td>
                        {ord.source_channel === 'FIELD_BOOKER' ? (
                          <span className="badge badge-emerald" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Smartphone size={10} /> Field
                          </span>
                        ) : (
                          <span className="badge badge-subtle" style={{ fontSize: '0.7rem' }}>
                            Office
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums" style={{ fontSize: '0.85rem' }}>{ord.order_date}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ord.customer_name}</div>
                        {ord.shop_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ord.shop_name}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{ord.route_name || 'Direct / Store'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Salesman: {ord.salesman_name ? `${ord.salesman_name}${ord.salesman_code ? ` [${ord.salesman_code}]` : ''}` : 'Unassigned'}</span>
                          {ord.supply_person_name && (
                            <span style={{ display: 'block', color: 'var(--primary)', opacity: 0.9 }}>
                              Supply: {ord.supply_person_name}{ord.supply_person_code ? ` [${ord.supply_person_code}]` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {ord.booker_staff_name || ord.booker_user_name ? (
                          <div style={{ fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {ord.booker_staff_name || ord.booker_user_name}
                            </div>
                            {ord.booker_employee_code && (
                              <span className="badge badge-subtle" style={{ fontSize: '0.65rem' }}>
                                {ord.booker_employee_code}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Office Standard</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {formatInteger(ord.total_pieces || ord.item_count || 1)} pcs
                      </td>
                      <td className="text-right tabular-nums font-bold" style={{ color: 'var(--text-heading)' }}>
                        {formatCurrency(ord.grand_total)}
                      </td>
                      <td className="text-right tabular-nums">
                        <div style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 500 }}>
                          Paid: {formatCurrency(ord.cash_received || 0)}
                        </div>
                        <div style={{ color: ord.remaining_balance > 0 ? '#f59e0b' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                          Due: {formatCurrency(ord.remaining_balance || 0)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${ord.status === 'POSTED' ? 'badge-success' : ord.status === 'CANCELLED' ? 'badge-danger' : 'badge-primary'}`}>
                          {ord.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenViewOrder(ord.id)}
                            className="btn btn-outline btn-sm"
                            title="View Full Bill & GL Voucher"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <Eye size={13} style={{ marginRight: '2px' }} /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => openPrint(ord.id, 'ORDER', 'THERMAL')}
                            className="btn btn-outline btn-sm"
                            title="Print 80mm Thermal Receipt"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <Printer size={13} style={{ marginRight: '2px' }} /> 80mm
                          </button>
                          <button
                            type="button"
                            onClick={() => openPrint(ord.id, 'ORDER', 'A4')}
                            className="btn btn-outline btn-sm"
                            title="Print Standard A4 Sheet"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <Printer size={13} style={{ marginRight: '2px' }} /> A4
                          </button>
                          {ord.status === 'POSTED' && (
                            <button
                              type="button"
                              onClick={() => handleConvertToInvoice(ord.id)}
                              className="btn btn-outline btn-sm"
                              title="Generate Commercial Invoice / Delivery Bill"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                            >
                              <FileText size={13} style={{ marginRight: '2px' }} /> Bill
                            </button>
                          )}
                          {ord.status === 'POSTED' && (
                            <button
                              type="button"
                              onClick={() => setCancellingOrder(ord)}
                              className="btn btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                              title="Cancel Order & Reverse Inventory/GL"
                            >
                              <Ban size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteModalDoc({ doc: ord, type: 'SALES_ORDER' })}
                            className="btn btn-sm"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                            title="Delete & Reverse Sale Order"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Invoices Tab */
          filteredInvoices.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                <FileText size={18} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No direct counter invoices found.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Create a new direct sale to get started.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                      <IndeterminateCheckbox
                        checked={isAllInvoicesSelected}
                        indeterminate={isInvoicesIndeterminate}
                        onChange={toggleSelectAllInvoices}
                        title="Select all visible invoices"
                      />
                    </th>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Customer & Shop</th>
                    <th>Route / Rep</th>
                    <th style={{ textAlign: 'right' }}>Lines</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Cash Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesPagination.paginatedItems.map((inv) => (
                    <tr key={inv.id} style={{ background: selectedIds.includes(inv.id) ? 'rgba(56, 189, 248, 0.06)' : undefined }}>
                      <td style={{ width: '40px', textAlign: 'center', padding: '0.5rem 0.6rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(inv.id)}
                          onChange={() => toggleSelectInvoice(inv.id)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                            verticalAlign: 'middle',
                          }}
                          title={`Select ${inv.invoice_number}`}
                        />
                      </td>
                      <td className="doc-identifier text-primary font-semibold">
                        <BusinessReferenceLink
                          businessReference={inv.invoice_number}
                          sourceDocumentId={inv.id}
                          sourceModule="sales"
                          transactionType="Sale Invoice"
                        />
                      </td>
                      <td className="table-date" style={{ fontSize: '0.85rem' }}>{inv.invoice_date}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.customer_name}</div>
                        {inv.shop_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{inv.shop_name}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{inv.route_name || 'Direct / Unassigned'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Booker: {inv.salesman_name ? `${inv.salesman_name}${inv.salesman_code ? ` [${inv.salesman_code}]` : ''}` : 'Unassigned'}</span>
                          {inv.supply_person_name && (
                            <span style={{ display: 'block', color: 'var(--primary)', opacity: 0.9 }}>
                              Supply: {inv.supply_person_name}{inv.supply_person_code ? ` [${inv.supply_person_code}]` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {formatInteger(inv.item_count || 1)} lines
                      </td>
                      <td className="text-right tabular-nums font-bold" style={{ color: 'var(--text-heading)' }}>
                        {formatCurrency(inv.grand_total)}
                      </td>
                      <td className="text-right tabular-nums font-medium" style={{ color: '#10b981', fontSize: '0.85rem' }}>
                        {formatCurrency(inv.cash_received || 0)}
                      </td>
                      <td className="text-right tabular-nums font-semibold" style={{ color: inv.remaining_balance > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                        {formatCurrency(inv.remaining_balance || 0)}
                      </td>
                      <td>
                        <span className={`badge ${inv.payment_status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>
                          {inv.payment_status || 'POSTED'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => openPrint(inv.id, 'INVOICE')}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            <Printer size={13} style={{ marginRight: '4px' }} /> Print
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteModalDoc({ doc: inv, type: 'DIRECT_SALE' })}
                            className="btn btn-sm"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                            title="Delete & Reverse Direct Sale"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Global Pagination Controls */}
        {activeTab === 'ORDERS' ? (
          <PaginationControls
            currentPage={ordersPagination.currentPage}
            totalRecords={ordersPagination.totalRecords}
            pageSize={ordersPagination.pageSize}
            onPageChange={ordersPagination.setCurrentPage}
            onPageSizeChange={ordersPagination.setPageSize}
            storageKey="saleflow_sales_orders_page_size"
          />
        ) : (
          <PaginationControls
            currentPage={invoicesPagination.currentPage}
            totalRecords={invoicesPagination.totalRecords}
            pageSize={invoicesPagination.pageSize}
            onPageChange={invoicesPagination.setCurrentPage}
            onPageSizeChange={invoicesPagination.setPageSize}
            storageKey="saleflow_sales_invoices_page_size"
          />
        )}
      </div>

      {/* VIEW ORDER DETAILS MODAL */}
      {viewOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-modal-overlay)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)' }}>
                  Sale Bill Details: <span style={{ color: 'var(--primary)' }}>{viewOrder.order_number}</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span className={`badge ${viewOrder.status === 'POSTED' ? 'badge-success' : 'badge-danger'}`}>
                    {viewOrder.status}
                  </span>
                  {viewOrder.source_channel === 'FIELD_BOOKER' ? (
                    <span className="badge badge-emerald" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center' }}>
                      <Smartphone size={11} style={{ marginRight: '3px' }} /> Field Booking
                    </span>
                  ) : (
                    <span className="badge badge-subtle" style={{ fontSize: '0.7rem' }}>
                      Office Standard
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewOrder(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Metadata Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem', background: 'var(--bg-panel)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Customer</div>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{viewOrder.customer_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{viewOrder.shop_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bill Date</div>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{viewOrder.order_date}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Route & Team</div>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{viewOrder.route_name || 'Direct / Counter'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Booker: {viewOrder.salesman_name ? `${viewOrder.salesman_name}${viewOrder.salesman_code ? ` [${viewOrder.salesman_code}]` : ''}` : 'Unassigned'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Supply: {viewOrder.supply_person_name ? `${viewOrder.supply_person_name}${viewOrder.supply_person_code ? ` [${viewOrder.supply_person_code}]` : ''}` : 'Unassigned'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Net Grand Total</div>
                <div className="tabular-nums font-bold" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{formatCurrency(viewOrder.grand_total)}</div>
                <div className="tabular-nums font-medium" style={{ fontSize: '0.75rem', color: '#10b981' }}>Paid: {formatCurrency(viewOrder.cash_received || 0)}</div>
              </div>
            </div>

            {/* Line Items Table */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.75rem' }}>Billed Line Items</h4>
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
              <table className="table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Packaging Breakdown</th>
                    <th style={{ textAlign: 'right' }}>Base Qty</th>
                    <th style={{ textAlign: 'right' }}>Bonus</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewOrder.items?.map((it: any) => (
                    <tr key={it.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{it.product_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: <span className="font-mono">{it.sku}</span> ({it.item_type || 'STANDARD'})</div>
                      </td>
                      <td className="tabular-nums">
                        {it.cartons_count > 0 && `${formatInteger(it.cartons_count)} ${it.uom_bulk || 'Ctn'} `}
                        {it.loose_pieces_count > 0 && `${formatInteger(it.loose_pieces_count)} ${it.uom_base || 'Pcs'}`}
                      </td>
                      <td className="text-right tabular-nums">{formatInteger(it.quantity_base)}</td>
                      <td className="text-right tabular-nums" style={{ color: it.scheme_bonus_base > 0 ? '#10b981' : 'inherit' }}>
                        {formatInteger(it.scheme_bonus_base || 0)}
                      </td>
                      <td className="text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                      <td className="text-right tabular-nums font-bold" style={{ color: 'var(--text-heading)' }}>{formatCurrency(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Linked Double-Entry General Ledger Voucher Lines */}
            {viewOrder.journal_lines && viewOrder.journal_lines.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={16} /> Linked General Ledger Voucher Lines
                </h4>
                <div className="table-container" style={{ marginBottom: '1rem' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Account Code & Name</th>
                        <th>Subledger Attribution</th>
                        <th style={{ textAlign: 'right' }}>Debit</th>
                        <th style={{ textAlign: 'right' }}>Credit</th>
                        <th>Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewOrder.journal_lines.map((jl: any) => (
                        <tr key={jl.id}>
                          <td>
                            <span className="font-mono" style={{ color: '#38bdf8', fontWeight: 700, marginRight: '6px' }}>
                              {jl.account_code}
                            </span>
                            {jl.account_name}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {jl.entity_type ? `${jl.entity_type}: ${viewOrder.customer_name}` : '—'}
                          </td>
                          <td className="text-right tabular-nums" style={{ fontWeight: jl.debit > 0 ? 700 : 400, color: jl.debit > 0 ? 'var(--text-heading)' : 'var(--text-muted)' }}>
                            {jl.debit > 0 ? formatCurrency(jl.debit) : '—'}
                          </td>
                          <td className="text-right tabular-nums" style={{ fontWeight: jl.credit > 0 ? 700 : 400, color: jl.credit > 0 ? '#10b981' : 'var(--text-muted)' }}>
                            {jl.credit > 0 ? formatCurrency(jl.credit) : '—'}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{jl.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  const ord = viewOrder;
                  setViewOrder(null);
                  openPrint(ord.id, 'ORDER', 'THERMAL');
                }}
                className="btn btn-primary btn-sm"
              >
                <Printer size={14} style={{ marginRight: '4px' }} /> Print Thermal 80mm
              </button>
              <button
                type="button"
                onClick={() => {
                  const ord = viewOrder;
                  setViewOrder(null);
                  openPrint(ord.id, 'ORDER', 'A4');
                }}
                className="btn btn-outline btn-sm"
              >
                <Printer size={14} style={{ marginRight: '4px' }} /> Print Standard A4
              </button>
              <button
                type="button"
                onClick={() => setViewOrder(null)}
                className="btn btn-outline btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL ORDER CONFIRMATION MODAL */}
      {cancellingOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-modal-overlay)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
          }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: '#ef4444' }}>
              <AlertCircle size={24} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                Void & Cancel Sale Order
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              Cancelling Bill <strong style={{ color: 'var(--text-heading)' }}>{cancellingOrder.order_number}</strong> will:
            </p>
            <ul style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', paddingLeft: '1.25rem' }}>
              <li>Post an offsetting reversal journal entry via <code className="font-mono">DoubleEntryEngine.voidEntry()</code>.</li>
              <li>Replenish physical warehouse inventory back to stock.</li>
              <li>Mark bill status as <strong style={{ color: '#ef4444' }}>CANCELLED</strong>.</li>
            </ul>

            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Reason for Cancellation:
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Retailer shop was closed, order cancelled..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ width: '100%', marginBottom: '1.5rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setCancellingOrder(null);
                  setCancelReason('');
                }}
                disabled={actionLoading}
                className="btn btn-outline"
              >
                Keep Bill
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={actionLoading}
                className="btn"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {actionLoading ? 'Cancelling & Reversing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printDoc && (
        <PrintInvoiceModal
          data={printDoc.doc}
          type={printDoc.type}
          defaultFormat={printDoc.format || defaultPrintFormat}
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Admin Security PIN Verification Modal */}
      <AdminPinModal
        isOpen={showPinModal}
        title={`Void Sale Order ${cancellingOrder?.order_number}`}
        description={`Authorizing cancellation of order ${cancellingOrder?.order_number}. This will reverse the general ledger voucher and restore warehouse stock.`}
        actionButtonText="Verify PIN & Cancel Order"
        onConfirm={(pin) => executeCancelOrder(pin)}
        onCancel={() => setShowPinModal(false)}
        loading={actionLoading}
      />

      {/* Delete & Reverse Transaction Modal */}
      {deleteModalDoc && (
        <DeleteTransactionModal
          isOpen={!!deleteModalDoc}
          onClose={() => setDeleteModalDoc(null)}
          onSuccess={(msg) => {
            fetchData();
          }}
          title={deleteModalDoc.type === 'SALES_ORDER' ? 'Delete & Reverse Sale Order' : 'Delete & Reverse Direct Sale'}
          transactionType={deleteModalDoc.type === 'SALES_ORDER' ? 'Sale Order' : 'Direct Sale'}
          transactionNumber={deleteModalDoc.type === 'SALES_ORDER' ? deleteModalDoc.doc.order_number : deleteModalDoc.doc.invoice_number}
          transactionDate={deleteModalDoc.type === 'SALES_ORDER' ? deleteModalDoc.doc.order_date : deleteModalDoc.doc.invoice_date}
          deleteUrl={
            deleteModalDoc.type === 'SALES_ORDER'
              ? `/api/sales/orders/${deleteModalDoc.doc.id}`
              : `/api/sales/direct/${deleteModalDoc.doc.id}`
          }
          detailsSummary={[
            { label: 'Customer', value: deleteModalDoc.doc.customer_name || 'Customer' },
            { label: 'Grand Total', value: formatCurrency(deleteModalDoc.doc.grand_total || 0) },
            { label: 'Payment Status', value: deleteModalDoc.doc.payment_status || 'POSTED' },
          ]}
        />
      )}

      {/* Bulk Delete Confirm Modal */}
      <BulkDeleteConfirmModal
        isOpen={isBulkConfirmOpen}
        onClose={() => setIsBulkConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        count={selectedIds.length}
        itemTypeLabel={activeTab === 'ORDERS' ? 'Sale Order(s)' : 'Direct Sale Invoice(s)'}
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
          itemTypeLabel={activeTab === 'ORDERS' ? 'Sale Orders' : 'Sales Invoices'}
        />
      )}

      {/* Batch Print Sales Modal */}
      {batchPrintData && (
        <BatchPrintSalesModal
          documents={batchPrintData.docs}
          type={batchPrintData.type}
          defaultFormat={defaultPrintFormat}
          onClose={() => setBatchPrintData(null)}
        />
      )}
    </ListPageContainer>
  );
}
