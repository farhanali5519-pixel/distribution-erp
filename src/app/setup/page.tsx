'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FirstRunSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Form State
  const [companyName, setCompanyName] = useState('My Distribution Company');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [evalMode, setEvalMode] = useState(false);

  async function parseJsonResponse(res: Response): Promise<{ success: boolean; [key: string]: any }> {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await res.json();
      } catch {
        // Fallback to text parsing if JSON is malformed
      }
    }
    const text = await res.text();
    const cleanMsg = text.trim();
    return {
      success: false,
      error: cleanMsg || `HTTP ${res.status}: ${res.statusText || 'Server error'}`,
      message: cleanMsg || `HTTP ${res.status}: ${res.statusText || 'Server error'}`,
    };
  }

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/setup');
        const data = await parseJsonResponse(res);
        if (data.success) {
          if (!data.setupRequired) {
            router.replace('/');
            return;
          }
          setFingerprint(data.machineFingerprint || '');
        } else {
          setError(data.error || data.message || 'Failed to initialize setup service.');
        }
      } catch (err: any) {
        setError('Failed to connect to local SaleFlow setup service: ' + (err.message || String(err)));
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, [router]);

  const handleCopyFingerprint = () => {
    if (fingerprint) {
      navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (adminPassword.length < 8) {
      setError('Administrator password must be at least 8 characters long.');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!/^\d{4}$/.test(adminPin.trim())) {
      setError('Security PIN must be exactly 4 digits (e.g. 1234).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          adminUsername,
          adminPassword,
          adminPin,
          licenseKey: evalMode ? '' : licenseKey.trim(),
        }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Setup initialization failed.');
      }
      // Redirect to main portal
      router.replace(data.redirectUrl || '/');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during setup.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Checking SaleFlow configuration...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: '640px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '1.75rem 2rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-600, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
              SF
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-heading)' }}>
                SaleFlow ERP &bull; First-Run Setup
              </h1>
              <p style={{ fontSize: '0.825rem', margin: 0, color: 'var(--text-muted)' }}>
                Commercial On-Premise Installation Wizard
              </p>
            </div>
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          {error && (
            <div style={{ padding: '0.85rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          {/* Section 1: Business Profile */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
              1. Business Information
            </h2>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Company / Distribution Agency Name
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Farhan Distribution"
              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontSize: '0.9rem' }}
            />
          </div>

          {/* Section 2: Administrator Account */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
              2. System Administrator Account
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Admin Username
                </label>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  4-Digit Security PIN (for Voids)
                </label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1234"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Admin Password (min. 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter strong password"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Hardware Fingerprint & Licensing */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
              3. Commercial License
            </h2>
            
            {/* Machine Fingerprint Display */}
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Host Machine Fingerprint (SHA-256)
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {fingerprint || 'Resolving...'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyFingerprint}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, borderRadius: '4px', border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', cursor: 'pointer' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  Commercial License Key
                </label>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={evalMode}
                    onChange={(e) => setEvalMode(e.target.checked)}
                  />
                  <span>Start with 14-Day Free Evaluation</span>
                </label>
              </div>

              {!evalMode ? (
                <textarea
                  rows={3}
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="Paste your signed Ed25519 license key here..."
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-body)', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              ) : (
                <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', color: '#059669', fontSize: '0.8rem' }}>
                  Evaluation Mode enabled. You will have full access for 14 days and can activate your commercial license anytime under Settings &rarr; System Information.
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-primary-600, #0284c7)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Initializing SaleFlow...' : 'Complete Setup & Launch SaleFlow'}
          </button>
        </form>
      </div>
    </div>
  );
}
