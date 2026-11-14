'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { NumericValue } from '@/shared/components/NumericValue';
import PrintInvoiceModal from '@/modules/sales/components/PrintInvoiceModal';
import { 
  TrendingUp, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  ArrowRight,
  ShieldAlert,
  CreditCard,
  Building2,
  ShieldCheck
} from 'lucide-react';

interface StaffOption {
  id: string;
  employee_code?: string;
  name: string;
  role: string;
}

interface RouteOption {
  id: string;
  name: string;
  code: string;
}

interface CustomerOption {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string | null;
  route_id: string | null;
  route_name: string | null;
  credit_limit: number;
  live_balance: number;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  brand_name?: string;
  uom_base: string;
  uom_bulk: string;
  bulk_conversion_factor: number;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  trade_price: number;
  cost_price: number;
  current_stock_base: number;
}

interface RowItem {
  id: string;
  productId: string;
  cartons: number;
  boxes: number;
  loose: number;
  unitPrice: number;
  discPercent: number;
  discPkr: number;
  schemeBonus: number;
}

// Helper to compute row gross amount in PKR
// Trade price is strictly per base piece (TP / PCS)
const getRowGross = (prod?: ProductOption, cartons = 0, boxes = 0, loose = 0, unitPrice = 0) => {
  if (!prod) return 0;
  const bpc = Math.max(1, prod.boxes_per_carton || 1);
  const ppb = Math.max(1, prod.pieces_per_box || 1);
  const ppc = Math.max(1, prod.total_pieces_per_carton || (bpc * ppb) || prod.bulk_conversion_factor || 1);
  const totalPcs = (cartons * ppc) + (boxes * ppb) + loose;
  return unitPrice * totalPcs;
};

