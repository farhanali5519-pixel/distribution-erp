'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  XCircle,
  CheckCircle2,
  Boxes,
  ArrowUpRight,
  RefreshCw,
  Plus,
  KeyRound,
  History,
  Activity,
  Layers,
} from 'lucide-react';
import type { CompanyPlan, CompanyStatus } from '@/core/tenancy/company-provisioning.service';
import { Button, IconButton } from '@/shared/components/Button';

interface DashboardStats {
  kpis: {
    totalCustomers: number;
    activeCustomers: number;
    inactiveCustomers: number;
    trialCustomers: number;
    expiredCustomers: number;
    totalTenantUsers: number;
    activeLicenses: number;
    expiringLicenses: number;
    suspendedAccounts: number;
  };
  subscriptionOverview: {
    active: number;
    trial: number;
    expiringSoon: number;
    expired: number;
    suspended: number;
  };
  recentCustomers: {
    id: string;
    name: string;
    slug: string;
    tenant_code?: string;
    status: CompanyStatus;
    plan: CompanyPlan;
    primary_contact_name?: string;
    email?: string;
    phone?: string;
    primaryAdmin?: string;
    subscription_starts_at?: string;
    subscription_ends_at?: string;
    trial_ends_at?: string;
    created_at: string;
    userCount: number;
    activeModuleCount: number;
  }[];
  recentActivity: {
    id: string;
    actor: string;
    action: string;
    target?: string;
    reason?: string;
    timestamp: string;
  }[];
  moduleUsage: {
    id: string;
    name: string;
    count: number;
    percentage: number;
  }[];
}

