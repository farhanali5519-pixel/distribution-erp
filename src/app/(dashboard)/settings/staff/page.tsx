'use client';

import React, { useState, useEffect } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Truck,
  Briefcase,
  Layers,
  MapPin,
  Phone,
  Hash,
  FileText,
  AlertTriangle,
  X,
  ShieldCheck,
  Check
} from 'lucide-react';

interface RouteOption {
  id: string;
  name: string;
  code: string;
}

interface StaffMember {
  id: string;
  employee_code: string;
  name: string;
  role: 'SALESMAN' | 'SUPPLY_PERSON' | 'BOTH' | 'DRIVER' | 'MANAGER';
  phone: string | null;
  route_id: string | null;
  route_name?: string | null;
  route_code?: string | null;
  notes: string | null;
  is_active: number;
  linked_transactions_count?: number;
  created_at: string;
  updated_at: string;
}

export default function StaffMasterPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [routeFilter, setRouteFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    employeeCode: '',
    phone: '',
    role: 'SALESMAN' as 'SALESMAN' | 'SUPPLY_PERSON' | 'BOTH' | 'DRIVER' | 'MANAGER',
    routeId: '',
    notes: '',
    isActive: true,
  });
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete State
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchStaffAndRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffRes, routesRes] = await Promise.all([
        fetch('/api/staff?all=true').then((r) => r.json()),
        fetch('/api/routes').then((r) => r.json()),
      ]);

      if (staffRes.success) {
        setStaff(staffRes.staff || []);
      } else {
        throw new Error(staffRes.message || 'Failed to fetch distribution team.');
      }

      if (routesRes.success) {
        setRoutes(routesRes.routes || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load staff records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffAndRoutes();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        openAddModal();
      }
    }
  }, []);

  const openAddModal = () => {
    setEditingStaff(null);
    setFormData({
      name: '',
      employeeCode: '',
      phone: '',
      role: 'SALESMAN',
      routeId: '',
      notes: '',
      isActive: true,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (member: StaffMember) => {
    setEditingStaff(member);
    setFormData({
      name: member.name,
      employeeCode: member.employee_code || '',
      phone: member.phone || '',
      role: member.role,
      routeId: member.route_id || '',
      notes: member.notes || '',
      isActive: member.is_active === 1,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setModalError('Staff member name is required.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : '/api/staff';
      const method = editingStaff ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save staff member.');
      }

      setSuccessMessage(data.message || 'Staff member saved successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setIsModalOpen(false);
      fetchStaffAndRoutes();
    } catch (err: any) {
      setModalError(err.message || 'Error occurred while saving staff member.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    try {
      const nextActive = member.is_active === 1 ? 0 : 1;
      const res = await fetch(`/api/staff/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: member.name,
          role: member.role,
          isActive: nextActive === 1,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to toggle status.');
      }
      setSuccessMessage(`Staff member "${member.name}" marked as ${nextActive === 1 ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      fetchStaffAndRoutes();
    } catch (err: any) {
      setError(err.message || 'Failed to update active state.');
    }
  };

  const handleDeleteStaff = async () => {
    if (!deletingStaff) return;
    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/staff/${deletingStaff.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete staff member.');
      }
      setSuccessMessage(data.message || 'Staff member removed.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setDeletingStaff(null);
      fetchStaffAndRoutes();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete staff member.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Filtered List
  const filteredStaff = staff.filter((s) => {
    const matchesSearch =
      searchTerm === '' ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.employee_code && s.employee_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.phone && s.phone.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole =
      roleFilter === 'ALL' ||
      s.role === roleFilter ||
      (roleFilter === 'SALESMAN' && (s.role === 'SALESMAN' || s.role === 'BOTH')) ||
      (roleFilter === 'SUPPLY_PERSON' && (s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER'));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && s.is_active === 1) ||
      (statusFilter === 'INACTIVE' && s.is_active === 0);

    const matchesRoute =
      routeFilter === 'ALL' ||
      s.route_id === routeFilter ||
      (routeFilter === 'UNASSIGNED' && !s.route_id);

    return matchesSearch && matchesRole && matchesStatus && matchesRoute;
  });

  const staffPagination = usePagination(filteredStaff);


  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SALESMAN':
        return (
          <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd', fontWeight: 600 }}>
            <Briefcase size={12} className="inline mr-1" /> Sales Executive
          </span>
        );
      case 'SUPPLY_PERSON':
        return (
          <span className="badge" style={{ backgroundColor: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 600 }}>
            <Truck size={12} className="inline mr-1" /> Delivery Officer
          </span>
        );
      case 'BOTH':
        return (
          <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#b45309', borderColor: '#fde68a', fontWeight: 700 }}>
            <Layers size={12} className="inline mr-1" /> Both (Sales & Delivery)
          </span>
        );
      case 'DRIVER':
        return (
          <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1', fontWeight: 600 }}>
            <Truck size={12} className="inline mr-1" /> Van Driver
          </span>
        );
      default:
        return (
          <span className="badge" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce', borderColor: '#e9d5ff', fontWeight: 600 }}>
            {role}
          </span>
        );
    }
  };

  return (
    <ListPageContainer className="flex flex-col gap-5">
      {/* Top Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}>
              <Users size={20} />
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
              Sales & Delivery Team
            </h1>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Staff Master directory for order booking executives, delivery officers, van drivers, and route allocations.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={fetchStaffAndRoutes}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', padding: '0.5rem 0.85rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={openAddModal}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.825rem',
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: 600,
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
            }}
          >
            <UserPlus size={16} />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle size={16} />
          <span>{successMessage}</span>
        </div>
      )}

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
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}



      {/* Filter and Search Bar */}
      <div className="filter-section-card p-4 space-y-3 mb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Staff Directory Filters
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredStaff.length}</strong> of{' '}
              <strong className="font-bold text-slate-900 dark:text-slate-100">{staff.length}</strong> members
            </div>

            {(searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL' || routeFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('ALL');
                  setStatusFilter('ALL');
                  setRouteFilter('ALL');
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <label className="sr-only">Search Staff</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by staff name, code, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="w-[190px]">
            <label className="sr-only">Filter by Role</label>
            <SearchableSelect
              options={[
                { value: 'ALL', label: 'All Roles' },
                { value: 'SALESMAN', label: 'Sales Executives (inc. Both)' },
                { value: 'SUPPLY_PERSON', label: 'Delivery Officers (inc. Both)' },
                { value: 'BOTH', label: 'Dual Role (Both) Only' },
                { value: 'DRIVER', label: 'Van Drivers' },
                { value: 'MANAGER', label: 'Managers' },
              ]}
              value={roleFilter}
              onChange={(val) => setRoleFilter(val as string)}
              size="sm"
              placeholder="All Roles"
            />
          </div>

          <div className="w-[140px]">
            <label className="sr-only">Filter by Status</label>
            <SearchableSelect
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active Staff' },
                { value: 'INACTIVE', label: 'Inactive Staff' },
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as string)}
              size="sm"
              placeholder="All Statuses"
            />
          </div>

          <div className="w-[200px]">
            <label className="sr-only">Filter by Route</label>
            <SearchableSelect
              options={[
                { value: 'ALL', label: 'All Assigned Routes' },
                { value: 'UNASSIGNED', label: 'Unassigned Routes' },
                ...routes.map((r) => ({
                  value: r.id,
                  label: `${r.name} (${r.code})`,
                })),
              ]}
              value={routeFilter}
              onChange={(val) => setRouteFilter(val as string)}
              size="sm"
              placeholder="All Assigned Routes"
            />
          </div>
        </div>
      </div>

      {/* Staff Master Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Code</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Staff Name</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Mobile / Contact</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Assigned Route</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Linked Records</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <RefreshCw size={16} className="animate-spin" />
                      Loading distribution team directory...
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No staff members match the selected criteria.
                  </td>
                </tr>
              ) : (
                staffPagination.paginatedItems.map((member) => (
                  <tr
                    key={member.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      opacity: member.is_active === 1 ? 1 : 0.65,
                      backgroundColor: member.is_active === 1 ? 'transparent' : '#f8fafc',
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        className="tabular-nums"
                        style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          background: '#f1f5f9',
                          color: '#334155',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {member.employee_code || 'EMP-N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{member.name}</div>
                      {member.notes && (
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {member.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{getRoleBadge(member.role)}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {member.phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                          <Phone size={13} style={{ color: 'var(--text-muted)' }} />
                          <span className="tabular-nums">{member.phone}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {member.route_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <MapPin size={13} style={{ color: '#2563eb' }} />
                          <span style={{ fontWeight: 500 }}>{member.route_name}</span>
                          {member.route_code && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({member.route_code})</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Unassigned Route</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button
                        onClick={() => handleToggleStatus(member)}
                        title="Click to toggle Active / Inactive status"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        {member.is_active === 1 ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              background: '#ecfdf5',
                              color: '#065f46',
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              border: '1px solid #a7f3d0',
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                            Active
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              background: '#f1f5f9',
                              color: '#64748b',
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }} />
                            Inactive
                          </span>
                        )}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="tabular-nums" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {member.linked_transactions_count !== undefined ? member.linked_transactions_count : 0} txn(s)
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => openEditModal(member)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                          title="Edit staff member"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setDeletingStaff(member)}
                          className="btn"
                          style={{
                            padding: '0.35rem 0.6rem',
                            fontSize: '0.75rem',
                            color: '#dc2626',
                            borderColor: '#fecaca',
                            backgroundColor: '#fff',
                          }}
                          title="Delete staff member"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls pagination={staffPagination} />
      </div>

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '1.5rem',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {editingStaff ? <Edit2 size={16} /> : <UserPlus size={16} />}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                  {editingStaff ? 'Edit Staff Member' : 'Register New Distribution Staff'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div style={{
                marginTop: '1rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <AlertTriangle size={15} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStaff} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Full Staff Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tariq Mehmood, Imran Rafiq"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    style={{ width: '100%', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Employee Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-001 (Blank = Auto)"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="input tabular-nums"
                    style={{ width: '100%', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Leave blank to auto-generate</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Mobile / Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="0300-1234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input tabular-nums"
                    style={{ width: '100%', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Operational Role <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'SALESMAN' })}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '8px',
                      border: formData.role === 'SALESMAN' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: formData.role === 'SALESMAN' ? '#eff6ff' : '#ffffff',
                      color: formData.role === 'SALESMAN' ? '#1d4ed8' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Briefcase size={16} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Salesperson</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Booking & Visits</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'SUPPLY_PERSON' })}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '8px',
                      border: formData.role === 'SUPPLY_PERSON' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      background: formData.role === 'SUPPLY_PERSON' ? '#f0fdf4' : '#ffffff',
                      color: formData.role === 'SUPPLY_PERSON' ? '#15803d' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Truck size={16} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Supply Person</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Deliveries & Bills</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'BOTH' })}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '8px',
                      border: formData.role === 'BOTH' ? '2px solid #d97706' : '1px solid #e2e8f0',
                      background: formData.role === 'BOTH' ? '#fffbeb' : '#ffffff',
                      color: formData.role === 'BOTH' ? '#b45309' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Layers size={16} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Both (Dual)</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Booking & Delivery</span>
                  </button>
                </div>
              </div>

              {/* Route Assignment */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Assigned Route (Optional)
                </label>
                <SearchableSelect
                  options={[
                    { value: '', label: 'No Default Route (Flexible / All Routes)' },
                    ...routes.map((r) => ({
                      value: r.id,
                      label: `${r.name} (${r.code})`,
                    })),
                  ]}
                  value={formData.routeId}
                  onChange={(val) => setFormData({ ...formData, routeId: val as string })}
                  placeholder="Select Assigned Route"
                  clearable
                />
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Notes / Observations
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. In charge of North sector, vehicle Suzuki Bolan LHR-1234"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0' }}>
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isActiveToggle" style={{ fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', color: 'var(--text-heading)' }}>
                  Active Staff Member (Appears in live Order Booking and Dispatch dropdowns)
                </label>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.85rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  {modalSubmitting ? 'Saving...' : editingStaff ? 'Update Staff Member' : 'Register Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStaff && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem',
        }}>
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '1.5rem',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Trash2 size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                  Delete Staff Member?
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Are you sure you want to delete <strong>{deletingStaff.name}</strong> ({deletingStaff.employee_code})?
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  If this staff member has already booked orders or delivered goods, deletion will be blocked to maintain historical ledger and reporting integrity.
                </div>
              </div>
            </div>

            {deleteError && (
              <div style={{
                marginTop: '1rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '0.8rem',
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
              <button
                type="button"
                onClick={() => {
                  setDeletingStaff(null);
                  setDeleteError(null);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleDeleteStaff}
                className="btn"
                style={{
                  fontSize: '0.85rem',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                {deleteSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
