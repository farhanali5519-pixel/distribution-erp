'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';

const routeStatusFilterOptions = [
  { value: 'ALL', label: 'All Routes' },
  { value: 'ACTIVE', label: 'Active Only' },
  { value: 'INACTIVE', label: 'Inactive Only' },
];
import {
  MapPin,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Truck,
  Calendar,
  Building,
  FileText,
  Compass,
  RefreshCw,
  X,
  Filter
} from 'lucide-react';
import { Route, RouteDeletionCheckResult } from '@/modules/routes/types';
import { formatCurrency, formatNumber } from '@/shared/utils/currency';

interface StaffOption {
  id: string;
  name: string;
  role: string;
  phone?: string;
}

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function RouteTerritoryMasterPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [salespersons, setSalespersons] = useState<StaffOption[]>([]);
  const [supplyPersons, setSupplyPersons] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [viewingRoute, setViewingRoute] = useState<Route | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<Route | null>(null);
  const [deleteDepCheck, setDeleteDepCheck] = useState<RouteDeletionCheckResult | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formSalespersonId, setFormSalespersonId] = useState('');
  const [formSupplyPersonId, setFormSupplyPersonId] = useState('');
  const [formDays, setFormDays] = useState<string[]>([]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [routesRes, staffRes] = await Promise.all([
        fetch('/api/routes?all=true'),
        fetch('/api/routes?staffOptions=true'),
      ]);

      const routesData = await routesRes.json();
      const staffData = await staffRes.json();

      if (routesData.success) {
        setRoutes(routesData.routes || []);
      } else {
        setError(routesData.message || 'Failed to load routes.');
      }

      if (staffData.success) {
        setSalespersons(staffData.salespersons || []);
        setSupplyPersons(staffData.supplyPersons || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  // Unique cities list for filtering
  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => {
      if (r.city && r.city.trim()) set.add(r.city.trim());
    });
    return Array.from(set).sort();
  }, [routes]);

  // Filtered routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (statusFilter === 'ACTIVE' && r.is_active !== 1) return false;
      if (statusFilter === 'INACTIVE' && r.is_active !== 0) return false;
      if (cityFilter !== 'ALL' && r.city !== cityFilter) return false;

      if (search.trim()) {
        const s = search.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(s);
        const matchesCode = r.code.toLowerCase().includes(s);
        const matchesArea = r.area_territory?.toLowerCase().includes(s);
        const matchesCity = r.city?.toLowerCase().includes(s);
        const matchesSp = r.assigned_salesperson_name?.toLowerCase().includes(s);
        const matchesDp = r.assigned_supply_person_name?.toLowerCase().includes(s);
        if (!matchesName && !matchesCode && !matchesArea && !matchesCity && !matchesSp && !matchesDp) {
          return false;
        }
      }
      return true;
    });
  }, [routes, statusFilter, cityFilter, search]);

  const cityFilterOptions = useMemo(() => [
    { value: 'ALL', label: 'All Cities' },
    ...uniqueCities.map((c) => ({ value: c, label: c })),
  ], [uniqueCities]);

  const salespersonOptions = useMemo(() => [
    { value: '', label: '— Unassigned —' },
    ...salespersons.map((s) => ({ value: s.id, label: `${s.name} (${s.role})` })),
  ], [salespersons]);

  const supplyPersonOptions = useMemo(() => [
    { value: '', label: '— Unassigned —' },
    ...supplyPersons.map((s) => ({ value: s.id, label: `${s.name} (${s.role})` })),
  ], [supplyPersons]);

  const pagination = usePagination(filteredRoutes);



  const openAddModal = () => {
    setFormName('');
    // Auto-generate next suggested code e.g. R-01, R-02 or based on count
    const nextNum = routes.length + 1;
    setFormCode(`R-${String(nextNum).padStart(2, '0')}`);
    setFormArea('');
    setFormCity('');
    setFormSalespersonId('');
    setFormSupplyPersonId('');
    setFormDays(['Monday', 'Thursday']);
    setFormIsActive(true);
    setFormNotes('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (r: Route) => {
    setEditingRoute(r);
    setFormName(r.name);
    setFormCode(r.code);
    setFormArea(r.area_territory || '');
    setFormCity(r.city || '');
    setFormSalespersonId(r.assigned_salesperson_id || '');
    setFormSupplyPersonId(r.assigned_supply_person_id || '');
    setFormDays(r.delivery_days || []);
    setFormIsActive(r.is_active === 1);
    setFormNotes(r.notes || '');
    setFormError(null);
  };

  const toggleDaySelection = (day: string) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Route Name is required.');
      return;
    }
    if (!formCode.trim()) {
      setFormError('Route Code is required.');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        area_territory: formArea.trim() || null,
        city: formCity.trim() || null,
        assigned_salesperson_id: formSalespersonId || null,
        assigned_supply_person_id: formSupplyPersonId || null,
        delivery_days: formDays,
        isActive: formIsActive,
        notes: formNotes.trim() || null,
      };

      const url = editingRoute ? `/api/routes/${editingRoute.id}` : '/api/routes';
      const method = editingRoute ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save route.');
      }

      setShowAddModal(false);
      setEditingRoute(null);
      await fetchInitialData();
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const initiateDelete = async (r: Route) => {
    setDeletingRoute(r);
    setCheckingDelete(true);
    setDeleteDepCheck(null);
    try {
      const res = await fetch(`/api/routes/${r.id}`);
      const data = await res.json();
      if (data.success && data.dependencies) {
        setDeleteDepCheck(data.dependencies);
      }
    } catch (err) {
      console.error('Failed to check dependencies', err);
    } finally {
      setCheckingDelete(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingRoute) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/routes/${deletingRoute.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete route.');
      }

      setDeletingRoute(null);
      setDeleteDepCheck(null);
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete route.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ListPageContainer>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)',
            }}>
              <MapPin size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Route & Territory Master
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.2rem' }}>
                Manage delivery sectors, geographic areas, delivery schedules, and assigned sales & delivery personnel.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={fetchInitialData}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
            title="Refresh routes list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} strokeWidth={2.2} />
            Add New Route
          </button>
        </div>
      </div>



      {/* Filter and Search Bar */}
      <div className="filter-section-card p-4 space-y-3 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Route & Territory Filters
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredRoutes.length}</strong> of{' '}
              <strong className="font-bold text-slate-900 dark:text-slate-100">{routes.length}</strong> routes
            </div>

            {(search || statusFilter !== 'ALL' || cityFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  setCityFilter('ALL');
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[280px] relative">
            <label className="sr-only">Search Routes</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search route name, code, territory, city, or assigned staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Status:</span>
            <SearchableSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
              options={routeStatusFilterOptions}
              placeholder="All Routes"
              searchPlaceholder="Search status..."
              size="sm"
            />
          </div>

          {/* City Filter */}
          {uniqueCities.length > 0 && (
            <div className="flex items-center gap-1.5 min-w-[130px]">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">City:</span>
              <SearchableSelect
                value={cityFilter}
                onChange={(val) => setCityFilter(val)}
                options={cityFilterOptions}
                placeholder="All Cities"
                searchPlaceholder="Search city..."
                size="sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Routes Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Route Code & Name
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Territory & City
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Salesperson
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Supply Person
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Delivery Days
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                  Linked Customers
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                  Status
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <RefreshCw size={18} className="animate-spin" />
                      Loading routes and territories...
                    </div>
                  </td>
                </tr>
              ) : filteredRoutes.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ maxWidth: '360px', margin: '0 auto' }}>
                      <Compass size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-heading)' }}>No routes found</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {search || statusFilter !== 'ALL' || cityFilter !== 'ALL'
                          ? 'Try adjusting your search criteria or resetting filters.'
                          : 'Get started by clicking "+ Add New Route" above.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.paginatedItems.map((r: any) => {
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background-color 0.15s ease',
                      }}
                      className="table-row-hover"
                    >
                      {/* Code & Name */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                          <span
                            className="badge badge-navy font-mono"
                            style={{ fontSize: '0.72rem', letterSpacing: '0.04em', fontWeight: 700 }}
                          >
                            {r.code}
                          </span>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.88rem' }}>
                              {r.name}
                            </span>
                            {r.notes && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Territory & City */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-heading)' }}>
                          {r.area_territory || '—'}
                        </div>
                        {r.city && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            <MapPin size={12} />
                            {r.city}
                          </div>
                        )}
                      </td>

                      {/* Assigned Salesperson */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {r.assigned_salesperson_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: 'var(--accent-blue)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}>
                              {r.assigned_salesperson_name.charAt(0)}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {r.assigned_salesperson_name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Assigned Supply Person */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {r.assigned_supply_person_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: 'var(--accent-emerald)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}>
                              <Truck size={12} />
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {r.assigned_supply_person_name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Delivery Days */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {r.delivery_days && r.delivery_days.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '200px' }}>
                            {r.delivery_days.map((d: any) => (
                              <span
                                key={d}
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.35rem',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-secondary)',
                                  fontWeight: 500,
                                }}
                              >
                                {d.slice(0, 3)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Daily / All</span>
                        )}
                      </td>

                      {/* Linked Customers Count */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <span
                          className="badge badge-secondary tabular-nums"
                          style={{ fontSize: '0.78rem', fontWeight: 600 }}
                          title={`${r.customers_count || 0} active customers`}
                        >
                          <Users size={12} style={{ marginRight: '0.25rem', display: 'inline' }} />
                          {formatNumber(r.customers_count || 0)}
                        </span>
                      </td>

                      {/* Active Status */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {r.is_active === 1 ? (
                          <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                            Active
                          </span>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setViewingRoute(r)}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem', color: 'var(--text-secondary)' }}
                            title="View route details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem', color: 'var(--accent-blue)' }}
                            title="Edit route details"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => initiateDelete(r)}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem', color: 'var(--accent-rose)' }}
                            title="Delete route"
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

        {/* Pagination Controls */}
        <PaginationControls {...pagination} />
      </div>

      {/* Modal: Add or Edit Route */}
      {(showAddModal || editingRoute) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 0,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  {editingRoute ? 'Edit Route & Territory' : 'Create New Route & Territory'}
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.2rem' }}>
                  Define distribution sector codes, geographical boundaries, and personnel assignments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingRoute(null);
                }}
                className="btn btn-secondary"
                style={{ padding: '0.35rem' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRoute} style={{ padding: '1.5rem' }}>
              {formError && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: 'var(--accent-rose)',
                  fontSize: '0.82rem',
                  marginBottom: '1.25rem',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Route Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Route 1 - North Commercial Zone"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Route Code <span style={{ color: 'var(--accent-rose)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. R-NORTH-1"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className="input font-mono"
                    style={{ width: '100%', fontSize: '0.85rem', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Area / Territory
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GT Road, Model Town, Industrial Estate"
                    value={formArea}
                    onChange={(e) => setFormArea(e.target.value)}
                    className="input"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Gujranwala, Lahore"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    className="input"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Staff Assignments */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Assigned Salesperson (Optional)
                  </label>
                  <SearchableSelect
                    value={formSalespersonId}
                    onChange={(val) => setFormSalespersonId(val)}
                    options={salespersonOptions}
                    placeholder="— Unassigned —"
                    searchPlaceholder="Search salesperson..."
                    size="sm"
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Assigned Supply Person (Optional)
                  </label>
                  <SearchableSelect
                    value={formSupplyPersonId}
                    onChange={(val) => setFormSupplyPersonId(val)}
                    options={supplyPersonOptions}
                    placeholder="— Unassigned —"
                    searchPlaceholder="Search supply person..."
                    size="sm"
                  />
                </div>
              </div>

              {/* Delivery Days Checkboxes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Delivery Schedule Days
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: '0.45rem',
                  background: 'var(--bg-main)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  {WEEKDAYS.map((day) => {
                    const checked = formDays.includes(day);
                    return (
                      <label
                        key={day}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          color: checked ? 'var(--text-heading)' : 'var(--text-secondary)',
                          fontWeight: checked ? 600 : 400,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDaySelection(day)}
                        />
                        {day}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Notes & Special Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Key landmarks, specific delivery gates, market timings, or contact precautions..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="input"
                  style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Active Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-main)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.5rem',
              }}>
                <input
                  type="checkbox"
                  id="formIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="formIsActive" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-heading)', cursor: 'pointer' }}>
                  Route Active in Distribution System
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  (Inactive routes will be hidden from order booking and customer assignment)
                </span>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingRoute(null);
                  }}
                  className="btn btn-secondary"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving...' : editingRoute ? 'Update Route' : 'Create Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Route Details */}
      {viewingRoute && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 0,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={20} className="text-emerald-500" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Route Details
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setViewingRoute(null)}
                className="btn btn-secondary"
                style={{ padding: '0.35rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: '1.25rem',
              }}>
                <div>
                  <span className="badge badge-navy font-mono" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    {viewingRoute.code}
                  </span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)', marginTop: '0.35rem' }}>
                    {viewingRoute.name}
                  </div>
                </div>
                {viewingRoute.is_active === 1 ? (
                  <span className="badge badge-emerald">Active</span>
                ) : (
                  <span className="badge badge-gray">Inactive</span>
                )}
              </div>

              {/* Key metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Territory / Area
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-heading)', marginTop: '0.2rem' }}>
                    {viewingRoute.area_territory || 'Unspecified'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    City
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-heading)', marginTop: '0.2rem' }}>
                    {viewingRoute.city || 'Unspecified'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Assigned Salesperson
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-heading)', marginTop: '0.2rem' }}>
                    {viewingRoute.assigned_salesperson_name || 'None Assigned'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Assigned Supply Person
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-heading)', marginTop: '0.2rem' }}>
                    {viewingRoute.assigned_supply_person_name || 'None Assigned'}
                  </div>
                </div>
              </div>

              {/* Delivery Days */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Delivery Schedule
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {viewingRoute.delivery_days && viewingRoute.delivery_days.length > 0 ? (
                    viewingRoute.delivery_days.map((d) => (
                      <span key={d} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                        <Calendar size={12} style={{ marginRight: '0.25rem', display: 'inline' }} />
                        {d}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Daily / All Days</span>
                  )}
                </div>
              </div>

              {/* Operational Stats */}
              <div style={{
                background: 'var(--bg-card-hover)',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.25rem',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
                  Operational Activity
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div>
                    <div className="tabular-nums" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      {formatNumber(viewingRoute.customers_count || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Customers</div>
                  </div>
                  <div>
                    <div className="tabular-nums" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      {formatNumber(viewingRoute.orders_count || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Orders</div>
                  </div>
                  <div>
                    <div className="tabular-nums" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      {formatNumber(viewingRoute.collections_count || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Collections</div>
                  </div>
                </div>
              </div>

              {viewingRoute.notes && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Notes
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--bg-main)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                    {viewingRoute.notes}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setViewingRoute(null)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Route with Live Dependency Blocker */}
      {deletingRoute && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 0,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)' }}>
                <AlertTriangle size={20} />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Delete Route & Territory
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeletingRoute(null);
                  setDeleteDepCheck(null);
                }}
                className="btn btn-secondary"
                style={{ padding: '0.35rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
                You are requesting to delete route: <strong style={{ color: 'var(--text-heading)' }}>{deletingRoute.name} ({deletingRoute.code})</strong>.
              </div>

              {checkingDelete ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Checking route dependencies and linked transactions...
                </div>
              ) : deleteDepCheck && !deleteDepCheck.canDelete ? (
                <div>
                  {/* Blocker Alert Banner */}
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1.5px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '1.25rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <AlertTriangle size={18} style={{ color: 'var(--accent-rose)', flexShrink: 0, marginTop: '0.1rem' }} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--accent-rose)', fontSize: '0.88rem' }}>
                          Deletion Strictly Blocked
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {deleteDepCheck.message}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Linked Breakdown */}
                  <div style={{
                    background: 'var(--bg-main)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.85rem 1rem',
                    marginBottom: '1.25rem',
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                      Linked Items Summary ({deleteDepCheck.summary.totalLinked} Total)
                    </div>

                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {deleteDepCheck.summary.customersCount > 0 && (
                        <li>
                          <strong>{deleteDepCheck.summary.customersCount} Customer(s)</strong>: {deleteDepCheck.linkedItems.customers.slice(0, 3).map((c) => c.name).join(', ')}{deleteDepCheck.summary.customersCount > 3 ? '...' : ''}
                        </li>
                      )}
                      {deleteDepCheck.summary.ordersCount > 0 && (
                        <li>
                          <strong>{deleteDepCheck.summary.ordersCount} Sale Order(s)</strong>: {deleteDepCheck.linkedItems.orders.slice(0, 3).map((o) => o.order_number).join(', ')}{deleteDepCheck.summary.ordersCount > 3 ? '...' : ''}
                        </li>
                      )}
                      {deleteDepCheck.summary.invoicesCount > 0 && (
                        <li>
                          <strong>{deleteDepCheck.summary.invoicesCount} Sales Invoice(s)</strong>: {deleteDepCheck.linkedItems.invoices.slice(0, 3).map((i) => i.invoice_number).join(', ')}{deleteDepCheck.summary.invoicesCount > 3 ? '...' : ''}
                        </li>
                      )}
                      {deleteDepCheck.summary.collectionsCount > 0 && (
                        <li>
                          <strong>{deleteDepCheck.summary.collectionsCount} Route Collection(s)</strong>: {deleteDepCheck.linkedItems.collections.slice(0, 3).map((cp) => cp.payment_number).join(', ')}{deleteDepCheck.summary.collectionsCount > 3 ? '...' : ''}
                        </li>
                      )}
                      {deleteDepCheck.summary.staffCount > 0 && (
                        <li>
                          <strong>{deleteDepCheck.summary.staffCount} Assigned Staff</strong>: {deleteDepCheck.linkedItems.staff.slice(0, 3).map((s) => s.name).join(', ')}{deleteDepCheck.summary.staffCount > 3 ? '...' : ''}
                        </li>
                      )}
                    </ul>

                    <div style={{ marginTop: '0.85rem', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-subtle)', paddingTop: '0.5rem' }}>
                      💡 <em>To delete this route, first reassign customers, orders, or staff to another route.</em>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                }}>
                  ✓ No transactions or records are currently linked to this route. It is safe to delete.
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDeletingRoute(null);
                    setDeleteDepCheck(null);
                  }}
                  className="btn btn-secondary"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="btn btn-danger"
                  disabled={actionLoading || checkingDelete || (deleteDepCheck !== null && !deleteDepCheck.canDelete)}
                >
                  {actionLoading ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