export function SuperAdminDashboardClient() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/superadmin/dashboard/stats');
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Failed to load statistics');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

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

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        <span className="text-sm text-[var(--color-text-muted)] font-medium">
          Loading platform metrics...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl alert-danger flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Failed to load platform dashboard</h3>
          <p className="text-xs text-[var(--color-danger)]/80 mt-1">{error || 'Unknown error'}</p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={fetchStats}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { kpis, subscriptionOverview, recentCustomers, recentActivity, moduleUsage } = data;

  return (
    <div className="space-y-6 select-none">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
            SaleFlow Cloud Overview
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Vendor-level tenant fleet status, licensing telemetry, and system activities
          </p>
        </div>

        <div className="flex items-center gap-3">
          <IconButton
            variant="outline"
            size="md"
            onClick={fetchStats}
            title="Refresh Metrics"
            aria-label="Refresh Metrics"
            loading={isLoading}
            icon={<RefreshCw className="w-4 h-4" />}
          />
          <Button
            variant="primary"
            size="md"
            href="/superadmin/companies?new=1"
            icon={<Plus className="w-4 h-4" />}
          >
            Add New Customer
          </Button>
        </div>
      </div>

      {/* TOP 9 KPIS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* 1. Total Customers */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Customers</span>
            <Building2 className="w-4 h-4 text-[#0F2747]" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#0F2747]">
            {kpis.totalCustomers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Registered tenant organizations
          </p>
        </div>

        {/* 2. Active Customers */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#16A46A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Customers</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#16A46A]">
            {kpis.activeCustomers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            In good standing & accessible
          </p>
        </div>

        {/* 3. Inactive Customers */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Inactive Customers</span>
            <Layers className="w-4 h-4 text-[#667085]" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#172033]">
            {kpis.inactiveCustomers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Dormant or de-provisioned
          </p>
        </div>

        {/* 4. Trial Customers */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#2E90FA] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Trial Customers</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#2E90FA]">
            {kpis.trialCustomers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Active trial subscriptions
          </p>
        </div>

        {/* 5. Expired Customers */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#F79009] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Expired Customers</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#F79009]">
            {kpis.expiredCustomers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Term ended • locked out
          </p>
        </div>

        {/* 6. Total Tenant Users */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Tenant Users</span>
            <Users className="w-4 h-4 text-[#0F2747]" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#0F2747]">
            {kpis.totalTenantUsers.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Accounts across all companies
          </p>
        </div>

        {/* 7. Active Licenses */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#16A46A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Licenses</span>
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#16A46A]">
            {kpis.activeLicenses.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Paid & trial active entitlements
          </p>
        </div>

        {/* 8. Expiring Licenses */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between text-[#F79009] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Expiring Licenses</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#F79009]">
            {kpis.expiringLicenses.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Expiring in next 15 days
          </p>
        </div>

        {/* 9. Suspended Accounts */}
        <div className="p-4 rounded-xl bg-white border border-[#E4E7EC] shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[#D92D20] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Suspended Accounts</span>
            <XCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums text-[#D92D20]">
            {kpis.suspendedAccounts.toLocaleString()}
          </div>
          <p className="text-[10px] text-[#667085] mt-1">
            Access administratively blocked
          </p>
        </div>
      </div>

      {/* SECTION C & D: SUBSCRIPTION OVERVIEW & MODULE USAGE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION C: Subscription / License Overview */}
        <div className="p-5 rounded-xl bg-white border border-[#E4E7EC] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#12A594]" />
                <span>Subscription Lifecycle</span>
              </h3>
              <Link
                href="/superadmin/licensing"
                className="text-[11px] text-[#16A46A] hover:text-[#12A594] font-medium flex items-center gap-1"
              >
                <span>View Licensing</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#172033] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#16A46A]" />
                  Active Subscriptions
                </span>
                <span className="font-semibold tabular-nums text-[#0F2747]">
                  {subscriptionOverview.active}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#172033] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#2E90FA]" />
                  Active Trial Accounts
                </span>
                <span className="font-semibold tabular-nums text-[#0F2747]">
                  {subscriptionOverview.trial}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#172033] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F79009]" />
                  Expiring Soon (≤ 15d)
                </span>
                <span className="font-semibold tabular-nums text-[#F79009]">
                  {subscriptionOverview.expiringSoon}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#172033] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F79009]" />
                  Expired Licenses
                </span>
                <span className="font-semibold tabular-nums text-[#F79009]">
                  {subscriptionOverview.expired}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#172033] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#D92D20]" />
                  Suspended Accounts
                </span>
                <span className="font-semibold tabular-nums text-[#D92D20]">
                  {subscriptionOverview.suspended}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#E4E7EC] text-[11px] text-[#667085]">
            Total active tenant fleet: <span className="font-semibold text-[#0F2747] tabular-nums">{kpis.activeLicenses}</span> organizations
          </div>
        </div>

        {/* SECTION D: Module Usage Overview */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#12A594]" />
              <span>Module Adoption Across Tenants</span>
            </h3>
            <Link
              href="/superadmin/modules"
              className="text-[11px] text-[#16A46A] hover:text-[#12A594] font-medium flex items-center gap-1"
            >
              <span>Manage Plans & Registry</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 mt-4">
            {moduleUsage.slice(0, 10).map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#172033] truncate">
                    {m.name}
                  </span>
                  <span className="text-[11px] text-[#667085] tabular-nums">
                    {m.count} tenants ({m.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#F2F4F7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#16A46A] to-[#12A594] rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(4, m.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION A & B: RECENT CUSTOMERS & RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION A: Recent Customers */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC] mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#12A594]" />
              <span>Recent Customers</span>
            </h3>
            <Link
              href="/superadmin/companies"
              className="text-[11px] text-[#16A46A] hover:text-[#12A594] font-medium flex items-center gap-1"
            >
              <span>View All ({kpis.totalCustomers})</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E4E7EC] bg-[#F8F9FA] text-[10px] font-bold uppercase tracking-wider text-[#667085]">
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3">Subdomain</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3 text-right">Expiry Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {recentCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#0F2747]">
                        {c.name}
                      </div>
                      {c.tenant_code && (
                        <div className="text-[10px] font-mono text-[#667085]">
                          {c.tenant_code}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-[#12A594] text-[11px]">
                        {c.slug}.salesflow.space
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-[#172033]">
                        {c.primaryAdmin || c.primary_contact_name || 'Admin'}
                      </span>
                    </td>
                    <td className="py-3 px-3">{getStatusBadge(c.status)}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F5F7FA] text-[#0F2747] border border-[#E4E7EC]">
                        {c.plan}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#667085]">
                      {c.subscription_ends_at || c.trial_ends_at || 'Perpetual'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button
                        variant="outline"
                        size="xs"
                        href={`/superadmin/companies/${c.id}`}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION B: Recent Activity */}
        <div className="p-5 rounded-xl bg-white border border-[#E4E7EC] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC] mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <History className="w-4 h-4 text-[#12A594]" />
              <span>Recent Activity</span>
            </h3>
            <Link
              href="/superadmin/audit"
              className="text-[11px] text-[#16A46A] hover:text-[#12A594] font-medium flex items-center gap-1"
            >
              <span>Full Audit Trail</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[380px]">
            {recentActivity.length === 0 ? (
              <p className="text-xs text-[#667085] text-center py-6">
                No recent activity recorded
              </p>
            ) : (
              recentActivity.map((act) => (
                <div key={act.id} className="p-2.5 rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#0F2747] text-[11px]">
                      {act.action}
                    </span>
                    <span className="text-[10px] text-[#667085] tabular-nums">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#172033] line-clamp-2">
                    {act.reason || act.target || 'Platform action'}
                  </p>
                  <div className="text-[10px] text-[#667085]">
                    By <span className="font-mono text-[#0F2747] font-medium">{act.actor}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