export default function DirectSalePage() {
  const { isEnabled, getValue } = useFeatureFlags();

  // Feature Flags
  const directSaleEnabled = isEnabled('sales.enable_direct_sale', true);
  const salesmanEnabled = isEnabled('sales.enable_salesman_tracking', true);
  const supplyPersonEnabled = isEnabled('sales.enable_supply_person_tracking', true);
  const lineDiscountEnabled = isEnabled('sales.enable_line_discount', true);
  const billDiscountEnabled = isEnabled('sales.enable_bill_discount', true);
  const schemeBonusEnabled = isEnabled('sales.enable_scheme_bonus', true);
  const spotCashEnabled = isEnabled('sales.enable_spot_cash_collection', true);
  const defaultPrintFormat = (getValue('sales.default_print_format') || 'THERMAL') as 'THERMAL' | 'A4';

  // Master Data
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Sticky Session State
  const [salesmanId, setSalesmanId] = useState('');
  const [supplyPersonId, setSupplyPersonId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [sessionLocked, setSessionLocked] = useState(true);

  // Invoice Header State
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Items State
  const [rows, setRows] = useState<RowItem[]>([
    { id: '1', productId: '', cartons: 1, boxes: 0, loose: 0, unitPrice: 0, discPercent: 0, discPkr: 0, schemeBonus: 0 },
  ]);

  // Bill Discount State
  const [billDiscPercent, setBillDiscPercent] = useState<number | ''>('');
  const [billDiscPkr, setBillDiscPkr] = useState<number | ''>('');

  // Spot Cash State
  const [cashReceived, setCashReceived] = useState<number | ''>('');

  // Submission / Print State
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [savedInvoice, setSavedInvoice] = useState<any | null>(null);

  const customerSelectRef = useRef<HTMLSelectElement | null>(null);

  // Fetch initial master data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cRes, rRes, sRes, pRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/routes'),
          fetch('/api/staff'),
          fetch('/api/inventory'),
        ]);

        const cData = await cRes.json();
        const rData = await rRes.json();
        const sData = await sRes.json();
        const pData = await pRes.json();

        if (cData.success) setCustomers(cData.customers);
        if (rData.success) setRoutes(rData.routes);
        if (sData.success) setStaff(sData.staff);
        if (pData.success) setProducts(pData.products);

        if (rData.success && rData.routes.length > 0) setRouteId(rData.routes[0].id);
        if (sData.success && sData.staff.length > 0) {
          const sm = sData.staff.find((s: any) => s.role === 'SALESMAN' || s.role === 'BOTH');
          const sp = sData.staff.find((s: any) => s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER');
          if (sm) setSalesmanId(sm.id);
          if (sp) setSupplyPersonId(sp.id);
        }
      } catch (err) {
        console.error('Error loading direct sale master data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredCustomers = routeId
    ? customers.filter((c) => !c.route_id || c.route_id === routeId)
    : customers;

  const routeOptions = useMemo(() => [
    { value: '', label: 'All Routes' },
    ...routes.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'blue' as const,
      keywords: [r.name, r.code],
    })),
  ], [routes]);

  const salesmanOptions = useMemo(() => [
    { value: '', label: 'Unassigned Salesman' },
    ...staff
      .filter((s) => s.role === 'SALESMAN' || s.role === 'BOTH')
      .map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.employee_code || undefined,
        badgeColor: 'blue' as const,
        keywords: [s.name, s.employee_code || ''],
      })),
  ], [staff]);

  const supplyPersonOptions = useMemo(() => [
    { value: '', label: 'Unassigned Delivery Officer' },
    ...staff
      .filter((s) => s.role === 'SUPPLY_PERSON' || s.role === 'DRIVER' || s.role === 'BOTH')
      .map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.employee_code || undefined,
        badgeColor: 'indigo' as const,
        keywords: [s.name, s.employee_code || ''],
      })),
  ], [staff]);

  const customerOptions = useMemo(() => {
    return filteredCustomers.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: [
        c.shop_name ? `Shop: ${c.shop_name}` : null,
        c.phone ? `Ph: ${c.phone}` : null,
        `Bal: ${formatCurrency(c.live_balance)}`,
      ].filter(Boolean).join(' • '),
      badge: c.live_balance > 0 ? 'Balance Due' : undefined,
      badgeColor: c.live_balance > 0 ? ('amber' as const) : undefined,
      keywords: [c.name, c.shop_name || '', c.phone || '', String(c.live_balance || '')],
    }));
  }, [filteredCustomers]);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      badge: p.sku,
      badgeColor: 'blue' as const,
      subLabel: `${p.brand_name ? `[${p.brand_name}] ` : ''}1 CTN = ${p.boxes_per_carton || 1} BOX = ${p.total_pieces_per_carton || p.bulk_conversion_factor || 1} PCS • TP: ${formatCurrency(p.trade_price)}`,
      keywords: [p.sku, p.name, p.brand_name || ''],
    }));
  }, [products]);

  // Row Change Handlers
  const handleProductChange = (rowId: string, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const tp = prod ? prod.trade_price : 0;
        const gross = getRowGross(prod, r.cartons, r.boxes, r.loose, tp);
        const discPkr = lineDiscountEnabled ? (gross * (r.discPercent / 100)) : 0;
        return {
          ...r,
          productId: prodId,
          unitPrice: tp,
          discPkr: Math.round(discPkr * 100) / 100,
        };
      })
    );
  };

  const handleCartonsChange = (rowId: string, val: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const c = Math.max(0, val);
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, c, r.boxes, r.loose, r.unitPrice);
        const discPkr = lineDiscountEnabled ? (gross * (r.discPercent / 100)) : 0;
        return {
          ...r,
          cartons: c,
          discPkr: Math.round(discPkr * 100) / 100,
        };
      })
    );
  };

  const handleBoxesChange = (rowId: string, val: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const b = Math.max(0, val);
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.cartons, b, r.loose, r.unitPrice);
        const discPkr = lineDiscountEnabled ? (gross * (r.discPercent / 100)) : 0;
        return {
          ...r,
          boxes: b,
          discPkr: Math.round(discPkr * 100) / 100,
        };
      })
    );
  };

  const handleLooseChange = (rowId: string, val: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const l = Math.max(0, val);
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.cartons, r.boxes, l, r.unitPrice);
        const discPkr = lineDiscountEnabled ? (gross * (r.discPercent / 100)) : 0;
        return {
          ...r,
          loose: l,
          discPkr: Math.round(discPkr * 100) / 100,
        };
      })
    );
  };

  const handleDiscPercentChange = (rowId: string, percent: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const p = Math.min(100, Math.max(0, percent));
        const prod = products.find((pr) => pr.id === r.productId);
        const gross = getRowGross(prod, r.cartons, r.boxes, r.loose, r.unitPrice);
        const pkr = (gross * p) / 100;
        return {
          ...r,
          discPercent: p,
          discPkr: Math.round(pkr * 100) / 100,
        };
      })
    );
  };

  const handleDiscPkrChange = (rowId: string, pkrVal: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const pkr = Math.max(0, pkrVal);
        const prod = products.find((pr) => pr.id === r.productId);
        const gross = getRowGross(prod, r.cartons, r.boxes, r.loose, r.unitPrice);
        const pct = gross > 0 ? (pkr / gross) * 100 : 0;
        return {
          ...r,
          discPkr: pkr,
          discPercent: Math.round(pct * 10) / 10,
        };
      })
    );
  };

  const handleSchemeBonusChange = (rowId: string, val: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, schemeBonus: Math.max(0, val) } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now()), productId: '', cartons: 1, boxes: 0, loose: 0, unitPrice: 0, discPercent: 0, discPkr: 0, schemeBonus: 0 },
    ]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Live Calculations
  let subtotal = 0;
  let totalLineDisc = 0;
  let totalBonusItems = 0;

  rows.forEach((r) => {
    const prod = products.find((p) => p.id === r.productId);
    const gross = getRowGross(prod, r.cartons, r.boxes, r.loose, r.unitPrice);
    const disc = lineDiscountEnabled ? r.discPkr : 0;
    subtotal += gross;
    totalLineDisc += disc;
    if (schemeBonusEnabled) totalBonusItems += r.schemeBonus;
  });

  const subtotalAfterLines = Math.max(0, subtotal - totalLineDisc);

  // Two-way Bill Discount
  const handleBillPercentChange = (val: number | '') => {
    setBillDiscPercent(val);
    if (val === '' || val === 0) {
      setBillDiscPkr('');
    } else {
      const pkr = (subtotalAfterLines * (Number(val) / 100));
      setBillDiscPkr(Math.round(pkr * 100) / 100);
    }
  };

  const handleBillPkrChange = (val: number | '') => {
    setBillDiscPkr(val);
    if (val === '' || val === 0) {
      setBillDiscPercent('');
    } else {
      const pct = subtotalAfterLines > 0 ? (Number(val) / subtotalAfterLines) * 100 : 0;
      setBillDiscPercent(Math.round(pct * 10) / 10);
    }
  };

  const billDiscount = billDiscountEnabled && typeof billDiscPkr === 'number' ? billDiscPkr : 0;
  const grandTotal = Math.max(0, subtotalAfterLines - billDiscount);

  // Spot Cash Calculation
  const actualCashReceived = spotCashEnabled && typeof cashReceived === 'number' ? Math.min(grandTotal, cashReceived) : 0;
  const remainingBalance = Math.max(0, grandTotal - actualCashReceived);

  // Quick Cash Chips
  const setFullCash = () => setCashReceived(grandTotal);
  const setHalfCash = () => setCashReceived(Math.round(grandTotal / 2));
  const setZeroCash = () => setCashReceived(0);

  // Submit Direct Sale
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setStatusMessage({ text: 'Please select a customer for this direct sale.', isError: true });
      return;
    }

    const validRows = rows.filter((r) => r.productId && (r.cartons > 0 || r.boxes > 0 || r.loose > 0));
    if (validRows.length === 0) {
      setStatusMessage({ text: 'Please add at least one product with valid quantities.', isError: true });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const payload = {
        customerId,
        routeId: routeId || undefined,
        salesmanId: salesmanEnabled && salesmanId ? salesmanId : undefined,
        supplyPersonId: supplyPersonEnabled && supplyPersonId ? supplyPersonId : undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        billDiscountPaisas: billDiscountEnabled ? Math.round(billDiscount * 100) : 0,
        cashReceivedPaisas: spotCashEnabled ? Math.round(actualCashReceived * 100) : 0,
        notes: notes || undefined,
        items: validRows.map((r) => ({
          productId: r.productId,
          cartonsCount: r.cartons,
          boxesCount: r.boxes,
          loosePiecesCount: r.loose,
          unitPricePaisas: Math.round(r.unitPrice * 100),
          discountPercent: lineDiscountEnabled ? r.discPercent : 0,
          discountPaisas: lineDiscountEnabled ? Math.round(r.discPkr * 100) : 0,
          schemeBonusBase: schemeBonusEnabled ? r.schemeBonus : 0,
        })),
      };

      const res = await fetch('/api/sales/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to process direct sale.');
      }

      setStatusMessage({
        text: `Invoice ${data.invoice.invoice_number} created with stock release & GL postings committed!`,
        isError: false,
      });

      // Show print preview modal
      setSavedInvoice(data.invoice);

      // RAPID RE-ENTRY:
      // 1. Keep Salesman, Supply Person, and Route intact.
      // 2. Clear customer, notes, discounts, cash input, and items.
      setCustomerId('');
      setNotes('');
      setBillDiscPercent('');
      setBillDiscPkr('');
      setCashReceived('');
      setRows([
        { id: String(Date.now()), productId: '', cartons: 1, boxes: 0, loose: 0, unitPrice: 0, discPercent: 0, discPkr: 0, schemeBonus: 0 },
      ]);

      // 3. Immediately focus customer dropdown for next entry
      setTimeout(() => {
        customerSelectRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error occurred.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!directSaleEnabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <ShieldAlert size={48} color="#f59e0b" style={{ margin: '0 auto 1.5rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '0.75rem' }}>
          Direct & Van Sale Workflow is Disabled
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 1.75rem' }}>
          The feature flag <code className="font-mono">sales.enable_direct_sale</code> is currently toggled OFF in system settings.
        </p>
        <Link href="/settings/features" className="btn btn-primary">
          Open Settings & Enable Workflow
        </Link>
      </div>
    );
  }

  const selectedCust = customers.find((c) => c.id === customerId);

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Van Sale
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/sales/order-booking" className="btn btn-outline btn-sm">
            Sale <ArrowRight size={14} style={{ marginLeft: '4px' }} />
          </Link>
          <Link href="/sales/collections" className="btn btn-outline btn-sm">
            Route Collections
          </Link>
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
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* STICKY SESSION BAR */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-heading)' }}>
              Van Dispatch Session
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSessionLocked(!sessionLocked)}
            className="btn btn-outline btn-sm"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            {sessionLocked ? (
              <>
                <Lock size={12} style={{ marginRight: '4px', color: 'var(--primary)' }} /> Session Locked
              </>
            ) : (
              <>
                <Unlock size={12} style={{ marginRight: '4px', color: '#d97706' }} /> Edit Session
              </>
            )}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* Route Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Delivery Route / Sector
            </label>
            <SearchableSelect
              options={routeOptions}
              value={routeId}
              onChange={(val) => setRouteId(val)}
              disabled={sessionLocked}
              placeholder="All Routes"
              className="w-full"
            />
          </div>

          {/* Salesman Selector */}
          {salesmanEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Sales Executive / Van Incharge
              </label>
              <SearchableSelect
                options={salesmanOptions}
                value={salesmanId}
                onChange={(val) => setSalesmanId(val)}
                disabled={sessionLocked}
                placeholder="Unassigned Salesman"
                className="w-full"
              />
            </div>
          )}

          {/* Supply Person Selector */}
          {supplyPersonEnabled && (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Delivery Driver / Supply Staff
              </label>
              <SearchableSelect
                options={supplyPersonOptions}
                value={supplyPersonId}
                onChange={(val) => setSupplyPersonId(val)}
                disabled={sessionLocked}
                placeholder="Unassigned Delivery Officer"
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit}>
        {/* Customer & Date */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.35rem' }}>
                Customer / Retailer *
              </label>
              <SearchableSelect
                options={customerOptions}
                value={customerId}
                onChange={(val) => setCustomerId(val)}
                placeholder="Select Retail Store / Client..."
                className="w-full"
              />

              {/* Customer Live Badge */}
              {selectedCust && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span className="badge badge-primary">Route: {selectedCust.route_name || 'Unassigned'}</span>
                  <span className="badge badge-muted tabular-nums">Credit Limit: {formatCurrency(selectedCust.credit_limit)}</span>
                  <span
                    className="badge tabular-nums"
                    style={{
                      color: selectedCust.live_balance > selectedCust.credit_limit ? '#ef4444' : 'var(--primary)',
                      background: selectedCust.live_balance > selectedCust.credit_limit ? 'rgba(239, 68, 68, 0.15)' : undefined,
                      fontWeight: 600,
                    }}
                  >
                    Outstanding: {formatCurrency(selectedCust.live_balance)}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Invoice Date
              </label>
              <input
                type="date"
                className="input tabular-nums"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Due Date
              </label>
              <input
                type="date"
                className="input tabular-nums"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Product Items Table */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-heading)' }}>Billed Merchandise Lines</h3>
            <button type="button" onClick={addRow} className="btn btn-outline btn-sm">
              <Plus size={14} style={{ marginRight: '4px' }} /> Add Row
            </button>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>Product</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Cartons</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Boxes</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Loose Pcs</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>TP / PCS</th>
                  {lineDiscountEnabled && (
                    <>
                      <th style={{ width: '100px', textAlign: 'right' }}>Disc %</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Disc Amount</th>
                    </>
                  )}
                  {schemeBonusEnabled && (
                    <th style={{ width: '100px', textAlign: 'right', color: '#10b981' }}>Bonus Pcs</th>
                  )}
                  <th style={{ width: '130px', textAlign: 'right' }}>Net Line</th>
                  <th style={{ width: '45px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const prod = products.find((p) => p.id === row.productId);
                  const gross = getRowGross(prod, row.cartons, row.boxes, row.loose, row.unitPrice);
                  const lineNet = Math.max(0, gross - (lineDiscountEnabled ? row.discPkr : 0));

                  return (
                    <tr key={row.id}>
                      <td>
                        <SearchableSelect
                          options={productOptions}
                          value={row.productId}
                          onChange={(val) => handleProductChange(row.id, val)}
                          placeholder="Select SKU..."
                          className="w-full min-w-[240px]"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="input tabular-nums text-right"
                          value={row.cartons}
                          onChange={(e) => handleCartonsChange(row.id, Number(e.target.value))}
                          style={{ padding: '0.4rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="input tabular-nums text-right"
                          value={row.boxes}
                          onChange={(e) => handleBoxesChange(row.id, Number(e.target.value))}
                          style={{ padding: '0.4rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="input tabular-nums text-right"
                          value={row.loose}
                          onChange={(e) => handleLooseChange(row.id, Number(e.target.value))}
                          style={{ padding: '0.4rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="input tabular-nums text-right"
                          value={row.unitPrice}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, unitPrice: val } : r))
                            );
                          }}
                          style={{ padding: '0.4rem' }}
                        />
                      </td>
                      {lineDiscountEnabled && (
                        <>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="0%"
                              className="input tabular-nums text-right"
                              value={row.discPercent || ''}
                              onChange={(e) => handleDiscPercentChange(row.id, Number(e.target.value))}
                              style={{ padding: '0.4rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              className="input tabular-nums text-right"
                              value={row.discPkr || ''}
                              onChange={(e) => handleDiscPkrChange(row.id, Number(e.target.value))}
                              style={{ padding: '0.4rem' }}
                            />
                          </td>
                        </>
                      )}
                      {schemeBonusEnabled && (
                        <td>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            className="input tabular-nums text-right"
                            value={row.schemeBonus || ''}
                            onChange={(e) => handleSchemeBonusChange(row.id, Number(e.target.value))}
                            style={{ padding: '0.4rem', borderColor: 'rgba(52, 211, 153, 0.4)' }}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-heading)' }} className="tabular-nums">
                        {formatCurrency(lineNet)}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: rows.length === 1 ? 'var(--text-muted)' : '#ef4444',
                            cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary, Spot Cash, and Billing Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Invoice Notes & Memo
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder="e.g. Counter spot delivery, cash collected at shop..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />

            {/* SPOT CASH RECOVERY SECTION */}
            {spotCashEnabled && (
              <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <DollarSign size={16} color="#34d399" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
                      Spot Cash Recovery
                    </span>
                  </div>

                  {/* Quick Chips */}
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={setFullCash}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                    >
                      100% Cash
                    </button>
                    <button
                      type="button"
                      onClick={setHalfCash}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                    >
                      50% Split
                    </button>
                    <button
                      type="button"
                      onClick={setZeroCash}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                    >
                      Full Credit
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Cash Received On Spot
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={grandTotal}
                      step="0.01"
                      placeholder="0.00"
                      className="input tabular-nums text-right"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ borderColor: 'rgba(52, 211, 153, 0.5)' }}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Posts to Dr. 1010 Cash
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Remaining Balance Due (AR)
                    </label>
                    <div
                      className="input tabular-nums font-bold"
                      style={{
                        background: 'var(--bg-panel)',
                        color: remainingBalance > 0 ? 'var(--primary)' : 'var(--success)',
                        textAlign: 'right',
                      }}
                    >
                      {formatCurrency(remainingBalance)}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Customer balance carried forward
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary Card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Gross Subtotal:</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
            </div>

            {lineDiscountEnabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#f87171' }}>
                <span>Line Discounts:</span>
                <span className="tabular-nums font-semibold">- {formatCurrency(totalLineDisc)}</span>
              </div>
            )}

            {billDiscountEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bill Discount:</span>
                <div style={{ display: 'flex', gap: '0.4rem', width: '180px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="%"
                    className="input tabular-nums text-right"
                    value={billDiscPercent}
                    onChange={(e) => handleBillPercentChange(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ padding: '0.35rem', fontSize: '0.8rem' }}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="input tabular-nums text-right"
                    value={billDiscPkr}
                    onChange={(e) => handleBillPkrChange(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ padding: '0.35rem', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
            )}

            {schemeBonusEnabled && totalBonusItems > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#10b981' }}>
                <span>Free Scheme Bonus:</span>
                <span className="tabular-nums font-semibold">{formatInteger(totalBonusItems)} Units ({formatCurrency(0)})</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                marginTop: '0.75rem',
                fontSize: '1.25rem',
                fontWeight: 900,
                color: 'var(--primary)',
              }}
            >
              <span>Grand Total:</span>
              <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
            </div>

            {spotCashEnabled && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-subtle)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Cash Paid Now:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(actualCashReceived)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)', marginTop: '0.25rem' }}>
                  <span>Carried on Credit:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(remainingBalance)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
            >
              <TrendingUp size={18} style={{ marginRight: '6px' }} />
              {submitting ? 'Generating Invoice...' : 'Generate & Print Invoice'}
            </button>
          </div>
        </div>
      </form>

      {/* Print / Preview Modal */}
      {savedInvoice && (
        <PrintInvoiceModal
          data={savedInvoice}
          type="INVOICE"
          defaultFormat={defaultPrintFormat}
          onClose={() => setSavedInvoice(null)}
        />
      )}
    </div>
  );
}
