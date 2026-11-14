'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { BusinessReferenceLink } from '@/shared/components/BusinessReferenceLink';

const ledgerStatusOptions = [
  { value: 'ALL', label: 'All Movements' },
  { value: 'POSTED', label: 'Active / Posted' },
  { value: 'REVERSED', label: 'Reversed Only' },
];

const movTxCategoryOptions = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'SALES', label: 'Sales Transactions' },
  { value: 'PURCHASE', label: 'Purchase Bills' },
  { value: 'RETURN', label: 'Sales & Purchase Returns' },
  { value: 'ADJUSTMENT', label: 'Stock Adjustments & Opening' },
  { value: 'TRANSFER', label: 'Warehouse Transfers' },
];

const movTypeOptions = [
  { value: 'ALL', label: 'All Types' },
  { value: 'OPENING_STOCK', label: 'Opening Stock' },
  { value: 'PURCHASE', label: 'Purchase Bill' },
  { value: 'SALE_ORDER', label: 'Sale Order' },
  { value: 'DIRECT_SALE', label: 'Direct Van Sale' },
  { value: 'SALE_RETURN', label: 'Sales Return' },
  { value: 'PURCHASE_RETURN', label: 'Purchase Return' },
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment' },
  { value: 'TRANSFER_IN', label: 'Transfer In' },
  { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  { value: 'DAMAGE_WRITEOFF', label: 'Damage Write-off' },
  { value: 'REVERSAL_IN', label: 'Reversal (+IN)' },
  { value: 'REVERSAL_OUT', label: 'Reversal (-OUT)' },
];

const movStatusOptions = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'POSTED', label: 'Active / Posted' },
  { value: 'REVERSED', label: 'Reversed Only' },
];
import {
  History,
  Package,
  Layers,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Printer,
  Download,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRightLeft,
  Calendar,
  Building2,
  User,
  Clock,
  FileText,
  Eye,
  X,
  ChevronRight,
  TrendingUp,
  ShoppingCart,
  Percent
} from 'lucide-react';
import { formatCurrency, formatNumber, formatInteger } from '@/shared/utils/formatting';
import {
  InventoryMovement,
  ProductStockLedgerSummary,
  ProductStockLedgerRow,
  InventoryReconciliationReport,
  AuditDashboardKPIs,
} from '@/modules/inventory/audit.types';

