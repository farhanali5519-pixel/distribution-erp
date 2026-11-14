'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { SearchableSelect, SearchableSelectOption } from '@/shared/components/SearchableSelect';
import { PaginationControls } from '@/shared/components/PaginationControls';
import { formatCurrency, formatInteger, fromPaisas } from '@/shared/utils/currency';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';
import {
  StockReportViewType,
  StockViewMode,
  StockAnalysisReportResult,
  StockDetailedRow,
  StockGroupedRow,
  FilterDimensionsResult,
} from '@/modules/reports/stock-analysis.service';
import {
  Printer,
  Download,
  RotateCcw,
  Search,
  Filter,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  DollarSign,
  Package,
  Boxes,
  FileText,
  CreditCard,
  AlertCircle,
  Truck,
  Building2,
  Users,
  MapPin,
  Tag,
  CheckCircle2,
  X,
  Store,
  Clock,
} from 'lucide-react';

const VIEW_BY_OPTIONS: SearchableSelectOption[] = [
  { value: 'detailed', label: 'Detailed Stock / Booking' },
  { value: 'supply_man', label: 'Supply Man Wise' },
  { value: 'salesman', label: 'Salesman Wise' },
  { value: 'order_booker', label: 'Order Booker Wise' },
  { value: 'customer', label: 'Customer / Shop Wise' },
  { value: 'order', label: 'Order Wise' },
  { value: 'item', label: 'Item Wise' },
  { value: 'route', label: 'Route Wise' },
  { value: 'brand', label: 'Brand Wise' },
  { value: 'company', label: 'Company Wise' },
  { value: 'category', label: 'Category Wise' },
  { value: 'warehouse', label: 'Warehouse Wise' },
];

const STOCK_VIEW_OPTIONS: SearchableSelectOption[] = [
  { value: 'all', label: 'All Stock & Booking' },
  { value: 'physical', label: 'Current Physical Stock' },
  { value: 'booked', label: 'Booked Stock (Pending Delivery)' },
  { value: 'allocated', label: 'Allocated / Dispatched Stock' },
  { value: 'available', label: 'Available Stock (Physical - Pending)' },
];

