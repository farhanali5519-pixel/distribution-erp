'use client';

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Database, 
  ShieldCheck, 
  Key, 
  Copy, 
  Check, 
  HardDrive, 
  Layers, 
  RefreshCw, 
  AlertCircle,
  Clock,
  CheckCircle2,
  Building,
  Info
} from 'lucide-react';

interface SystemInfoData {
  application: {
    name: string;
    version: string;
    deploymentMode: string;
    databaseType: string;
    schemaVersion: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
  };
  database: {
    health: string;
    integrity: string;
    sizeFormatted: string;
    tableCount: number;
    totalRecords: number;
  };
  license: {
    status: string;
    isValid: boolean;
    type: string;
    licenseId: string;
    expiresAt: string | null;
    maxUsers: number;
    daysRemaining: number | null;
    isGracePeriod: boolean;
    graceDaysRemaining: number;
    issuer: string;
    machineFingerprint: string;
    message: string;
  };
  modules: {
    total: number;
    enabledCount: number;
    enabled: Array<{ id: string; name: string }>;
  };
  backups: {
    totalBackupsCount: number;
    lastBackupTimestamp: string | null;
    totalStorageFormatted: string;
  };
}

export default function SystemInfoPage() {
  const [data, setData] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // License install form state
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchSystemInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/info');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load system information');
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
  }, []);

  const handleCopyFingerprint = () => {
    if (!data?.license?.machineFingerprint) return;
    navigator.clipboard.writeText(data.license.machineFingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  const handleInstallLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;

    setInstalling(true);
    setInstallMessage(null);
    try {
      const res = await fetch('/api/system/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKeyInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to install license');
      }
      setInstallMessage({ text: json.message, isError: false });
      setLicenseKeyInput('');
      fetchSystemInfo();
    } catch (err: any) {
      setInstallMessage({ text: err.message, isError: true });
    } finally {
      setInstalling(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="animate-spin text-blue-600" size={24} />
          <span className="font-medium text-sm">Loading System Diagnostics...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-xl flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-sm">System Diagnostics Error</h3>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={fetchSystemInfo}
              className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lic = data?.license;
  const app = data?.application;
  const db = data?.database;
  const backups = data?.backups;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Server className="text-blue-600" size={24} />
            System & Commercial Licensing
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Commercial deployment health, database diagnostic status, and cryptographic license verification.
          </p>
        </div>
        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} />
          Refresh Diagnostics
        </button>
      </div>

      {/* Top Level KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Application Version */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ERP Version</p>
            <p className="text-xl font-bold tracking-tight tabular-nums text-slate-900 mt-1.5">v{app?.version}</p>
            <p className="text-xs text-slate-500 mt-1 capitalize font-medium">{app?.deploymentMode} Mode</p>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <Server size={20} />
          </div>
        </div>

        {/* Database Health */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Database Engine</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xl font-bold tracking-tight text-slate-900 capitalize">{app?.databaseType}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} /> {db?.integrity === 'ok' ? 'Optimal' : db?.health}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">{db?.sizeFormatted} ({db?.tableCount} tables)</p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <Database size={20} />
          </div>
        </div>

        {/* License Status */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">License Status</p>
            <div className="mt-1.5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                lic?.status === 'VALID' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : lic?.status === 'GRACE_PERIOD'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-purple-50 text-purple-700 border border-purple-200'
              }`}>
                <ShieldCheck size={13} /> {lic?.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 capitalize font-medium">{lic?.type} Tier</p>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
            <Key size={20} />
          </div>
        </div>

        {/* Backup Status */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Backups</p>
            <p className="text-xl font-bold tracking-tight tabular-nums text-slate-900 mt-1.5">
              {backups?.totalBackupsCount} Snapshots
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">{backups?.totalStorageFormatted} used</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
            <HardDrive size={20} />
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Commercial License & Hardware Fingerprint */}
        <div className="lg:col-span-2 space-y-6">
          {/* License Details Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                Commercial License Information
              </h2>
              <span className="text-xs text-slate-400 font-mono">ID: {lic?.licenseId}</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex items-start gap-3 text-xs text-slate-600">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800">{lic?.message}</p>
                  <p className="mt-0.5 text-slate-500">
                    License authenticity is verified cryptographically via HMAC-SHA256 signatures with constant-time validation.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Company</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block">{data?.company.name}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Plan Type</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block capitalize">{lic?.type}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Max Concurrent Users</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block tabular-nums">{lic?.maxUsers} Seats</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Expiration Date</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block tabular-nums">
                    {lic?.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never (Perpetual)'}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Time Remaining</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block tabular-nums">
                    {lic?.type === 'PERPETUAL' ? 'Lifetime' : `${lic?.daysRemaining} days`}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Authorized Issuer</span>
                  <span className="text-sm font-semibold text-slate-900 mt-0.5 block">{lic?.issuer}</span>
                </div>
              </div>

              {/* Hardware Machine Fingerprint */}
              <div className="pt-4 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Server Hardware Machine Fingerprint
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={lic?.machineFingerprint || ''}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 tracking-wider select-all"
                  />
                  <button
                    onClick={handleCopyFingerprint}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm shrink-0"
                    title="Copy Fingerprint"
                  >
                    {copiedFingerprint ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copiedFingerprint ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Provide this hardware identifier when requesting a machine-locked commercial license.
                </p>
              </div>
            </div>
          </div>

          {/* Install New License Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key size={18} className="text-purple-600" />
                Activate or Renew Commercial License
              </h2>
            </div>
            <form onSubmit={handleInstallLicense} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Enter Cryptographically Signed License Key
                </label>
                <textarea
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder="Paste your base64.signature license key here..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
              </div>

              {installMessage && (
                <div className={`p-3.5 rounded-lg text-xs font-medium ${
                  installMessage.isError 
                    ? 'bg-red-50 text-red-700 border border-red-200' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {installMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={installing || !licenseKeyInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                {installing ? 'Verifying & Installing...' : 'Install & Activate License'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (1 Col): System & Database Specifications */}
        <div className="space-y-6">
          {/* System Spec Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Server size={18} className="text-slate-600" />
                System Environment
              </h2>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Application Name</span>
                <span className="font-semibold text-slate-800">{app?.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Build Version</span>
                <span className="font-semibold text-slate-800 font-mono">v{app?.version}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Deployment Target</span>
                <span className="font-semibold text-slate-800 capitalize">{app?.deploymentMode}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Database Schema</span>
                <span className="font-semibold text-slate-800 font-mono">v{app?.schemaVersion}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Database Records</span>
                <span className="font-semibold text-slate-800 tabular-nums">{db?.totalRecords.toLocaleString()} rows</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Last Backup</span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {backups?.lastBackupTimestamp ? new Date(backups.lastBackupTimestamp).toLocaleString() : 'None yet'}
                </span>
              </div>
            </div>
          </div>

          {/* Enabled Modules Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers size={18} className="text-blue-600" />
                Licensed Modules ({data?.modules.enabledCount}/{data?.modules.total})
              </h2>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {data?.modules.enabled.map((mod) => (
                  <span
                    key={mod.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    <CheckCircle2 size={12} className="text-blue-600" />
                    {mod.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