export default function InventoryAuditLedgerPage() {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'ledger' | 'movements' | 'reconciliation' | 'warehouses'>('ledger');

  // Loading States
  const [loadingKPIs, setLoadingKPIs] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [loadingRecon, setLoadingRecon] = useState(false);

  // Data states
  const [kpis, setKpis] = useState<AuditDashboardKPIs | null>(null);
  const [warehouseSummaries, setWarehouseSummaries] = useState<Array<{ warehouse: string; totalProducts: number; totalPieces: number; totalValue: number }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string; category: string; current_stock_base: number }>>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productLedger, setProductLedger] = useState<ProductStockLedgerSummary | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [reconReport, setReconReport] = useState<InventoryReconciliationReport | null>(null);

  // Filters for Product Ledger Tab
  const [ledgerWarehouse, setLedgerWarehouse] = useState<string>('ALL');
  const [ledgerFromDate, setLedgerFromDate] = useState<string>('');
  const [ledgerToDate, setLedgerToDate] = useState<string>('');
  const [ledgerStatus, setLedgerStatus] = useState<string>('ALL');

  // Filters for All Movements Tab
  const [movFromDate, setMovFromDate] = useState<string>('');
  const [movToDate, setMovToDate] = useState<string>('');
  const [movWarehouse, setMovWarehouse] = useState<string>('ALL');
  const [movCategory, setMovCategory] = useState<string>('ALL');
  const [movType, setMovType] = useState<string>('ALL');
  const [movStatus, setMovStatus] = useState<string>('ALL');
  const [movTxCategory, setMovTxCategory] = useState<string>('ALL');
  const [movSearch, setMovSearch] = useState<string>('');

  // Reconciliation Filter
  const [reconVarianceOnly, setReconVarianceOnly] = useState<boolean>(false);
  const [reconSearch, setReconSearch] = useState<string>('');

  // Detail Modal
  const [detailModalItem, setDetailModalItem] = useState<any | null>(null);

  // Transfer Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferForm, setTransferForm] = useState({
    productId: '',
    fromWarehouse: 'Main Warehouse',
    toWarehouse: 'Godown 1',
    cartons: 0,
    boxes: 0,
    pieces: 0,
    notes: '',
  });

  const ledgerRows = useMemo(() => productLedger?.rows || [], [productLedger]);
  const ledgerPagination = usePagination(ledgerRows);
  const paginatedLedgerRows = ledgerPagination.paginatedItems;

  const movementsPagination = usePagination(movements);
  const paginatedMovements = movementsPagination.paginatedItems;

  // Load initial KPIs, warehouses, and products
  const loadInitialData = async () => {
    try {
      setLoadingKPIs(true);
      const resKpis = await fetch('/api/inventory/audit/kpis');
      const dataKpis = await resKpis.json();
      if (dataKpis.success) {
        setKpis(dataKpis.kpis);
        setWarehouseSummaries(dataKpis.warehouses || []);
      }

      const resProds = await fetch('/api/inventory');
      const dataProds = await resProds.json();
      if (dataProds.success && dataProds.products?.length > 0) {
        setProducts(dataProds.products);
        if (!selectedProductId) {
          setSelectedProductId(dataProds.products[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setLoadingKPIs(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('transfer') === '1' || params.get('create') === '1' || params.get('new') === '1') {
        setIsTransferModalOpen(true);
      }
    }
  }, []);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      subLabel: `Stock: ${formatInteger(p.current_stock_base)} pcs`,
      badge: p.sku,
      badgeColor: 'emerald' as const,
      keywords: [p.sku, p.name],
    }));
  }, [products]);

  const warehouseOptions = useMemo(() => [
    { value: 'ALL', label: 'All Warehouses' },
    { value: 'Main Warehouse', label: 'Main Warehouse', badge: 'Main', badgeColor: 'blue' as const },
    { value: 'Godown 1', label: 'Godown 1', badge: 'Annex', badgeColor: 'slate' as const },
    { value: 'Quarantine / Damaged', label: 'Quarantine / Damaged', badge: 'Restricted', badgeColor: 'rose' as const },
  ], []);

  const transferWarehouseOptions = useMemo(() => [
    { value: 'Main Warehouse', label: 'Main Warehouse', badge: 'Main', badgeColor: 'blue' as const },
    { value: 'Godown 1', label: 'Godown 1', badge: 'Annex', badgeColor: 'slate' as const },
    { value: 'Van 1', label: 'Van 1 (Delivery Vehicle)', badge: 'Mobile', badgeColor: 'indigo' as const },
    { value: 'Quarantine / Damaged', label: 'Quarantine / Damaged', badge: 'Restricted', badgeColor: 'rose' as const },
  ], []);

  // Load Product Ledger whenever product or its filters change
  const loadProductLedger = async (prodId: string) => {
    if (!prodId) return;
    try {
      setLoadingLedger(true);
      const params = new URLSearchParams();
      if (ledgerWarehouse !== 'ALL') params.set('warehouse', ledgerWarehouse);
      if (ledgerFromDate) params.set('fromDate', ledgerFromDate);
      if (ledgerToDate) params.set('toDate', ledgerToDate);
      if (ledgerStatus !== 'ALL') params.set('status', ledgerStatus);

      const res = await fetch(`/api/inventory/audit/ledger/${prodId}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setProductLedger(data.ledger);
      }
    } catch (err) {
      console.error('Error loading product stock ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    if (selectedProductId) {
      loadProductLedger(selectedProductId);
    }
  }, [selectedProductId, ledgerWarehouse, ledgerFromDate, ledgerToDate, ledgerStatus]);

  // Load All Movements Feed
  const loadAllMovements = async () => {
    try {
      setLoadingMovements(true);
      const params = new URLSearchParams();
      if (movFromDate) params.set('fromDate', movFromDate);
      if (movToDate) params.set('toDate', movToDate);
      if (movWarehouse !== 'ALL') params.set('warehouse', movWarehouse);
      if (movType !== 'ALL') params.set('movementType', movType);
      if (movStatus !== 'ALL') params.set('status', movStatus);
      if (movTxCategory !== 'ALL') params.set('transactionCategory', movTxCategory);
      if (movSearch.trim()) params.set('documentNumber', movSearch.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/inventory/audit/movements?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setMovements(data.movements);
        setMovementsTotal(data.total);
      }
    } catch (err) {
      console.error('Error loading movements:', err);
    } finally {
      setLoadingMovements(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'movements') {
      loadAllMovements();
    }
  }, [activeTab, movFromDate, movToDate, movWarehouse, movType, movStatus, movTxCategory, movSearch]);

  // Load Reconciliation Report
  const loadReconciliation = async () => {
    try {
      setLoadingRecon(true);
      const res = await fetch('/api/inventory/audit/reconciliation');
      const data = await res.json();
      if (data.success) {
        setReconReport(data.report);
      }
    } catch (err) {
      console.error('Error loading reconciliation:', err);
    } finally {
      setLoadingRecon(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reconciliation') {
      loadReconciliation();
    }
  }, [activeTab]);

  // Handle Warehouse Transfer Submit
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.productId) {
      alert('Please select a product.');
      return;
    }
    try {
      setTransferSubmitting(true);
      const res = await fetch('/api/inventory/audit/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setIsTransferModalOpen(false);
        setTransferForm({
          productId: '',
          fromWarehouse: 'Main Warehouse',
          toWarehouse: 'Godown 1',
          cartons: 0,
          boxes: 0,
          pieces: 0,
          notes: '',
        });
        loadInitialData();
        if (selectedProductId) loadProductLedger(selectedProductId);
        if (activeTab === 'movements') loadAllMovements();
      } else {
        alert(data.message || 'Transfer failed');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // CSV Exporter
  const exportToCSV = () => {
    if (activeTab === 'ledger' && productLedger) {
      const headers = ['Date', 'Movement #', 'Document', 'Type', 'Warehouse', 'Qty In', 'Qty Out', 'Net Change', 'Balance', 'Packaging', 'Unit Cost', 'Total Value', 'User', 'Status'];
      const rows = productLedger.rows.map((r) => [
        r.date,
        r.movementNumber,
        r.documentNumber,
        r.type,
        r.warehouse,
        r.quantityIn,
        r.quantityOut,
        r.netChange,
        r.balance,
        `"${r.formattedBreakdown}"`,
        r.unitCost,
        r.totalValue,
        `"${r.user}"`,
        r.status,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Stock_Ledger_${productLedger.sku}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeTab === 'movements') {
      const headers = ['Date', 'Movement #', 'Product', 'SKU', 'Document', 'Type', 'Warehouse', 'Qty In', 'Qty Out', 'Net Change', 'Balance After', 'Cost', 'Value', 'Status'];
      const rows = movements.map((m) => [
        m.movement_date,
        m.movement_number,
        `"${m.product_name}"`,
        m.sku,
        m.document_number,
        m.movement_type,
        m.warehouse,
        m.quantity_in_base,
        m.quantity_out_base,
        m.net_quantity_base,
        m.stock_after_base,
        m.unit_cost,
        m.total_cost,
        m.status,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Inventory_Movements_Audit_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeTab === 'reconciliation' && reconReport) {
      const headers = ['Product', 'SKU', 'Category', 'Warehouse', 'System Stock', 'Ledger Stock', 'Difference', 'Variance Flag', 'Last Movement Date', 'Last Document'];
      const rows = reconReport.items.map((i) => [
        `"${i.productName}"`,
        i.sku,
        `"${i.category}"`,
        i.warehouse,
        i.systemCurrentStock,
        i.ledgerCalculatedStock,
        i.difference,
        i.hasVariance ? 'VARIANCE' : 'MATCHED',
        i.lastMovementDate || '',
        i.lastDocumentNumber || '',
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Stock_Audit_Reconciliation_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Helper for Movement Type Badge
  const renderMovementTypeBadge = (type: string) => {
    switch (type) {
      case 'OPENING_STOCK':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">Opening Stock</span>;
      case 'PURCHASE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">Purchase Receipt</span>;
      case 'PURCHASE_RETURN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">Purchase Return</span>;
      case 'SALE_ORDER':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">Sales Order</span>;
      case 'DIRECT_SALE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50">Direct Van Sale</span>;
      case 'SALE_RETURN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">Sales Return</span>;
      case 'STOCK_ADJUSTMENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">Adjustment</span>;
      case 'TRANSFER_IN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50">Transfer In</span>;
      case 'TRANSFER_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50">Transfer Out</span>;
      case 'DAMAGE_WRITEOFF':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">Damage / Quarantine</span>;
      case 'REVERSAL_IN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-mono">REVERSAL (+IN)</span>;
      case 'REVERSAL_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-mono">REVERSAL (-OUT)</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">Cancelled Tx</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{type}</span>;
    }
  };

  // Helper for Status Badge
  const renderStatusBadge = (status: string, reversalReason?: string | null) => {
    if (status === 'REVERSED') {
      return (
        <span
          title={reversalReason ? `Reversed: ${reversalReason}` : 'Reversed Transaction'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/50 cursor-help"
        >
          <RotateCcw size={11} /> REVERSED
        </span>
      );
    }
    if (status === 'DELETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700">
          DELETED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
        <CheckCircle2 size={11} /> POSTED
      </span>
    );
  };

  // Filtered reconciliation items
  const filteredReconItems = useMemo(() => {
    if (!reconReport) return [];
    return reconReport.items.filter((item) => {
      if (reconVarianceOnly && !item.hasVariance) return false;
      if (reconSearch.trim()) {
        const q = reconSearch.toLowerCase();
        return (
          item.productName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reconReport, reconVarianceOnly, reconSearch]);

  return (
    <ListPageContainer className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">
            Inventory Audit & Stock Ledger
          </h1>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-hover)] shadow-sm transition-all"
          >
            <ArrowRightLeft size={15} className="text-emerald-600" />
            Warehouse Transfer
          </button>

          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-hover)] shadow-sm transition-all"
          >
            <Download size={15} className="text-blue-600" />
            Export CSV
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-hover)] shadow-sm transition-all"
          >
            <Printer size={15} />
            Print Ledger
          </button>

          <button
            onClick={() => {
              loadInitialData();
              if (selectedProductId) loadProductLedger(selectedProductId);
              if (activeTab === 'movements') loadAllMovements();
              if (activeTab === 'reconciliation') loadReconciliation();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>



      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers size={16} />
          Product Stock Ledger
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'movements'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <History size={16} />
          All Movements Audit Trail
          {movementsTotal > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 font-bold tabular-nums">
              {formatInteger(movementsTotal)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'reconciliation'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ShieldAlert size={16} />
          Inventory Reconciliation
          {kpis && kpis.productsWithVariance > 0 ? (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 font-bold tabular-nums">
              {formatInteger(kpis.productsWithVariance)}
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-bold">
              Synced
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'warehouses'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Building2 size={16} />
          Warehouse Ledger & Godowns
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PRODUCT STOCK LEDGER (ITEM LEDGER)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'ledger' && (
        <div className="space-y-5">
          {/* Product Selector & Filter Bar (Redesigned Soft Tinted Container) */}
          <div className="bg-slate-100/75 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3.5">
            {/* Header Strip with Filter Icon */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                  <Filter size={13} />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">
                  Audit Filters
                </span>
                <span className="hidden sm:inline-block text-[11px] text-slate-500 dark:text-slate-400">
                  • Refine ledger by product, warehouse location, date range, and entry status
                </span>
              </div>

              {(ledgerFromDate || ledgerToDate || ledgerWarehouse !== 'ALL' || ledgerStatus !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setLedgerWarehouse('ALL');
                    setLedgerFromDate('');
                    setLedgerToDate('');
                    setLedgerStatus('ALL');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                  title="Reset filters to default"
                >
                  <RotateCcw size={11} />
                  Reset Filters
                </button>
              )}
            </div>

            {/* Filter Controls Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Product Select */}
              <div className="md:col-span-4">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Package size={13} className="text-slate-500 dark:text-slate-400" />
                  Product / Item
                </label>
                <SearchableSelect
                  options={productOptions}
                  value={selectedProductId}
                  onChange={(val) => setSelectedProductId(val)}
                  placeholder="Select product..."
                  className="w-full"
                />
              </div>

              {/* Warehouse Filter */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Building2 size={13} className="text-slate-500 dark:text-slate-400" />
                  Warehouse
                </label>
                <SearchableSelect
                  options={warehouseOptions}
                  value={ledgerWarehouse}
                  onChange={(val) => setLedgerWarehouse(val)}
                  placeholder="Filter warehouse..."
                  className="w-full"
                />
              </div>

              {/* Date Range: Grouped From Date + To Date */}
              <div className="md:col-span-4">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Calendar size={13} className="text-slate-500 dark:text-slate-400" />
                  Date Range
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <input
                      type="date"
                      value={ledgerFromDate}
                      onChange={(e) => setLedgerFromDate(e.target.value)}
                      className="w-full h-10 px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                      title="From Date"
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 px-0.5">→</span>
                  <div className="flex-1">
                    <input
                      type="date"
                      value={ledgerToDate}
                      onChange={(e) => setLedgerToDate(e.target.value)}
                      className="w-full h-10 px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                      title="To Date"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Layers size={13} className="text-slate-500 dark:text-slate-400" />
                  Entry Status
                </label>
                <SearchableSelect
                  value={ledgerStatus}
                  onChange={(val) => setLedgerStatus(val)}
                  options={ledgerStatusOptions}
                  placeholder="All Movements"
                  searchPlaceholder="Search status..."
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Product Summary Header Card */}
          {productLedger && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-md border border-slate-700">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {productLedger.sku}
                    </span>
                    <span className="text-xs text-slate-300">Category: {productLedger.category}</span>
                    <span className="text-xs text-slate-300">• Brand: {productLedger.brand}</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white mt-1">
                    {productLedger.productName}
                  </h2>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <Building2 size={13} /> Location: {productLedger.warehouse}
                  </div>
                </div>

                {/* Running Balance Stats Grid */}
                <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 md:border-l border-slate-700 pt-3 md:pt-0 md:pl-6">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Opening Bal</div>
                    <div className="text-lg font-bold tabular-nums text-slate-200">
                      {formatInteger(productLedger.openingBalance)} <span className="text-xs font-normal">pcs</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">+ Total In</div>
                    <div className="text-lg font-bold tabular-nums text-emerald-400">
                      +{formatInteger(productLedger.totalIn)} <span className="text-xs font-normal">pcs</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">- Total Out</div>
                    <div className="text-lg font-bold tabular-nums text-amber-400">
                      -{formatInteger(productLedger.totalOut)} <span className="text-xs font-normal">pcs</span>
                    </div>
                  </div>

                  <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                    <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">Closing Balance</div>
                    <div className="text-xl font-extrabold tabular-nums text-emerald-400">
                      {formatInteger(productLedger.closingBalance)} <span className="text-xs font-normal">pcs</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Valuation (Cost)</div>
                    <div className="text-lg font-bold tabular-nums text-slate-100">
                      {formatCurrency(productLedger.closingStockValue, 'PKR')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Stock Ledger Table */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-heading)]">
                  Chronological Transaction Stock Ledger
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Every increase and decrease event with exact running physical balance after movement.
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
                {productLedger?.rows.length || 0} Movements Recorded
              </span>
            </div>

            {loadingLedger ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
                Calculating running balance ledger...
              </div>
            ) : !productLedger || productLedger.rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <Layers size={36} className="mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
                No stock movements found matching the selected filters.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-3.5">Date & Time</th>
                      <th className="py-3 px-3.5">Movement #</th>
                      <th className="py-3 px-3.5">Document</th>
                      <th className="py-3 px-3.5">Movement Type</th>
                      <th className="py-3 px-3.5">Warehouse</th>
                      <th className="py-3 px-3.5 text-right">Qty In</th>
                      <th className="py-3 px-3.5 text-right">Qty Out</th>
                      <th className="py-3 px-3.5 text-right">Net Change</th>
                      <th className="py-3 px-3.5 text-right font-extrabold bg-emerald-500/5">Running Balance</th>
                      <th className="py-3 px-3.5">Packaging</th>
                      <th className="py-3 px-3.5 text-right">Unit Cost</th>
                      <th className="py-3 px-3.5 text-right">Total Value</th>
                      <th className="py-3 px-3.5">User</th>
                      <th className="py-3 px-3.5 text-center">Status</th>
                      <th className="py-3 px-3.5 text-center">Audit Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {paginatedLedgerRows.map((row: any) => {
                      const isReversed = row.status === 'REVERSED';
                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-[var(--surface-hover)] transition-colors ${
                            isReversed ? 'bg-red-50/20 opacity-75' : ''
                          }`}
                        >
                          <td className="py-3 px-3.5 font-medium whitespace-nowrap text-[var(--text-primary)]">
                            <div>{row.date}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{row.createdAt.slice(11, 19)}</div>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {row.movementNumber}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-semibold text-[var(--text-heading)]">
                              <BusinessReferenceLink
                                businessReference={row.documentNumber}
                                sourceDocumentId={row.originalTransactionId}
                                sourceDocumentType={row.sourceDocumentType}
                                transactionType={row.type}
                              />
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">{row.sourceDocumentType}</div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {renderMovementTypeBadge(row.type)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                            {row.warehouse}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                            {row.quantityIn > 0 ? `+${formatInteger(row.quantityIn)}` : '—'}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-semibold text-amber-600 whitespace-nowrap">
                            {row.quantityOut > 0 ? `-${formatInteger(row.quantityOut)}` : '—'}
                          </td>
                          <td className={`py-3 px-3.5 text-right tabular-nums font-bold whitespace-nowrap ${
                            row.netChange > 0 ? 'text-emerald-600' : row.netChange < 0 ? 'text-amber-600' : 'text-slate-600'
                          }`}>
                            {row.netChange > 0 ? `+${formatInteger(row.netChange)}` : row.netChange < 0 ? formatInteger(row.netChange) : '0'}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-extrabold text-sm text-[var(--text-heading)] bg-emerald-500/5 whitespace-nowrap">
                            {formatInteger(row.balance)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)] font-mono text-[11px]">
                            {row.formattedBreakdown}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums whitespace-nowrap text-[var(--text-primary)]">
                            {formatCurrency(row.unitCost, 'PKR')}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-medium whitespace-nowrap text-[var(--text-heading)]">
                            {formatCurrency(row.totalValue, 'PKR')}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                            {row.user}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {renderStatusBadge(row.status, row.reversalReason)}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <button
                              onClick={() => setDetailModalItem(row)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-colors"
                              title="View Immutable Audit Record"
                            >
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <PaginationControls
                currentPage={ledgerPagination.currentPage}
                totalRecords={productLedger.rows.length}
                pageSize={ledgerPagination.pageSize}
                onPageChange={ledgerPagination.onPageChange}
                onPageSizeChange={ledgerPagination.onPageSizeChange}
              />
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ALL MOVEMENTS AUDIT TRAIL (GLOBAL FEED)                            */}
      {/* ========================================================================= */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Movement Filters Bar */}
          <div className="filter-section-card space-y-3.5">
            {/* Header Strip */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                  <Filter size={13} />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">
                  Movement Trail Filters
                </span>
                <span className="hidden sm:inline-block text-[11px] text-slate-500 dark:text-slate-400">
                  • Search and categorize cross-warehouse stock movement logs
                </span>
              </div>
              {(movSearch || movTxCategory !== 'ALL' || movType !== 'ALL' || movWarehouse !== 'ALL' || movStatus !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setMovSearch('');
                    setMovTxCategory('ALL');
                    setMovType('ALL');
                    setMovWarehouse('ALL');
                    setMovStatus('ALL');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                  title="Reset filters to default"
                >
                  <RotateCcw size={11} />
                  Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
              {/* Search */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Search size={13} className="text-slate-500 dark:text-slate-400" />
                  Search Doc / Movement #
                </label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search document #, movement #, SKU..."
                    value={movSearch}
                    onChange={(e) => setMovSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Tx Category Pills */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Layers size={13} className="text-slate-500 dark:text-slate-400" />
                  Category
                </label>
                <SearchableSelect
                  value={movTxCategory}
                  onChange={(val) => setMovTxCategory(val)}
                  options={movTxCategoryOptions}
                  placeholder="All Categories"
                  searchPlaceholder="Search category..."
                  size="sm"
                />
              </div>

              {/* Movement Type */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <History size={13} className="text-slate-500 dark:text-slate-400" />
                  Movement Type
                </label>
                <SearchableSelect
                  value={movType}
                  onChange={(val) => setMovType(val)}
                  options={movTypeOptions}
                  placeholder="All Types"
                  searchPlaceholder="Search type..."
                  size="sm"
                />
              </div>

              {/* Warehouse */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <Building2 size={13} className="text-slate-500 dark:text-slate-400" />
                  Warehouse
                </label>
                <SearchableSelect
                  options={warehouseOptions}
                  value={movWarehouse}
                  onChange={(val) => setMovWarehouse(val)}
                  placeholder="Filter location..."
                  className="w-full"
                />
              </div>

              {/* Status */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  <ShieldCheck size={13} className="text-slate-500 dark:text-slate-400" />
                  Status
                </label>
                <SearchableSelect
                  value={movStatus}
                  onChange={(val) => setMovStatus(val)}
                  options={movStatusOptions}
                  placeholder="All Statuses"
                  searchPlaceholder="Search status..."
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Movements Feed Table */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            {loadingMovements ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
                Loading audit movement feed...
              </div>
            ) : movements.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <History size={36} className="mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
                No inventory audit records match the current filter criteria.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-3.5">Date & Time</th>
                      <th className="py-3 px-3.5">Movement #</th>
                      <th className="py-3 px-3.5">Product & SKU</th>
                      <th className="py-3 px-3.5">Movement Type</th>
                      <th className="py-3 px-3.5">Document #</th>
                      <th className="py-3 px-3.5">Warehouse</th>
                      <th className="py-3 px-3.5 text-right">In</th>
                      <th className="py-3 px-3.5 text-right">Out</th>
                      <th className="py-3 px-3.5 text-right">Net Qty</th>
                      <th className="py-3 px-3.5 text-right">Stock After</th>
                      <th className="py-3 px-3.5 text-right">Total Cost</th>
                      <th className="py-3 px-3.5">User</th>
                      <th className="py-3 px-3.5 text-center">Status</th>
                      <th className="py-3 px-3.5 text-center">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {paginatedMovements.map((m: any) => {
                      const isReversed = m.status === 'REVERSED';
                      return (
                        <tr
                          key={m.id}
                          className={`hover:bg-[var(--surface-hover)] transition-colors ${
                            isReversed ? 'bg-red-50/20 opacity-75' : ''
                          }`}
                        >
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-primary)]">
                            <div className="font-semibold">{m.movement_date}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{m.created_at.slice(11, 19)}</div>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {m.movement_number}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-bold text-[var(--text-heading)]">{m.product_name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono">{m.sku}</div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {renderMovementTypeBadge(m.movement_type)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-medium text-[var(--text-primary)]">
                            <div>
                              <BusinessReferenceLink
                                businessReference={m.document_number}
                                sourceDocumentId={m.original_transaction_id}
                                sourceDocumentType={m.source_document_type}
                                sourceModule={m.source_module}
                                transactionType={m.movement_type}
                              />
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">{m.source_document_type}</div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                            {m.warehouse}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                            {m.quantity_in_base > 0 ? `+${formatInteger(m.quantity_in_base)}` : '—'}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-semibold text-amber-600 whitespace-nowrap">
                            {m.quantity_out_base > 0 ? `-${formatInteger(m.quantity_out_base)}` : '—'}
                          </td>
                          <td className={`py-3 px-3.5 text-right tabular-nums font-bold whitespace-nowrap ${
                            m.net_quantity_base > 0 ? 'text-emerald-600' : m.net_quantity_base < 0 ? 'text-amber-600' : 'text-slate-600'
                          }`}>
                            {m.net_quantity_base > 0 ? `+${formatInteger(m.net_quantity_base)}` : formatInteger(m.net_quantity_base)}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-bold text-sm text-[var(--text-heading)] whitespace-nowrap">
                            {formatInteger(m.stock_after_base)}
                          </td>
                          <td className="py-3 px-3.5 text-right tabular-nums font-medium text-[var(--text-heading)] whitespace-nowrap">
                            {formatCurrency(m.total_cost, 'PKR')}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                            {m.user_name || 'admin'}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {renderStatusBadge(m.status, m.reversal_reason)}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <button
                              onClick={() => setDetailModalItem(m)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-colors"
                              title="View Full Audit Record"
                            >
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <PaginationControls
                currentPage={movementsPagination.currentPage}
                totalRecords={movements.length}
                pageSize={movementsPagination.pageSize}
                onPageChange={movementsPagination.onPageChange}
                onPageSizeChange={movementsPagination.onPageSizeChange}
              />
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INVENTORY RECONCILIATION (VARIANCE ENGINE)                         */}
      {/* ========================================================================= */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-5">
          {/* Reconciliation Status Banner */}
          {reconReport && (
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
              reconReport.varianceCount > 0
                ? 'bg-red-500/10 border-red-500/20 text-red-900'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  reconReport.varianceCount > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {reconReport.varianceCount > 0 ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {reconReport.varianceCount > 0
                      ? `STOCK AUDIT VARIANCE DETECTED (${formatInteger(reconReport.varianceCount)} Products)`
                      : 'Zero Stock Audit Variance — System & Ledger in Complete 1:1 Harmony'}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {reconReport.varianceCount > 0
                      ? 'Differences between physical current stock and chronological ledger calculations exist. Investigate below without silent overwrites.'
                      : 'All catalog items matched the sum of verified chronological stock movements with zero discrepancy.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setReconVarianceOnly(!reconVarianceOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    reconVarianceOnly
                      ? 'bg-red-600 text-white border-red-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {reconVarianceOnly ? 'Showing Variances Only' : 'Show Only Variances'}
                </button>
              </div>
            </div>
          )}

          {/* Search bar for reconciliation */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 shadow-sm flex items-center gap-3">
            <Search size={16} className="text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search product name, SKU, or category to inspect variance..."
              value={reconSearch}
              onChange={(e) => setReconSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
            />
          </div>

          {/* Reconciliation Table */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            {loadingRecon ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
                Auditing current stock against complete ledger movements...
              </div>
            ) : filteredReconItems.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-600 opacity-60" />
                No products found matching the criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)] uppercase tracking-wider text-[10px] font-bold border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-3.5">Product & SKU</th>
                      <th className="py-3 px-3.5">Category</th>
                      <th className="py-3 px-3.5">Warehouse</th>
                      <th className="py-3 px-3.5 text-right font-bold">System Current Stock</th>
                      <th className="py-3 px-3.5 text-right font-bold">Ledger Calculated Stock</th>
                      <th className="py-3 px-3.5 text-right font-extrabold">Variance Difference</th>
                      <th className="py-3 px-3.5 text-center">Audit Status</th>
                      <th className="py-3 px-3.5">Last Movement</th>
                      <th className="py-3 px-3.5">Possible Source of Variance</th>
                      <th className="py-3 px-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredReconItems.map((item) => (
                      <tr
                        key={item.productId}
                        className={`hover:bg-[var(--surface-hover)] transition-colors ${
                          item.hasVariance ? 'bg-red-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-[var(--text-heading)]">{item.productName}</div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">{item.sku}</div>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                          {item.category}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                          {item.warehouse}
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums font-bold text-sm text-[var(--text-heading)] whitespace-nowrap">
                          {formatInteger(item.systemCurrentStock)} <span className="text-[10px] font-normal text-[var(--text-muted)]">pcs</span>
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums font-bold text-sm text-[var(--text-heading)] whitespace-nowrap">
                          {formatInteger(item.ledgerCalculatedStock)} <span className="text-[10px] font-normal text-[var(--text-muted)]">pcs</span>
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums font-extrabold text-sm whitespace-nowrap">
                          {item.hasVariance ? (
                            <span className="px-2 py-0.5 rounded font-mono text-red-700 bg-red-100 border border-red-300">
                              {item.difference > 0 ? `+${formatInteger(item.difference)}` : formatInteger(item.difference)} pcs
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-mono font-medium">0 pcs</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {item.hasVariance ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
                              <AlertTriangle size={12} /> STOCK VARIANCE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} /> MATCHED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap text-[var(--text-muted)]">
                          <div>{item.lastMovementDate || 'No movements'}</div>
                          <div className="text-[10px] font-mono text-slate-500">{item.lastDocumentNumber || ''}</div>
                        </td>
                        <td className="py-3 px-3.5 text-xs text-[var(--text-muted)] max-w-xs truncate" title={item.possibleSource}>
                          {item.possibleSource}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedProductId(item.productId);
                              setActiveTab('ledger');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                          >
                            Inspect Ledger
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: WAREHOUSE BREAKDOWN & TRANSFERS                                    */}
      {/* ========================================================================= */}
      {activeTab === 'warehouses' && (
        <div className="space-y-6">
          {/* Warehouse Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {warehouseSummaries.map((wh) => (
              <div key={wh.warehouse} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                    <Building2 size={20} />
                  </div>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    Active Storage
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-heading)]">{wh.warehouse}</h3>
                  <div className="text-xs text-[var(--text-muted)]">{wh.totalProducts} Distinct Stocked Products</div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Physical Stock</div>
                    <div className="text-base font-bold tabular-nums text-[var(--text-heading)]">
                      {formatInteger(wh.totalPieces)} pcs
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Stock Valuation</div>
                    <div className="text-base font-bold tabular-nums text-emerald-600">
                      {formatCurrency(wh.totalValue, 'PKR')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Transfer Callout */}
          <div className="bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-sm text-[var(--text-heading)]">Warehouse / Godown Stock Transfers</h4>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Transfer inventory between central warehouse and secondary godowns or vans with full atomic dual-entry audit logging.
              </p>
            </div>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 shadow-sm transition-all"
            >
              <ArrowRightLeft size={14} />
              Transfer Stock Now
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRILL-DOWN AUDIT DETAILS MODAL                                            */}
      {/* ========================================================================= */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="modal-solid-panel relative z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto text-slate-900 dark:text-slate-100">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    Audit Movement Record:
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {detailModalItem.movementNumber || detailModalItem.movement_number}
                    </span>
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Recorded: {detailModalItem.createdAt || detailModalItem.created_at} • Immutable Audit Trail
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 space-y-5 text-sm">
              {/* Product Header */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-base text-slate-900 dark:text-white">
                    {detailModalItem.productName || detailModalItem.product_name || productLedger?.productName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 font-semibold">
                    SKU: {detailModalItem.sku || productLedger?.sku}
                  </div>
                </div>
                <div>
                  {renderMovementTypeBadge(detailModalItem.type || detailModalItem.movement_type)}
                </div>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Document Number</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm mt-0.5">
                    {detailModalItem.documentNumber || detailModalItem.document_number}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Source Document</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {detailModalItem.sourceDocumentType || detailModalItem.source_document_type}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Warehouse</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {detailModalItem.warehouse}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Quantity In</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm mt-0.5">
                    +{formatInteger(detailModalItem.quantityIn ?? detailModalItem.quantity_in_base ?? 0)} pcs
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Quantity Out</div>
                  <div className="font-bold text-amber-600 dark:text-amber-400 tabular-nums text-sm mt-0.5">
                    -{formatInteger(detailModalItem.quantityOut ?? detailModalItem.quantity_out_base ?? 0)} pcs
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Net Quantity Change</div>
                  <div className="font-extrabold text-slate-900 dark:text-white tabular-nums text-sm mt-0.5">
                    {formatInteger(detailModalItem.netChange ?? detailModalItem.net_quantity_base ?? 0)} pcs
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Stock Before Movement</div>
                  <div className="font-semibold tabular-nums text-slate-600 dark:text-slate-400 text-sm mt-0.5">
                    {formatInteger(detailModalItem.stock_before_base ?? (detailModalItem.balance - (detailModalItem.netChange || 0)))} pcs
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Stock After Movement</div>
                  <div className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">
                    {formatInteger(detailModalItem.balance ?? detailModalItem.stock_after_base ?? 0)} pcs
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Unit Cost</div>
                  <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                    {formatCurrency(detailModalItem.unitCost ?? detailModalItem.unit_cost, 'PKR')}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Total Cost Value</div>
                  <div className="font-bold tabular-nums text-slate-900 dark:text-white text-sm mt-0.5">
                    {formatCurrency(detailModalItem.totalValue ?? detailModalItem.total_cost, 'PKR')}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Recorded By User</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {detailModalItem.user || detailModalItem.user_name || 'System Admin'}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Day Close Status</div>
                  <div className="font-semibold text-xs mt-0.5">
                    {detailModalItem.day_close_status === 'CLOSED' ? (
                      <span className="text-red-700 dark:text-red-300 font-bold bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900/40 px-2 py-0.5 rounded">
                        CLOSED DAY
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/40 px-2 py-0.5 rounded">
                        OPEN DAY
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Packaging Breakdown */}
              {detailModalItem.formattedBreakdown && (
                <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">3-Tier Packaging Breakdown</div>
                  <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {detailModalItem.formattedBreakdown}
                  </div>
                </div>
              )}

              {/* Reversal / Deletion Audit Section */}
              {(detailModalItem.status === 'REVERSED' || detailModalItem.status === 'DELETED') && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-300 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle size={15} />
                    Transaction Deleted & Reversed Audit Log
                  </div>
                  <div className="text-xs text-rose-950 dark:text-rose-200 space-y-1.5 leading-relaxed">
                    <div><strong>Reversal Reason:</strong> {detailModalItem.reversalReason || detailModalItem.reversal_reason || 'Not specified'}</div>
                    {detailModalItem.reversedBy && <div><strong>Reversed By User:</strong> {detailModalItem.reversedBy || detailModalItem.reversed_by_user_name}</div>}
                    {detailModalItem.reversedAt && <div><strong>Reversal Timestamp:</strong> {detailModalItem.reversedAt || detailModalItem.reversed_at}</div>}
                    {detailModalItem.admin_override_details && <div><strong>Admin Override:</strong> {detailModalItem.admin_override_details}</div>}
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailModalItem.notes && (
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Notes & Audit Memo</div>
                  <div className="text-xs text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700 font-mono leading-relaxed">
                    {detailModalItem.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/70 dark:bg-slate-900/90 rounded-b-2xl">
              <button
                onClick={() => setDetailModalItem(null)}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs transition-colors shadow-sm"
              >
                Close Audit Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WAREHOUSE TRANSFER MODAL                                                  */}
      {/* ========================================================================= */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="modal-solid-panel relative z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-auto text-slate-900 dark:text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Record Warehouse Stock Transfer
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Dual-entry stock movement between godowns or delivery vans
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              {/* Product */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Product / Item *
                </label>
                <SearchableSelect
                  options={productOptions}
                  value={transferForm.productId}
                  onChange={(val) => setTransferForm({ ...transferForm, productId: val })}
                  placeholder="Select product to transfer..."
                  className="w-full"
                />
              </div>

              {/* From & To Warehouses */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    From Warehouse *
                  </label>
                  <SearchableSelect
                    options={transferWarehouseOptions}
                    value={transferForm.fromWarehouse}
                    onChange={(val) => setTransferForm({ ...transferForm, fromWarehouse: val })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    To Warehouse *
                  </label>
                  <SearchableSelect
                    options={transferWarehouseOptions}
                    value={transferForm.toWarehouse}
                    onChange={(val) => setTransferForm({ ...transferForm, toWarehouse: val })}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Quantities */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Transfer Quantities (Base Pieces or Carton Breakdown)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Cartons</span>
                    <input
                      type="number"
                      min="0"
                      value={transferForm.cartons || ''}
                      placeholder="0"
                      onChange={(e) => setTransferForm({ ...transferForm, cartons: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Boxes</span>
                    <input
                      type="number"
                      min="0"
                      value={transferForm.boxes || ''}
                      placeholder="0"
                      onChange={(e) => setTransferForm({ ...transferForm, boxes: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Loose Pieces</span>
                    <input
                      type="number"
                      min="0"
                      value={transferForm.pieces || ''}
                      placeholder="0"
                      onChange={(e) => setTransferForm({ ...transferForm, pieces: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Transfer Memo / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Stock replenishment for Godown 1"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <ArrowRightLeft size={16} />
                  {transferSubmitting ? 'Transferring...' : 'Execute Stock Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
