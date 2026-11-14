'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Settings as SettingsIcon,
  Users,
  UserPlus,
  Loader2,
  RefreshCw,
  Key,
  Globe,
  ExternalLink,
  Palette,
  ShieldCheck,
  History,
  KeyRound,
  Lock,
  RotateCcw,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  Smartphone,
  TrendingUp,
  ShoppingCart,
  Package,
  PieChart,
  CreditCard,
  BarChart3,
  Sliders,
  X,
  FileText,
  Truck,
  Landmark,
  Check,
  PlusCircle,
  Undo2,
  Coins,
  Receipt,
  Wallet,
  MapPin,
  UserCheck,
  ToggleLeft,
  Database,
  ClipboardList,
} from 'lucide-react';
import type { CompanyPlan, CompanyStatus } from '@/core/tenancy/company-provisioning.service';
import { PLAN_CONFIGS } from '@/core/tenancy/plans';
import {
  APPROVED_FONTS,
  APPROVED_TEXT_FONTS,
  APPROVED_NUMERIC_FONTS,
  getFontFamilyCss,
  BrandingConfig,
  ApprovedFont,
  ApprovedNumericFont,
  NumericDigitStyle,
  FontSizeScale,
  DEFAULT_SALEFLOW_BRANDING,
} from '@/core/branding/theme';
import { HIERARCHICAL_MODULES, MainModuleDefinition, SubModuleDefinition } from '@/core/registry/hierarchical-module-registry';
import { Button, IconButton } from '@/shared/components/Button';

interface CompanyDetailData {
  company: {
    id: string;
    name: string;
    legal_name?: string | null;
    tenant_code?: string | null;
    slug: string;
    status: CompanyStatus;
    plan: CompanyPlan;
    is_active: number;
    primary_contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    notes?: string | null;
    trial_ends_at: string | null;
    subscription_starts_at: string | null;
    subscription_ends_at: string | null;
    max_users: number;
    max_warehouses: number;
    created_at: string;
    updated_at: string;
    erpUrl?: string;
  };
  modules: {
    id: string;
    name: string;
    description: string;
    version: string;
    is_enabled: boolean;
  }[];
  hierarchicalModules?: {
    id: string;
    label: string;
    description: string;
    icon: string;
    is_enabled: boolean;
    enabledCount: number;
    totalChildren: number;
    children: {
      id: string;
      key: string;
      label: string;
      description: string;
      routes: string[];
      is_enabled: boolean;
    }[];
  }[];
  users: {
    id: string;
    username: string;
    full_name: string;
    email?: string;
    phone?: string;
    role: string;
    is_active: number;
    created_at: string;
  }[];
}

type TabType = 'overview' | 'users' | 'modules' | 'license' | 'branding' | 'security' | 'activity';

function getModuleIcon(iconName: string) {
  switch (iconName) {
    case 'ShoppingCart':
      return <ShoppingCart className="w-4 h-4 text-indigo-400" />;
    case 'ShoppingBag':
      return <Package className="w-4 h-4 text-emerald-400" />;
    case 'Boxes':
      return <Package className="w-4 h-4 text-amber-400" />;
    case 'BookOpen':
      return <FileText className="w-4 h-4 text-sky-400" />;
    case 'CreditCard':
      return <CreditCard className="w-4 h-4 text-purple-400" />;
    case 'BarChart3':
      return <BarChart3 className="w-4 h-4 text-rose-400" />;
    case 'Users':
      return <Users className="w-4 h-4 text-cyan-400" />;
    case 'Settings':
      return <SettingsIcon className="w-4 h-4 text-slate-400" />;
    default:
      return <Layers className="w-4 h-4 text-indigo-400" />;
  }
}

