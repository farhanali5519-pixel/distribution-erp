'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ExternalLink,
  Building2,
  KeyRound,
} from 'lucide-react';
import { Button, IconButton } from '@/shared/components/Button';

export default function UsersPage() {
  const [data, setData] = useState<{ platformUsers: any[]; tenantUsers: any[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'platform' | 'tenants'>('platform');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/superadmin/users');
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredPlatformUsers = (data?.platformUsers || []).filter((u) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      (u.full_name && u.full_name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term))
    );
  });

  const filteredTenantUsers = (data?.tenantUsers || []).filter((u) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      (u.full_name && u.full_name.toLowerCase().includes(term)) ||
      (u.company_name && u.company_name.toLowerCase().includes(term)) ||
      (u.company_slug && u.company_slug.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
            Platform & Tenant Users
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Vendor super administrator directory and customer tenant user index
          </p>
        </div>

        <IconButton
          variant="outline"
          size="md"
          onClick={fetchUsers}
          loading={isLoading}
          title="Refresh"
          aria-label="Refresh Users"
          icon={<RefreshCw className="w-4 h-4" />}
        />
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 tab-group w-full sm:w-auto">
          <Button
            variant={activeTab === 'platform' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('platform')}
          >
            Platform Super Admins ({data?.platformUsers?.length || 0})
          </Button>
          <Button
            variant={activeTab === 'tenants' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('tenants')}
          >
            Tenant Users ({data?.tenantUsers?.length || 0})
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* PLATFORM USERS TABLE */}
      {activeTab === 'platform' && (
        <div className="rounded-xl surface-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-3">Username</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">2FA Status</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Last 2FA Login</th>
                <th className="py-3 px-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {filteredPlatformUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--color-surface-muted)]/50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-[var(--color-text)]">
                    {u.full_name}
                  </td>
                  <td className="py-3 px-3 font-mono text-[var(--color-primary)]">
                    @{u.username}
                  </td>
                  <td className="py-3 px-3 text-[11px] text-[var(--color-text-muted)]">
                    {u.email || '—'}
                  </td>
                  <td className="py-3 px-3">
                    <span className="badge badge-neutral">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {u.totp_enabled === 1 ? (
                      <span className="badge badge-success">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>TOTP Active</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">Optional</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className={u.is_active === 1 ? 'badge badge-success' : 'badge badge-danger'}>
                      {u.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {u.last_2fa_at ? new Date(u.last_2fa_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="py-3 px-4 text-right text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {u.created_at?.split('T')[0] || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TENANT USERS TABLE */}
      {activeTab === 'tenants' && (
        <div className="rounded-xl surface-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-3">Company / Tenant</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]/60">
              {filteredTenantUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--color-surface-muted)]/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[var(--color-text)]">
                      {u.full_name}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--color-primary)]">
                      @{u.username}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/superadmin/companies/${u.company_id}`}
                      className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
                    >
                      {u.company_name || 'Organization'}
                    </Link>
                    <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {u.company_slug}.salesflow.space
                    </div>
                  </td>
                  <td className="py-3 px-3 text-[11px] text-[var(--color-text-muted)]">
                    {u.email || (u.phone ? <span className="numeric-text tabular-nums">{u.phone}</span> : '—')}
                  </td>
                  <td className="py-3 px-3">
                    <span className="badge badge-neutral">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={u.is_active === 1 ? 'badge badge-success' : 'badge badge-danger'}>
                      {u.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[11px] table-date text-[var(--color-text-muted)] tabular-nums">
                    {u.created_at?.split('T')[0] || '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      href={`/superadmin/companies/${u.company_id}`}
                    >
                      Manage Tenant
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