export function StockAnalysisClient() {
  const { profile: companyProfile } = useCompanyProfile();

  // Date Range State
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // View By & Stock View
  const [viewBy, setViewBy] = useState<StockReportViewType>('detailed');
  const [stockView, setStockView] = useState<StockViewMode>('all');

  // Search State
  const [search, setSearch] = useState<string>('');

  // Multi-Select Dimension Filters
  const [salesmanIds, setSalesmanIds] = useState<string[]>([]);
  const [orderBookerIds, setOrderBookerIds] = useState<string[]>([]);
  const [supplyPersonIds, setSupplyPersonIds] = useState<string[]>([]);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);

  // Sorting & Pagination
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'All'>(50);

  // Expanded Orders in Order Wise mode
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Dimension Options State
  const [dimensions, setDimensions] = useState<FilterDimensionsResult | null>(null);
  const [loadingDimensions, setLoadingDimensions] = useState<boolean>(true);

  // Report Data State
  const [reportData, setReportData] = useState<StockAnalysisReportResult | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load Filter Dimensions on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadDimensions() {
      try {
        setLoadingDimensions(true);
        const res = await fetch('/api/reports/stock-analysis?mode=dimensions').then((r) => r.json());
        if (isMounted && res.success) {
          setDimensions(res.data);
        }
      } catch (err: any) {
        console.error('Failed to load dimensions', err);
      } finally {
        if (isMounted) setLoadingDimensions(false);
      }
    }
    loadDimensions();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Report Data
  const fetchReport = useCallback(async () => {
    try {
      setLoadingReport(true);
      setError(null);

      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      params.set('viewBy', viewBy);
      params.set('stockView', stockView);
      params.set('page', String(page));
      params.set('pageSize', pageSize === 'All' ? '-1' : String(pageSize));
      if (search.trim()) params.set('search', search.trim());
      if (sortBy) params.set('sortBy', sortBy);
      if (sortOrder) params.set('sortOrder', sortOrder);

      if (salesmanIds.length > 0) params.set('salesmanIds', salesmanIds.join(','));
      if (orderBookerIds.length > 0) params.set('orderBookerIds', orderBookerIds.join(','));
      if (supplyPersonIds.length > 0) params.set('supplyPersonIds', supplyPersonIds.join(','));
      if (customerIds.length > 0) params.set('customerIds', customerIds.join(','));
      if (routeIds.length > 0) params.set('routeIds', routeIds.join(','));
      if (productIds.length > 0) params.set('productIds', productIds.join(','));
      if (categoryIds.length > 0) params.set('categoryIds', categoryIds.join(','));
      if (brandIds.length > 0) params.set('brandIds', brandIds.join(','));
      if (companyNames.length > 0) params.set('companyNames', companyNames.join(','));
      if (sources.length > 0) params.set('sources', sources.join(','));
      if (statuses.length > 0) params.set('statuses', statuses.join(','));
      if (warehouses.length > 0) params.set('warehouses', warehouses.join(','));

      const res = await fetch(`/api/reports/stock-analysis?${params.toString()}`).then((r) => r.json());
      if (res.success) {
        setReportData(res.data);
      } else {
        setError(res.error || 'Failed to load stock report data');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching report');
    } finally {
      setLoadingReport(false);
    }
  }, [
    fromDate,
    toDate,
    viewBy,
    stockView,
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    salesmanIds,
    orderBookerIds,
    supplyPersonIds,
    customerIds,
    routeIds,
    productIds,
    categoryIds,
    brandIds,
    companyNames,
    sources,
    statuses,
    warehouses,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setFromDate('');
    setToDate('');
    setViewBy('detailed');
    setStockView('all');
    setSearch('');
    setSalesmanIds([]);
    setOrderBookerIds([]);
    setSupplyPersonIds([]);
    setCustomerIds([]);
    setRouteIds([]);
    setProductIds([]);
    setCategoryIds([]);
    setBrandIds([]);
    setCompanyNames([]);
    setSources([]);
    setStatuses([]);
    setWarehouses([]);
    setSortBy('');
    setSortOrder('desc');
    setPage(1);
    setExpandedOrders(new Set());
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Drill-Down Handler
  const handleDrillDown = (row: StockGroupedRow) => {
    if (viewBy === 'supply_man' && row.groupId !== 'unassigned') {
      setSupplyPersonIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'salesman' && row.groupId !== 'unassigned') {
      setSalesmanIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'order_booker' && row.groupId !== 'unassigned') {
      setOrderBookerIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'customer') {
      setCustomerIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'item') {
      setProductIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'route' && row.groupId !== 'unassigned') {
      setRouteIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'brand' && row.groupId !== 'unbranded') {
      setBrandIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'company' && row.groupId !== 'Unassigned') {
      setCompanyNames([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'category' && row.groupId !== 'uncategorized') {
      setCategoryIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'order') {
      toggleOrderExpand(row.groupId);
      return;
    }
    setPage(1);
  };

  // Options Mapping
  const salesmanOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.salesmen) return [];
    return dimensions.salesmen.map((s) => ({
      value: s.id,
      label: s.name,
      subLabel: s.employeeCode ? `Code: ${s.employeeCode}` : undefined,
      keywords: [s.name, s.employeeCode],
    }));
  }, [dimensions]);

  const orderBookerOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.orderBookers) return [];
    return dimensions.orderBookers.map((s) => ({
      value: s.id,
      label: s.name,
      subLabel: s.employeeCode ? `Code: ${s.employeeCode}` : undefined,
      keywords: [s.name, s.employeeCode],
    }));
  }, [dimensions]);

  const supplyPersonOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.supplyPersons) return [];
    return dimensions.supplyPersons.map((s) => ({
      value: s.id,
      label: s.name,
      subLabel: s.employeeCode ? `Code: ${s.employeeCode}` : undefined,
      keywords: [s.name, s.employeeCode],
    }));
  }, [dimensions]);

  const customerOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.customers) return [];
    return dimensions.customers.map((c) => ({
      value: c.id,
      label: c.shopName || c.name,
      subLabel: c.shopName && c.shopName !== c.name ? `Owner: ${c.name}` : undefined,
      badge: c.phone || undefined,
      keywords: [c.name, c.shopName || '', c.phone || '', c.code || ''],
    }));
  }, [dimensions]);

  const routeOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.routes) return [];
    return dimensions.routes.map((r) => ({
      value: r.id,
      label: r.name,
      subLabel: r.code ? `Code: ${r.code}` : undefined,
      keywords: [r.name, r.code],
    }));
  }, [dimensions]);

  const productOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.products) return [];
    return dimensions.products.map((p) => ({
      value: p.id,
      label: p.name,
      subLabel: `SKU: ${p.sku}`,
      keywords: [p.name, p.sku],
    }));
  }, [dimensions]);

  const categoryOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.categories) return [];
    return dimensions.categories.map((c) => ({
      value: c.id,
      label: c.name,
      keywords: [c.name],
    }));
  }, [dimensions]);

  const brandOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.brands) return [];
    return dimensions.brands.map((b) => ({
      value: b.id,
      label: b.name,
      keywords: [b.name],
    }));
  }, [dimensions]);

  const companyOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.companies) return [];
    return dimensions.companies.map((c) => ({
      value: c.name,
      label: c.name,
      keywords: [c.name],
    }));
  }, [dimensions]);

  const sourceOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.sources) return [];
    return dimensions.sources.map((s) => ({
      value: s.id,
      label: s.label,
    }));
  }, [dimensions]);

  const statusOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.statuses) return [];
    return dimensions.statuses.map((s) => ({
      value: s.id,
      label: s.label,
    }));
  }, [dimensions]);

  const warehouseOptions: SearchableSelectOption[] = useMemo(() => {
    if (!dimensions?.warehouses) return [];
    return dimensions.warehouses.map((w) => ({
      value: w.id,
      label: w.name,
    }));
  }, [dimensions]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (fromDate) count++;
    if (toDate) count++;
    if (stockView !== 'all') count++;
    if (salesmanIds.length > 0) count++;
    if (orderBookerIds.length > 0) count++;
    if (supplyPersonIds.length > 0) count++;
    if (customerIds.length > 0) count++;
    if (routeIds.length > 0) count++;
    if (productIds.length > 0) count++;
    if (categoryIds.length > 0) count++;
    if (brandIds.length > 0) count++;
    if (companyNames.length > 0) count++;
    if (sources.length > 0) count++;
    if (statuses.length > 0) count++;
    if (warehouses.length > 0) count++;
    if (search.trim()) count++;
    return count;
  }, [
    fromDate,
    toDate,
    stockView,
    salesmanIds,
    orderBookerIds,
    supplyPersonIds,
    customerIds,
    routeIds,
    productIds,
    categoryIds,
    brandIds,
    companyNames,
    sources,
    statuses,
    warehouses,
    search,
  ]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!reportData) return;

    const escapeCsv = (str: any) => {
      const val = str === null || str === undefined ? '' : String(str);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const lines: string[] = [];

    // Header info
    lines.push(escapeCsv(companyProfile.businessName || 'SALEFLOW DISTRIBUTION ERP'));
    lines.push(escapeCsv(`Stock & Booking Analysis Report - ${VIEW_BY_OPTIONS.find((v) => v.value === viewBy)?.label || 'Detailed'}`));
    lines.push(escapeCsv(`Stock View Mode: ${STOCK_VIEW_OPTIONS.find((s) => s.value === stockView)?.label || 'All'}`));
    lines.push(escapeCsv(`Date Range: ${fromDate || 'Beginning'} to ${toDate || 'Present'}`));
    lines.push(escapeCsv(`Generated: ${new Date().toLocaleString()}`));
    lines.push('');

    // Table Content
    if (viewBy === 'detailed') {
      const headers = [
        'Date',
        'Order #',
        'Customer',
        'Shop Name',
        'Route',
        'Salesman',
        'Order Booker',
        'Supply Man',
        'SKU',
        'Product',
        'Category',
        'Brand',
        'CTN',
        'BOX',
        'Loose PCS',
        'Total Booked PCS',
        'Bonus PCS',
        'Allocated PCS',
        'Issued PCS',
        'Pending PCS',
        'Order Status',
      ];
      lines.push(headers.map(escapeCsv).join(','));

      const rows = reportData.detailedRows || [];
      for (const r of rows) {
        lines.push([
          escapeCsv(r.date),
          escapeCsv(r.orderNumber),
          escapeCsv(r.customerName),
          escapeCsv(r.shopName),
          escapeCsv(r.routeName),
          escapeCsv(r.salesmanName),
          escapeCsv(r.orderBookerName),
          escapeCsv(r.supplyPersonName),
          escapeCsv(r.sku),
          escapeCsv(r.productName),
          escapeCsv(r.categoryName),
          escapeCsv(r.brandName),
          escapeCsv(r.bookedCartons),
          escapeCsv(r.bookedBoxes),
          escapeCsv(r.bookedLoosePieces),
          escapeCsv(r.totalBookedPcs),
          escapeCsv(r.bonusPcs),
          escapeCsv(r.allocatedPcs),
          escapeCsv(r.issuedPcs),
          escapeCsv(r.pendingPcs),
          escapeCsv(r.orderStatus),
        ].join(','));
      }

      // Grand Total
      const gt = reportData.grandTotal;
      lines.push([
        escapeCsv('GRAND TOTAL'),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        escapeCsv(gt.cartonsCount),
        escapeCsv(gt.boxesCount),
        escapeCsv(gt.loosePiecesCount),
        escapeCsv(gt.totalBookedPcs),
        escapeCsv(gt.bonusPcs),
        escapeCsv(gt.allocatedPcs),
        escapeCsv(gt.issuedPcs),
        escapeCsv(gt.pendingPcs),
        '',
      ].join(','));
    } else {
      const headers = [
        'Grouping',
        'Hierarchy / Details',
        'Orders',
        'Shops',
        'Products',
        'Total Booked PCS',
        'Bonus PCS',
        'Packaging Breakdown',
        'Allocated PCS',
        'Issued PCS',
        'Pending PCS',
      ];
      lines.push(headers.map(escapeCsv).join(','));

      const rows = reportData.groupedRows || [];
      for (const r of rows) {
        lines.push([
          escapeCsv(r.groupName),
          escapeCsv(r.secondaryLabel || r.groupCode || ''),
          escapeCsv(r.orderCount),
          escapeCsv(r.customerCount),
          escapeCsv(r.productCount),
          escapeCsv(r.totalBookedPcs),
          escapeCsv(r.bonusPcs),
          escapeCsv(r.packagingSummary),
          escapeCsv(r.allocatedPcs),
          escapeCsv(r.issuedPcs),
          escapeCsv(r.pendingPcs),
        ].join(','));
      }

      // Grand Total
      const gt = reportData.grandTotal;
      lines.push([
        escapeCsv('GRAND TOTAL'),
        '',
        escapeCsv(gt.orderCount),
        escapeCsv(gt.customerCount),
        escapeCsv(gt.productCount),
        escapeCsv(gt.totalBookedPcs),
        escapeCsv(gt.bonusPcs),
        escapeCsv(gt.packagingSummary),
        escapeCsv(gt.allocatedPcs),
        escapeCsv(gt.issuedPcs),
        escapeCsv(gt.pendingPcs),
      ].join(','));
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Stock_Booking_Analysis_${viewBy}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const kpis = reportData?.kpis;
  const grandTotal = reportData?.grandTotal;

  return (
    <ListPageContainer className="space-y-4 pb-16 print:p-0 print:m-0 print:max-w-none">
      {/* 1. Header (Hidden on print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Boxes size={22} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-heading)] tracking-tight">
                Stock & Booking Analysis Report
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                Supply team loading, customer booking, and warehouse inventory allocation analysis
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] hover:bg-[var(--surface-hover)] text-[var(--text-body)] transition-colors shadow-sm"
            title="Print Report"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!reportData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm disabled:opacity-50"
            title="Export CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Print-Only Dedicated Header */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {companyProfile.businessName || 'SALEFLOW DISTRIBUTION ERP'}
            </h1>
            <p className="text-sm font-semibold text-slate-700">Stock & Booking Analysis Report</p>
            <p className="text-xs text-slate-500">
              View By: {VIEW_BY_OPTIONS.find((v) => v.value === viewBy)?.label || 'Detailed'} • Mode: {STOCK_VIEW_OPTIONS.find((s) => s.value === stockView)?.label || 'All'}
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <div>
              <span className="font-semibold">Period:</span>{' '}
              {fromDate ? fromDate : 'Beginning'} to {toDate ? toDate : 'Present'}
            </div>
            <div>
              <span className="font-semibold">Printed:</span> {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Panel (Hidden on print) */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-sm space-y-3.5 print:hidden">
        {/* Row 1: Primary Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* From Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFilterChange(setFromDate, e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleFilterChange(setToDate, e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Stock View Mode */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
              Stock View
            </label>
            <SearchableSelect
              mode="single"
              value={stockView}
              onChange={(val) => handleFilterChange(setStockView, val as StockViewMode)}
              options={STOCK_VIEW_OPTIONS}
              placeholder="Select Stock View..."
              size="sm"
            />
          </div>

          {/* View Report By */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              View Report By
            </label>
            <SearchableSelect
              mode="single"
              value={viewBy}
              onChange={(val) => handleFilterChange(setViewBy, val as StockReportViewType)}
              options={VIEW_BY_OPTIONS}
              placeholder="Select grouping..."
              size="sm"
            />
          </div>

          {/* Clear Filters Button & Active count */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            {activeFiltersCount > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                {activeFiltersCount} Active
              </span>
            )}
            <button
              onClick={handleClearAllFilters}
              className="inline-flex items-center gap-1 px-3 h-9 text-xs font-semibold rounded-md border border-[var(--border-subtle)] bg-[var(--surface-hover)] text-[var(--text-body)] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Reset all filters and view"
            >
              <RotateCcw size={13} />
              <span>Clear All</span>
            </button>
          </div>
        </div>

        {/* Row 2: Sales Team & Logistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
          {/* Salesman */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Salesman
            </label>
            <SearchableSelect
              mode="multiple"
              value={salesmanIds}
              onChange={(val) => handleFilterChange(setSalesmanIds, val)}
              options={salesmanOptions}
              placeholder="All Salesmen"
              searchPlaceholder="Search salesman..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Order Booker */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Sale Order Booker
            </label>
            <SearchableSelect
              mode="multiple"
              value={orderBookerIds}
              onChange={(val) => handleFilterChange(setOrderBookerIds, val)}
              options={orderBookerOptions}
              placeholder="All Order Bookers"
              searchPlaceholder="Search order booker..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Supply / Delivery Man */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Supply / Delivery Man
            </label>
            <SearchableSelect
              mode="multiple"
              value={supplyPersonIds}
              onChange={(val) => handleFilterChange(setSupplyPersonIds, val)}
              options={supplyPersonOptions}
              placeholder="All Delivery Men"
              searchPlaceholder="Search delivery staff..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Route */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Route / Territory
            </label>
            <SearchableSelect
              mode="multiple"
              value={routeIds}
              onChange={(val) => handleFilterChange(setRouteIds, val)}
              options={routeOptions}
              placeholder="All Routes"
              searchPlaceholder="Search route name or code..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>
        </div>

        {/* Row 3: Customer & Product Hierarchy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Customer / Retail Outlet */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Customer / Retail Outlet
            </label>
            <SearchableSelect
              mode="multiple"
              value={customerIds}
              onChange={(val) => handleFilterChange(setCustomerIds, val)}
              options={customerOptions}
              placeholder="All Customers / Shops"
              searchPlaceholder="Search shop name, customer, phone..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Product / Item */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Product / Item
            </label>
            <SearchableSelect
              mode="multiple"
              value={productIds}
              onChange={(val) => handleFilterChange(setProductIds, val)}
              options={productOptions}
              placeholder="All Products"
              searchPlaceholder="Search item name or SKU..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Category
            </label>
            <SearchableSelect
              mode="multiple"
              value={categoryIds}
              onChange={(val) => handleFilterChange(setCategoryIds, val)}
              options={categoryOptions}
              placeholder="All Categories"
              searchPlaceholder="Search category..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Brand
            </label>
            <SearchableSelect
              mode="multiple"
              value={brandIds}
              onChange={(val) => handleFilterChange(setBrandIds, val)}
              options={brandOptions}
              placeholder="All Brands"
              searchPlaceholder="Search brand..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>
        </div>

        {/* Row 4: Company, Logistics & Channel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Product Company / Manufacturer */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Product Company / Manufacturer
            </label>
            <SearchableSelect
              mode="multiple"
              value={companyNames}
              onChange={(val) => handleFilterChange(setCompanyNames, val)}
              options={companyOptions}
              placeholder="All Companies"
              searchPlaceholder="Search company/manufacturer..."
              disabled={loadingDimensions}
              size="sm"
            />
          </div>

          {/* Sale Source */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Sale Source
            </label>
            <SearchableSelect
              mode="multiple"
              value={sources}
              onChange={(val) => handleFilterChange(setSources, val)}
              options={sourceOptions}
              placeholder="All Sources"
              size="sm"
            />
          </div>

          {/* Order / Bill Status */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Order / Bill Status
            </label>
            <SearchableSelect
              mode="multiple"
              value={statuses}
              onChange={(val) => handleFilterChange(setStatuses, val)}
              options={statusOptions}
              placeholder="All Statuses"
              size="sm"
            />
          </div>

          {/* Warehouse / Godown */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Warehouse / Godown
            </label>
            <SearchableSelect
              mode="multiple"
              value={warehouses}
              onChange={(val) => handleFilterChange(setWarehouses, val)}
              options={warehouseOptions}
              placeholder="All Warehouses"
              size="sm"
            />
          </div>
        </div>

        {/* General Search Box */}
        {(viewBy === 'detailed' || viewBy === 'order') && (
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                placeholder="Search by Order #, Customer, Shop, Product, SKU, Staff..."
                className="w-full h-9 pl-9 pr-8 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <button
                  onClick={() => handleFilterChange(setSearch, '')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
        {/* Total Booked PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Total Booked PCS
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalBookedPcs) : '0'}
          </div>
        </div>

        {/* Total Allocated PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Allocated PCS
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400 mt-0.5">
            {kpis ? formatInteger(kpis.totalAllocatedPcs) : '0'}
          </div>
        </div>

        {/* Total Issued PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Issued / Delivered
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {kpis ? formatInteger(kpis.totalIssuedPcs) : '0'}
          </div>
        </div>

        {/* Total Pending PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Pending Delivery
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
            {kpis ? formatInteger(kpis.totalPendingPcs) : '0'}
          </div>
        </div>

        {/* Physical Stock PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Physical Stock
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.currentPhysicalStockPcs) : '0'}
          </div>
        </div>

        {/* Available Stock PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            Available Stock
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-teal-600 dark:text-teal-400 mt-0.5">
            {kpis ? formatInteger(kpis.availableStockPcs) : '0'}
          </div>
        </div>

        {/* Total Orders */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Total Orders
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalOrders) : '0'}
          </div>
        </div>

        {/* Total Customers */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Outlets / Shops
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalCustomers) : '0'}
          </div>
        </div>

        {/* Total Products */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Products
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalProducts) : '0'}
          </div>
        </div>
      </div>

      {/* 5. Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
          <AlertCircle size={18} />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}

      {/* 6. Report Content Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] overflow-hidden shadow-sm">
        {loadingReport ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-xs font-medium">Generating Stock & Booking Analysis...</p>
          </div>
        ) : viewBy === 'detailed' ? (
          /* DETAILED STOCK / BOOKING TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface-hover)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  <th className="py-2.5 px-3 cursor-pointer select-none" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      {sortBy === 'date' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 cursor-pointer select-none" onClick={() => handleSort('orderNumber')}>
                    <div className="flex items-center gap-1">
                      <span>Order #</span>
                      {sortBy === 'orderNumber' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Customer / Shop</th>
                  <th className="py-2.5 px-3">Route</th>
                  <th className="py-2.5 px-3">Salesman</th>
                  <th className="py-2.5 px-3">Supply Man</th>
                  <th className="py-2.5 px-3">Product / SKU</th>
                  <th className="py-2.5 px-3 text-right">CTN</th>
                  <th className="py-2.5 px-3 text-right">BOX</th>
                  <th className="py-2.5 px-3 text-right">Loose</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none font-bold text-blue-600 dark:text-blue-400" onClick={() => handleSort('bookedPcs')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Booked PCS</span>
                      {sortBy === 'bookedPcs' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right text-purple-600 dark:text-purple-400">Bonus</th>
                  <th className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400">Allocated</th>
                  <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">Issued</th>
                  <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">Pending</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(!reportData?.detailedRows || reportData.detailedRows.length === 0) ? (
                  <tr>
                    <td colSpan={16} className="py-12 text-center text-[var(--text-muted)]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle size={20} className="text-slate-400" />
                        <span className="text-sm font-medium">No stock bookings found for the selected filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.detailedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="py-2 px-3 whitespace-nowrap tabular-nums font-medium text-[var(--text-heading)]">
                        {row.date}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-semibold text-blue-600 dark:text-blue-400">
                        {row.orderNumber}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-medium text-[var(--text-heading)]">{row.shopName}</div>
                        {row.customerName !== row.shopName && (
                          <div className="text-[10px] text-[var(--text-muted)]">{row.customerName}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {row.routeName}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                        <span className="font-medium text-[var(--text-body)]">{row.salesmanName}</span>
                        {row.salesmanCode && <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.salesmanCode})</span>}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                        <span className="font-medium text-[var(--text-body)]">{row.supplyPersonName}</span>
                        {row.supplyPersonCode && <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.supplyPersonCode})</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-[var(--text-heading)] leading-snug">{row.productName}</div>
                        <div className="text-[10px] text-slate-400 tabular-nums">SKU: {row.sku}</div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-medium text-[var(--text-body)]">
                        {row.bookedCartons}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-medium text-[var(--text-body)]">
                        {row.bookedBoxes}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-medium text-[var(--text-body)]">
                        {row.bookedLoosePieces}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                        {formatInteger(row.totalBookedPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-purple-600 dark:text-purple-400 font-medium">
                        {formatInteger(row.bonusPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-indigo-600 dark:text-indigo-400 font-medium">
                        {formatInteger(row.allocatedPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatInteger(row.issuedPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {formatInteger(row.pendingPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          row.issuedPcs > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                        }`}>
                          {row.issuedPcs > 0 ? 'INVOICED / DELIVERED' : row.orderStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Grand Total Row */}
              {grandTotal && reportData?.detailedRows && reportData.detailedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-[var(--surface-hover)] border-t-2 border-[var(--border-subtle)] font-bold text-[11px] text-[var(--text-heading)]">
                    <td className="py-3 px-3 uppercase tracking-wider" colSpan={7}>
                      GRAND TOTAL
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.cartonsCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.boxesCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.loosePiecesCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-blue-600 dark:text-blue-400 text-sm">
                      {formatInteger(grandTotal.totalBookedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-purple-600 dark:text-purple-400">
                      {formatInteger(grandTotal.bonusPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">
                      {formatInteger(grandTotal.allocatedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatInteger(grandTotal.issuedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 text-sm">
                      {formatInteger(grandTotal.pendingPcs)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : viewBy === 'order' ? (
          /* ORDER WISE TABLE WITH EXPANDABLE ITEMS */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface-hover)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8"></th>
                  <th className="py-2.5 px-3 cursor-pointer select-none" onClick={() => handleSort('orderNumber')}>
                    <div className="flex items-center gap-1">
                      <span>Order #</span>
                      {sortBy === 'orderNumber' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Customer / Shop</th>
                  <th className="py-2.5 px-3">Route</th>
                  <th className="py-2.5 px-3">Salesman</th>
                  <th className="py-2.5 px-3">Supply Man</th>
                  <th className="py-2.5 px-3 text-right">Items</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none font-bold text-blue-600 dark:text-blue-400" onClick={() => handleSort('bookedPcs')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Booked PCS</span>
                      {sortBy === 'bookedPcs' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">Issued</th>
                  <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">Pending</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(!reportData?.groupedRows || reportData.groupedRows.length === 0) ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle size={20} className="text-slate-400" />
                        <span className="text-sm font-medium">No orders found for the selected filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.groupedRows.map((row) => {
                    const isExpanded = expandedOrders.has(row.groupId);
                    return (
                      <React.Fragment key={row.groupId}>
                        <tr
                          onClick={() => toggleOrderExpand(row.groupId)}
                          className={`hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${
                            isExpanded ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-slate-400">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-blue-600 dark:text-blue-400">
                            {row.orderNumber || row.groupName}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-[var(--text-heading)]">
                            {row.orderDate}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-[var(--text-heading)]">{row.shopName}</div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                            {row.routeName}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-[var(--text-body)]">
                            {row.salesmanName}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-[var(--text-body)]">
                            {row.supplyPersonName}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-medium text-[var(--text-body)]">
                            {row.productCount}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                            {formatInteger(row.totalBookedPcs)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatInteger(row.issuedPcs)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                            {formatInteger(row.pendingPcs)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              row.issuedPcs > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                            }`}>
                              {row.issuedPcs > 0 ? 'DELIVERED' : row.orderStatus}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded Item Breakdown */}
                        {isExpanded && row.items && row.items.length > 0 && (
                          <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                            <td colSpan={12} className="p-3 pl-10">
                              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3 shadow-inner">
                                <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                                  Items Booked in Order #{row.orderNumber}
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] font-semibold text-[var(--text-muted)] uppercase border-b pb-1">
                                      <th className="text-left pb-1">SKU</th>
                                      <th className="text-left pb-1">Product</th>
                                      <th className="text-right pb-1">CTN</th>
                                      <th className="text-right pb-1">BOX</th>
                                      <th className="text-right pb-1">Loose PCS</th>
                                      <th className="text-right pb-1 font-bold text-blue-600 dark:text-blue-400">Total Booked PCS</th>
                                      <th className="text-right pb-1 text-purple-600 dark:text-purple-400">Bonus PCS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {row.items.map((itm) => (
                                      <tr key={itm.id} className="py-1">
                                        <td className="py-1 text-slate-400 font-mono text-[11px]">{itm.sku}</td>
                                        <td className="py-1 font-medium text-[var(--text-heading)]">{itm.productName}</td>
                                        <td className="py-1 text-right tabular-nums">{itm.cartons}</td>
                                        <td className="py-1 text-right tabular-nums">{itm.boxes}</td>
                                        <td className="py-1 text-right tabular-nums">{itm.loosePieces}</td>
                                        <td className="py-1 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                                          {formatInteger(itm.totalPcs)}
                                        </td>
                                        <td className="py-1 text-right tabular-nums text-purple-600 dark:text-purple-400">
                                          {formatInteger(itm.bonusPcs)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Grand Total Row */}
              {grandTotal && reportData?.groupedRows && reportData.groupedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-[var(--surface-hover)] border-t-2 border-[var(--border-subtle)] font-bold text-[11px] text-[var(--text-heading)]">
                    <td colSpan={7} className="py-3 px-3 uppercase tracking-wider">
                      GRAND TOTAL
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.productCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-blue-600 dark:text-blue-400 text-sm">
                      {formatInteger(grandTotal.totalBookedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatInteger(grandTotal.issuedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 text-sm">
                      {formatInteger(grandTotal.pendingPcs)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* ALL OTHER GROUPINGS (Supply Man, Salesman, Booker, Customer, Item, Route, Brand, Company, Category, Warehouse) */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface-hover)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  <th className="py-2.5 px-3 cursor-pointer select-none" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1">
                      <span>{VIEW_BY_OPTIONS.find((v) => v.value === viewBy)?.label.replace(' Wise', '') || 'Group'}</span>
                      {sortBy === 'name' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Hierarchy / Info</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('orderCount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Orders</span>
                      {sortBy === 'orderCount' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Shops</th>
                  <th className="py-2.5 px-3 text-right">Products</th>

                  {viewBy === 'item' && (
                    <th className="py-2.5 px-3 text-right text-slate-500 font-semibold">
                      Physical Stock
                    </th>
                  )}

                  <th className="py-2.5 px-3 text-right cursor-pointer select-none font-bold text-blue-600 dark:text-blue-400" onClick={() => handleSort('bookedPcs')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Booked PCS</span>
                      {sortBy === 'bookedPcs' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>

                  {viewBy === 'supply_man' && (
                    <>
                      <th className="py-2.5 px-3 text-right">CTN</th>
                      <th className="py-2.5 px-3 text-right">BOX</th>
                      <th className="py-2.5 px-3 text-right">Loose</th>
                    </>
                  )}

                  {(viewBy === 'supply_man' || viewBy === 'route' || viewBy === 'item') && (
                    <th className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400" onClick={() => handleSort('allocatedPcs')}>
                      Allocated
                    </th>
                  )}

                  <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400" onClick={() => handleSort('issuedPcs')}>
                    Issued
                  </th>
                  <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400 font-semibold" onClick={() => handleSort('pendingPcs')}>
                    Pending
                  </th>

                  {viewBy === 'item' && (
                    <th className="py-2.5 px-3 text-right text-teal-600 dark:text-teal-400 font-bold">
                      Available PCS
                    </th>
                  )}

                  <th className="py-2.5 px-3 text-center print:hidden">Drill Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(!reportData?.groupedRows || reportData.groupedRows.length === 0) ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-[var(--text-muted)]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle size={20} className="text-slate-400" />
                        <span className="text-sm font-medium">No stock records found for the selected filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.groupedRows.map((row) => (
                    <tr
                      key={row.groupId}
                      onClick={() => handleDrillDown(row)}
                      className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group"
                      title="Click to drill down"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[var(--text-heading)] group-hover:text-blue-600 transition-colors">
                          {row.groupName}
                        </div>
                        {row.groupCode && (
                          <div className="text-[10px] text-[var(--text-muted)]">{row.groupCode}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">
                        {row.secondaryLabel || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-medium text-[var(--text-body)]">
                        {formatInteger(row.orderCount)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)]">
                        {formatInteger(row.customerCount)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)]">
                        {formatInteger(row.productCount)}
                      </td>

                      {viewBy === 'item' && (
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300 font-medium">
                          {formatInteger(row.physicalStockPcs || 0)}
                        </td>
                      )}

                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                        {formatInteger(row.totalBookedPcs)}
                      </td>

                      {viewBy === 'supply_man' && (
                        <>
                          <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)]">{row.cartonsCount}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)]">{row.boxesCount}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)]">{row.loosePiecesCount}</td>
                        </>
                      )}

                      {(viewBy === 'supply_man' || viewBy === 'route' || viewBy === 'item') && (
                        <td className="py-2.5 px-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400 font-medium">
                          {formatInteger(row.allocatedPcs)}
                        </td>
                      )}

                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatInteger(row.issuedPcs)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {formatInteger(row.pendingPcs)}
                      </td>

                      {viewBy === 'item' && (
                        <td className="py-2.5 px-3 text-right tabular-nums text-teal-600 dark:text-teal-400 font-bold">
                          {formatInteger(row.availableStockPcs || 0)}
                        </td>
                      )}

                      <td className="py-2.5 px-3 text-center print:hidden">
                        <button
                          type="button"
                          className="p-1 rounded text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 transition-colors"
                          title="Drill down"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Grand Total Row */}
              {grandTotal && reportData?.groupedRows && reportData.groupedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-[var(--surface-hover)] border-t-2 border-[var(--border-subtle)] font-bold text-[11px] text-[var(--text-heading)]">
                    <td className="py-3 px-3 uppercase tracking-wider" colSpan={2}>
                      GRAND TOTAL
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.orderCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.customerCount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInteger(grandTotal.productCount)}</td>

                    {viewBy === 'item' && (
                      <td className="py-3 px-3 text-right tabular-nums">
                        {formatInteger(grandTotal.physicalStockPcs || 0)}
                      </td>
                    )}

                    <td className="py-3 px-3 text-right tabular-nums text-blue-600 dark:text-blue-400 text-sm">
                      {formatInteger(grandTotal.totalBookedPcs)}
                    </td>

                    {viewBy === 'supply_man' && (
                      <>
                        <td className="py-3 px-3 text-right tabular-nums">{grandTotal.cartonsCount}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{grandTotal.boxesCount}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{grandTotal.loosePiecesCount}</td>
                      </>
                    )}

                    {(viewBy === 'supply_man' || viewBy === 'route' || viewBy === 'item') && (
                      <td className="py-3 px-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">
                        {formatInteger(grandTotal.allocatedPcs)}
                      </td>
                    )}

                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatInteger(grandTotal.issuedPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 text-sm">
                      {formatInteger(grandTotal.pendingPcs)}
                    </td>

                    {viewBy === 'item' && (
                      <td className="py-3 px-3 text-right tabular-nums text-teal-600 dark:text-teal-400 text-sm">
                        {formatInteger(grandTotal.availableStockPcs || 0)}
                      </td>
                    )}

                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* 7. Pagination Controls (Hidden on print) */}
      {reportData && reportData.pagination.totalItems > 0 && (
        <div className="print:hidden">
          <PaginationControls
            currentPage={reportData.pagination.page}
            totalRecords={reportData.pagination.totalItems}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            storageKey="saleflow_stock_analysis_page_size"
          />
        </div>
      )}
    </ListPageContainer>
  );
}