export function CompanyDetailClient({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [data, setData] = useState<CompanyDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states: Overview & Master
  const [companyForm, setCompanyForm] = useState({
    name: '',
    legalName: '',
    tenantCode: '',
    primaryContactName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'Pakistan',
    notes: '',
    status: 'ACTIVE' as CompanyStatus,
    plan: 'COMMERCIAL' as CompanyPlan,
    trialEndsAt: '',
    subscriptionStartsAt: '',
    subscriptionEndsAt: '',
    maxUsers: 5,
    maxWarehouses: 1,
  });

  // Modules & Submodules State
  const [modulesState, setModulesState] = useState<{ [moduleId: string]: boolean }>({});
  const [submodulesState, setSubmodulesState] = useState<{ [submoduleId: string]: boolean }>({});
  const [expandedModules, setExpandedModules] = useState<{ [moduleId: string]: boolean }>({});
  const [moduleSearch, setModuleSearch] = useState('');
  const [presetModal, setPresetModal] = useState<{ open: boolean; plan: CompanyPlan | null }>({
    open: false,
    plan: null,
  });

  // Tenant Branding State
  const [brandingState, setBrandingState] = useState<BrandingConfig>(DEFAULT_SALEFLOW_BRANDING);
  const [isBrandingLoading, setIsBrandingLoading] = useState(false);

  // Tenant Activity State
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);

  // Add User Modal State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'SALESMAN',
  });

  // Reset Password Modal State
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');

  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        headers: { 'Accept': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      let resData: any = null;
      if (contentType.includes('application/json')) {
        resData = await res.json().catch(() => null);
      }
      if (res.ok && resData?.success && resData.data) {
        const d: CompanyDetailData = resData.data;
        setData(d);
        setCompanyForm({
          name: d.company.name || '',
          legalName: d.company.legal_name || '',
          tenantCode: d.company.tenant_code || '',
          primaryContactName: d.company.primary_contact_name || '',
          email: d.company.email || '',
          phone: d.company.phone || '',
          address: d.company.address || '',
          city: d.company.city || '',
          country: d.company.country || 'Pakistan',
          notes: d.company.notes || '',
          status: d.company.status || 'ACTIVE',
          plan: d.company.plan || 'COMMERCIAL',
          trialEndsAt: d.company.trial_ends_at ? d.company.trial_ends_at.slice(0, 10) : '',
          subscriptionStartsAt: d.company.subscription_starts_at ? d.company.subscription_starts_at.slice(0, 10) : '',
          subscriptionEndsAt: d.company.subscription_ends_at ? d.company.subscription_ends_at.slice(0, 10) : '',
          maxUsers: d.company.max_users || 5,
          maxWarehouses: d.company.max_warehouses || 1,
        });

        const modMap: { [k: string]: boolean } = {};
        const subMap: { [k: string]: boolean } = {};
        const expMap: { [k: string]: boolean } = {};

        if (Array.isArray(d.hierarchicalModules) && d.hierarchicalModules.length > 0) {
          for (const hm of d.hierarchicalModules) {
            modMap[hm.id] = hm.is_enabled;
            expMap[hm.id] = true; // default expanded
            for (const c of hm.children) {
              subMap[c.id] = c.is_enabled;
            }
          }
        } else {
          // Fallback mapping from HIERARCHICAL_MODULES
          for (const hm of HIERARCHICAL_MODULES) {
            const isParentOn = d.modules.some((m) => m.id === hm.id && m.is_enabled);
            modMap[hm.id] = isParentOn;
            expMap[hm.id] = true;
            for (const c of hm.children) {
              subMap[c.id] = isParentOn;
            }
          }
        }

        setModulesState(modMap);
        setSubmodulesState(subMap);
        setExpandedModules(expMap);
      } else {
        const errorText = resData?.error || `HTTP ${res.status} loading company details`;
        console.error('Failed to load company details:', errorText);
      }
    } catch (err) {
      console.error('Failed to load company details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBranding = async () => {
    setIsBrandingLoading(true);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}/branding`, {
        headers: { 'Accept': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      let json: any = null;
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
      }
      if (res.ok && json?.success && json.data) {
        setBrandingState(json.data);
      }
    } catch (err) {
      console.error('Failed to load branding:', err);
    } finally {
      setIsBrandingLoading(false);
    }
  };

  const fetchActivity = async () => {
    setIsActivityLoading(true);
    try {
      const res = await fetch(`/api/superadmin/audit?tenantId=${companyId}&limit=50`, {
        headers: { 'Accept': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      let json: any = null;
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
      }
      if (res.ok && json?.success && json.data) {
        setActivityLogs(json.data);
      }
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setIsActivityLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [companyId]);

  useEffect(() => {
    if (activeTab === 'branding') fetchBranding();
    if (activeTab === 'activity') fetchActivity();
  }, [activeTab]);

  // Save Master Overview / License
  const handleSaveCompany = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(companyForm),
      });
      const contentType = res.headers.get('content-type') || '';
      let resData: any = null;
      if (contentType.includes('application/json')) {
        resData = await res.json().catch(() => null);
      }
      if (res.ok && resData?.success) {
        setStatusMessage({ type: 'success', text: 'Company profile and licensing saved successfully' });
        fetchDetails();
      } else {
        throw new Error(resData?.error || `Failed to update company (${res.status})`);
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setIsSaving(false);
    }
  };

  // Save Modules & Submodules
  const handleSaveModules = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const modulesPayload = Object.entries(modulesState).map(([moduleId, isEnabled]) => ({
        moduleId,
        isEnabled,
      }));

      const submodulesPayload = Object.entries(submodulesState).map(([id, isEnabled]) => ({
        id,
        isEnabled,
      }));

      const res = await fetch(`/api/superadmin/companies/${companyId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ modules: modulesPayload, submodules: submodulesPayload }),
      });
      const contentType = res.headers.get('content-type') || '';
      let resData: any = null;
      if (contentType.includes('application/json')) {
        resData = await res.json().catch(() => null);
      }
      if (res.ok && resData?.success) {
        setStatusMessage({ type: 'success', text: 'Module and sub-module access saved successfully' });
        if (Array.isArray(resData.hierarchicalModules) && resData.hierarchicalModules.length > 0) {
          const modMap: { [k: string]: boolean } = {};
          const subMap: { [k: string]: boolean } = {};
          for (const hm of resData.hierarchicalModules) {
            modMap[hm.id] = hm.is_enabled;
            for (const c of hm.children) {
              subMap[c.id] = c.is_enabled;
            }
          }
          setModulesState(modMap);
          setSubmodulesState(subMap);
        } else {
          fetchDetails();
        }
      } else {
        throw new Error(resData?.error || `Failed to update modules (${res.status})`);
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  };

  // Preset Confirmation Modal Handlers
  const handleOpenPresetModal = (plan: CompanyPlan) => {
    setPresetModal({ open: true, plan });
  };

  const handleConfirmPreset = () => {
    if (!presetModal.plan) return;
    const plan = presetModal.plan;
    const config = PLAN_CONFIGS[plan];
    if (config) {
      const nextModules: { [k: string]: boolean } = {};
      const nextSubmodules: { [k: string]: boolean } = {};
      const enabledModulesSet = new Set(config.modules);
      const enabledSubmodulesSet = new Set(config.submodules || []);

      HIERARCHICAL_MODULES.forEach((hm) => {
        const isModuleOn = enabledModulesSet.has(hm.id);
        nextModules[hm.id] = isModuleOn;
        hm.children.forEach((c) => {
          nextSubmodules[c.id] = isModuleOn && enabledSubmodulesSet.has(c.id);
        });
      });

      setModulesState(nextModules);
      setSubmodulesState(nextSubmodules);
      setCompanyForm((prev) => ({
        ...prev,
        plan,
        maxUsers: config.maxUsers,
        maxWarehouses: config.maxWarehouses,
      }));
      setStatusMessage({
        type: 'success',
        text: `Preset applied for ${plan}. Click "Save Modules" above to persist changes.`,
      });
    }
    setPresetModal({ open: false, plan: null });
  };

  const handleExpandAll = () => {
    const next: { [k: string]: boolean } = {};
    HIERARCHICAL_MODULES.forEach((m) => {
      next[m.id] = true;
    });
    setExpandedModules(next);
  };

  const handleCollapseAll = () => {
    const next: { [k: string]: boolean } = {};
    HIERARCHICAL_MODULES.forEach((m) => {
      next[m.id] = false;
    });
    setExpandedModules(next);
  };

  const toggleExpand = (moduleId: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const handleToggleMainModule = (moduleId: string) => {
    const isCurrentlyOn = modulesState[moduleId] ?? false;
    const nextVal = !isCurrentlyOn;
    setModulesState((prev) => ({ ...prev, [moduleId]: nextVal }));
    if (nextVal) {
      setExpandedModules((prev) => ({ ...prev, [moduleId]: true }));
    }
  };

  const handleToggleSubmodule = (submoduleId: string) => {
    setSubmodulesState((prev) => ({
      ...prev,
      [submoduleId]: !prev[submoduleId],
    }));
  };

  // Save Branding Override
  const handleSaveBranding = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}/branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingState),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Tenant branding override saved' });
        setBrandingState(json.data);
      } else {
        throw new Error(json.error || 'Failed to save branding');
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save branding' });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset Branding Override
  const handleResetBranding = async () => {
    if (!confirm('Reset this company\'s theme to the platform global default?')) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}/branding`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Branding reset to system default' });
        setBrandingState(json.data);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to reset branding' });
    } finally {
      setIsSaving(false);
    }
  };

  // Add Tenant User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.username.trim() || !newUserForm.password) return;

    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm),
      });
      const resData = await res.json();
      if (resData.success) {
        setIsAddUserOpen(false);
        setNewUserForm({ username: '', password: '', fullName: '', email: '', phone: '', role: 'SALESMAN' });
        fetchDetails();
      } else {
        alert(resData.error || 'Failed to create user');
      }
    } catch {
      alert('Network error while adding user');
    }
  };

  // Reset User Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUserId || !resetPwdValue || resetPwdValue.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}/reset-admin-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetPwdUserId, newPassword: resetPwdValue }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Password reset successfully!');
        setResetPwdUserId(null);
        setResetPwdValue('');
      } else {
        alert(json.error || 'Failed to reset password');
      }
    } catch {
      alert('Failed to reset password');
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-sm text-[var(--text-muted,#8b949e)] font-medium">
          Loading company details...
        </span>
      </div>
    );
  }

  const { company, modules, users } = data;

  return (
    <div className="space-y-6 select-none">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconButton
            variant="outline"
            size="md"
            href="/superadmin/companies"
            title="Back to Companies"
            aria-label="Back to Companies"
            icon={<ArrowLeft className="w-4 h-4" />}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
                {company.name}
              </h2>
              <span className="badge badge-info font-mono">
                {company.slug}.salesflow.space
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Tenant Code: <span className="font-mono text-[var(--color-text)] font-semibold">{company.tenant_code || 'SF-TENANT'}</span> • Created {company.created_at?.split('T')[0]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {company.erpUrl && (
            <Button
              variant="outline"
              size="sm"
              href={company.erpUrl}
              external
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open Customer ERP
            </Button>
          )}

          {(activeTab === 'overview' || activeTab === 'license') && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveCompany}
              disabled={isSaving}
              loading={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          )}

          {activeTab === 'modules' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveModules}
              disabled={isSaving}
              loading={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Modules
            </Button>
          )}

          {activeTab === 'branding' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveBranding}
              disabled={isSaving}
              loading={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Branding
            </Button>
          )}
        </div>
      </div>

      {/* Status Feedback Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'alert-success'
              : 'alert-danger'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 7 NAVIGATION TABS */}
      <div className="border-b border-[var(--color-border)] flex items-center gap-2 overflow-x-auto tab-group">
        {[
          { id: 'overview', label: 'Overview', icon: Building2 },
          { id: 'users', label: `Users (${users.length})`, icon: Users },
          { id: 'modules', label: 'Modules', icon: Layers },
          { id: 'license', label: 'Licensing & Plan', icon: KeyRound },
          { id: 'branding', label: 'Branding Override', icon: Palette },
          { id: 'security', label: 'Security & 2FA', icon: ShieldCheck },
          { id: 'activity', label: 'Audit Trail', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setStatusMessage(null);
              }}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: OVERVIEW */}
      {/* ============================================================== */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Master Company Details
            </h3>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Display Company Name
              </label>
              <input
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Legal Registered Name
              </label>
              <input
                type="text"
                value={companyForm.legalName}
                onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Tenant Code
                </label>
                <input
                  type="text"
                  value={companyForm.tenantCode}
                  onChange={(e) => setCompanyForm({ ...companyForm, tenantCode: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Tenant Subdomain
                </label>
                <input
                  type="text"
                  disabled
                  value={`${company.slug}.salesflow.space`}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)]/50 border border-[var(--border-default,#30363d)] text-xs text-indigo-400 font-mono opacity-80 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Internal Operational Notes
              </label>
              <textarea
                rows={3}
                value={companyForm.notes}
                onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                placeholder="Account manager notes, contract references..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Primary Contact & Location
            </h3>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Primary Contact Person
              </label>
              <input
                type="text"
                value={companyForm.primaryContactName}
                onChange={(e) => setCompanyForm({ ...companyForm, primaryContactName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] numeric-text focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Physical Business Address
              </label>
              <input
                type="text"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={companyForm.country}
                  onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: USERS */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-heading,#f0f6fc)]">
                Tenant User Accounts
              </h3>
              <p className="text-xs text-[var(--text-muted,#8b949e)]">
                Users registered exclusively to {company.name} ({users.length} / {company.max_users} max allowed)
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddUserOpen(true)}
              icon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Add Tenant User
            </Button>
          </div>

          <div className="rounded-2xl surface-card overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-3">Username</th>
                  <th className="py-3 px-3">Email / Phone</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--color-surface-muted)]/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-[var(--color-text)]">
                      {u.full_name}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--color-primary)]">
                      @{u.username}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[var(--color-text-muted)]">
                      {u.email || u.phone || '—'}
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
                    <td className="py-3 px-3 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                      {u.created_at ? u.created_at.split('T')[0] : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setResetPwdUserId(u.id);
                          setResetPwdValue('');
                        }}
                      >
                        Reset Password
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: MODULES */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* TAB 3: HIERARCHICAL MODULES & SUB-MODULES */}
      {/* ============================================================== */}
      {activeTab === 'modules' && (() => {
        // Compute active metrics
        const activeMainCount = HIERARCHICAL_MODULES.filter((hm) => modulesState[hm.id] ?? false).length;
        let activeSubCount = 0;
        let totalSubCount = 0;
        HIERARCHICAL_MODULES.forEach((hm) => {
          totalSubCount += hm.children.length;
          const isMainOn = modulesState[hm.id] ?? false;
          hm.children.forEach((c) => {
            if (isMainOn && (submodulesState[c.id] ?? false)) {
              activeSubCount += 1;
            }
          });
        });

        // Filter modules & submodules by search query
        const q = moduleSearch.trim().toLowerCase();
        const filteredModules = HIERARCHICAL_MODULES.filter((hm) => {
          if (!q) return true;
          const mainMatch =
            hm.label.toLowerCase().includes(q) ||
            hm.id.toLowerCase().includes(q) ||
            hm.description.toLowerCase().includes(q);
          const childMatch = hm.children.some(
            (c) =>
              c.label.toLowerCase().includes(q) ||
              c.id.toLowerCase().includes(q) ||
              c.key.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q) ||
              c.routes.some((r) => r.toLowerCase().includes(q))
          );
          return mainMatch || childMatch;
        });

        return (
          <div className="space-y-6">
            {/* Plan Presets Selector */}
            <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-heading,#f0f6fc)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Apply Plan Preset</span>
                </h4>
                <p className="text-[11px] text-[var(--text-muted,#8b949e)] mt-0.5">
                  Select a subscription tier preset or configure custom granular module &amp; sub-module access below
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['STARTER', 'STANDARD', 'COMMERCIAL', 'PROFESSIONAL', 'ENTERPRISE'] as CompanyPlan[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleOpenPresetModal(p)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      companyForm.plan === p
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'border-[var(--border-default,#30363d)] bg-[var(--bg-app,#0d1117)] text-[var(--text-muted,#8b949e)] hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter, Search & Bulk Controls Toolbar */}
            <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted,#8b949e)]" />
                <input
                  type="text"
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder="Search modules, submodules, or routes..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
                {moduleSearch && (
                  <button
                    type="button"
                    onClick={() => setModuleSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 text-[11px] text-[var(--text-muted,#8b949e)] border-r border-[var(--border-default,#30363d)] pr-4">
                  <span>
                    <strong className="text-[var(--text-heading,#f0f6fc)] font-semibold">{activeMainCount}</strong> / {HIERARCHICAL_MODULES.length} Main Active
                  </span>
                  <span>•</span>
                  <span>
                    <strong className="text-emerald-400 font-semibold">{activeSubCount}</strong> / {totalSubCount} Sub-Modules Active
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleExpandAll}
                  >
                    Expand All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleCollapseAll}
                  >
                    Collapse All
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    onClick={handleSaveModules}
                    isLoading={isSaving}
                    leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="ml-2"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Hierarchical Accordion Module Cards */}
            <div className="space-y-4">
              {filteredModules.map((hm) => {
                const isParentEnabled = modulesState[hm.id] ?? false;
                const isExpanded = moduleSearch ? true : (expandedModules[hm.id] ?? true);
                const enabledChildrenCount = hm.children.filter((c) => submodulesState[c.id] ?? false).length;

                return (
                  <div
                    key={hm.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isParentEnabled
                        ? 'bg-[var(--bg-surface,#161b22)] border-indigo-500/30 shadow-sm'
                        : 'bg-[var(--bg-surface,#161b22)]/50 border-[var(--border-default,#30363d)]'
                    }`}
                  >
                    {/* Main Module Card Header */}
                    <div
                      onClick={() => toggleExpand(hm.id)}
                      className={`p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                        isParentEnabled ? 'hover:bg-indigo-500/5' : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-[240px]">
                        <button
                          type="button"
                          className="p-1 rounded text-[var(--text-muted,#8b949e)] hover:text-white"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-400 transition-transform" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[var(--text-muted,#8b949e)]" />
                          )}
                        </button>

                        <div className="p-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] shrink-0">
                          {getModuleIcon(hm.icon)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[var(--text-heading,#f0f6fc)]">
                              {hm.label}
                            </span>
                            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-[var(--text-muted,#8b949e)]">
                              {hm.id}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted,#8b949e)] mt-0.5">
                            {hm.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Enabled Child Counter Badge */}
                        <div
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                            isParentEnabled
                              ? enabledChildrenCount === hm.children.length
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : enabledChildrenCount > 0
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                              : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-500'
                          }`}
                        >
                          {isParentEnabled
                            ? `${enabledChildrenCount} of ${hm.children.length} enabled`
                            : 'Parent Disabled'}
                        </div>

                        {/* Parent Toggle */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMainModule(hm.id);
                          }}
                          className="flex items-center gap-2 pl-2 border-l border-[var(--border-default,#30363d)]"
                        >
                          <button
                            type="button"
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isParentEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isParentEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Submodules Accordion Section */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border-default,#30363d)] bg-[var(--bg-app,#0d1117)]/70 p-4 space-y-3">
                        {!isParentEnabled && (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              Parent module is <strong>OFF</strong>. All sub-modules below are currently disabled for this tenant regardless of individual switches. Turn on parent to activate.
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {hm.children.map((c) => {
                            const isChildEnabled = submodulesState[c.id] ?? false;
                            const isEffectivelyActive = isParentEnabled && isChildEnabled;

                            return (
                              <div
                                key={c.id}
                                className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                  isEffectivelyActive
                                    ? 'bg-[var(--bg-surface,#161b22)] border-indigo-500/30 shadow-xs'
                                    : isParentEnabled
                                    ? 'bg-[var(--bg-surface,#161b22)]/50 border-[var(--border-default,#30363d)] opacity-70'
                                    : 'bg-[var(--bg-surface,#161b22)]/30 border-[var(--border-default,#30363d)] opacity-40'
                                }`}
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`text-xs font-semibold ${
                                        isEffectivelyActive
                                          ? 'text-[var(--text-heading,#f0f6fc)]'
                                          : 'text-[var(--text-muted,#8b949e)]'
                                      }`}
                                    >
                                      {c.label}
                                    </span>
                                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-[var(--bg-app,#0d1117)] text-[var(--text-muted,#8b949e)]">
                                      {c.key}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-muted,#8b949e)] line-clamp-2">
                                    {c.description}
                                  </p>
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {c.routes.map((r) => (
                                      <span
                                        key={r}
                                        className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                                      >
                                        {r}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleToggleSubmodule(c.id)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-0.5 ${
                                    isChildEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      isChildEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* TAB 4: LICENSING & PLAN */}
      {/* ============================================================== */}
      {activeTab === 'license' && (
        <div className="max-w-2xl p-6 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            <span>Licensing Lifecycle & Entitlements</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Account Status
              </label>
              <select
                value={companyForm.status}
                onChange={(e) => setCompanyForm({ ...companyForm, status: e.target.value as CompanyStatus })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              >
                <option value="ACTIVE">ACTIVE (Full access)</option>
                <option value="TRIAL">TRIAL (Evaluation period)</option>
                <option value="SUSPENDED">SUSPENDED (Temporarily locked)</option>
                <option value="EXPIRED">EXPIRED (License term ended)</option>
                <option value="INACTIVE">INACTIVE (Dormant)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Subscription Plan Tier
              </label>
              <select
                value={companyForm.plan}
                onChange={(e) => setCompanyForm({ ...companyForm, plan: e.target.value as CompanyPlan })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              >
                <option value="STARTER">Starter</option>
                <option value="STANDARD">Standard</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Subscription Start Date
              </label>
              <input
                type="date"
                value={companyForm.subscriptionStartsAt}
                onChange={(e) => setCompanyForm({ ...companyForm, subscriptionStartsAt: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Subscription Expiry Date
              </label>
              <input
                type="date"
                value={companyForm.subscriptionEndsAt}
                onChange={(e) => setCompanyForm({ ...companyForm, subscriptionEndsAt: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Maximum Allowed Users
              </label>
              <input
                type="number"
                min={1}
                value={companyForm.maxUsers}
                onChange={(e) => setCompanyForm({ ...companyForm, maxUsers: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] tabular-nums focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                Maximum Allowed Warehouses
              </label>
              <input
                type="number"
                min={1}
                value={companyForm.maxWarehouses}
                onChange={(e) => setCompanyForm({ ...companyForm, maxWarehouses: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] tabular-nums focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: BRANDING OVERRIDE */}
      {/* ============================================================== */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-heading,#f0f6fc)]">
                Tenant Appearance Override
              </h4>
              <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
                {brandingState.isCustomOverride
                  ? 'Custom appearance active for this organization'
                  : 'Currently inheriting global SaleFlow platform theme'}
              </p>
            </div>
            {brandingState.isCustomOverride && (
              <Button
                variant="danger-outline"
                size="xs"
                type="button"
                onClick={handleResetBranding}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Reset to Global Theme
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Colors & Styling
              </h4>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  ERP Display Name
                </label>
                <input
                  type="text"
                  value={brandingState.displayName}
                  onChange={(e) => setBrandingState({ ...brandingState, displayName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--text-muted,#8b949e)] mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingState.primaryColor}
                      onChange={(e) => setBrandingState({ ...brandingState, primaryColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[var(--border-default,#30363d)] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingState.primaryColor}
                      onChange={(e) => setBrandingState({ ...brandingState, primaryColor: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] font-mono text-[10px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-[var(--text-muted,#8b949e)] mb-1">
                    Sidebar Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingState.sidebarColor}
                      onChange={(e) => setBrandingState({ ...brandingState, sidebarColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[var(--border-default,#30363d)] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingState.sidebarColor}
                      onChange={(e) => setBrandingState({ ...brandingState, sidebarColor: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] font-mono text-[10px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-[var(--text-muted,#8b949e)] mb-1">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingState.accentColor}
                      onChange={(e) => setBrandingState({ ...brandingState, accentColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[var(--border-default,#30363d)] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingState.accentColor}
                      onChange={(e) => setBrandingState({ ...brandingState, accentColor: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] font-mono text-[10px]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                    Text Font Family
                  </label>
                  <select
                    value={brandingState.textFontFamily || brandingState.fontFamily || 'Inter'}
                    onChange={(e) => {
                      const val = e.target.value as ApprovedFont;
                      setBrandingState({ ...brandingState, fontFamily: val, textFontFamily: val });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
                  >
                    {APPROVED_TEXT_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                    Numeric Font Family
                  </label>
                  <select
                    value={brandingState.numericFontFamily || 'Same as Text Font'}
                    onChange={(e) => {
                      const val = e.target.value as ApprovedNumericFont;
                      setBrandingState({ ...brandingState, numericFontFamily: val });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
                  >
                    {APPROVED_NUMERIC_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                    Size Scale
                  </label>
                  <select
                    value={brandingState.sizeScale || brandingState.fontSizeScale || 'md'}
                    onChange={(e) => {
                      const val = e.target.value as FontSizeScale;
                      setBrandingState({ ...brandingState, fontSizeScale: val, sizeScale: val });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
                  >
                    <option value="sm">Compact (sm)</option>
                    <option value="md">Standard (md)</option>
                    <option value="lg">Expanded (lg)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                    Digit Style
                  </label>
                  <select
                    value={brandingState.numericStyle || 'tabular'}
                    onChange={(e) => {
                      const val = e.target.value as NumericDigitStyle;
                      setBrandingState({ ...brandingState, numericStyle: val });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)]"
                  >
                    <option value="tabular">Tabular / Accounting (Equal-width digits)</option>
                    <option value="proportional">Proportional (Natural digit width)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Live Preview Card */}
            {(() => {
              const previewTextFont = brandingState.textFontFamily || brandingState.fontFamily || 'Inter';
              const previewNumFont = brandingState.numericFontFamily || 'Same as Text Font';
              const previewTextFontCss = getFontFamilyCss(previewTextFont);
              const previewNumFontCss = previewNumFont === 'Same as Text Font'
                ? previewTextFontCss
                : getFontFamilyCss(previewNumFont, previewTextFont);
              const isProp = brandingState.numericStyle === 'proportional';
              const previewNumVariant = isProp ? 'proportional-nums lining-nums' : 'tabular-nums lining-nums';
              const previewNumFeatures = isProp ? "'pnum' 1, 'lnum' 1" : "'tnum' 1, 'lnum' 1";

              return (
                <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Live Preview
                  </h4>
                  <div
                    className="p-5 rounded-2xl border flex flex-col justify-between min-h-[260px]"
                    style={{
                      backgroundColor: brandingState.backgroundColor,
                      borderColor: brandingState.sidebarColor,
                      fontFamily: previewTextFontCss,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm" style={{ color: brandingState.primaryColor }}>
                        {brandingState.displayName || 'SaleFlow'}
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: `${brandingState.accentColor}20`, color: brandingState.accentColor }}
                      >
                        Tenant ERP Preview
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-2">
                      <div
                        className="p-2.5 rounded-xl border text-left"
                        style={{ backgroundColor: brandingState.sidebarColor, borderColor: `${brandingState.primaryColor}20` }}
                      >
                        <div className="text-[9px] uppercase font-bold text-zinc-400">Total Sales</div>
                        <div
                          className="text-sm font-bold text-white mt-0.5"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          1,450,200.00
                        </div>
                      </div>

                      <div
                        className="p-2.5 rounded-xl border text-left"
                        style={{ backgroundColor: brandingState.sidebarColor, borderColor: `${brandingState.accentColor}20` }}
                      >
                        <div className="text-[9px] uppercase font-bold text-zinc-400">Recovery Rate</div>
                        <div
                          className="text-sm font-bold text-emerald-400 mt-0.5"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          94.8%
                        </div>
                      </div>
                    </div>

                    {/* Sample Document / Commercial Invoice & Contact Preview */}
                    <div
                      className="p-2.5 rounded-xl border my-2 text-left space-y-1.5"
                      style={{ backgroundColor: brandingState.sidebarColor, borderColor: `${brandingState.primaryColor}15` }}
                    >
                      <div className="flex items-center justify-between text-[11px] text-white">
                        <span className="font-semibold text-zinc-300">
                          Invoice #
                          <span
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            10254
                          </span>
                        </span>
                        <span className="text-zinc-300">
                          Qty{' '}
                          <span
                            className="font-semibold"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            125
                          </span>
                        </span>
                        <span
                          className="font-bold text-emerald-300"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          PKR 48,750.00
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] pt-1.5 border-t border-white/5">
                        <div>
                          <span className="text-zinc-400">Phone: </span>
                          <span
                            className="font-medium text-white"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            03001234567
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">CNIC: </span>
                          <span
                            className="font-medium text-white"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            35202-1234567-1
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Date: </span>
                          <span
                            className="font-medium text-white"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            17/10/2026
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
                      <div className="flex flex-col text-[10px] text-zinc-400 font-mono">
                        <span>Text: {previewTextFont}</span>
                        <span>Num: {previewNumFont} ({isProp ? 'Prop' : 'Tab'})</span>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow"
                        style={{ backgroundColor: brandingState.primaryColor }}
                      >
                        Action Button
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 6: SECURITY */}
      {/* ============================================================== */}
      {activeTab === 'security' && (
        <div className="max-w-2xl p-6 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Tenant Workspace Security Isolation</span>
          </h3>

          <div className="space-y-3 text-xs text-[var(--text-primary,#c9d1d9)]">
            <div className="p-3.5 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Subdomain Multi-Tenant Isolation</div>
                <div className="text-[11px] text-[var(--text-muted,#8b949e)]">
                  Bound strictly to host: <span className="font-mono text-indigo-400">{company.slug}.salesflow.space</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ENFORCED
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Super Admin Access Guard</div>
                <div className="text-[11px] text-[var(--text-muted,#8b949e)]">
                  Tenant admin/staff cookies are permanently blocked from /superadmin routes.
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                BLOCKED
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Suspension & Expiry Interceptor</div>
                <div className="text-[11px] text-[var(--text-muted,#8b949e)]">
                  Status changes take immediate effect on edge requests without data loss.
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 7: ACTIVITY AUDIT */}
      {/* ============================================================== */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-heading,#f0f6fc)]">
              Tenant Operational Audit History
            </h3>
            <button
              onClick={fetchActivity}
              className="p-1.5 rounded-lg border border-[var(--border-default,#30363d)] text-[var(--text-muted,#8b949e)] hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isActivityLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default,#30363d)] bg-[var(--bg-app,#0d1117)]/50 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#8b949e)]">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Details / Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default,#30363d)]/60">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[var(--text-muted,#8b949e)]">
                      No audit events recorded for this organization yet.
                    </td>
                  </tr>
                ) : (
                  activityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--bg-app,#0d1117)]/40 transition-colors">
                      <td className="py-2.5 px-4 text-[11px] tabular-nums text-[var(--text-muted,#8b949e)]">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">
                        @{log.actor}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--text-heading,#f0f6fc)]">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--text-primary,#c9d1d9)]">
                        {log.reason || log.target || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD USER */}
      {/* ============================================================== */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)] mb-3">
              Add Tenant User: {company.name}
            </h3>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newUserForm.fullName}
                  onChange={(e) => setNewUserForm({ ...newUserForm, fullName: e.target.value })}
                  placeholder="Ali Hassan"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  placeholder="alihassan"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  ERP Role
                </label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="SALESMAN">SALESMAN</option>
                  <option value="ACCOUNTANT">ACCOUNTANT</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[var(--border-default,#30363d)] flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddUserOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                >
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: RESET PASSWORD */}
      {/* ============================================================== */}
      {resetPwdUserId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)] mb-3">
              Reset Tenant User Password
            </h3>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                  New Password (min 6 chars)
                </label>
                <input
                  type="password"
                  required
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  placeholder="••••••••••••"
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-[var(--text-heading,#f0f6fc)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-[var(--border-default,#30363d)] flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setResetPwdUserId(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                >
                  Set Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: PLAN PRESET CONFIRMATION */}
      {/* ============================================================== */}
      {presetModal.open && presetModal.plan && (() => {
        const p = presetModal.plan;
        const config = PLAN_CONFIGS[p];
        const enabledModules = config?.modules || [];
        const enabledSubmodules = config?.submodules || [];
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-[var(--border-default,#30363d)] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-[var(--text-heading,#f0f6fc)]">
                      Apply Preset: {p} Plan
                    </h3>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted,#8b949e)] mt-0.5">
                    Review which main modules and sub-modules will be enabled for this tenant
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPresetModal({ open: false, plan: null })}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-[var(--text-muted,#8b949e)] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted,#8b949e)]">Main Modules</span>
                    <p className="text-sm font-bold text-indigo-400">{enabledModules.length} of 8 Enabled</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted,#8b949e)]">Sub-Modules</span>
                    <p className="text-sm font-bold text-emerald-400">{enabledSubmodules.length} of 36 Enabled</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted,#8b949e)]">
                    Entitlement Breakdown by Module
                  </h4>
                  {HIERARCHICAL_MODULES.map((hm) => {
                    const isMainOn = enabledModules.includes(hm.id);
                    const childOnCount = hm.children.filter((c) => isMainOn && enabledSubmodules.includes(c.id)).length;
                    return (
                      <div
                        key={hm.id}
                        className={`p-3 rounded-xl border ${
                          isMainOn
                            ? 'bg-indigo-500/5 border-indigo-500/20'
                            : 'bg-zinc-900/40 border-[var(--border-default,#30363d)] opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-heading,#f0f6fc)]">{hm.label}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              {hm.id}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              isMainOn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {isMainOn ? `${childOnCount} / ${hm.children.length} submodules` : 'Disabled'}
                          </span>
                        </div>
                        {isMainOn && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {hm.children.map((c) => {
                              const isChildOn = enabledSubmodules.includes(c.id);
                              return (
                                <span
                                  key={c.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                                    isChildOn
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-zinc-800/80 text-zinc-500 border border-zinc-700/50 line-through'
                                  }`}
                                >
                                  {isChildOn ? <Check className="w-2.5 h-2.5" /> : null}
                                  {c.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border-default,#30363d)] flex items-center justify-between gap-3 bg-[var(--bg-app,#0d1117)]">
                <span className="text-[11px] text-[var(--text-muted,#8b949e)]">
                  Clicking apply will stage these settings. You still need to click &quot;Save Modules&quot;.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setPresetModal({ open: false, plan: null })}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    type="button"
                    onClick={handleConfirmPreset}
                  >
                    Apply {p} Preset
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
