'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { SearchableSelect, SearchableSelectOption } from '@/shared/components/SearchableSelect';
import { PaginationControls } from '@/shared/components/PaginationControls';
import { formatCurrency, formatInteger, fromPaisas } from '@/shared/utils/currency';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';
import {
  SalesAnalysisViewBy,
  SalesAnalysisReportResult,
  SalesDetailedRow,
  SalesGroupedRow,
  FilterDimensionsResult,
} from '@/modules/reports/sales-analysis.service';
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
  TrendingUp,
  DollarSign,
  Package,
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
} from 'lucide-react';

const VIEW_BY_OPTIONS: SearchableSelectOption[] = [
  { value: 'detailed', label: 'Detailed Sales' },
  { value: 'salesman', label: 'Salesman Wise' },
  { value: 'order_booker', label: 'Order Booker Wise' },
  { value: 'item', label: 'Item Wise' },
  { value: 'customer', label: 'Customer Wise' },
  { value: 'route', label: 'Route Wise' },
  { value: 'brand', label: 'Brand Wise' },
  { value: 'company', label: 'Company Wise' },
  { value: 'category', label: 'Category Wise' },
  { value: 'source', label: 'Source Wise' },
  { value: 'date', label: 'Date Wise' },
];

export function SalesAnalysisClient() {
  const { profile: companyProfile } = useCompanyProfile();

  // Date Range State
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // View By State
  const [viewBy, setViewBy] = useState<SalesAnalysisViewBy>('detailed');

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

  // Dimension Options State
  const [dimensions, setDimensions] = useState<FilterDimensionsResult | null>(null);
  const [loadingDimensions, setLoadingDimensions] = useState<boolean>(true);

  // Report Data State
  const [reportData, setReportData] = useState<SalesAnalysisReportResult | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load Filter Dimensions on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadDimensions() {
      try {
        setLoadingDimensions(true);
        const res = await fetch('/api/reports/sales-analysis?mode=dimensions').then((r) => r.json());
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

      const res = await fetch(`/api/reports/sales-analysis?${params.toString()}`).then((r) => r.json());
      if (res.success) {
        setReportData(res.data);
      } else {
        setError(res.error || 'Failed to load report data');
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

  // Reset page to 1 when filters change
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setPage(1);
  };

  // Clear All Filters
  const handleClearAllFilters = () => {
    setFromDate('');
    setToDate('');
    setViewBy('detailed');
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
  };

  // Header Click Sorting
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Drill-Down Handler
  const handleDrillDown = (row: SalesGroupedRow) => {
    if (viewBy === 'salesman' && row.groupId !== 'unassigned') {
      setSalesmanIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'order_booker' && row.groupId !== 'unassigned') {
      setOrderBookerIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'item') {
      setProductIds([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'customer') {
      setCustomerIds([row.groupId]);
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
    } else if (viewBy === 'source') {
      setSources([row.groupId]);
      setViewBy('detailed');
    } else if (viewBy === 'date') {
      setFromDate(row.groupId);
      setToDate(row.groupId);
      setViewBy('detailed');
    }
    setPage(1);
  };

  // Options Mapping for SearchableSelect
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
    lines.push(escapeCsv(`Sales Analysis Report - ${VIEW_BY_OPTIONS.find((v) => v.value === viewBy)?.label || 'Detailed'}`));
    lines.push(escapeCsv(`Date Range: ${fromDate || 'Beginning'} to ${toDate || 'Present'}`));
    lines.push(escapeCsv(`Generated: ${new Date().toLocaleString()}`));
    lines.push('');

    // Table Content
    if (viewBy === 'detailed') {
      const headers = [
        'Date',
        'Bill / Order #',
        'Source',
        'Customer',
        'Shop Name',
        'Route',
        'Salesman',
        'Order Booker',
        'Product / Item',
        'SKU',
        'Brand',
        'Company',
        'Category',
        'Qty PCS',
        'Bonus PCS',
        'Rate / PCS',
        'Gross Sales',
        'Discount',
        'Tax',
        'Net Sales',
        'Paid',
        'Due',
        'Status',
      ];
      lines.push(headers.map(escapeCsv).join(','));

      const rows = reportData.detailedRows || [];
      for (const r of rows) {
        lines.push([
          escapeCsv(r.date),
          escapeCsv(r.documentNumber),
          escapeCsv(r.sourceLabel),
          escapeCsv(r.customerName),
          escapeCsv(r.shopName),
          escapeCsv(r.routeName),
          escapeCsv(r.salesmanName),
          escapeCsv(r.orderBookerName),
          escapeCsv(r.productName),
          escapeCsv(r.sku),
          escapeCsv(r.brandName),
          escapeCsv(r.companyName),
          escapeCsv(r.categoryName),
          escapeCsv(r.quantityPcs),
          escapeCsv(r.bonusPcs),
          escapeCsv(fromPaisas(r.ratePcsPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.grossPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.discountPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.taxPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.netSalePaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.paidPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.duePaisas).toFixed(2)),
          escapeCsv(r.status),
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
        '',
        escapeCsv(gt.quantityPcs),
        escapeCsv(gt.bonusPcs),
        '',
        escapeCsv(fromPaisas(gt.grossPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.discountPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.taxPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.netSalePaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.paidPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.duePaisas).toFixed(2)),
        '',
      ].join(','));
    } else {
      const headers = [
        'Grouping',
        'Sub-Info',
        'Orders / Bills',
        'Qty PCS',
        'Bonus PCS',
        'Gross Sales',
        'Discount',
        'Tax',
        'Net Sales',
        'Paid',
        'Due',
      ];
      lines.push(headers.map(escapeCsv).join(','));

      const rows = reportData.groupedRows || [];
      for (const r of rows) {
        lines.push([
          escapeCsv(r.groupName),
          escapeCsv(r.secondaryLabel || r.groupCode || ''),
          escapeCsv(r.orderCount),
          escapeCsv(r.quantityPcs),
          escapeCsv(r.bonusPcs),
          escapeCsv(fromPaisas(r.grossPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.discountPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.taxPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.netSalePaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.paidPaisas).toFixed(2)),
          escapeCsv(fromPaisas(r.duePaisas).toFixed(2)),
        ].join(','));
      }

      // Grand Total
      const gt = reportData.grandTotal;
      lines.push([
        escapeCsv('GRAND TOTAL'),
        '',
        escapeCsv(gt.orderCount),
        escapeCsv(gt.quantityPcs),
        escapeCsv(gt.bonusPcs),
        escapeCsv(fromPaisas(gt.grossPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.discountPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.taxPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.netSalePaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.paidPaisas).toFixed(2)),
        escapeCsv(fromPaisas(gt.duePaisas).toFixed(2)),
      ].join(','));
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sales_Analysis_${viewBy}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Handler
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
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <BarChart3 size={22} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-heading)] tracking-tight">
                Sales Analysis Report
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                Multi-dimensional enterprise analytics with strict audit reconciliation
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-50"
            title="Export CSV / Excel"
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
            <p className="text-sm font-semibold text-slate-700">Sales Analysis Report</p>
            <p className="text-xs text-slate-500">
              View By: {VIEW_BY_OPTIONS.find((v) => v.value === viewBy)?.label || 'Detailed Sales'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {/* From Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              From Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => handleFilterChange(setFromDate, e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              To Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={toDate}
                onChange={(e) => handleFilterChange(setToDate, e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* View Report By */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              View Report By
            </label>
            <SearchableSelect
              mode="single"
              value={viewBy}
              onChange={(val) => handleFilterChange(setViewBy, val as SalesAnalysisViewBy)}
              options={VIEW_BY_OPTIONS}
              placeholder="Select grouping..."
              size="sm"
            />
          </div>

          {/* Clear Filters Button & Active count */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            {activeFiltersCount > 0 && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                {activeFiltersCount} Filter{activeFiltersCount > 1 ? 's' : ''} Active
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

        {/* Row 2: Sales Team & Outlets */}
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
              placeholder="All Customers"
              searchPlaceholder="Search shop name, customer, phone..."
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

        {/* Row 3: Product Hierarchy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        </div>

        {/* Row 4: Channel, Status, Logistics & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

          {/* Document Status */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              Status
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
        </div>

        {/* General Search Box for Detailed Sales Mode */}
        {viewBy === 'detailed' && (
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                placeholder="Search by Bill #, Customer, Product, SKU, Salesman..."
                className="w-full h-9 pl-9 pr-8 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-body)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

      {/* 4. KPI Summary Cards (Reconciled with Grand Total) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
        {/* Total Net Sales */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Total Net Sales
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalNetSalesPaisas)) : '0.00'}
          </div>
        </div>

        {/* Gross Sales */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Gross Sales
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalGrossSalesPaisas)) : '0.00'}
          </div>
        </div>

        {/* Total Discount */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-500">
            Total Discount
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalDiscountPaisas)) : '0.00'}
          </div>
        </div>

        {/* Total Tax */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Total Tax
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalTaxPaisas)) : '0.00'}
          </div>
        </div>

        {/* Total Quantity PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Quantity PCS
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalQuantityPcs) : '0'}
          </div>
        </div>

        {/* Total Bonus PCS */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Bonus PCS
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-purple-600 dark:text-purple-400 mt-0.5">
            {kpis ? formatInteger(kpis.totalBonusPcs) : '0'}
          </div>
        </div>

        {/* Total Orders / Bills */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Orders / Bills
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-[var(--text-heading)] mt-0.5">
            {kpis ? formatInteger(kpis.totalOrders) : '0'}
          </div>
        </div>

        {/* Cash / Paid */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Cash / Paid
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalPaidPaisas)) : '0.00'}
          </div>
        </div>

        {/* Outstanding / Due */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Outstanding / Due
          </span>
          <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
            {kpis ? formatCurrency(fromPaisas(kpis.totalDuePaisas)) : '0.00'}
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            <p className="text-xs font-medium">Generating Sales Analysis Report...</p>
          </div>
        ) : viewBy === 'detailed' ? (
          /* DETAILED SALES TABLE */
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
                  <th className="py-2.5 px-3 cursor-pointer select-none" onClick={() => handleSort('documentNumber')}>
                    <div className="flex items-center gap-1">
                      <span>Bill #</span>
                      {sortBy === 'documentNumber' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Customer / Outlet</th>
                  <th className="py-2.5 px-3">Route</th>
                  <th className="py-2.5 px-3">Salesman</th>
                  <th className="py-2.5 px-3">Order Booker</th>
                  <th className="py-2.5 px-3">Product / SKU</th>
                  <th className="py-2.5 px-3">Brand</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('quantityPcs')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Qty</span>
                      {sortBy === 'quantityPcs' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Bonus</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('grossPaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Gross</span>
                      {sortBy === 'grossPaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Disc</th>
                  <th className="py-2.5 px-3 text-right">Tax</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none font-bold text-emerald-600 dark:text-emerald-400" onClick={() => handleSort('netSalePaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Net Sale</span>
                      {sortBy === 'netSalePaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Paid</th>
                  <th className="py-2.5 px-3 text-right">Due</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(!reportData?.detailedRows || reportData.detailedRows.length === 0) ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-[var(--text-muted)]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle size={20} className="text-slate-400" />
                        <span className="text-sm font-medium">No sales found for the selected filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.detailedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="py-2 px-3 whitespace-nowrap tabular-nums font-medium text-[var(--text-heading)]">
                        {row.date}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.documentNumber}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {row.sourceLabel}
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
                        <span className="font-medium text-[var(--text-body)]">{row.orderBookerName}</span>
                        {row.orderBookerCode && <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.orderBookerCode})</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-[var(--text-heading)] leading-snug">{row.productName}</div>
                        <div className="text-[10px] text-slate-400 tabular-nums">SKU: {row.sku}</div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {row.brandName}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {row.categoryName}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-semibold text-[var(--text-heading)]">
                        {formatInteger(row.quantityPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-purple-600 dark:text-purple-400 font-medium">
                        {formatInteger(row.bonusPcs)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-[var(--text-muted)]">
                        {formatCurrency(fromPaisas(row.ratePcsPaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-medium text-[var(--text-body)]">
                        {formatCurrency(fromPaisas(row.grossPaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-rose-500 font-medium">
                        {formatCurrency(fromPaisas(row.discountPaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-[var(--text-muted)]">
                        {formatCurrency(fromPaisas(row.taxPaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(fromPaisas(row.netSalePaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(fromPaisas(row.paidPaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-right tabular-nums text-amber-600 dark:text-amber-400 font-medium">
                        {formatCurrency(fromPaisas(row.duePaisas))}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          {row.status}
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
                    <td className="py-3 px-3 uppercase tracking-wider" colSpan={10}>
                      GRAND TOTAL
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatInteger(grandTotal.quantityPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-purple-600 dark:text-purple-400">
                      {formatInteger(grandTotal.bonusPcs)}
                    </td>
                    <td className="py-3 px-3 text-right"></td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(fromPaisas(grandTotal.grossPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-rose-500">
                      {formatCurrency(fromPaisas(grandTotal.discountPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(fromPaisas(grandTotal.taxPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatCurrency(fromPaisas(grandTotal.netSalePaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(fromPaisas(grandTotal.paidPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(fromPaisas(grandTotal.duePaisas))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* GROUPED SALES TABLE (Salesman, Booker, Item, Customer, Route, Brand, Company, Category, Source, Date) */
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
                  <th className="py-2.5 px-3">Details / Hierarchy</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('orderCount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Orders / Bills</span>
                      {sortBy === 'orderCount' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('quantityPcs')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Qty PCS</span>
                      {sortBy === 'quantityPcs' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Bonus PCS</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('grossPaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Gross Sales</span>
                      {sortBy === 'grossPaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('discountPaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Discount</span>
                      {sortBy === 'discountPaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Tax</th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none font-bold text-emerald-600 dark:text-emerald-400" onClick={() => handleSort('netSalePaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Net Sales</span>
                      {sortBy === 'netSalePaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('paidPaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Cash / Paid</span>
                      {sortBy === 'paidPaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer select-none" onClick={() => handleSort('duePaisas')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Due</span>
                      {sortBy === 'duePaisas' && (sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center print:hidden">Drill Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(!reportData?.groupedRows || reportData.groupedRows.length === 0) ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle size={20} className="text-slate-400" />
                        <span className="text-sm font-medium">No sales found for the selected filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.groupedRows.map((row) => (
                    <tr
                      key={row.groupId}
                      onClick={() => handleDrillDown(row)}
                      className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group"
                      title="Click to view detailed sales"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[var(--text-heading)] group-hover:text-emerald-600 transition-colors">
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
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[var(--text-heading)]">
                        {formatInteger(row.quantityPcs)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-purple-600 dark:text-purple-400 font-medium">
                        {formatInteger(row.bonusPcs)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-body)] font-medium">
                        {formatCurrency(fromPaisas(row.grossPaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-rose-500 font-medium">
                        {formatCurrency(fromPaisas(row.discountPaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-muted)]">
                        {formatCurrency(fromPaisas(row.taxPaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(fromPaisas(row.netSalePaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(fromPaisas(row.paidPaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400 font-medium">
                        {formatCurrency(fromPaisas(row.duePaisas))}
                      </td>
                      <td className="py-2.5 px-3 text-center print:hidden">
                        <button
                          type="button"
                          className="p-1 rounded text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 transition-colors"
                          title="Drill down to transactions"
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
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatInteger(grandTotal.orderCount)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatInteger(grandTotal.quantityPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-purple-600 dark:text-purple-400">
                      {formatInteger(grandTotal.bonusPcs)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(fromPaisas(grandTotal.grossPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-rose-500">
                      {formatCurrency(fromPaisas(grandTotal.discountPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(fromPaisas(grandTotal.taxPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatCurrency(fromPaisas(grandTotal.netSalePaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(fromPaisas(grandTotal.paidPaisas))}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(fromPaisas(grandTotal.duePaisas))}
                    </td>
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
            storageKey="saleflow_sales_analysis_page_size"
          />
        </div>
      )}
    </ListPageContainer>
  );
}
