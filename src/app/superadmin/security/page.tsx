'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Mail,
  LifeBuoy,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Printer,
  RotateCcw,
  Lock,
} from 'lucide-react';
import type { TwoFactorPolicy, PlatformUserSecurityProfile } from '@/core/auth/two-factor.service';
import { Button, IconButton } from '@/shared/components/Button';

export default function SecurityPage() {
  const [profile, setProfile] = useState<PlatformUserSecurityProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // TOTP Setup Modal State
  const [isTotpSetupOpen, setIsTotpSetupOpen] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; uri: string; qrSvg: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [isVerifyingTotp, setIsVerifyingTotp] = useState(false);

  // Disable TOTP Modal State
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  // Regenerate Recovery Codes Modal State
  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Policy state
  const [selectedPolicy, setSelectedPolicy] = useState<TwoFactorPolicy>('OPTIONAL');

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/superadmin/security/policy');
      const json = await res.json();
      if (json.success && json.data) {
        setProfile(json.data);
        setSelectedPolicy(json.data.twoFactorPolicy || 'OPTIONAL');
      }
    } catch (err) {
      console.error('Failed to load security profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Initiate TOTP Setup
  const handleStartTotpSetup = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/security/totp/setup', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data) {
        setTotpSetupData(json.data);
        setIsTotpSetupOpen(true);
        setNewRecoveryCodes(null);
        setVerifyCode('');
      } else {
        throw new Error(json.error || 'Failed to initialize TOTP');
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Setup failed' });
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm TOTP with 6-digit code
  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;

    setIsVerifyingTotp(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/security/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setNewRecoveryCodes(json.recoveryCodes || []);
        fetchProfile();
      } else {
        throw new Error(json.error || 'Invalid 6-digit verification code');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifyingTotp(false);
    }
  };

  // Disable TOTP
  const handleDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) return;

    setIsDisabling(true);
    try {
      const res = await fetch('/api/superadmin/security/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      });
      const json = await res.json();
      if (json.success) {
        setIsDisableOpen(false);
        setDisablePassword('');
        setStatusMessage({ type: 'success', text: 'Authenticator 2FA has been disabled.' });
        fetchProfile();
      } else {
        throw new Error(json.error || 'Failed to disable 2FA');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsDisabling(false);
    }
  };

  // Regenerate Recovery Codes
  const handleRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenPassword) return;

    setIsRegenerating(true);
    try {
      const res = await fetch('/api/superadmin/security/recovery-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: regenPassword }),
      });
      const json = await res.json();
      if (json.success) {
        setIsRegenOpen(false);
        setRegenPassword('');
        setNewRecoveryCodes(json.recoveryCodes || []);
        setIsTotpSetupOpen(true);
        setTotpSetupData(null);
        fetchProfile();
      } else {
        throw new Error(json.error || 'Failed to regenerate codes');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate codes');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Update 2FA Policy
  const handleSavePolicy = async () => {
    setPolicySaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/security/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: selectedPolicy }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: `Platform 2FA policy updated to ${selectedPolicy}` });
        setProfile(json.data);
      } else {
        throw new Error(json.error || 'Failed to update policy');
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setPolicySaving(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#16A46A]" />
        <span className="text-sm text-[#667085] font-medium">
          Loading security policies...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none max-w-4xl">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
          Security & Two-Factor Authentication
        </h2>
        <p className="text-xs text-[#667085] mt-0.5">
          Configure TOTP Authenticator apps, Gmail/Email OTP verification, and platform 2FA enforcement
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-[#EAF8F2] border-[#A6F4C5] text-[#16A46A]'
              : 'bg-[#FEF3F2] border-[#FECDCA] text-[#D92D20]'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 2FA ENFORCEMENT POLICY */}
      <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#12A594]" />
              <span>Platform 2FA Enforcement Policy</span>
            </h3>
            <p className="text-[11px] text-[#667085] mt-0.5">
              Governs authentication requirements for Super Administrator accounts
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSavePolicy}
            disabled={policySaving}
            loading={policySaving}
          >
            Save Policy
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              id: 'REQUIRED' as TwoFactorPolicy,
              title: '2FA Required (Recommended)',
              desc: 'Enforces second factor before access is granted to Super Admin dashboard.',
            },
            {
              id: 'OPTIONAL' as TwoFactorPolicy,
              title: '2FA Optional',
              desc: 'Allows users to sign in with password only unless 2FA is explicitly configured.',
            },
            {
              id: 'TOTP_ONLY' as TwoFactorPolicy,
              title: 'Authenticator Only',
              desc: 'Strictly requires Google or Microsoft Authenticator TOTP token.',
            },
            {
              id: 'EMAIL_OTP_ONLY' as TwoFactorPolicy,
              title: 'Email OTP Only',
              desc: 'Dispatches 6-digit one-time code to verified Super Admin email address.',
            },
          ].map((item) => (
            <label
              key={item.id}
              className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                selectedPolicy === item.id
                  ? 'bg-[#EAF8F2] border-[#A6F4C5] text-[#16A46A] shadow-xs'
                  : 'bg-white border-[#E4E7EC] text-[#667085] hover:bg-[#F5F7FA]'
              }`}
            >
              <input
                type="radio"
                name="2fa_policy"
                value={item.id}
                checked={selectedPolicy === item.id}
                onChange={() => setSelectedPolicy(item.id)}
                className="mt-0.5 text-[#16A46A] focus:ring-[#16A46A]"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[#0F2747]">
                  {item.title}
                </div>
                <div className="text-[11px] text-[#667085] leading-relaxed">
                  {item.desc}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* METHOD 1: GOOGLE AUTHENTICATOR / TOTP */}
      <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF8F2] border border-[#A6F4C5] text-[#16A46A] flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747]">
                Google Authenticator / TOTP
              </h3>
              <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
                Compatible with Google Authenticator, Microsoft Authenticator, and Authy
              </p>
            </div>
          </div>

          <div>
            {profile?.totpEnabled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                <span>Not Enabled</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-[var(--text-primary,#c9d1d9)] space-y-1">
            <p>
              Standard RFC 6238 time-based one-time passwords for mobile authenticator apps.
            </p>
            {profile?.last2faAt && (
              <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
                Last authenticated via 2FA: <span className="tabular-nums text-zinc-300">{new Date(profile.last2faAt).toLocaleString()}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {profile?.totpEnabled ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleStartTotpSetup}
                >
                  Reconfigure
                </Button>
                <Button
                  variant="danger-outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsDisableOpen(true)}
                >
                  Disable 2FA
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={handleStartTotpSetup}
              >
                Enable Authenticator
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* METHOD 2: EMERGENCY RECOVERY CODES */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default,#30363d)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-heading,#f0f6fc)]">
                Emergency Backup Recovery Codes
              </h3>
              <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
                One-time use access codes if you ever lose your mobile device
              </p>
            </div>
          </div>

          <div>
            {profile?.hasRecoveryCodes ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>8 Codes Stored</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span>Not Generated</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-primary,#c9d1d9)] max-w-md">
            Recovery codes are stored as SHA-256 hashes only. Each code can be used exactly once.
            Regenerating codes immediately invalidates any previously generated codes.
          </p>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setIsRegenOpen(true)}
          >
            Regenerate Recovery Codes
          </Button>
        </div>
      </div>

      {/* METHOD 3: EMAIL / GMAIL OTP */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default,#30363d)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-heading,#f0f6fc)]">
                Email / Gmail OTP Verification
              </h3>
              <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
                Delivers 6-digit temporary codes via configured SMTP transport
              </p>
            </div>
          </div>

          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <span>Ready</span>
            </span>
          </div>
        </div>

        <div className="text-xs text-[var(--text-primary,#c9d1d9)] space-y-2">
          <p>
            Super Admin login attempts will dispatch a short-lived 6-digit OTP (~5 min expiration) with rate-limiting and 60-second cooldown protection.
          </p>
          <p className="text-[11px] text-[var(--text-muted,#8b949e)]">
            Configured through environment variables: <span className="font-mono text-zinc-300">SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM</span>
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: TOTP SETUP / QR CODE */}
      {/* ============================================================== */}
      {isTotpSetupOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            {newRecoveryCodes ? (
              /* Recovery Codes Display */
              <div className="space-y-5">
                <div className="text-center">
                  <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)]">
                    Save Your Emergency Recovery Codes
                  </h3>
                  <p className="text-xs text-[var(--text-muted,#8b949e)] mt-1">
                    Keep these 8 codes safe. If you lose access to your Authenticator app, each code can be used once to log in.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] grid grid-cols-2 gap-2 text-center font-mono text-sm tracking-wider tabular-nums text-indigo-300">
                  {newRecoveryCodes.map((c, i) => (
                    <div key={i} className="p-1.5 rounded bg-black/30 border border-white/5">
                      {c}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
                      alert('Recovery codes copied to clipboard');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-default,#30363d)] text-xs font-semibold text-[var(--text-primary,#c9d1d9)] hover:bg-[var(--bg-app,#0d1117)] cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Codes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsTotpSetupOpen(false);
                      setNewRecoveryCodes(null);
                    }}
                    className="px-5 py-2 rounded-lg bg-[#16A46A] hover:bg-[#12A594] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    I Have Saved My Codes
                  </button>
                </div>
              </div>
            ) : (
              /* QR Code & Code Verification Form */
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)]">
                    Set Up Google Authenticator
                  </h3>
                  <p className="text-xs text-[var(--text-muted,#8b949e)] mt-0.5">
                    Scan the QR code below using Google Authenticator, Microsoft Authenticator, or Authy.
                  </p>
                </div>

                {totpSetupData?.qrSvg && (
                  <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white w-48 h-48 mx-auto shadow-inner">
                    <div dangerouslySetInnerHTML={{ __html: totpSetupData.qrSvg }} />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted,#8b949e)] mb-1">
                    Manual Setup Secret Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={totpSetupData?.secret || ''}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] font-mono text-xs text-[#0F2747] tracking-wider text-center"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (totpSetupData?.secret) navigator.clipboard.writeText(totpSetupData.secret);
                        alert('Secret copied to clipboard');
                      }}
                      className="p-2 rounded-lg border border-[var(--border-default,#30363d)] bg-[var(--bg-app,#0d1117)] text-[var(--text-muted,#8b949e)] hover:text-white cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleConfirmTotp} className="space-y-4 pt-3 border-t border-[var(--border-default,#30363d)]">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary,#c9d1d9)] mb-1">
                      Enter Current 6-Digit Code from App
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={6}
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] font-mono text-center tracking-widest text-lg tabular-nums text-white focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTotpSetupOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={isVerifyingTotp || verifyCode.trim().length < 6}
                      loading={isVerifyingTotp}
                    >
                      Activate Authenticator
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DISABLE TOTP */}
      {/* ============================================================== */}
      {isDisableOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)]">
              Disable Two-Factor Authentication
            </h3>
            <p className="text-xs text-[var(--text-muted,#8b949e)]">
              To disable Authenticator 2FA, please verify your Super Admin security password.
            </p>

            <form onSubmit={handleDisableTotp} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDisableOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={isDisabling || !disablePassword}
                  loading={isDisabling}
                >
                  Confirm Disable
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: REGENERATE RECOVERY CODES */}
      {/* ============================================================== */}
      {isRegenOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface,#161b22)] border border-[var(--border-default,#30363d)] rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-heading,#f0f6fc)]">
              Regenerate Recovery Codes
            </h3>
            <p className="text-xs text-[var(--text-muted,#8b949e)]">
              Enter your password to generate 8 fresh one-time backup codes. Existing codes will be revoked.
            </p>

            <form onSubmit={handleRegenerateCodes} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app,#0d1117)] border border-[var(--border-default,#30363d)] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRegenOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isRegenerating || !regenPassword}
                  loading={isRegenerating}
                >
                  Regenerate Codes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
