'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { DateRangeFilter, isDateInRange } from '@/shared/components/DateRangeFilter';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';

const paymentMethodOptions = [
  { value: 'CASH', label: 'Cash in Hand (Van / Register)' },
  { value: 'BANK_TRANSFER', label: 'Bank Direct Transfer' },
  { value: 'CHEQUE', label: 'Cheque Collection' },
];
import { 
  CreditCard, 
  PlusCircle, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  ArrowLeft,
  DollarSign,
  Building2,
  Calendar,
  UserCheck
} from 'lucide-react';

interface PaymentRecord {
  id: string;
  payment_number: string;
  payment_date: string;
  customer_id: string;
  customer_name: string;
  shop_name: string | null;
  route_name: string | null;
  salesman_name: string | null;
  payment_method: string;
  amount: number;
  reference_note: string | null;
  created_at: string;
}

interface CustomerOption {
  id: string;
  name: string;
  shop_name: string | null;
  live_balance: number;
  route_id: string | null;
  route_name: string | null;
}

export default function CollectionsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [salesmanId, setSalesmanId] = useState('');
  const [referenceNote, setReferenceNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchCollectionsData = async () => {
    try {
      const [pRes, cRes, sRes, bRes] = await Promise.all([
        fetch('/api/sales/collections'),
        fetch('/api/customers'),
        fetch('/api/staff?role=SALESMAN'),
        fetch('/api/banking/accounts?isActive=true'),
      ]);

      const pData = await pRes.json();
      const cData = await cRes.json();
      const sData = await sRes.json();
      const bData = await bRes.json();

      if (pData.success) setPayments(pData.payments);
      if (cData.success) setCustomers(cData.customers);
      if (sData.success) setStaff(sData.staff);
      if (bData.success) {
        setBankAccounts(bData.accounts || []);
        if (bData.accounts && bData.accounts.length > 0 && !bankAccountId) {
          setBankAccountId(bData.accounts[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectionsData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowModal(true);
      }
    }
  }, []);

  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: [
        c.shop_name ? `Shop: ${c.shop_name}` : null,
        `Bal: ${formatCurrency(c.live_balance)}`,
      ].filter(Boolean).join(' • '),
      badge: c.live_balance > 0 ? 'Balance Due' : undefined,
      badgeColor: c.live_balance > 0 ? ('amber' as const) : undefined,
      keywords: [c.name, c.shop_name || '', String(c.live_balance || '')],
    }));
  }, [customers]);

  const salesmanOptions = useMemo(() => [
    { value: '', label: 'Office Counter / Cashier' },
    ...staff.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.role || 'Salesman',
      badgeColor: 'blue' as const,
      keywords: [s.name, s.role || ''],
    })),
  ], [staff]);

  const bankAccountOptions = useMemo(() => {
    return bankAccounts.map((b) => ({
      value: b.id,
      label: `${b.bank_name} - ${b.account_number}`,
      subLabel: b.account_title,
      badge: b.currency && b.currency !== 'PKR' ? b.currency : undefined,
      badgeColor: 'emerald' as const,
      keywords: [b.bank_name, b.account_number, b.account_title],
    }));
  }, [bankAccounts]);

  const selectedCust = customers.find((c) => c.id === customerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !amount || Number(amount) <= 0) {
      setStatusMessage({ text: 'Please select a customer and specify a valid payment amount.', isError: true });
      return;
    }

    if ((paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CHEQUE') && !bankAccountId && bankAccounts.length > 0) {
      setStatusMessage({ text: 'Please select a deposit bank account.', isError: true });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/sales/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          amount: Number(amount),
          paymentDate,
          paymentMethod,
          bankAccountId: (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CHEQUE') ? bankAccountId : undefined,
          salesmanId: salesmanId || undefined,
          referenceNote: referenceNote || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to record payment');
      }

      setStatusMessage({
        text: `Payment ${data.payment.payment_number} recorded & credited to customer ledger.`,
        isError: false,
      });

      setShowModal(false);
      setCustomerId('');
      setAmount('');
      setReferenceNote('');
      fetchCollectionsData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error occurred', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          p.payment_number.toLowerCase().includes(q) ||
          p.customer_name?.toLowerCase().includes(q) ||
          p.shop_name?.toLowerCase().includes(q) ||
          p.salesman_name?.toLowerCase().includes(q) ||
          p.payment_method?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (!isDateInRange(p.payment_date, dateFrom, dateTo)) {
        return false;
      }
      return true;
    });
  }, [payments, searchTerm, dateFrom, dateTo]);

  const pagination = usePagination(filteredPayments);

  return (
    <ListPageContainer>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Route Collections
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <PlusCircle size={18} style={{ marginRight: '6px' }} /> Record Collection
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div
          style={{
            background: statusMessage.isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${statusMessage.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            color: statusMessage.isError ? '#f87171' : '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}



      {/* Search & Filter Bar */}
      <div className="filter-section-card mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="filter-input-control w-full h-10 pl-9 pr-3 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              placeholder="Search by Payment #, Retailer Name, Shop, Salesman, or Mode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DateRangeFilter
            fromDate={dateFrom}
            toDate={dateTo}
            onFromDateChange={setDateFrom}
            onToDateChange={setDateTo}
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading collections...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No payment collections recorded yet. Click &quot;Record Collection&quot; to log recovery.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date</th>
                  <th>Customer & Shop</th>
                  <th>Route & Salesman</th>
                  <th>Payment Mode</th>
                  <th>Reference Note</th>
                  <th style={{ textAlign: 'right' }}>Amount Collected</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <span className="payment-id">
                        {p.payment_number}
                      </span>
                    </td>
                    <td className="table-date">{p.payment_date}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{p.customer_name}</div>
                      {p.shop_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {p.shop_name}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{p.route_name || 'Counter'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Collector: {p.salesman_name || 'Office Cashier'}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-primary">{p.payment_method}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {p.reference_note || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }} className="tabular-nums">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls {...pagination} />
          </div>
        )}
      </div>

      {/* Record Collection Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-modal-overlay)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '560px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                Record Route Customer Payment
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Retailer / Customer *
                </label>
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={(val) => setCustomerId(val)}
                  placeholder="Select Retailer..."
                  className="w-full"
                />

                {selectedCust && (
                  <div className="tabular-nums" style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                    Current Ledger Balance: <b className="font-semibold">{formatCurrency(selectedCust.live_balance)}</b>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Payment Amount *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="input tabular-nums text-right"
                    placeholder="e.g. 25000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Collection Date
                  </label>
                  <input
                    type="date"
                    className="input tabular-nums"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Payment Method
                  </label>
                  <SearchableSelect
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(val as any)}
                    options={paymentMethodOptions}
                    size="sm"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Collecting Salesman
                  </label>
                  <SearchableSelect
                    options={salesmanOptions}
                    value={salesmanId}
                    onChange={(val) => setSalesmanId(val)}
                    placeholder="Office Counter / Cashier"
                    className="w-full"
                  />
                </div>
              </div>

              {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CHEQUE') && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Deposit Bank Account <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <SearchableSelect
                    options={bankAccountOptions}
                    value={bankAccountId}
                    onChange={(val) => setBankAccountId(val)}
                    placeholder="Select Deposit Bank Account..."
                    className="w-full"
                  />
                  {bankAccounts.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem' }}>
                      No active bank accounts found. Create one in Bank Accounts Master or it will use default bank GL account.
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Reference Note / Cheque # / Bank Txn
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Cheque # 889201 HBL or Route cash clearance"
                  value={referenceNote}
                  onChange={(e) => setReferenceNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
                  {submitting ? 'Recording...' : 'Record Payment & Post to GL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
