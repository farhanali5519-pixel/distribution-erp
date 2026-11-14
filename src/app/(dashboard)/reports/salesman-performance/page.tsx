'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';

const orderStatusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'POSTED', label: 'POSTED (Active)' },
  { value: 'BOOKED', label: 'BOOKED' },
  { value: 'DISPATCHED', label: 'DISPATCHED' },
  { value: 'DELIVERED', label: 'DELIVERED' },
];
import {
  Users,
  Printer,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  MapPin,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Truck,
  Briefcase,
  Layers,
  Package,
  Search,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Building2,
  FileText,
  Filter,
  ArrowDownLeft,
  ChevronRight
} from 'lucide-react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import {
  SalespersonReportRow,
  SupplyPersonReportRow,
  StaffItemReportRow,
  StaffCustomerReportRow,
  StaffTransactionReportRow,
  DistributionTeamReportSummary,
} from '@/modules/reports/types';

interface StaffOption {
  id: string;
  employee_code?: string;
  name: string;
  role: string;
}

interface RouteOption {
  id: string;
  name: string;
  code: string;
}

interface CustomerOption {
  id: string;
  name: string;
  shop_name?: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

type TabType = 'salesperson' | 'supply_person' | 'items' | 'customers' | 'transactions';

export default function DistributionTeamReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = `${today.slice(0, 7)}-01`;

