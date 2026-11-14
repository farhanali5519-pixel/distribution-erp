'use client';

import { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { formatCurrency, formatInteger, formatNumber } from '@/shared/utils/currency';
import { 
  Users, 
  Plus, 
  Search, 
  MapPin, 
  Phone, 
  Calendar, 
  CreditCard, 
  AlertCircle, 
  CheckCircle2,
  Building2,
  AlertTriangle,
  RefreshCw,
  X,
  TrendingUp,
  ShieldAlert,
  Route as RouteIcon,
  Trash2,
  Filter
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  shop_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  cnic_or_ntn: string | null;
  route_id: string | null;
  route_name: string | null;
  route_code: string | null;
  delivery_days?: string[];
  credit_limit: number;
  credit_days: number;
  live_balance: number;
  is_active: number;
}

interface RouteOption {
  id: string;
  name: string;
  code: string;
  delivery_days: string;
}

type CustomerFilterTab = 'ALL' | 'WITH_BALANCE' | 'LIMIT_EXCEEDED';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<CustomerFilterTab>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Customer Form State
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Lahore');
  const [cnicOrNtn, setCnicOrNtn] = useState('');
  const [routeId, setRouteId] = useState('');
  const [creditLimit, setCreditLimit] = useState<number | ''>('');
  const [creditDays, setCreditDays] = useState<number | ''>(14);

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchCustomerData = async () => {
    try {
      const [resCust, resRoutes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/routes'),
      ]);
      const dataCust = await resCust.json();
      const dataRoutes = await resRoutes.json();

      if (dataCust.success) setCustomers(dataCust.customers || []);
      if (dataRoutes.success) setRoutes(dataRoutes.routes || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  const routeFilterOptions = useMemo(() => [
    { value: 'ALL', label: `All Routes (${routes.length})` },
    ...routes.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'blue' as const,
      keywords: [r.name, r.code],
    })),
  ], [routes]);

  const routeAssignOptions = useMemo(() => [
    { value: '', label: 'Select Route...' },
    ...routes.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'blue' as const,
      keywords: [r.name, r.code],
    })),
  ], [routes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCustomerData();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          shopName,
          contactPerson,
          phone,
          email,
          address,
          city,
          cnicOrNtn,
          routeId,
          creditLimit: Number(creditLimit) || 0,
          creditDays: Number(creditDays) || 0,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setStatusMessage({ text: data.message, isError: true });
        return;
      }

      setStatusMessage({ text: `Customer "${data.customer.name}" onboarded successfully!`, isError: false });
      setShowAddModal(false);
      setName('');
      setShopName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCnicOrNtn('');
      setRouteId('');
      setCreditLimit('');
      setCreditDays(14);
      await fetchCustomerData();
    } catch (err: any) {
      setStatusMessage({ text: err.message, isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Customer State & Handlers
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [dependencyInfo, setDependencyInfo] = useState<{
    canDelete: boolean;
    message?: string;
    counts?: Record<string, number>;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = async (customer: Customer) => {
    setCustomerToDelete(customer);
    setCheckingDependencies(true);
    setDependencyInfo(null);

    try {
      const res = await fetch(`/api/customers/${customer.id}`);
      const data = await res.json();
      if (data.success && data.dependencies) {
        setDependencyInfo(data.dependencies);
      } else {
        setDependencyInfo({ canDelete: false, message: 'Could not verify customer dependencies.' });
      }
    } catch (err: any) {
      setDependencyInfo({ canDelete: false, message: err.message || 'Failed to check customer dependencies.' });
    } finally {
      setCheckingDependencies(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    setDeleting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/customers/${customerToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!data.success) {
        setStatusMessage({ text: data.message || 'Failed to delete customer', isError: true });
        return;
      }

      setStatusMessage({ text: data.message || `Customer "${customerToDelete.name}" deleted successfully.`, isError: false });
      setCustomerToDelete(null);
      await fetchCustomerData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error during deletion.', isError: true });
    } finally {
      setDeleting(false);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalCount = customers.length;
    let totalReceivables = 0;
    let breachedCount = 0;
    let activeRoutesCount = new Set(customers.map((c) => c.route_id).filter(Boolean)).size;

    customers.forEach((c) => {
      totalReceivables += c.live_balance || 0;
      if (c.credit_limit > 0 && c.live_balance > c.credit_limit) {
        breachedCount++;
      }
    });

    return {
      totalCount,
      totalReceivables,
      breachedCount,
      activeRoutesCount,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Tab filter
      if (activeTab === 'WITH_BALANCE' && c.live_balance <= 0) return false;
      if (activeTab === 'LIMIT_EXCEEDED' && !(c.credit_limit > 0 && c.live_balance > c.credit_limit)) return false;

      // Route filter
      if (selectedRoute !== 'ALL' && c.route_id !== selectedRoute) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.shop_name && c.shop_name.toLowerCase().includes(q)) ||
          (c.route_name && c.route_name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.cnic_or_ntn && c.cnic_or_ntn.includes(q))
        );
      }

      return true;
    });
  }, [customers, searchTerm, selectedRoute, activeTab]);

  const customerPagination = usePagination(filteredCustomers);

  return (
    <ListPageContainer className="space-y-3.5">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-1 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-slate-900 text-white dark:bg-emerald-600">
              <Users className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-heading)]">
              Customers & Retail Outlets
            </h1>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              <span className="numeric-text font-bold">{customers.length}</span> Retailers
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage retail customer accounts, route allocations, credit limits, and ledger balances.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="h-8 px-3 text-xs font-medium rounded-md bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 flex items-center gap-1.5 shadow-xs transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card-hover)] flex items-center justify-center transition-colors"
            title="Refresh Retailers"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted)] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div
          className={`p-2.5 rounded-md border text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150 ${
            statusMessage.isError
              ? 'bg-rose-50/80 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.isError ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}



      {/* Toolbar: Tabs, Search & Route Filter */}
      <div className="filter-section-card p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          {/* Tabs */}
          <div className="inline-flex items-center bg-slate-200/70 dark:bg-slate-800/90 p-0.5 rounded-lg text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Retailers (<span className="numeric-text">{customers.length}</span>)
            </button>
            <button
              onClick={() => setActiveTab('WITH_BALANCE')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'WITH_BALANCE'
                  ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              With Balance
            </button>
            <button
              onClick={() => setActiveTab('LIMIT_EXCEEDED')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'LIMIT_EXCEEDED'
                  ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Limit Exceeded (<span className="numeric-text">{metrics.breachedCount}</span>)
            </button>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 self-end sm:self-auto font-medium flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Showing <strong className="font-bold text-slate-900 dark:text-slate-100 numeric-text">{filteredCustomers.length}</strong> of <span className="numeric-text font-medium">{customers.length}</span></span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {/* Search Box */}
          <div className="relative sm:col-span-8 lg:col-span-9">
            <label className="sr-only">Search Customers</label>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by customer name, shop, route, phone, or NTN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-all outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Route Filter */}
          <div className="sm:col-span-4 lg:col-span-3">
            <label className="sr-only">Filter by Route</label>
            <SearchableSelect
              options={routeFilterOptions}
              value={selectedRoute}
              onChange={(val) => setSelectedRoute(val)}
              placeholder="All Routes"
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                <th className="py-2.5 px-3 min-w-[200px]">Retailer & Shop</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Contact Info</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Assigned Route</th>
                <th className="py-2.5 px-3 whitespace-nowrap">CNIC / NTN</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Credit Policy</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Ledger Balance</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-[var(--text-muted)]">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[var(--primary)]" />
                      <span className="text-xs">Loading customer directory...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-[var(--text-muted)]">
                    <div className="flex flex-col items-center gap-1.5">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">No customers found</p>
                      <p className="text-[11px] text-slate-400">Click &quot;Add Customer&quot; to onboard accounts.</p>
                      <button onClick={() => setShowAddModal(true)} className="mt-2 h-7 px-2.5 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Customer
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                customerPagination.paginatedItems.map((c) => {
                  const isBreached = c.credit_limit > 0 && c.live_balance > c.credit_limit;
                  const isWarning = c.credit_limit > 0 && c.live_balance > c.credit_limit * 0.85;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Retailer & Shop */}
                      <td className="py-2 px-3 align-middle max-w-[240px]">
                        <div className="font-medium text-xs text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                        {c.shop_name && (
                          <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{c.shop_name}</span>
                          </div>
                        )}
                      </td>

                      {/* Contact Info */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <div className="numeric-text text-xs text-slate-700 dark:text-slate-300 font-medium">{c.phone || '—'}</div>
                        <div className="text-[11px] text-slate-400">{c.contact_person || c.city || '—'}</div>
                      </td>

                      {/* Assigned Route */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {c.route_name || 'Unassigned'}
                        </span>
                        {c.delivery_days && c.delivery_days.length > 0 && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {c.delivery_days.join(', ')}
                          </span>
                        )}
                      </td>

                      {/* CNIC / NTN */}
                      <td className="py-2 px-3 align-middle numeric-text text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">
                        {c.cnic_or_ntn || '—'}
                      </td>

                      {/* Credit Policy */}
                      <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                        <div className="tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {formatCurrency(c.credit_limit)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          <span className="numeric-text font-medium">{formatInteger(c.credit_days)}</span> Days Term
                        </div>
                      </td>

                      {/* Live Ledger Balance */}
                      <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                        <div
                          className={`tabular-nums text-xs font-semibold ${
                            isBreached ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatCurrency(c.live_balance)}
                        </div>
                        {isBreached && (
                          <span className="inline-block text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.2 rounded border border-rose-200 dark:border-rose-900">
                            EXCEEDED
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                        <button
                          onClick={() => openDeleteModal(c)}
                          title="Delete Customer"
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={customerPagination} />
      </div>

      {/* Onboard Customer Modal */}
      {showAddModal && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="modal-content bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Onboard Retail Customer</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Business / Client Name *
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. Farhan Super Mart"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Shop / Store Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. Branch 2"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. Muhammad Farhan"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 numeric-text text-xs text-[var(--text-primary)] outline-none"
                    placeholder="0300-1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Shop Address
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Shop #, Market"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    City
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Assign Distribution Route
                  </label>
                  <SearchableSelect
                    options={routeAssignOptions}
                    value={routeId}
                    onChange={(val) => setRouteId(val)}
                    placeholder="Select Route..."
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    CNIC / NTN Number
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 numeric-text text-xs text-[var(--text-primary)] outline-none"
                    placeholder="35201-1234567-1"
                    value={cnicOrNtn}
                    onChange={(e) => setCnicOrNtn(e.target.value)}
                  />
                </div>
              </div>

              {/* Credit Limit Policy */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Credit Limit Policy & Sub-Ledger Terms
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5">
                      Max Credit Limit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1 numeric-text input-numeric text-xs text-[var(--text-primary)] outline-none"
                      placeholder="0"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <span className="text-[10px] text-slate-400">0 = Cash on Delivery</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5">
                      Payment Term (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1 numeric-text input-numeric text-xs text-[var(--text-primary)] outline-none"
                      value={creditDays}
                      onChange={(e) => setCreditDays(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <span className="text-[10px] text-slate-400">Allowed payment window</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-8 px-3 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-8 px-3.5 text-xs font-medium rounded bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 flex items-center gap-1.5 transition-opacity"
                >
                  {submitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Onboard Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Customer & Dependency Check Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-md w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-900/40">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Safe Delete Customer</h3>
              </div>
              <button
                onClick={() => setCustomerToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Auditing records for customer:{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{customerToDelete.name}</span>
                {customerToDelete.shop_name && (
                  <span className="text-slate-400"> ({customerToDelete.shop_name})</span>
                )}
              </div>

              {checkingDependencies ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
                  <span>Auditing operational & accounting dependencies...</span>
                </div>
              ) : dependencyInfo && !dependencyInfo.canDelete ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200">
                        Deletion Blocked: Linked Records Exist
                      </div>
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
                        {dependencyInfo.message}
                      </p>
                    </div>
                  </div>

                  {dependencyInfo.counts && (
                    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-rose-200/60 dark:border-rose-900/60 text-[10px]">
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Sales Orders:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.salesOrders || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Direct Sales:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.directSales || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Payments:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.payments || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Sales Returns:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.salesReturns || 0}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-rose-600 dark:text-rose-400 italic">
                    To protect ledger & inventory integrity, you must delete/reverse these transactions first.
                  </p>
                </div>
              ) : dependencyInfo && dependencyInfo.canDelete ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                        Zero Linked Records Found
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        This customer has 0 sales orders, 0 invoices, 0 payments, 0 returns, and 0 ledger entries. It can be safely deleted.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                disabled={deleting || checkingDependencies || !dependencyInfo?.canDelete}
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-xs transition-colors"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
