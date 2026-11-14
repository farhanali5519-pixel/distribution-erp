'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  ArrowUpRight,
  Shield,
  Layers,
} from 'lucide-react';
import type { CompanyPlan, CompanyStatus } from '@/core/tenancy/company-provisioning.service';
import { Button, IconButton } from '@/shared/components/Button';

export default function LicensingPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Quick Extend Modal
  const [extendCompany, setExtendCompany] = useState<any | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLicenses = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/superadmin/companies');
      const json = await res.json();
      if (json.success && json.data) {
        setCompanies(json.data);
      }
    } catch (err) {
      console.error('Failed to load licenses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendCompany || !newExpiryDate) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/superadmin/companies/${extendCompany.id}/license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newExpiryDate, notes }),
      });
      const json = await res.json();
      if (json.success) {
        setExtendCompany(null);
        fetchLicenses();
      } else {
        alert(json.error || 'Failed to extend license');
      }
    } catch {
      alert('Network error while extending license');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const term = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(term) ||
      c.slug.toLowerCase().includes(term) ||
      (c.tenant_code && c.tenant_code.toLowerCase().includes(term));
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const now = new Date();
  const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const activeCount = companies.filter((c) => c.status === 'ACTIVE').length;
  const trialCount = companies.filter((c) => c.status === 'TRIAL').length;
  const expiringCount = companies.filter((c) => {
    const exp = c.subscription_ends_at ? new Date(c.subscription_ends_at) : (c.trial_ends_at ? new Date(c.trial_ends_at) : null);
    return exp && exp > now && exp <= in15Days;
  }).length;
  const expiredCount = companies.filter((c) => c.status === 'EXPIRED').length;
  const suspendedCount = companies.filter((c) => c.status === 'SUSPENDED').length;

  return (
    <div className="space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--text-heading,#f0f6fc)]">
            Licensing & Subscriptions
          </h2>
          <p className="text-xs text-[var(--text-muted,#8b949e)] mt-0.5">
            Fleet entitlement dates, renewals, status enforcement, and access controls
          </p>
        </div>

        <IconButton
          variant="outline"
          size="md"
          onClick={fetchLicenses}
          loading={isLoading}
          title="Refresh"
          aria-label="Refresh Licensing"
          icon={<RefreshCw className="w-4 h-4" />}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Active Paid</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Trial Tier</div>
          <div className="text-2xl font-bold tabular-nums text-sky-400 mt-1">{trialCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Expiring Soon</div>
          <div className="text-2xl font-bold tabular-nums text-orange-400 mt-1">{expiringCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Expired</div>
          <div className="text-2xl font-bold tabular-nums text-amber-400 mt-1">{expiredCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Suspended</div>
          <div className="text-2xl font-bold tabular-nums text-rose-400 mt-1">{suspendedCount}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted,#8b949e)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search organizations..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-primary,#c9d1d9)] w-full sm:w-auto"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {/* Licenses Table */}
      <div className="rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-default,#30363d)] bg-[var(--bg-app,#0d1117)]/50 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#8b949e)]">
              <th className="py-3 px-4">Organization</th>
              <th className="py-3 px-3">Plan</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Start Date</th>
              <th className="py-3 px-3">Expiry Date</th>
              <th className="py-3 px-3">User Seats</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default,#30363d)]/60">
            {filteredCompanies.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--bg-app,#0d1117)]/40 transition-colors">
                <td className="py-3 px-4">
                  <Link
                    href={`/superadmin/companies/${c.id}`}
                    className="font-semibold text-[var(--text-heading,#f0f6fc)] hover:text-[#16A46A]"
                  >
                    {c.name}
                  </Link>
                  <div className="font-mono text-[10px] text-[#12A594]">
                    {c.slug}.salesflow.space
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F5F7FA] text-[#0F2747] border border-[#E4E7EC]">
                    {c.plan}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className="font-semibold text-[11px] text-[var(--text-heading,#f0f6fc)]">
                    {c.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-[11px] tabular-nums text-[var(--text-muted,#8b949e)]">
                  {c.subscription_starts_at || 'Initial'}
                </td>
                <td className="py-3 px-3 text-[11px] tabular-nums font-semibold text-[var(--text-heading,#f0f6fc)]">
                  {c.subscription_ends_at || c.trial_ends_at || 'Perpetual'}
                </td>
                <td className="py-3 px-3 tabular-nums text-[var(--text-primary,#c9d1d9)]">
                  {c.userCount} / {c.max_users} seats
                </td>
                <td className="py-3 px-4 text-right">
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      setExtendCompany(c);
                      setNewExpiryDate(c.subscription_ends_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                      setNotes('');
                    }}
                  >
                    Extend License
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Extend License Modal */}
      {extendCompany && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)] mb-1">
              Extend License: {extendCompany.name}
            </h3>
            <p className="text-xs text-[var(--text-muted,#8b949e)] mb-4">
              Organization Subdomain: <span className="font-mono text-[#12A594]">{extendCompany.slug}.salesflow.space</span>
            </p>

            <form onSubmit={handleExtendSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  New Expiry Date
                </label>
                <input
                  type="date"
                  required
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-[#16A46A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Extension Reason / Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Annual renewal payment confirmed"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-[#16A46A]"
                />
              </div>

              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtendCompany(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                >
                  Confirm Extension
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