  // Filters
  const [fromDate, setFromDate] = useState<string>(firstDayOfMonth);
  const [toDate, setToDate] = useState<string>(today);
  const [salesmanId, setSalesmanId] = useState<string>('');
  const [supplyPersonId, setSupplyPersonId] = useState<string>('');
  const [routeId, setRouteId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [tabSearch, setTabSearch] = useState<string>('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('salesperson');

  // Master Directories
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [routesList, setRoutesList] = useState<RouteOption[]>([]);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [productsList, setProductsList] = useState<ProductOption[]>([]);

  // Report Data
  const [reportData, setReportData] = useState<DistributionTeamReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Masters
  useEffect(() => {
    async function loadMasters() {
      try {
        const [sRes, rRes, cRes, pRes] = await Promise.all([
          fetch('/api/staff?all=true').then((r) => r.json()),
          fetch('/api/routes').then((r) => r.json()),
          fetch('/api/customers').then((r) => r.json()),
          fetch('/api/products').then((r) => r.json()),
        ]);

        if (sRes.success && sRes.staff) {
          setStaffList(sRes.staff);
        }
        if (rRes.success && rRes.routes) {
          setRoutesList(rRes.routes);
        }
        if (cRes.success && cRes.customers) {
          setCustomersList(cRes.customers);
        }
        if (pRes.success && pRes.products) {
          setProductsList(pRes.products);
        }
      } catch {
        setError('Failed to load filter reference directories.');
      }
    }
    loadMasters();
  }, []);

  // 2. Fetch Report
  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (salesmanId) params.set('salesmanId', salesmanId);
      if (supplyPersonId) params.set('supplyPersonId', supplyPersonId);
      if (routeId) params.set('routeId', routeId);
      if (customerId) params.set('customerId', customerId);
      if (productId) params.set('productId', productId);
      if (status) params.set('status', status);

      const res = await fetch(`/api/reports/salesman-performance?${params.toString()}`).then((r) => r.json());
      if (!res.success) {
        throw new Error(res.message || 'Failed to generate distribution team report.');
      }
      setReportData(res.data);
    } catch (err: any) {
      setError(err.message || 'Error occurred while generating report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [fromDate, toDate, salesmanId, supplyPersonId, routeId, customerId, productId, status]);

  // Filter staff by role for dropdowns
  const salesStaff = staffList.filter((s) => s.role === 'SALESMAN' || s.role === 'BOTH');
  const deliveryStaff = staffList.filter((s) => s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER');

  const salesmanOptions = useMemo(() => [
    { value: '', label: 'All Sales Personnel' },
    ...salesStaff.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.employee_code || undefined,
      badgeColor: 'blue' as const,
      subLabel: 'Salesman',
      keywords: [s.name, s.employee_code || ''],
    })),
  ], [salesStaff]);

  const supplyPersonOptions = useMemo(() => [
    { value: '', label: 'All Delivery Officers' },
    ...deliveryStaff.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.employee_code || undefined,
      badgeColor: 'indigo' as const,
      subLabel: s.role,
      keywords: [s.name, s.employee_code || '', s.role],
    })),
  ], [deliveryStaff]);

  const routeOptions = useMemo(() => [
    { value: '', label: 'All Routes' },
    ...routesList.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'blue' as const,
      keywords: [r.name, r.code],
    })),
  ], [routesList]);

  const customerOptions = useMemo(() => [
    { value: '', label: 'All Customers' },
    ...customersList.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: c.shop_name ? `Shop: ${c.shop_name}` : undefined,
      keywords: [c.name, c.shop_name || ''],
    })),
  ], [customersList]);

  const productOptions = useMemo(() => [
    { value: '', label: 'All Products' },
    ...productsList.map((p) => ({
      value: p.id,
      label: p.name,
      badge: p.sku,
      badgeColor: 'emerald' as const,
      keywords: [p.name, p.sku],
    })),
  ], [productsList]);

  // Search within active tab rows
  const term = tabSearch.trim().toLowerCase();

  const filteredSalespersonRows = (reportData?.salespersonRows || []).filter((r) =>
    term === '' ||
    r.staffName.toLowerCase().includes(term) ||
    r.employeeCode.toLowerCase().includes(term) ||
    (r.assignedRoute && r.assignedRoute.toLowerCase().includes(term))
  );

  const filteredSupplyPersonRows = (reportData?.supplyPersonRows || []).filter((r) =>
    term === '' ||
    r.staffName.toLowerCase().includes(term) ||
    r.employeeCode.toLowerCase().includes(term) ||
    (r.routesServiced && r.routesServiced.toLowerCase().includes(term))
  );

  const filteredItemRows = (reportData?.itemRows || []).filter((r) =>
    term === '' ||
    r.productName.toLowerCase().includes(term) ||
    r.sku.toLowerCase().includes(term) ||
    r.categoryName.toLowerCase().includes(term) ||
    r.staffName.toLowerCase().includes(term) ||
    r.employeeCode.toLowerCase().includes(term)
  );

  const filteredCustomerRows = (reportData?.customerRows || []).filter((r) =>
    term === '' ||
    r.customerName.toLowerCase().includes(term) ||
    (r.shopName && r.shopName.toLowerCase().includes(term)) ||
    r.staffName.toLowerCase().includes(term) ||
    (r.routeName && r.routeName.toLowerCase().includes(term))
  );

  const filteredTransactionRows = (reportData?.transactionRows || []).filter((r) =>
    term === '' ||
    r.transactionNumber.toLowerCase().includes(term) ||
    r.customerName.toLowerCase().includes(term) ||
    r.salesmanName.toLowerCase().includes(term) ||
    r.supplyPersonName.toLowerCase().includes(term)
  );

  const summary = reportData?.summary;

  return (
    <ListPageContainer className="flex flex-col gap-5">
      {/* Header Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }} className="print:hidden">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <Users size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
                Distribution Team & Item-Level Performance
              </h1>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                End-to-end attribution across Sales Executives, Delivery Officers, Item Quantities, and Collections
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', padding: '0.5rem 0.85rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => window.print()}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', padding: '0.5rem 0.85rem' }}
          >
            <Printer size={14} />
            Print Report
          </button>
        </div>
      </div>

      {/* Print-Only Title Header */}
      <div className="hidden print:block" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>DISTRIBUTION TEAM & ITEM SALES REPORT</h2>
        <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.25rem' }}>
          Period: <strong>{fromDate}</strong> to <strong>{toDate}</strong> | Generated on: {new Date().toLocaleString()}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Multi-Dimensional Filter Bar */}
      <div className="filter-section-card p-4 space-y-3.5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Comprehensive Distribution & Transaction Filters
            </span>
          </div>

          {(salesmanId || supplyPersonId || routeId || customerId || productId || status) && (
            <button
              onClick={() => {
                setSalesmanId('');
                setSupplyPersonId('');
                setRouteId('');
                setCustomerId('');
                setProductId('');
                setStatus('');
              }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Date Range Grouped */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Date Range (From → To)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 tabular-nums focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 tabular-nums focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Salesperson Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Salesperson
            </label>
            <SearchableSelect
              options={salesmanOptions}
              value={salesmanId}
              onChange={(val) => setSalesmanId(val)}
              placeholder="All Sales Personnel"
              className="w-full"
            />
          </div>

          {/* Supply Person Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Supply Person
            </label>
            <SearchableSelect
              options={supplyPersonOptions}
              value={supplyPersonId}
              onChange={(val) => setSupplyPersonId(val)}
              placeholder="All Delivery Officers"
              className="w-full"
            />
          </div>

          {/* Route Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Assigned Route
            </label>
            <SearchableSelect
              options={routeOptions}
              value={routeId}
              onChange={(val) => setRouteId(val)}
              placeholder="All Routes"
              className="w-full"
            />
          </div>

          {/* Customer Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Customer / Retailer
            </label>
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onChange={(val) => setCustomerId(val)}
              placeholder="All Customers"
              className="w-full"
            />
          </div>

          {/* Product Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Product Item
            </label>
            <SearchableSelect
              options={productOptions}
              value={productId}
              onChange={(val) => setProductId(val)}
              placeholder="All Products"
              className="w-full"
            />
          </div>

          {/* Status Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Order Status
            </label>
            <SearchableSelect
              value={status}
              onChange={(val) => setStatus(val)}
              options={orderStatusOptions}
              placeholder="All Statuses"
              searchPlaceholder="Search status..."
              size="sm"
            />
          </div>
        </div>
      </div>



      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color, #e2e8f0)', gap: '0.5rem', overflowX: 'auto' }} className="print:hidden">
        <button
          onClick={() => setActiveTab('salesperson')}
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'salesperson' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'salesperson' ? '#2563eb' : 'var(--text-secondary)',
            fontWeight: activeTab === 'salesperson' ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '-2px',
            whiteSpace: 'nowrap',
          }}
        >
          <Briefcase size={16} />
          Salesperson Performance & Financials
        </button>

        <button
          onClick={() => setActiveTab('supply_person')}
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'supply_person' ? '2px solid #16a34a' : '2px solid transparent',
            color: activeTab === 'supply_person' ? '#16a34a' : 'var(--text-secondary)',
            fontWeight: activeTab === 'supply_person' ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '-2px',
            whiteSpace: 'nowrap',
          }}
        >
          <Truck size={16} />
          Supply Person Deliveries & Operations
        </button>

        <button
          onClick={() => setActiveTab('items')}
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'items' ? '2px solid #d97706' : '2px solid transparent',
            color: activeTab === 'items' ? '#d97706' : 'var(--text-secondary)',
            fontWeight: activeTab === 'items' ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '-2px',
            whiteSpace: 'nowrap',
          }}
        >
          <Package size={16} />
          Item-Level Sales & Deliveries
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'customers' ? '2px solid #8b5cf6' : '2px solid transparent',
            color: activeTab === 'customers' ? '#8b5cf6' : 'var(--text-secondary)',
            fontWeight: activeTab === 'customers' ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '-2px',
            whiteSpace: 'nowrap',
          }}
        >
          <Building2 size={16} />
          Customer-Wise Staff Attribution
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'transactions' ? '2px solid #475569' : '2px solid transparent',
            color: activeTab === 'transactions' ? '#475569' : 'var(--text-secondary)',
            fontWeight: activeTab === 'transactions' ? 700 : 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '-2px',
            whiteSpace: 'nowrap',
          }}
        >
          <FileText size={16} />
          All Transactions Log
        </button>
      </div>

      {/* Tab Local Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }} className="print:hidden">
        <div style={{ position: 'relative', width: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search records in this tab..."
            value={tabSearch}
            onChange={(e) => setTabSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: '2.1rem', width: '100%', fontSize: '0.825rem' }}
          />
        </div>

        <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
          {activeTab === 'salesperson' && `Showing ${filteredSalespersonRows.length} salesperson record(s)`}
          {activeTab === 'supply_person' && `Showing ${filteredSupplyPersonRows.length} supply officer record(s)`}
          {activeTab === 'items' && `Showing ${filteredItemRows.length} item line(s)`}
          {activeTab === 'customers' && `Showing ${filteredCustomerRows.length} customer attribution row(s)`}
          {activeTab === 'transactions' && `Showing ${filteredTransactionRows.length} transaction(s)`}
        </div>
      </div>

      {/* TAB 1: SALESPERSON PERFORMANCE */}
      {activeTab === 'salesperson' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Salesperson</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Route</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Orders</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Quantity (PCS)</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Gross Sales</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Discounts</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Net Sales</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Returns</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#047857' }}>Net After Returns</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Recoveries</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>Spot Cash</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Total Collected</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalespersonRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No salesperson sales records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredSalespersonRows.map((r, idx) => (
                    <tr
                      key={r.staffId || `unassigned-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        backgroundColor: !r.staffId ? '#fffbeb' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f1f5f9' }}>
                          {r.employeeCode}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {r.staffName}
                        {r.phone && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.phone}</div>}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{r.assignedRoute || 'General'}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatInteger(r.ordersCount + r.invoicesCount)}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatInteger(r.quantitySoldBase)}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatCurrency(r.grossSales, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#b45309' }}>{formatCurrency(r.totalDiscount, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{formatCurrency(r.netSales, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#dc2626' }}>{formatCurrency(r.returnsAmount, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(r.netAfterReturns, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatCurrency(r.collections, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#2563eb' }}>{formatCurrency(r.spotCashCollected, 'PKR')}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#1e293b' }}>
                        {formatCurrency(r.totalLiquidityCollected, 'PKR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUPPLY PERSON DELIVERIES */}
      {activeTab === 'supply_person' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Delivery Officer</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Routes Covered</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Deliveries</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Pieces Delivered</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Cartons</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Delivery Amount</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Returns Handled</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Customers Served</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupplyPersonRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No delivery officer records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredSupplyPersonRows.map((r, idx) => (
                    <tr
                      key={r.staffId || `unassigned-sp-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        backgroundColor: !r.staffId ? '#fffbeb' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f1f5f9' }}>
                          {r.employeeCode}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {r.staffName}
                        {r.phone && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.phone}</div>}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{r.routesServiced}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>
                        {formatInteger(r.ordersDeliveredCount + r.invoicesCount)}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {formatInteger(r.quantityDeliveredBase)}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>
                        {formatInteger(r.cartonsDelivered)} CTN
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#15803d' }}>
                        {formatCurrency(r.deliveryAmount, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#dc2626' }}>
                        {formatCurrency(r.returnsAmount, 'PKR')} ({r.returnsCount} ret)
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>
                        {formatInteger(r.customersServedCount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ITEM-LEVEL SALES & DELIVERIES */}
      {activeTab === 'items' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Staff Member</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>SKU</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Product Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Quantity Sold</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Cartons</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Gross Total</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Discounts</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Net Sold</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Returns (PCS)</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#047857' }}>Net Delivered Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredItemRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No item-level sales found for this filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItemRows.map((item, idx) => (
                    <tr
                      key={`${item.staffId}-${item.staffRoleType}-${item.productId}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        <span style={{ color: '#2563eb', marginRight: '0.35rem' }}>[{item.employeeCode}]</span>
                        {item.staffName}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: item.staffRoleType === 'SALESPERSON' ? '#eff6ff' : '#f0fdf4',
                            color: item.staffRoleType === 'SALESPERSON' ? '#1d4ed8' : '#15803d',
                          }}
                        >
                          {item.staffRoleType === 'SALESPERSON' ? 'Sales Booking' : 'Delivery Incharge'}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="tabular-nums" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                          {item.sku}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{item.productName}</td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{item.categoryName}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {formatInteger(item.quantitySoldBase)} {item.uomBase}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>
                        {formatInteger(item.cartonsSold)} {item.uomBulk}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>
                        {formatCurrency(item.grossAmount, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#b45309' }}>
                        {formatCurrency(item.discount, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {formatCurrency(item.netAmount, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: item.returnsQuantityBase > 0 ? '#dc2626' : 'inherit' }}>
                        {item.returnsQuantityBase > 0 ? `${formatInteger(item.returnsQuantityBase)} PCS` : '-'}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(item.netDeliveredAmount, 'PKR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOMER-WISE STAFF ATTRIBUTION */}
      {activeTab === 'customers' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Staff Member</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Customer Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Shop Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Route</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Orders Count</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Pieces Billed</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Net Sales</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Returns</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#047857' }}>Net After Returns</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>Collections</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomerRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No customer staff attribution records found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomerRows.map((c, idx) => (
                    <tr
                      key={`${c.staffId}-${c.customerId}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        <span style={{ color: '#2563eb', marginRight: '0.35rem' }}>[{c.employeeCode}]</span>
                        {c.staffName}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{c.customerName}</td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{c.shopName || '-'}</td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{c.routeName || 'General'}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatInteger(c.ordersCount)}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{formatInteger(c.quantityBase)}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        {formatCurrency(c.netSales, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#dc2626' }}>
                        {formatCurrency(c.returns, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#047857' }}>
                        {formatCurrency(c.netAfterReturns, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#6d28d9' }}>
                        {formatCurrency(c.collections, 'PKR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: INDIVIDUAL TRANSACTIONS AUDIT LOG */}
      {activeTab === 'transactions' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Txn #</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Salesperson</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Supply Person</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Items</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Net Amount</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Cash Rec.</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactionRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No individual transactions found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredTransactionRows.map((t) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        backgroundColor: t.transactionType === 'RETURN' ? '#fef2f2' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                        <span className="tabular-nums" style={{ color: '#0f172a' }}>{t.transactionNumber}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.675rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background: t.transactionType === 'ORDER' ? '#eff6ff' : t.transactionType === 'DIRECT_SALE' ? '#ecfdf5' : '#fee2e2',
                            color: t.transactionType === 'ORDER' ? '#1d4ed8' : t.transactionType === 'DIRECT_SALE' ? '#065f46' : '#991b1b',
                          }}
                        >
                          {t.transactionType}
                        </span>
                      </td>
                      <td className="tabular-nums" style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>{t.date}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 500 }}>{t.customerName}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ fontWeight: 600, color: t.salesmanName === 'Unassigned' ? '#94a3b8' : '#0369a1' }}>
                          {t.salesmanName}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ fontWeight: 600, color: t.supplyPersonName === 'Unassigned' ? '#94a3b8' : '#15803d' }}>
                          {t.supplyPersonName}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className="badge" style={{ fontSize: '0.675rem' }}>{t.status}</span>
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem' }}>{t.itemCount}</td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', fontWeight: 700, color: t.netAmount < 0 ? '#dc2626' : 'inherit' }}>
                        {formatCurrency(t.netAmount, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: '#16a34a' }}>
                        {formatCurrency(t.cashReceived, 'PKR')}
                      </td>
                      <td className="text-right tabular-nums" style={{ padding: '0.65rem 1rem', color: t.remainingBalance > 0 ? '#b45309' : 'var(--text-muted)' }}>
                        {formatCurrency(t.remainingBalance, 'PKR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
