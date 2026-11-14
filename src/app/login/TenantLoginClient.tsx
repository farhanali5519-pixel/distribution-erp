'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Building2,
  ShieldCheck,
  History,
  ArrowRight,
} from 'lucide-react';
import { SaleFlowIcon } from '@/core/branding/logo';
import { BrandIdentity } from '@/core/branding/BrandIdentity';
import { ApplicationPreloader } from '@/core/branding/ApplicationPreloader';

interface EnabledModuleInfo {
  id: string;
  name: string;
  code?: string;
}

interface TenantBrandingInfo {
  companyLogo?: string | null;
  uploadedLogo?: string | null;
  uploadedLogoVersion?: number | string | null;
  uploadedSidebarLogo?: string | null;
  uploadedSidebarLogoVersion?: number | string | null;
  sidebarLogoAsset?: string | null;
  sidebarLogoVersion?: number | string | null;
  preloaderEnabled?: boolean;
  displayName?: string;
  primaryColor?: string;
  fontFamily?: string;
}

interface TenantLoginClientProps {
  companyName: string;
  companySlug: string;
  hostname: string;
  branding?: TenantBrandingInfo;
  enabledModules?: EnabledModuleInfo[];
}

export function TenantLoginClient({
  companyName,
  companySlug,
  hostname,
  branding,
  enabledModules = [],
}: TenantLoginClientProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`saleflow_remembered_user_${companySlug}`);
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {}
  }, [companySlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (rememberMe) {
        try {
          localStorage.setItem(`saleflow_remembered_user_${companySlug}`, username.trim());
        } catch {}
      } else {
        try {
          localStorage.removeItem(`saleflow_remembered_user_${companySlug}`);
        } catch {}
      }

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Authentication failed. Please check your credentials.');
      }

      // Hard redirect to load all server components and layout with fresh authenticated session
      window.location.href = '/';
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F8FAFC] select-none font-sans">
      <ApplicationPreloader
        config={{
          preloaderEnabled: Boolean(branding?.preloaderEnabled),
          uploadedLogo: branding?.uploadedLogo,
          uploadedLogoVersion: branding?.uploadedLogoVersion,
          companyLogo: branding?.companyLogo ?? null,
          displayName: branding?.displayName || 'SaleFlow ERP',
          favicon: null,
          primaryColor: branding?.primaryColor || '#0F2747',
          secondaryColor: '#12A594',
          accentColor: '#16A46A',
          sidebarColor: '#081A2F',
          headerColor: '#FFFFFF',
          backgroundColor: '#061826',
          buttonStyle: 'rounded',
          borderRadius: 'md',
          fontFamily: 'Inter',
          fontSizeScale: 'md',
          loginBranding: { title: 'SaleFlow ERP', subtitle: '', logoUrl: null, showSaleFlowBadge: true },
        }}
        companyName={companyName}
      />
      {/* ============================================================ */}
      {/* 55% LEFT BRANDING PANEL (Desktop only / responsive)           */}
      {/* ============================================================ */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#061826] via-[#082226] to-[#041d18] relative flex-col justify-between p-12 xl:p-16 text-white overflow-hidden">
        {/* Subtle geometric grid background pattern */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #16A46A 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Soft emerald & teal radial glow overlays */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#16A46A]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#12A594]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Branding Section */}
        <div className="relative z-10 flex flex-col items-start gap-4">
          <BrandIdentity
            surface="login"
            uploadedSidebarLogo={branding?.uploadedSidebarLogo}
            uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
            sidebarLogoAsset={branding?.sidebarLogoAsset}
            sidebarLogoVersion={branding?.sidebarLogoVersion}
            uploadedLogo={branding?.uploadedLogo}
            uploadedLogoVersion={branding?.uploadedLogoVersion}
            companyLogo={branding?.companyLogo}
            displayName={branding?.displayName || 'SaleFlow ERP'}
            badge="Workspace"
            showBadge={true}
            subtitle="Enterprise Distribution Platform"
            showSubtitle={true}
            size="md"
            theme="dark"
          />

          {/* Prominent Tenant Company Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold backdrop-blur-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-white font-medium">{companyName}</span>
            <span className="text-emerald-500/50">•</span>
            <span className="font-mono text-[11px] text-emerald-400/90">{hostname}</span>
          </div>
        </div>

        {/* Center Marketing Narrative */}
        <div className="relative z-10 my-auto py-8 max-w-xl">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.15] text-white">
            Everything your business<br />
            needs, <span className="text-[#16A46A]">in one place.</span>
          </h1>

          <p className="mt-6 text-base text-slate-300 leading-relaxed font-normal max-w-lg">
            Securely manage your sales and enabled business operations from one unified workspace.
          </p>

          {/* Canonical Enabled Modules Pills - ONLY modules enabled for this tenant */}
          {enabledModules.length > 0 && (
            <div className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Enabled Workspace Modules
              </p>
              <div className="flex flex-wrap gap-2">
                {enabledModules.map((mod) => (
                  <span
                    key={mod.id}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 backdrop-blur-xs flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{mod.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Trust & Architecture Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 pt-8 border-t border-white/10 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-[#16A46A] shrink-0" />
              <span>Secure workspace</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Lock className="w-4 h-4 text-[#12A594] shrink-0" />
              <span>Role-based access</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <History className="w-4 h-4 text-[#16A46A] shrink-0" />
              <span>Audit trail</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-slate-400 flex items-center justify-between">
          <span>© 2026 {branding?.displayName || 'SaleFlow ERP'}</span>
          <span className="font-mono text-[11px] text-slate-500">Dedicated Tenant Instance</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 45% RIGHT LOGIN FORM (Full width on mobile/tablet)            */}
      {/* ============================================================ */}
      <div className="w-full lg:w-[45%] min-h-screen bg-white flex flex-col justify-center px-6 sm:px-12 xl:px-20 py-12 relative">
        <div className="max-w-md w-full mx-auto">
          {/* Mobile-only brand header */}
          <div className="lg:hidden flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
            <BrandIdentity
              surface="login"
              uploadedSidebarLogo={branding?.uploadedSidebarLogo}
              uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
              sidebarLogoAsset={branding?.sidebarLogoAsset}
              sidebarLogoVersion={branding?.sidebarLogoVersion}
              uploadedLogo={branding?.uploadedLogo}
              uploadedLogoVersion={branding?.uploadedLogoVersion}
              companyLogo={branding?.companyLogo}
              displayName={branding?.displayName || 'SaleFlow ERP'}
              size="sm"
              theme="light"
            />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Building2 className="w-3 h-3 text-emerald-600" />
              <span>{companyName}</span>
            </span>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <div className="mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 inline-block">
                WELCOME BACK
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2747]">
              Sign in to your workspace
            </h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Enter your organization credentials to continue.
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-relaxed animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span className="font-medium text-xs">Remember username</span>
              </label>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 disabled:opacity-50 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Tenant Isolation Info Notice */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 font-normal">
              Secure tenant workspace • <span className="text-slate-600 font-medium font-mono">{hostname}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
