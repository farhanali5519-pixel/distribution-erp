'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  MoreVertical,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Shield,
  Layers,
  Users,
  Palette,
  History,
  Lock,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import type { CompanyPlan, CompanyStatus } from '@/core/tenancy/company-provisioning.service';
import { PLAN_CONFIGS } from '@/core/tenancy/plans';
import { Button, IconButton } from '@/shared/components/Button';

interface CompanyListItem {
  id: string;
  name: string;
  legal_name?: string | null;
  tenant_code?: string | null;
  slug: string;
  status: CompanyStatus;
  plan: CompanyPlan;
  primary_contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  subscription_starts_at?: string | null;
  subscription_ends_at?: string | null;
  trial_ends_at?: string | null;
  created_at: string;
  userCount: number;
  activeModuleCount: number;
  primaryAdmin?: string;
  erpUrl?: string;
}

const RESERVED_SLUGS = new Set([
  'www', 'admin', 'superadmin', 'api', 'app', 'mail', 'support', 'static', 'assets', 'billing', 'demo'
]);

function CompaniesPageContent() {
  const searchParams = useSearchParams();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Add Company Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Extend License Modal State
  const [extendModalCompany, setExtendModalCompany] = useState<CompanyListItem | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [extendNotes, setExtendNotes] = useState('');

  // Reset Password Modal State
  const [resetPwdCompany, setResetPwdCompany] = useState<CompanyListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  // Form inputs for Add Customer
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    legalName: '',
    tenantCode: '',
    slug: '',
    primaryContactName: '',
    email: '',
    phone: '',
    address: '',
    city: 'Lahore',
    country: 'Pakistan',
    plan: 'COMMERCIAL' as CompanyPlan,
    licenseStartDate: new Date().toISOString().split('T')[0],
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'ACTIVE' as CompanyStatus,
    adminFullName: 'Company Administrator',
    adminUsername: 'admin',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
  });

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsAddModalOpen(true);
    }
  }, [searchParams]);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/superadmin/companies');
      const data = await res.json();
      if (data.success && data.data) {
        setCompanies(data.data);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Filter & Pagination
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.tenant_code && c.tenant_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = !statusFilter || c.status === statusFilter;
      const matchesPlan = !planFilter || c.plan === planFilter;

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [companies, searchQuery, statusFilter, planFilter]);

  const totalPages = Math.ceil(filteredCompanies.length / pageSize) || 1;
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCompanies.slice(start, start + pageSize);
  }, [filteredCompanies, currentPage, pageSize]);

  // Slug computation & validation
  const computedSlug = useMemo(() => {
    if (newCustomerForm.slug.trim()) {
      return newCustomerForm.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/--+/g, '-');
    }
    return newCustomerForm.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-');
  }, [newCustomerForm.slug, newCustomerForm.name]);

  const slugValidationError = useMemo(() => {
    if (!computedSlug) return '';
    if (RESERVED_SLUGS.has(computedSlug)) {
      return `"${computedSlug}" is a reserved system domain and cannot be used.`;
    }
    if (companies.some((c) => c.slug === computedSlug)) {
      return `"${computedSlug}" is already taken by another organization.`;
    }
    return '';
  }, [computedSlug, companies]);

  // Handle Add Customer Form Submit
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim() || !newCustomerForm.adminPassword) {
      setFormError('Company Name and Admin Password are required.');
      return;
    }
    if (slugValidationError) {
      setFormError(slugValidationError);
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const res = await fetch('/api/superadmin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerForm.name.trim(),
          legalName: newCustomerForm.legalName.trim() || undefined,
          tenantCode: newCustomerForm.tenantCode.trim() || undefined,
          slug: computedSlug,
          primaryContactName: newCustomerForm.primaryContactName.trim() || undefined,
          email: newCustomerForm.email.trim() || undefined,
          phone: newCustomerForm.phone.trim() || undefined,
          address: newCustomerForm.address.trim() || undefined,
          city: newCustomerForm.city.trim() || undefined,
          country: newCustomerForm.country.trim() || 'Pakistan',
          plan: newCustomerForm.plan,
          status: newCustomerForm.status,
          subscriptionStartsAt: newCustomerForm.licenseStartDate,
          subscriptionEndsAt: newCustomerForm.licenseExpiryDate,
          initialAdmin: {
            fullName: newCustomerForm.adminFullName.trim() || 'Company Administrator',
            username: newCustomerForm.adminUsername.trim() || 'admin',
            email: newCustomerForm.adminEmail.trim() || newCustomerForm.email.trim() || undefined,
            phone: newCustomerForm.adminPhone.trim() || newCustomerForm.phone.trim() || undefined,
            password: newCustomerForm.adminPassword,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create customer');
      }

      setIsAddModalOpen(false);
      fetchCompanies();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Status Toggle (Suspend / Activate)
  const handleToggleStatus = async (company: CompanyListItem) => {
    const nextStatus: CompanyStatus = company.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const actionLabel = nextStatus === 'SUSPENDED' ? 'suspend' : 'activate';
    if (!confirm(`Are you sure you want to ${actionLabel} "${company.name}"?`)) return;

    try {
      const res = await fetch(`/api/superadmin/companies/${company.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        fetchCompanies();
      }
    } catch (err) {
      alert('Failed to update company status');
    }
  };

  // Extend License Handler
  const handleExtendLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendModalCompany || !newExpiryDate) return;

    try {
      const res = await fetch(`/api/superadmin/companies/${extendModalCompany.id}/license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newExpiryDate, notes: extendNotes }),
      });
      const data = await res.json();
      if (data.success) {
        setExtendModalCompany(null);
        fetchCompanies();
      } else {
        alert(data.error || 'Failed to extend license');
      }
    } catch {
      alert('Network error while extending license');
    }
  };

  // Reset Password Handler
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdCompany || !newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      const res = await fetch(`/api/superadmin/companies/${resetPwdCompany.id}/reset-admin-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetPwdCompany.id, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setResetSuccessMsg(`Password reset successfully for ${resetPwdCompany.name}!`);
        setTimeout(() => {
          setResetPwdCompany(null);
          setResetSuccessMsg('');
          setNewPassword('');
        }, 1500);
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch {
      alert('Failed to reset password');
    }
  };

  const getStatusBadge = (status: CompanyStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="badge badge-success">
            <CheckCircle2 className="w-3 h-3" />
            <span>Active</span>
          </span>
        );
      case 'TRIAL':
        return (
          <span className="badge badge-info">
            <Clock className="w-3 h-3" />
            <span>Trial</span>
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="badge badge-danger">
            <XCircle className="w-3 h-3" />
            <span>Suspended</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="badge badge-warning">
            <AlertTriangle className="w-3 h-3" />
            <span>Expired</span>
          </span>
        );
      default:
        return (
          <span className="badge badge-neutral">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
            Customers & Companies
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Provision and manage SaleFlow subscriber tenant instances ({filteredCompanies.length} total)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <IconButton
            variant="outline"
            size="md"
            onClick={fetchCompanies}
            loading={isLoading}
            title="Refresh"
            aria-label="Refresh Customer List"
            icon={<RefreshCw className="w-4 h-4" />}
          />

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsAddModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Customer
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl surface-card flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by company name, subdomain, code, contact or email..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="TRIAL">Trial</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">All Plans</option>
            <option value="STARTER">Starter</option>
            <option value="STANDARD">Standard</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="rounded-xl surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-3">Tenant Code</th>
                <th className="py-3 px-3">Subdomain</th>
                <th className="py-3 px-3">Primary Contact</th>
                <th className="py-3 px-3">Contact Email / Phone</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Plan</th>
                <th className="py-3 px-3">License Range</th>
                <th className="py-3 px-3 text-center">Users</th>
                <th className="py-3 px-3 text-center">Modules</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {paginatedCompanies.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                    No matching customer organizations found.
                  </td>
                </tr>
              ) : (
                paginatedCompanies.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--color-surface-muted)]/50 transition-colors">
                    {/* Company Name */}
                    <td className="py-3 px-4">
                      <Link
                        href={`/superadmin/companies/${c.id}`}
                        className="font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
                      >
                        {c.name}
                      </Link>
                      {c.legal_name && c.legal_name !== c.name && (
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          {c.legal_name}
                        </div>
                      )}
                    </td>

                    {/* Tenant Code */}
                    <td className="py-3 px-3 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {c.tenant_code || '—'}
                    </td>

                    {/* Subdomain */}
                    <td className="py-3 px-3">
                      <span className="font-mono text-[#12A594] text-[11px]">
                        {c.slug}.salesflow.space
                      </span>
                    </td>

                    {/* Primary Contact */}
                    <td className="py-3 px-3 text-[var(--color-text)]">
                      {c.primary_contact_name || c.primaryAdmin || 'Admin'}
                    </td>

                    {/* Email / Phone */}
                    <td className="py-3 px-3">
                      <div className="text-[11px] text-[var(--color-text)] truncate max-w-[140px]">
                        {c.email || '—'}
                      </div>
                      {c.phone && (
                        <div className="text-[10px] text-[var(--color-text-muted)] numeric-text tabular-nums">
                          {c.phone}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3">{getStatusBadge(c.status)}</td>

                    {/* Plan */}
                    <td className="py-3 px-3">
                      <span className="badge badge-neutral">
                        {c.plan}
                      </span>
                    </td>

                    {/* License Start / Expiry */}
                    <td className="py-3 px-3 tabular-nums text-[11px]">
                      <div className="text-[var(--color-text)]">
                        {c.subscription_ends_at || c.trial_ends_at || 'Perpetual'}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">
                        Start: {c.subscription_starts_at || 'Initial'}
                      </div>
                    </td>

                    {/* Users Count */}
                    <td className="py-3 px-3 text-center tabular-nums font-semibold text-[var(--color-text)]">
                      {c.userCount}
                    </td>

                    {/* Enabled Modules Count */}
                    <td className="py-3 px-3 text-center tabular-nums font-semibold text-[var(--color-text)]">
                      {c.activeModuleCount}
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-3 tabular-nums text-[11px] text-[var(--color-text-muted)]">
                      {c.created_at ? c.created_at.split('T')[0] : '—'}
                    </td>

                    {/* Actions Menu */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          href={`/superadmin/companies/${c.id}`}
                        >
                          View
                        </Button>

                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setExtendModalCompany(c);
                            setNewExpiryDate(c.subscription_ends_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                          }}
                          title="Extend License"
                        >
                          Extend
                        </Button>

                        <Button
                          variant={c.status === 'SUSPENDED' ? 'success' : 'danger-outline'}
                          size="xs"
                          onClick={() => handleToggleStatus(c)}
                          title={c.status === 'SUSPENDED' ? 'Activate Tenant' : 'Suspend Tenant'}
                        >
                          {c.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]">
          <div>
            Showing <span className="font-semibold text-[var(--color-text)] tabular-nums">{paginatedCompanies.length}</span> of{' '}
            <span className="font-semibold text-[var(--color-text)] tabular-nums">{filteredCompanies.length}</span> companies
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: ADD CUSTOMER / COMPANY PROVISIONING */}
      {/* ============================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="surface-card rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  Provision New Customer Company
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Creates dedicated customer ERP tenant organization & primary admin
                </p>
              </div>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                title="Close"
                aria-label="Close modal"
                icon={<XCircle className="w-4 h-4" />}
              />
            </div>

            {formError && (
              <div className="m-6 mb-0 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddCustomerSubmit} className="p-6 space-y-6">
              {/* Section 1: Organization Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#12A594]" />
                  <span>1. Company Information</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newCustomerForm.name}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                      placeholder="e.g. Apex Distributors"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Legal Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newCustomerForm.legalName}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, legalName: e.target.value })}
                      placeholder="e.g. Apex Distributors Pvt Ltd"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Tenant Code
                    </label>
                    <input
                      type="text"
                      value={newCustomerForm.tenantCode}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, tenantCode: e.target.value })}
                      placeholder="Auto (e.g. SF-1042)"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] font-mono uppercase focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Subdomain Slug with live preview */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Subdomain Slug *
                    </label>
                    <input
                      type="text"
                      value={newCustomerForm.slug}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, slug: e.target.value })}
                      placeholder="e.g. apex"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] font-mono lowercase focus:outline-none focus:border-indigo-500"
                    />
                    <div className="mt-1 text-[11px] flex items-center justify-between font-mono">
                      <span className="text-[var(--text-muted,#8b949e)]">
                        Preview:{' '}
                        <span className="text-indigo-400 font-semibold">
                          https://{computedSlug || 'slug'}.salesflow.space
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Primary Contact Name
                    </label>
                    <input
                      type="text"
                      value={newCustomerForm.primaryContactName}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, primaryContactName: e.target.value })}
                      placeholder="Farhan Ali"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newCustomerForm.email}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                      placeholder="admin@apex.com"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newCustomerForm.phone}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                      placeholder="0300-1234567"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] numeric-text focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Subscription & Plan */}
              <div className="space-y-4 pt-4 border-t border-[var(--border-default,#30363d)]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#12A594]" />
                  <span>2. Subscription Plan & License</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Plan Tier
                    </label>
                    <select
                      value={newCustomerForm.plan}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, plan: e.target.value as CompanyPlan })}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    >
                      <option value="STARTER">Starter (3 users, 1 wh)</option>
                      <option value="STANDARD">Standard (8 users, 2 wh)</option>
                      <option value="COMMERCIAL">Commercial (15 users, 5 wh)</option>
                      <option value="PROFESSIONAL">Professional (25 users, 10 wh)</option>
                      <option value="ENTERPRISE">Enterprise (100 users, 50 wh)</option>
                      <option value="CUSTOM">Custom Configuration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      License Start Date
                    </label>
                    <input
                      type="date"
                      value={newCustomerForm.licenseStartDate}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, licenseStartDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      License Expiry Date
                    </label>
                    <input
                      type="date"
                      value={newCustomerForm.licenseExpiryDate}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, licenseExpiryDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Initial Tenant Admin User */}
              <div className="space-y-4 pt-4 border-t border-[var(--border-default,#30363d)]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#12A594]" />
                  <span>3. Primary Tenant Administrator (Assigned exclusively to this customer)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Admin Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newCustomerForm.adminFullName}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, adminFullName: e.target.value })}
                      placeholder="Farhan Admin"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Admin Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={newCustomerForm.adminUsername}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, adminUsername: e.target.value })}
                      placeholder="admin"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] font-mono focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Initial Temporary Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={newCustomerForm.adminPassword}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, adminPassword: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting || Boolean(slugValidationError)}
                  loading={isSubmitting}
                >
                  {isSubmitting ? 'Provisioning Instance...' : 'Provision Customer Company'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EXTEND LICENSE */}
      {/* ============================================================== */}
      {extendModalCompany && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="surface-card rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--color-text)] mb-1">
              Extend License: {extendModalCompany.name}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Current Expiry:{' '}
              <span className="font-mono text-[var(--color-text)]">
                {extendModalCompany.subscription_ends_at || 'Perpetual'}
              </span>
            </p>

            <form onSubmit={handleExtendLicenseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1">
                  New Expiry Date
                </label>
                <input
                  type="date"
                  required
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1">
                  Extension Reason / Notes
                </label>
                <input
                  type="text"
                  value={extendNotes}
                  onChange={(e) => setExtendNotes(e.target.value)}
                  placeholder="e.g. Annual renewal paid invoice #9921"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtendModalCompany(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                >
                  Confirm License Extension
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading companies...</div>}>
      <CompaniesPageContent />
    </Suspense>
  );
}
