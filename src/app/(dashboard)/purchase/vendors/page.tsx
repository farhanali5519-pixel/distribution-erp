'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { 
  Users, 
  Plus, 
  Search, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  X,
  CreditCard
} from 'lucide-react';

interface Vendor {
  id: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  cnic_or_ntn: string | null;
  payment_terms_days: number;
  current_balance: number;
  is_active: number;
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WITH_BALANCE'>('ALL');

  // Add Vendor Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [cnicOrNtn, setCnicOrNtn] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState<number | ''>(30);
  const [submitting, setSubmitting] = useState(false);

  // Delete Vendor Modal State
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [dependencyInfo, setDependencyInfo] = useState<{
    canDelete: boolean;
    message?: string;
    counts?: Record<string, number>;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors');
      const data = await res.json();
      if (data.success) {
        setVendors(data.vendors || []);
      }
    } catch (err) {
      console.error('Failed to load vendors', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVendors();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVendors();
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        v.name.toLowerCase().includes(term) ||
        (v.company_name && v.company_name.toLowerCase().includes(term)) ||
        (v.phone && v.phone.includes(term)) ||
        (v.city && v.city.toLowerCase().includes(term));

      if (!matchesSearch) return false;
      if (statusFilter === 'WITH_BALANCE') return (v.current_balance || 0) > 0;
      return true;
    });
  }, [vendors, searchTerm, statusFilter]);

  const vendorPagination = usePagination(filteredVendors);


  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company_name: companyName,
          contact_person: contactPerson,
          phone,
          email,
          address,
          city,
          cnic_or_ntn: cnicOrNtn,
          payment_terms_days: Number(paymentTermsDays) || 30,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setStatusMessage({ text: data.error || data.message || 'Failed to create vendor', isError: true });
        return;
      }

      setStatusMessage({ text: `Vendor "${data.vendor.name}" created successfully!`, isError: false });
      setShowAddModal(false);
      setName('');
      setCompanyName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCity('');
      setCnicOrNtn('');
      setPaymentTermsDays(30);
      await fetchVendors();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error occurred.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteModal = async (vendor: Vendor) => {
    setVendorToDelete(vendor);
    setCheckingDependencies(true);
    setDependencyInfo(null);

    try {
      const res = await fetch(`/api/vendors/${vendor.id}`);
      const data = await res.json();
      if (data.success && data.dependencies) {
        setDependencyInfo(data.dependencies);
      } else {
        setDependencyInfo({ canDelete: false, message: 'Could not verify vendor dependencies.' });
      }
    } catch (err: any) {
      setDependencyInfo({ canDelete: false, message: err.message || 'Failed to check vendor dependencies.' });
    } finally {
      setCheckingDependencies(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!vendorToDelete) return;
    setDeleting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/vendors/${vendorToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!data.success) {
        setStatusMessage({ text: data.message || data.error || 'Failed to delete vendor', isError: true });
        return;
      }

      setStatusMessage({ text: data.message || `Vendor "${vendorToDelete.name}" deleted successfully.`, isError: false });
      setVendorToDelete(null);
      await fetchVendors();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error during deletion.', isError: true });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ListPageContainer className="space-y-4 pb-12">
      {/* Top Banner & KPI Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-3.5 rounded-lg border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--text-heading)]">Vendor / Supplier Master</h1>
              <p className="text-[11px] text-slate-500">
                Manage manufacturers, mills, procurement terms, and live Accounts Payable balances.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-md transition-colors border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Vendor</span>
          </button>
        </div>
      </div>



      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between p-3 rounded-md text-xs border ${
            statusMessage.isError
              ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.isError ? <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-0.5 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="filter-section-card flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="filter-input-control w-full h-9 pl-9 pr-3 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            placeholder="Search by vendor name, company, city, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="inline-flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs shadow-2xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Vendors (<span className="numeric-text">{vendors.length}</span>)
            </button>
            <button
              onClick={() => setStatusFilter('WITH_BALANCE')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                statusFilter === 'WITH_BALANCE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              With Balance
            </button>
          </div>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-slate-50/75 dark:bg-slate-900/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">Vendor / Company</th>
                <th className="py-2.5 px-3">Contact Person</th>
                <th className="py-2.5 px-3">Phone / Email</th>
                <th className="py-2.5 px-3">City / Address</th>
                <th className="py-2.5 px-3 text-right">Payment Terms</th>
                <th className="py-2.5 px-3 text-right">Live AP Balance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-blue-500" />
                    <span>Loading vendors...</span>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <Building2 className="w-6 h-6 mx-auto mb-1 text-slate-300 opacity-60" />
                    <span>No vendors match your search criteria.</span>
                  </td>
                </tr>
              ) : (
                vendorPagination.paginatedItems.map((v) => {
                  const hasDebt = (v.current_balance || 0) > 0;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 align-middle">
                        <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{v.name}</div>
                        {v.company_name && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{v.company_name}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-3 align-middle text-slate-600 dark:text-slate-300">
                        {v.contact_person || '—'}
                      </td>

                      <td className="py-2 px-3 align-middle">
                        <div className="numeric-text text-xs text-slate-700 dark:text-slate-300 font-medium">{v.phone || '—'}</div>
                        {v.email && <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{v.email}</div>}
                      </td>

                      <td className="py-2 px-3 align-middle">
                        <div className="text-slate-700 dark:text-slate-300 font-medium">{v.city || '—'}</div>
                        {v.address && <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{v.address}</div>}
                      </td>

                      <td className="py-2 px-3 align-middle text-right text-slate-700 dark:text-slate-300">
                        <span className="numeric-text font-medium">{formatInteger(v.payment_terms_days)}</span> Days
                      </td>

                      <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                        <div className={`tabular-nums text-xs font-semibold ${hasDebt ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatCurrency(v.current_balance || 0)}
                        </div>
                        {hasDebt && (
                          <span className="inline-block text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.2 rounded border border-rose-200 dark:border-rose-900 mt-0.5">
                            PAYABLE
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      </td>

                      <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                        <button
                          onClick={() => openDeleteModal(v)}
                          title="Delete Vendor"
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
        <PaginationControls pagination={vendorPagination} />
      </div>

      {/* New Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Add New Supplier / Vendor</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Vendor / Firm Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. Unilever Pakistan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Company / Trade Title
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. FMCG Distribution Hub"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Manager Name"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Phone / Mobile
                  </label>
                  <input
                    type="tel"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none numeric-text"
                    placeholder="0300-XXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="vendor@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    City
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="e.g. Lahore / Karachi"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    CNIC / NTN
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none numeric-text"
                    placeholder="XXXXX-XXXXXXX-X"
                    value={cnicOrNtn}
                    onChange={(e) => setCnicOrNtn(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Credit Terms (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none numeric-text input-numeric"
                    placeholder="30"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5 block">
                    Physical Address
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Factory / Office Street Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded shadow-xs transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Vendor & Dependency Check Modal */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-md w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-900/40">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Safe Delete Vendor</h3>
              </div>
              <button
                onClick={() => setVendorToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Checking records for supplier:{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{vendorToDelete.name}</span>
                {vendorToDelete.company_name && (
                  <span className="text-slate-400"> ({vendorToDelete.company_name})</span>
                )}
              </div>

              {checkingDependencies ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-500" />
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
                        <span className="text-slate-600 dark:text-slate-400">Purchase Bills:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.purchaseBills || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Payment Made:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.payments || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Purchase Returns:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.purchaseReturns || 0}
                        </span>
                      </div>
                      <div className="bg-white/60 dark:bg-black/30 p-1.5 rounded flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Journal Entries:</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {dependencyInfo.counts.journalEntries || 0}
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
                        This vendor has 0 purchase bills, 0 payment vouchers, 0 returns, and 0 ledger entries. It can be safely deleted.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setVendorToDelete(null)}
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
                {deleting ? 'Deleting...' : 'Permanently Delete Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
