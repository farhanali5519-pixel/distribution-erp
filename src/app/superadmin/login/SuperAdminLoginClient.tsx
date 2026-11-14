'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Mail,
  Smartphone,
  LifeBuoy,
  RotateCcw,
  Eye,
  EyeOff,
  History,
  Layers,
} from 'lucide-react';
import { BrandIdentity } from '@/core/branding/BrandIdentity';
import type { BrandingConfig } from '@/core/branding/theme';

type TwoFactorMethod = 'totp' | 'email_otp' | 'recovery_code';

export interface SuperAdminLoginClientProps {
  branding?: BrandingConfig | null;
}

export function SuperAdminLoginClient({ branding }: SuperAdminLoginClientProps) {
  const router = useRouter();
  const appName = branding?.displayName?.trim() || 'SaleFlow ERP';

  // Step 1 State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 2 (2FA) State
  const [requires2FA, setRequires2FA] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [allowedMethods, setAllowedMethods] = useState<TwoFactorMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<TwoFactorMethod>('totp');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Restore remembered username on mount if available
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('sf_superadmin_remembered_user');
      if (savedUser) {
        setUsername(savedUser);
        setRememberMe(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Countdown timer for email resend
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  // STEP 1: Submit Credentials
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (rememberMe) {
        try {
          localStorage.setItem('sf_superadmin_remembered_user', username.trim());
        } catch {
          // Ignore
        }
      } else {
        try {
          localStorage.removeItem('sf_superadmin_remembered_user');
        } catch {
          // Ignore
        }
      }

      const res = await fetch('/api/superadmin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.requires2FA) {
        setRequires2FA(true);
        setChallengeToken(data.challengeToken);
        setAllowedMethods(data.allowedMethods || ['totp']);
        setSelectedMethod(data.allowedMethods?.includes('totp') ? 'totp' : data.allowedMethods?.[0] || 'email_otp');
        setMaskedEmail(data.maskedEmail || '');
      } else {
        router.push('/superadmin');
        router.refresh();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Email OTP Send
  const handleSendEmailOtp = async () => {
    if (otpCooldown > 0 || !challengeToken) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/superadmin/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send verification email');
      }

      setEmailOtpSent(true);
      setOtpCooldown(data.cooldownSeconds || 60);
      if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Verify 2FA
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode.trim() || !challengeToken) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/superadmin/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          method: selectedMethod,
          code: twoFactorCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      router.push('/superadmin');
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const resetToStep1 = () => {
    setRequires2FA(false);
    setChallengeToken('');
    setTwoFactorCode('');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F5F7FA] select-none">
      {/* ============================================================ */}
      {/* 55% LEFT BRANDING PANEL (Desktop only / responsive on small)  */}
      {/* ============================================================ */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#081A2F] via-[#0B213E] to-[#082025] relative flex-col justify-between p-12 xl:p-16 text-white overflow-hidden">
        {/* Subtle geometric grid background pattern */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #16A46A 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Soft emerald radial glow overlay */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#16A46A]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#12A594]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <BrandIdentity
            surface="login"
            isSuperAdmin={true}
            uploadedSidebarLogo={branding?.uploadedSidebarLogo}
            uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
            sidebarLogoAsset={branding?.sidebarLogoAsset}
            sidebarLogoVersion={branding?.sidebarLogoVersion}
            uploadedLogo={branding?.uploadedLogo}
            uploadedLogoVersion={branding?.uploadedLogoVersion}
            companyLogo={branding?.companyLogo}
            displayName={appName}
            badge="Vendor"
            showBadge={true}
            subtitle="Platform Administration"
            showSubtitle={true}
            size="md"
            theme="dark"
          />
        </div>

        {/* Center Marketing Headline & Supporting Narrative */}
        <div className="relative z-10 my-auto py-8 max-w-xl">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.15] text-white">
            Control your entire<br />
            {appName} network,<br />
            <span className="text-[#16A46A]">in one place.</span>
          </h1>

          <p className="mt-6 text-base text-slate-300 leading-relaxed font-normal max-w-lg">
            Manage customer companies, users, modules, licenses, branding and security from one secure control center.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {['Companies', 'Users', 'Modules', 'Licensing', 'Branding', 'Security'].map((pill) => (
              <span
                key={pill}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 backdrop-blur-xs"
              >
                {pill}
              </span>
            ))}
          </div>

          {/* Bottom Security / Architecture Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 pt-8 border-t border-white/10 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-[#16A46A] shrink-0" />
              <span>Role-based access</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <History className="w-4 h-4 text-[#12A594] shrink-0" />
              <span>Complete audit logs</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Layers className="w-4 h-4 text-[#16A46A] shrink-0" />
              <span>Multi-tenant control</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-slate-400 flex items-center justify-between">
          <span>© 2026 {appName}</span>
          <span className="font-mono text-[11px] text-slate-500">v2.4 Enterprise</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 45% RIGHT LOGIN FORM (Full width on mobile/tablet)            */}
      {/* ============================================================ */}
      <div className="w-full lg:w-[45%] min-h-screen bg-white flex flex-col justify-center px-6 sm:px-12 xl:px-20 py-12">
        <div className="max-w-md w-full mx-auto">
          {/* Mobile-only brand badge at top */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <BrandIdentity
              surface="login"
              isSuperAdmin={true}
              uploadedSidebarLogo={branding?.uploadedSidebarLogo}
              uploadedSidebarLogoVersion={branding?.uploadedSidebarLogoVersion}
              sidebarLogoAsset={branding?.sidebarLogoAsset}
              sidebarLogoVersion={branding?.sidebarLogoVersion}
              uploadedLogo={branding?.uploadedLogo}
              uploadedLogoVersion={branding?.uploadedLogoVersion}
              companyLogo={branding?.companyLogo}
              displayName={appName}
              size="sm"
              theme="light"
            />
          </div>

          {/* Form Header */}
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#16A46A] mb-1.5 flex items-center gap-1.5">
              <span>WELCOME BACK</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2747]">
              Sign in to {appName}
            </h2>
            <p className="text-sm text-[#667085] mt-1.5">
              Access the secure Super Administrator portal.
            </p>
          </div>

          {/* Error Alert Box */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] flex items-start gap-3 text-xs leading-relaxed animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D92D20]" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {!requires2FA ? (
            /* STEP 1: Username & Password Form */
            <form onSubmit={handleStep1Submit} className="space-y-4.5">
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Super Admin Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="superadmin"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E4E7EC] bg-white text-[#172033] placeholder:text-[#667085]/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A46A]/20 focus:border-[#16A46A] transition-all font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-[#E4E7EC] bg-white text-[#172033] placeholder:text-[#667085]/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A46A]/20 focus:border-[#16A46A] transition-all font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#0F2747] transition-colors cursor-pointer p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#E4E7EC] text-[#16A46A] focus:ring-[#16A46A] cursor-pointer"
                  />
                  <span className="text-xs text-[#667085] font-medium">
                    Remember me on this device
                  </span>
                </label>
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#16A46A] hover:bg-[#12A594] text-white font-semibold text-sm transition-all shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: Two-Factor Authentication Form */
            <form onSubmit={handleStep2Submit} className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
                <div className="flex items-center gap-2 text-[#16A46A]">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="text-sm font-bold text-[#0F2747]">
                    Two-Factor Verification
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetToStep1}
                  className="text-xs text-[#667085] hover:text-[#0F2747] flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Back to login</span>
                </button>
              </div>

              {/* Method Selector Tabs */}
              <div className="grid grid-cols-3 gap-2">
                {allowedMethods.includes('totp') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('totp');
                      setTwoFactorCode('');
                    }}
                    className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      selectedMethod === 'totp'
                        ? 'bg-[#EAF8F2] border-[#A6F4C5] text-[#16A46A] font-semibold'
                        : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F5F7FA]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Authenticator</span>
                  </button>
                )}

                {allowedMethods.includes('email_otp') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('email_otp');
                      setTwoFactorCode('');
                      if (!emailOtpSent) handleSendEmailOtp();
                    }}
                    className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      selectedMethod === 'email_otp'
                        ? 'bg-[#EAF8F2] border-[#A6F4C5] text-[#16A46A] font-semibold'
                        : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F5F7FA]'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Email OTP</span>
                  </button>
                )}

                {allowedMethods.includes('recovery_code') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod('recovery_code');
                      setTwoFactorCode('');
                    }}
                    className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      selectedMethod === 'recovery_code'
                        ? 'bg-[#EAF8F2] border-[#A6F4C5] text-[#16A46A] font-semibold'
                        : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F5F7FA]'
                    }`}
                  >
                    <LifeBuoy className="w-4 h-4" />
                    <span>Recovery</span>
                  </button>
                )}
              </div>

              {/* Dynamic Instructions per Method */}
              {selectedMethod === 'totp' && (
                <p className="text-xs text-[#667085]">
                  Enter the 6-digit verification code from Google Authenticator, Microsoft Authenticator, or Authy.
                </p>
              )}

              {selectedMethod === 'email_otp' && (
                <div className="space-y-2">
                  <p className="text-xs text-[#667085]">
                    A 6-digit code has been dispatched to{' '}
                    <span className="font-mono text-[#0F2747] font-semibold">{maskedEmail || 'your email'}</span>.
                  </p>
                  <button
                    type="button"
                    disabled={otpCooldown > 0 || isLoading}
                    onClick={handleSendEmailOtp}
                    className="text-xs text-[#16A46A] hover:text-[#12A594] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed font-medium inline-flex items-center gap-1"
                  >
                    {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend verification code'}
                  </button>
                </div>
              )}

              {selectedMethod === 'recovery_code' && (
                <p className="text-xs text-[#667085]">
                  Enter one of your 8-digit emergency backup recovery codes (e.g. <span className="font-mono">ABCD-1234</span>).
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">
                  {selectedMethod === 'recovery_code' ? 'Emergency Recovery Code' : '6-Digit Verification Code'}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder={selectedMethod === 'recovery_code' ? 'XXXX-XXXX' : '123456'}
                  maxLength={selectedMethod === 'recovery_code' ? 12 : 6}
                  className="w-full px-4 py-2.5 rounded-lg border border-[#E4E7EC] text-[#0F2747] focus:outline-none focus:ring-2 focus:ring-[#16A46A]/20 focus:border-[#16A46A] transition-all text-center tracking-widest text-lg font-mono tabular-nums bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !twoFactorCode.trim()}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#16A46A] hover:bg-[#12A594] text-white font-semibold text-sm transition-all shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Continue →</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Security Notice Footer */}
          <div className="mt-8 pt-6 border-t border-[#F2F4F7] text-center text-xs text-[#667085]">
            Restricted access • Authorized administrators only
          </div>
        </div>
      </div>
    </div>
  );
}
