'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  Printer, 
  RefreshCw, 
  Calendar, 
  TrendingUp, 
  Receipt, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Coins, 
  FileText,
  Building,
  Check,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, toPaisas } from '@/shared/utils/currency';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import type { DenominationBreakdown, DailyReconciliationResult } from '@/modules/closing/types';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';

export default function DailyClosingPage() {
  const { profile: companyProfile } = useCompanyProfile();
  const { isEnabled } = useFeatureFlags();
  const denominationCounterEnabled = isEnabled('closing.enable_denomination_counter');
  const dayLockEnabled = isEnabled('closing.enable_day_lock');

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<DailyReconciliationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [closedBy, setClosedBy] = useState<string>('Admin Cashier');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Denominations State
  const [denoms, setDenoms] = useState<DenominationBreakdown>({
    note5000: 0,
    note1000: 0,
    note500: 0,
    note100: 0,
    note50: 0,
    note20: 0,
    note10: 0,
    coinsLoose: 0,
  });

  // Print Modal
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [printFormat, setPrintFormat] = useState<'THERMAL' | 'A4'>('THERMAL');

  // Load reconciliation for selected date
  const loadReconciliation = async (dateStr: string) => {
    try {
      setLoading(true);
      setStatusMessage(null);
      const res = await fetch(`/api/closing/reconciliation?date=${dateStr}`);
      const json = await res.json();

      if (json.success) {
        setData(json.reconciliation);
        if (json.reconciliation.finalizedClosing) {
          setDenoms(json.reconciliation.finalizedClosing.denominations || {
            note5000: 0,
            note1000: 0,
            note500: 0,
            note100: 0,
            note50: 0,
            note20: 0,
            note10: 0,
            coinsLoose: 0,
          });
          setNotes(json.reconciliation.finalizedClosing.notes || '');
          setClosedBy(json.reconciliation.finalizedClosing.closed_by || 'Admin Cashier');
        } else {
          // Reset denomination counts for an open date
          setDenoms({
            note5000: 0,
            note1000: 0,
            note500: 0,
            note100: 0,
            note50: 0,
            note20: 0,
            note10: 0,
            coinsLoose: 0,
          });
          setNotes('');
        }
      } else {
        throw new Error(json.message || 'Failed to load daily reconciliation.');
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to fetch closing data.', isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReconciliation(selectedDate);
  }, [selectedDate]);

  // Denomination calculations
  const calculatePhysicalTotal = () => {
    return (
      denoms.note5000 * 5000 +
      denoms.note1000 * 1000 +
      denoms.note500 * 500 +
      denoms.note100 * 100 +
      denoms.note50 * 50 +
      denoms.note20 * 20 +
      denoms.note10 * 10 +
      (Number(denoms.coinsLoose) || 0)
    );
  };

  const physicalCashTotal = calculatePhysicalTotal();
  const physicalCashPaisas = toPaisas(physicalCashTotal);
  const expectedCashPaisas = data?.expectedCashPaisas || 0;
  const variancePaisas = physicalCashPaisas - expectedCashPaisas;
  const varianceAmount = physicalCashTotal - (data?.expectedCash || 0);

  // Finalize Day
  const handleFinalizeClosing = async () => {
    if (!data) return;

    if (variancePaisas !== 0) {
      const confirmMsg =
        variancePaisas < 0
          ? `Cash Shortage Detected of ${formatCurrency(Math.abs(varianceAmount))}. Are you sure you want to close the day with this shortage?`
          : `Cash Surplus Detected of ${formatCurrency(varianceAmount)}. Are you sure you want to close the day with this surplus?`;
      if (!window.confirm(confirmMsg)) return;
    }

    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/closing/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingDate: selectedDate,
          openingCashPaisas: data.openingCashPaisas,
          spotCashSalesPaisas: data.spotCashSalesPaisas,
          debtRecoveriesPaisas: data.debtRecoveriesPaisas,
          spotCashPurchasesPaisas: data.spotCashPurchasesPaisas,
          dailyExpensesPaisas: data.dailyExpensesPaisas,
          bankDepositsPaisas: data.bankDepositsPaisas,
          expectedCashPaisas: data.expectedCashPaisas,
          physicalCashPaisas: physicalCashPaisas,
          denominations: denoms,
          notes: notes.trim() || undefined,
          closedBy: closedBy.trim() || 'Admin Cashier',
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || 'Failed to finalize day closing.');
      }

      setStatusMessage({
        text: `Daily cash closing for ${selectedDate} has been locked and audited!`,
        isError: false,
      });

      loadReconciliation(selectedDate);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error occurred.', isError: true });
    } finally {
      setSaving(false);
    }
  };

  const isClosed = data?.isFinalized && data?.finalizedClosing?.status === 'CLOSED';

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em', margin: 0 }}>
              Daily Closing
            </h1>
            {isClosed ? (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Lock size={12} /> Closed
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Unlock size={12} /> Open / Pending
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            className="btn btn-outline btn-sm"
            style={{ background: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Printer size={15} /> Print Roznamcha Slip
          </button>
          <Link href="/expenses" className="btn btn-outline btn-sm" style={{ background: '#ffffff' }}>
            Daily Expenses
          </Link>
        </div>
      </div>

      {/* Date Bar & Reconciliation Filter Card */}
      <div className="filter-section-card p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Reconciliation Date:
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              className="filter-input-control text-xs font-mono py-1.5 px-3 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                selectedDate === new Date().toISOString().split('T')[0]
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => loadReconciliation(selectedDate)}
              className="btn btn-outline btn-sm text-xs py-1.5 px-2.5 bg-white dark:bg-slate-800"
              title="Refresh Numbers"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {isClosed ? (
            <span>
              Finalized by <strong>{data?.finalizedClosing?.closed_by}</strong> on{' '}
              <span className="font-mono">{data?.finalizedClosing?.closed_at}</span>
            </span>
          ) : (
            <span>System calculations update automatically as orders and vouchers are posted.</span>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            background: statusMessage.isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${statusMessage.isError ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            color: statusMessage.isError ? '#b91c1c' : '#15803d',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* MAIN TWO-COLUMN RECONCILIATION LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: System Cash Flow Statement */}
        <div>
          <div
            style={{
              padding: '1.5rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  System Cash Flow Statement
                </span>
              </div>
              <span className="badge badge-outline" style={{ fontSize: '0.7rem' }}>
                Account 1010 (Cash in Hand)
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                Calculating system balances...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* 1. Opening Cash */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                      (+) Opening Cash in Hand:
                    </span>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      Previous day closing balance or starting GL cash
                    </div>
                  </div>
                  <span className="tabular-nums" style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>
                    {formatCurrency(data?.openingCash || 0)}
                  </span>
                </div>

                {/* INFLOWS SECTION */}
                <div style={{ marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#15803d', letterSpacing: '0.05em' }}>
                    Cash Inflows (Galla Receipts)
                  </span>
                  
                  {/* Spot Cash Sales */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', marginTop: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowDownLeft size={14} style={{ color: '#15803d' }} />
                      <span style={{ fontSize: '0.85rem', color: '#334155' }}>Spot Cash Sales Today</span>
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>
                      + {formatCurrency(data?.spotCashSales || 0)}
                    </span>
                  </div>

                  {/* Customer Debt Recoveries */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowDownLeft size={14} style={{ color: '#15803d' }} />
                      <span style={{ fontSize: '0.85rem', color: '#334155' }}>Customer Debt Recoveries (Route Collections)</span>
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>
                      + {formatCurrency(data?.debtRecoveries || 0)}
                    </span>
                  </div>
                </div>

                {/* OUTFLOWS SECTION */}
                <div style={{ marginTop: '0.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#b91c1c', letterSpacing: '0.05em' }}>
                    Cash Outflows (Disbursements)
                  </span>

                  {/* Daily Expenses */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', marginTop: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowUpRight size={14} style={{ color: '#b91c1c' }} />
                      <span style={{ fontSize: '0.85rem', color: '#334155' }}>Daily Cash Expenses (Petty Cash Vouchers)</span>
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}>
                      - {formatCurrency(data?.dailyExpenses || 0)}
                    </span>
                  </div>

                  {/* Spot Cash Purchases */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowUpRight size={14} style={{ color: '#b91c1c' }} />
                      <span style={{ fontSize: '0.85rem', color: '#334155' }}>Spot Cash Purchases (Vendor Cash)</span>
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}>
                      - {formatCurrency(data?.spotCashPurchases || 0)}
                    </span>
                  </div>

                  {/* Bank Deposits */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowUpRight size={14} style={{ color: '#b91c1c' }} />
                      <span style={{ fontSize: '0.85rem', color: '#334155' }}>Bank Cash Deposits (Drawer to Bank)</span>
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}>
                      - {formatCurrency(data?.bankDeposits || 0)}
                    </span>
                  </div>
                </div>

                {/* EXPECTED SYSTEM CLOSING TOTAL */}
                <div
                  style={{
                    borderTop: '2px solid #e2e8f0',
                    paddingTop: '1rem',
                    marginTop: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                      Expected Closing Cash:
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Exact physical balance required in cash drawer
                    </div>
                  </div>
                  <span className="tabular-nums" style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0284c7' }}>
                    {formatCurrency(data?.expectedCash || 0)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Day Finalization & Notes Card */}
          <div
            style={{
              padding: '1.25rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Day Finalization Audit Notes
            </h4>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600, marginBottom: '0.35rem' }}>
                Cashier / Sign-off Name
              </label>
              <input
                type="text"
                disabled={isClosed}
                className="input"
                value={closedBy}
                onChange={(e) => setClosedBy(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600, marginBottom: '0.35rem' }}>
                Closing Remarks / Audit Notes
              </label>
              <textarea
                rows={3}
                disabled={isClosed}
                placeholder="e.g. All 4 routes reconciled. Van #2 cash tallied by Imran Rafiq. Safe locked by manager."
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
              />
            </div>

            <button
              type="button"
              onClick={handleFinalizeClosing}
              disabled={loading || saving}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <ShieldCheck size={18} />
              {saving ? 'Finalizing Day...' : isClosed ? 'Update & Re-Lock Day' : 'Finalize & Close Day'}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Currency Denomination Counter (Noton ki Ginti) */}
        <div>
          <div
            style={{
              padding: '1.5rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Coins size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Currency Denomination Counter
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                Noton ki Ginti
              </span>
            </div>

            {/* Denomination Input Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                { label: '5,000 Note', val: 5000, key: 'note5000' as const },
                { label: '1,000 Note', val: 1000, key: 'note1000' as const },
                { label: '500 Note', val: 500, key: 'note500' as const },
                { label: '100 Note', val: 100, key: 'note100' as const },
                { label: '50 Note', val: 50, key: 'note50' as const },
                { label: '20 Note', val: 20, key: 'note20' as const },
                { label: '10 Note', val: 10, key: 'note10' as const },
              ].map((row) => {
                const count = denoms[row.key] || 0;
                const subtotal = count * row.val;
                return (
                  <div
                    key={row.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 90px 1fr',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.35rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: '#f8fafc',
                    }}
                  >
                    <span className="tabular-nums" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                      {row.label}
                    </span>

                    <input
                      type="number"
                      min="0"
                      disabled={isClosed}
                      placeholder="0"
                      className="input tabular-nums"
                      value={denoms[row.key] || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setDenoms((prev) => ({ ...prev, [row.key]: val }));
                      }}
                      style={{ height: '34px', padding: '0.25rem 0.5rem', textAlign: 'right', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                    />

                    <span className="tabular-nums" style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                );
              })}

              {/* Coins / Loose */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.35rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: '#f8fafc',
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                  Coins / Loose:
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isClosed}
                  placeholder="0.00"
                  className="input tabular-nums"
                  value={denoms.coinsLoose || ''}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setDenoms((prev) => ({ ...prev, coinsLoose: val }));
                  }}
                  style={{ height: '34px', padding: '0.25rem 0.5rem', textAlign: 'right', fontSize: '0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                />
              </div>
            </div>

            {/* Total Physical Cash Counted */}
            <div
              style={{
                borderTop: '2px solid #e2e8f0',
                paddingTop: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '1rem',
              }}
            >
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                Total Physical Cash:
              </span>
              <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0f172a' }}>
                {formatCurrency(physicalCashTotal)}
              </span>
            </div>

            {/* VARIANCE INDICATOR BOX */}
            <div
              style={{
                borderRadius: 'var(--radius-sm)',
                padding: '1rem',
                background:
                  varianceAmount === 0
                    ? '#f0fdf4'
                    : varianceAmount < 0
                    ? '#fef2f2'
                    : '#fffbeb',
                border: `1px solid ${
                  varianceAmount === 0
                    ? '#bbf7d0'
                    : varianceAmount < 0
                    ? '#fecaca'
                    : '#fde68a'
                }`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {varianceAmount === 0 ? (
                    <CheckCircle2 size={18} style={{ color: '#15803d' }} />
                  ) : varianceAmount < 0 ? (
                    <AlertCircle size={18} style={{ color: '#b91c1c' }} />
                  ) : (
                    <AlertTriangle size={18} style={{ color: '#b45309' }} />
                  )}
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color:
                        varianceAmount === 0
                          ? '#15803d'
                          : varianceAmount < 0
                          ? '#b91c1c'
                          : '#b45309',
                    }}
                  >
                    {varianceAmount === 0
                      ? 'PERFECT MATCH / BALANCED'
                      : varianceAmount < 0
                      ? 'CASH SHORTAGE DETECTED'
                      : 'CASH SURPLUS DETECTED'}
                  </span>
                </div>

                <span
                  className="tabular-nums"
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color:
                      varianceAmount === 0
                        ? '#15803d'
                        : varianceAmount < 0
                        ? '#b91c1c'
                        : '#b45309',
                  }}
                >
                  {varianceAmount === 0
                    ? '0.00'
                    : `${varianceAmount > 0 ? '+' : ''}${formatCurrency(varianceAmount)}`}
                </span>
              </div>

              <p
                style={{
                  fontSize: '0.75rem',
                  color:
                    varianceAmount === 0
                      ? '#166534'
                      : varianceAmount < 0
                      ? '#991b1b'
                      : '#92400e',
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                {varianceAmount === 0
                  ? 'Physical drawer cash matches system calculations with zero float or cash leakage.'
                  : varianceAmount < 0
                  ? 'Physical drawer cash is less than expected by system. Verify spot collections or unrecorded petty vouchers.'
                  : 'Physical drawer cash exceeds system expected total. Check if direct sale or customer collection was missed.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT PREVIEW MODAL (Thermal 80mm & Standard A4) */}
      {printModalOpen && data && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: printFormat === 'A4' ? '780px' : '440px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Modal Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPrintFormat('THERMAL')}
                  className={`btn btn-sm ${printFormat === 'THERMAL' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.75rem' }}
                >
                  Thermal 80mm Slip
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFormat('A4')}
                  className={`btn btn-sm ${printFormat === 'A4' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.75rem' }}
                >
                  Standard A4 Sheet
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.75rem', background: '#ffffff' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div id="printable-roznamcha" style={{ color: '#0f172a' }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.75rem' }}>
                {companyProfile.showLogoOnPrints && companyProfile.logoUrl && (
                  <img
                    src={companyProfile.logoUrl}
                    alt="Logo"
                    style={{ maxHeight: '44px', maxWidth: '120px', objectFit: 'contain', margin: '0 auto 6px auto', display: 'block', filter: 'grayscale(100%)' }}
                  />
                )}
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>
                  {companyProfile.businessName || 'SALEFLOW DISTRIBUTION'}
                </h2>
                {companyProfile.tagline && (
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>{companyProfile.tagline}</div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>DAILY CASH CLOSING & ROZNAMCHA</div>
                {(companyProfile.address || companyProfile.city) && (
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {[companyProfile.address, companyProfile.city].filter(Boolean).join(', ')}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Date: <strong>{selectedDate}</strong> | Status: <strong>{isClosed ? 'AUDITED / CLOSED' : 'PROVISIONAL'}</strong>
                </div>
              </div>

              {/* Summary Numbers */}
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Opening Cash in Hand:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(data.openingCash)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(+) Spot Cash Sales:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(data.spotCashSales)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(+) Route Debt Collections:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(data.debtRecoveries)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                  <span>(-) Daily Cash Expenses:</span>
                  <span className="tabular-nums font-semibold">- {formatCurrency(data.dailyExpenses)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                  <span>(-) Spot Cash Purchases:</span>
                  <span className="tabular-nums font-semibold">- {formatCurrency(data.spotCashPurchases)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                  <span>(-) Bank Cash Deposits:</span>
                  <span className="tabular-nums font-semibold">- {formatCurrency(data.bankDeposits)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid #0f172a', paddingTop: '0.35rem' }}>
                  <span>EXPECTED SYSTEM CASH:</span>
                  <span className="tabular-nums">{formatCurrency(data.expectedCash)}</span>
                </div>
              </div>

              {/* Denominations breakdown */}
              <div style={{ fontSize: '0.75rem', marginBottom: '1rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.75rem' }}>
                <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>PHYSICAL CASH DENOMINATIONS:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                  <div className="tabular-nums">5000 x {denoms.note5000} = {formatCurrency(denoms.note5000 * 5000)}</div>
                  <div className="tabular-nums">1000 x {denoms.note1000} = {formatCurrency(denoms.note1000 * 1000)}</div>
                  <div className="tabular-nums">500 x {denoms.note500} = {formatCurrency(denoms.note500 * 500)}</div>
                  <div className="tabular-nums">100 x {denoms.note100} = {formatCurrency(denoms.note100 * 100)}</div>
                  <div className="tabular-nums">50 x {denoms.note50} = {formatCurrency(denoms.note50 * 50)}</div>
                  <div className="tabular-nums">20 x {denoms.note20} = {formatCurrency(denoms.note20 * 20)}</div>
                  <div className="tabular-nums">10 x {denoms.note10} = {formatCurrency(denoms.note10 * 10)}</div>
                  <div className="tabular-nums">Coins / Loose = {formatCurrency(denoms.coinsLoose || 0)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: '0.5rem', borderTop: '1px solid #0f172a', paddingTop: '0.25rem' }}>
                  <span>TOTAL PHYSICAL CASH:</span>
                  <span className="tabular-nums">{formatCurrency(physicalCashTotal)}</span>
                </div>
              </div>

              {/* Variance Statement */}
              <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '1.25rem', textAlign: 'center' }}>
                {varianceAmount === 0 ? (
                  <span style={{ color: '#15803d' }}>STATUS: EXACT BALANCE (0.00 VARIANCE)</span>
                ) : varianceAmount < 0 ? (
                  <span style={{ color: '#b91c1c' }} className="tabular-nums">STATUS: SHORTAGE (-{formatCurrency(Math.abs(varianceAmount))})</span>
                ) : (
                  <span style={{ color: '#b45309' }} className="tabular-nums">STATUS: SURPLUS (+{formatCurrency(varianceAmount)})</span>
                )}
              </div>

              {/* Signature Blocks */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #0f172a', fontSize: '0.75rem' }}>
                <div style={{ textAlign: 'center', width: '45%' }}>
                  <div style={{ borderBottom: '1px solid #0f172a', height: '24px', marginBottom: '4px' }}></div>
                  <span>Cashier: {closedBy || 'Cashier Sign'}</span>
                </div>
                <div style={{ textAlign: 'center', width: '45%' }}>
                  <div style={{ borderBottom: '1px solid #0f172a', height: '24px', marginBottom: '4px' }}></div>
                  <span>Owner / Auditor Sign</span>
                </div>
              </div>

              {/* Footer Note */}
              <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.7rem', color: '#64748b' }}>
                <p style={{ margin: 0, fontStyle: 'italic' }}>
                  {companyProfile.thermalFooterNote || 'Computer Generated Bill. Software Powered by SaleFlow.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
