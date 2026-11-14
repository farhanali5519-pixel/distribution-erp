'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { NumericValue } from '@/shared/components/NumericValue';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import PrintInvoiceModal from '@/modules/sales/components/PrintInvoiceModal';
import { 
  ClipboardList, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Search,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  Filter,
  RotateCcw
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
  pieces: number | '';
  unitPrice: number; // Trade price per piece (TP / PCS)
  discPercent: number | '';
  discPkr: number | '';
  taxPercent: number | '';
  taxPkr: number | '';
  schemeBonus: number | '';
}

const createEmptyEntryRow = (): RowItem => ({
  id: 'entry',
  productId: '',
  pieces: 1,
  unitPrice: 0,
  discPercent: '',
  discPkr: '',
  taxPercent: '',
  taxPkr: '',
  schemeBonus: '',
});

// Helper to compute row gross amount in PKR based on pieces entered
// Trade price is strictly per base piece (TP / PCS)
const getRowGross = (prod?: ProductOption, pieces: number | '' = 0, unitPrice = 0) => {
  if (!prod) return 0;
  const totalPcs = typeof pieces === 'number' ? Math.max(0, pieces) : 0;
  return unitPrice * totalPcs;
};

// Pure calculation following: Gross - Discount = Net Before Tax + Tax = Net Line Total
const calculateLineFinancials = (
  prod?: ProductOption,
  pieces: number | '' = 0,
  unitPrice = 0,
  discPkr: number | '' = 0,
  discPercent: number | '' = 0,
  taxPkr: number | '' = 0,
  taxPercent: number | '' = 0
) => {
  const gross = getRowGross(prod, pieces, unitPrice);
  const discount = typeof discPkr === 'number' ? Math.max(0, discPkr) : 0;
  const netBeforeTax = Math.max(0, gross - discount);

  let taxAmount = 0;
  let computedTaxPct = typeof taxPercent === 'number' ? Math.max(0, taxPercent) : 0;

  if (typeof taxPkr === 'number' && taxPkr > 0) {
    taxAmount = taxPkr;
    computedTaxPct = netBeforeTax > 0 ? (taxAmount / netBeforeTax) * 100 : 0;
  } else if (typeof taxPercent === 'number' && taxPercent > 0) {
    taxAmount = (netBeforeTax * taxPercent) / 100;
  }

  const netLineTotal = netBeforeTax + taxAmount;

  return {
    gross,
    discount,
    netBeforeTax,
    taxAmount: Math.round(taxAmount * 100) / 100,
    taxPercent: Math.round(computedTaxPct * 10) / 10,
    netLineTotal: Math.round(netLineTotal * 100) / 100,
  };
};

export default function OrderBookingPage() {
  const { isEnabled, getValue } = useFeatureFlags();

  // Feature Flag Toggles
  const orderBookingEnabled = isEnabled('sales.enable_order_booking', true);
  const salesmanEnabled = isEnabled('sales.enable_salesman_tracking', true);
  const supplyPersonEnabled = isEnabled('sales.enable_supply_person_tracking', true);
  const lineDiscountEnabled = isEnabled('sales.enable_line_discount', true);
  const billDiscountEnabled = isEnabled('sales.enable_bill_discount', true);
  const schemeBonusEnabled = isEnabled('sales.enable_scheme_bonus', true);
  const spotCashEnabled = isEnabled('sales.enable_spot_cash_collection', true);
  const defaultPrintFormat = (getValue('sales.default_print_format') || 'THERMAL') as 'THERMAL' | 'A4';
  const [activePrintFormat, setActivePrintFormat] = useState<'THERMAL' | 'A4'>(defaultPrintFormat);
  const [printModalOpen, setPrintModalOpen] = useState(false);

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

  // Order Header State
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Active Entry Row (pinned at top) + Finalized Completed Rows (move underneath)
  const [entryRow, setEntryRow] = useState<RowItem>(createEmptyEntryRow());
  const [completedRows, setCompletedRows] = useState<RowItem[]>([]);
  const [productError, setProductError] = useState<string | null>(null);

  // Bill Discount State
  const [billDiscPercent, setBillDiscPercent] = useState<number | ''>('');
  const [billDiscPkr, setBillDiscPkr] = useState<number | ''>('');
  const [cashReceived, setCashReceived] = useState<number | ''>('');

  // UI / Submission state
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [savedOrder, setSavedOrder] = useState<any | null>(null);

  const submitRef = useRef<() => void>(() => {});

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

        // Pre-select first options if available
        if (rData.success && rData.routes.length > 0) setRouteId(rData.routes[0].id);
        if (sData.success && sData.staff.length > 0) {
          const sm = sData.staff.find((s: any) => s.role === 'SALESMAN' || s.role === 'BOTH');
          const sp = sData.staff.find((s: any) => s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER');
          if (sm) setSalesmanId(sm.id);
          if (sp) setSupplyPersonId(sp.id);
        }
      } catch (err) {
        console.error('Error fetching order booking data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter customers by selected route if route is chosen
  const filteredCustomers = routeId
    ? customers.filter((c) => !c.route_id || c.route_id === routeId)
    : customers;

  // Searchable combobox options
  const customerOptions = useMemo(() => {
    return filteredCustomers.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: `${c.shop_name ? `${c.shop_name} • ` : ''}Bal: ${formatCurrency(c.live_balance)}`,
      keywords: [c.shop_name || '', c.phone || '', c.route_name || ''],
    }));
  }, [filteredCustomers]);

  const productOptions = useMemo(() => {
    return products.map((p) => {
      const bpc = Math.max(1, p.boxes_per_carton || 1);
      const ppb = Math.max(1, p.pieces_per_box || 1);
      const ppc = Math.max(1, p.total_pieces_per_carton || (bpc * ppb) || p.bulk_conversion_factor || 1);
      return {
        value: p.id,
        label: p.name,
        subLabel: `${p.brand_name ? `[${p.brand_name}] • ` : ''}${ppc} pcs/CTN • ${ppb} pcs/BOX • TP: ${formatCurrency(p.trade_price)} • Stock: ${formatInteger(p.current_stock_base)} PCS`,
        badge: p.sku,
        badgeColor: 'emerald' as const,
        keywords: [p.sku, p.name, p.brand_name || '', String(p.trade_price || '')],
      };
    });
  }, [products]);

  const routeOptions = useMemo(() => {
    return routes.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'slate' as const,
      keywords: [r.code],
    }));
  }, [routes]);

  const salesmanOptions = useMemo(() => {
    return staff
      .filter((s) => s.role === 'SALESMAN' || s.role === 'BOTH')
      .map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.employee_code,
        badgeColor: 'blue' as const,
        keywords: [s.employee_code || ''],
      }));
  }, [staff]);

  const supplyPersonOptions = useMemo(() => {
    return staff
      .filter((s) => s.role === 'SUPPLY_PERSON' || s.role === 'DRIVER' || s.role === 'BOTH')
      .map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.employee_code,
        badgeColor: 'indigo' as const,
        keywords: [s.employee_code || ''],
      }));
  }, [staff]);

  // Keyboard navigation & focus helpers
  const focusCustomerSelect = () => {
    const doFocus = () => {
      const el = document.getElementById('customer-select') as HTMLButtonElement | null;
      if (el) {
        el.focus();
      }
    };
    requestAnimationFrame(doFocus);
    setTimeout(doFocus, 50);
  };

  const focusPcsInput = (rowId: string) => {
    const doFocus = () => {
      const el = document.getElementById(`pcs-input-${rowId}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    };
    requestAnimationFrame(doFocus);
    setTimeout(doFocus, 50);
  };

  const focusProductSelect = (rowId: string) => {
    const doFocus = () => {
      const el = document.getElementById(`product-select-${rowId}`) as HTMLButtonElement | null;
      if (el) {
        el.focus();
      }
    };
    requestAnimationFrame(doFocus);
    setTimeout(doFocus, 50);
  };

  // 1. NEW BILL START: Autofocus Customer selector on initial load or new bill start
  useEffect(() => {
    if (!loading && orderBookingEnabled) {
      focusCustomerSelect();
    }
  }, [loading, orderBookingEnabled]);

  const handleNewBill = () => {
    setCustomerId('');
    setNotes('');
    setBillDiscPercent('');
    setBillDiscPkr('');
    setCashReceived('');
    setCompletedRows([]);
    setEntryRow(createEmptyEntryRow());
    setProductError(null);
    setStatusMessage(null);
    focusCustomerSelect();
  };

  // Keep latest submit handler for keyboard shortcuts
  useEffect(() => {
    submitRef.current = () => {
      handleSubmit();
    };
  });

  // Global CTRL + S shortcut for instant order posting
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); // Prevent browser's Save Page dialog
        if (submitting) return; // Prevent duplicate rapid submission
        submitRef.current();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [submitting]);

  // =========================================================================
  // TOP ACTIVE ENTRY ROW HANDLERS
  // =========================================================================
  const handleEntryProductChange = (prodId: string) => {
    if (!prodId) {
      setEntryRow(createEmptyEntryRow());
      return;
    }
    const prod = products.find((p) => p.id === prodId);
    const tp = prod ? prod.trade_price : 0;
    const pcs = typeof entryRow.pieces === 'number' && entryRow.pieces > 0 ? entryRow.pieces : 1;
    const gross = getRowGross(prod, pcs, tp);
    const discPct = typeof entryRow.discPercent === 'number' ? entryRow.discPercent : 0;
    const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof entryRow.discPkr === 'number' ? entryRow.discPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);

    setEntryRow((prev) => ({
      ...prev,
      productId: prodId,
      pieces: pcs,
      unitPrice: tp,
      discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
      taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
    }));
    setProductError(null);
  };

  const handleEntryPiecesChange = (val: number | '') => {
    const pcs = val === '' ? '' : Math.max(0, val);
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, pcs, entryRow.unitPrice);
    const discPct = typeof entryRow.discPercent === 'number' ? entryRow.discPercent : 0;
    const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof entryRow.discPkr === 'number' ? entryRow.discPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);

    setEntryRow((prev) => ({
      ...prev,
      pieces: pcs,
      discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
      taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
    }));
  };

  const handleEntryUnitPriceChange = (val: number | '') => {
    const price = val === '' ? 0 : Math.max(0, val);
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, entryRow.pieces, price);
    const discPct = typeof entryRow.discPercent === 'number' ? entryRow.discPercent : 0;
    const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof entryRow.discPkr === 'number' ? entryRow.discPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);

    setEntryRow((prev) => ({
      ...prev,
      unitPrice: price,
      discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
      taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
    }));
  };

  const handleEntryDiscPercentChange = (val: number | '') => {
    if (val === '' || val === 0) {
      const prod = products.find((p) => p.id === entryRow.productId);
      const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
      const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
      const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);
      setEntryRow((prev) => ({ ...prev, discPercent: '', discPkr: '', taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '' }));
      return;
    }
    const pct = Math.min(100, Math.max(0, Number(val)));
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
    const discPkr = (gross * pct) / 100;
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);
    setEntryRow((prev) => ({
      ...prev,
      discPercent: pct,
      discPkr: Math.round(discPkr * 100) / 100,
      taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
    }));
  };

  const handleEntryDiscPkrChange = (val: number | '') => {
    if (val === '' || val === 0) {
      const prod = products.find((p) => p.id === entryRow.productId);
      const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
      const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
      const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);
      setEntryRow((prev) => ({ ...prev, discPkr: '', discPercent: '', taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '' }));
      return;
    }
    const pkr = Math.max(0, Number(val));
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
    const pct = gross > 0 ? (pkr / gross) * 100 : 0;
    const netBeforeTax = Math.max(0, gross - pkr);
    const taxPct = typeof entryRow.taxPercent === 'number' ? entryRow.taxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryRow.taxPkr === 'number' ? entryRow.taxPkr : 0);
    setEntryRow((prev) => ({
      ...prev,
      discPkr: pkr,
      discPercent: Math.round(pct * 10) / 10,
      taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
    }));
  };

  const handleEntryTaxPercentChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryRow((prev) => ({ ...prev, taxPercent: '', taxPkr: '' }));
      return;
    }
    const pct = Math.min(100, Math.max(0, Number(val)));
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
    const disc = lineDiscountEnabled && typeof entryRow.discPkr === 'number' ? entryRow.discPkr : 0;
    const netBeforeTax = Math.max(0, gross - disc);
    const taxPkr = (netBeforeTax * pct) / 100;
    setEntryRow((prev) => ({ ...prev, taxPercent: pct, taxPkr: Math.round(taxPkr * 100) / 100 }));
  };

  const handleEntryTaxPkrChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryRow((prev) => ({ ...prev, taxPkr: '', taxPercent: '' }));
      return;
    }
    const pkr = Math.max(0, Number(val));
    const prod = products.find((p) => p.id === entryRow.productId);
    const gross = getRowGross(prod, entryRow.pieces, entryRow.unitPrice);
    const disc = lineDiscountEnabled && typeof entryRow.discPkr === 'number' ? entryRow.discPkr : 0;
    const netBeforeTax = Math.max(0, gross - disc);
    const pct = netBeforeTax > 0 ? (pkr / netBeforeTax) * 100 : 0;
    setEntryRow((prev) => ({ ...prev, taxPkr: pkr, taxPercent: Math.round(pct * 10) / 10 }));
  };

  const handleEntrySchemeBonusChange = (val: number | '') => {
    setEntryRow((prev) => ({ ...prev, schemeBonus: val === '' ? '' : Math.max(0, Number(val)) }));
  };

  const finalizeEntryRow = () => {
    if (!entryRow.productId) {
      setProductError('Select a product first');
      focusProductSelect('entry');
      return;
    }
    if (typeof entryRow.pieces !== 'number' || entryRow.pieces <= 0) {
      focusPcsInput('entry');
      return;
    }

    const newItem: RowItem = {
      ...entryRow,
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    setCompletedRows((prev) => [...prev, newItem]);
    setEntryRow(createEmptyEntryRow());
    setProductError(null);

    requestAnimationFrame(() => {
      focusProductSelect('entry');
    });
  };

  // =========================================================================
  // COMPLETED ROWS HANDLERS (Rendered below the active entry row)
  // =========================================================================
  const handleCompletedRowProductChange = (rowId: string, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const tp = prod ? prod.trade_price : 0;
        const pcs = typeof r.pieces === 'number' && r.pieces > 0 ? r.pieces : 1;
        const gross = getRowGross(prod, pcs, tp);
        const discPct = typeof r.discPercent === 'number' ? r.discPercent : 0;
        const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof r.discPkr === 'number' ? r.discPkr : 0);
        const netBeforeTax = Math.max(0, gross - discPkr);
        const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
        const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
        return {
          ...r,
          productId: prodId,
          pieces: pcs,
          unitPrice: tp,
          discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
          taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
        };
      })
    );
  };

  const handleCompletedRowPiecesChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const pcs = val === '' ? '' : Math.max(0, val);
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, pcs, r.unitPrice);
        const discPct = typeof r.discPercent === 'number' ? r.discPercent : 0;
        const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof r.discPkr === 'number' ? r.discPkr : 0);
        const netBeforeTax = Math.max(0, gross - discPkr);
        const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
        const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
        return {
          ...r,
          pieces: pcs,
          discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
          taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
        };
      })
    );
  };

  const handleCompletedRowUnitPriceChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const price = val === '' ? 0 : Math.max(0, val);
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.pieces, price);
        const discPct = typeof r.discPercent === 'number' ? r.discPercent : 0;
        const discPkr = lineDiscountEnabled && discPct > 0 ? (gross * discPct) / 100 : (typeof r.discPkr === 'number' ? r.discPkr : 0);
        const netBeforeTax = Math.max(0, gross - discPkr);
        const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
        const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
        return {
          ...r,
          unitPrice: price,
          discPkr: discPkr > 0 ? Math.round(discPkr * 100) / 100 : '',
          taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
        };
      })
    );
  };

  const handleCompletedRowDiscPercentChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (val === '' || val === 0) {
          const prod = products.find((p) => p.id === r.productId);
          const gross = getRowGross(prod, r.pieces, r.unitPrice);
          const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
          const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
          return { ...r, discPercent: '', discPkr: '', taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '' };
        }
        const pct = Math.min(100, Math.max(0, Number(val)));
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.pieces, r.unitPrice);
        const discPkr = (gross * pct) / 100;
        const netBeforeTax = Math.max(0, gross - discPkr);
        const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
        const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
        return {
          ...r,
          discPercent: pct,
          discPkr: Math.round(discPkr * 100) / 100,
          taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
        };
      })
    );
  };

  const handleCompletedRowDiscPkrChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (val === '' || val === 0) {
          const prod = products.find((p) => p.id === r.productId);
          const gross = getRowGross(prod, r.pieces, r.unitPrice);
          const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
          const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
          return { ...r, discPkr: '', discPercent: '', taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '' };
        }
        const pkr = Math.max(0, Number(val));
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.pieces, r.unitPrice);
        const pct = gross > 0 ? (pkr / gross) * 100 : 0;
        const netBeforeTax = Math.max(0, gross - pkr);
        const taxPct = typeof r.taxPercent === 'number' ? r.taxPercent : 0;
        const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof r.taxPkr === 'number' ? r.taxPkr : 0);
        return {
          ...r,
          discPkr: pkr,
          discPercent: Math.round(pct * 10) / 10,
          taxPkr: taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '',
        };
      })
    );
  };

  const handleCompletedRowTaxPercentChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (val === '' || val === 0) {
          return { ...r, taxPercent: '', taxPkr: '' };
        }
        const pct = Math.min(100, Math.max(0, Number(val)));
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.pieces, r.unitPrice);
        const disc = lineDiscountEnabled && typeof r.discPkr === 'number' ? r.discPkr : 0;
        const netBeforeTax = Math.max(0, gross - disc);
        const taxPkr = (netBeforeTax * pct) / 100;
        return { ...r, taxPercent: pct, taxPkr: Math.round(taxPkr * 100) / 100 };
      })
    );
  };

  const handleCompletedRowTaxPkrChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (val === '' || val === 0) {
          return { ...r, taxPkr: '', taxPercent: '' };
        }
        const pkr = Math.max(0, Number(val));
        const prod = products.find((p) => p.id === r.productId);
        const gross = getRowGross(prod, r.pieces, r.unitPrice);
        const disc = lineDiscountEnabled && typeof r.discPkr === 'number' ? r.discPkr : 0;
        const netBeforeTax = Math.max(0, gross - disc);
        const pct = netBeforeTax > 0 ? (pkr / netBeforeTax) * 100 : 0;
        return { ...r, taxPkr: pkr, taxPercent: Math.round(pct * 10) / 10 };
      })
    );
  };

  const handleCompletedRowSchemeBonusChange = (rowId: string, val: number | '') => {
    setCompletedRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, schemeBonus: val === '' ? '' : Math.max(0, Number(val)) } : r))
    );
  };

  const removeCompletedRow = (rowId: string) => {
    setCompletedRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // =========================================================================
  // FINANCIAL TOTALS CALCULATION
  // =========================================================================
  let grossSubtotal = 0;
  let totalLineDiscounts = 0;
  let totalTaxAmount = 0;
  let totalBonusPcs = 0;

  // Completed rows
  completedRows.forEach((r) => {
    const prod = products.find((p) => p.id === r.productId);
    const fin = calculateLineFinancials(
      prod,
      r.pieces,
      r.unitPrice,
      lineDiscountEnabled ? r.discPkr : 0,
      lineDiscountEnabled ? r.discPercent : 0,
      r.taxPkr,
      r.taxPercent
    );
    grossSubtotal += fin.gross;
    totalLineDiscounts += fin.discount;
    totalTaxAmount += fin.taxAmount;
    if (schemeBonusEnabled && typeof r.schemeBonus === 'number') totalBonusPcs += r.schemeBonus;
  });

  // Include in-progress entry row in live financial preview if product is picked and pieces > 0
  if (entryRow.productId && typeof entryRow.pieces === 'number' && entryRow.pieces > 0) {
    const prod = products.find((p) => p.id === entryRow.productId);
    const fin = calculateLineFinancials(
      prod,
      entryRow.pieces,
      entryRow.unitPrice,
      lineDiscountEnabled ? entryRow.discPkr : 0,
      lineDiscountEnabled ? entryRow.discPercent : 0,
      entryRow.taxPkr,
      entryRow.taxPercent
    );
    grossSubtotal += fin.gross;
    totalLineDiscounts += fin.discount;
    totalTaxAmount += fin.taxAmount;
    if (schemeBonusEnabled && typeof entryRow.schemeBonus === 'number') totalBonusPcs += entryRow.schemeBonus;
  }

  const netBeforeBillDiscount = Math.max(0, grossSubtotal - totalLineDiscounts);

  // Two-way Bill Discount
  const handleBillPercentChange = (val: number | '') => {
    setBillDiscPercent(val);
    if (val === '' || val === 0) {
      setBillDiscPkr('');
    } else {
      const pkr = netBeforeBillDiscount * (Number(val) / 100);
      setBillDiscPkr(Math.round(pkr * 100) / 100);
    }
  };

  const handleBillPkrChange = (val: number | '') => {
    setBillDiscPkr(val);
    if (val === '' || val === 0) {
      setBillDiscPercent('');
    } else {
      const pct = netBeforeBillDiscount > 0 ? (Number(val) / netBeforeBillDiscount) * 100 : 0;
      setBillDiscPercent(Math.round(pct * 10) / 10);
    }
  };

  const billDiscount = billDiscountEnabled && typeof billDiscPkr === 'number' ? billDiscPkr : 0;
  const netBeforeTax = Math.max(0, netBeforeBillDiscount - billDiscount);
  const grandTotal = netBeforeTax + totalTaxAmount;
  const cashAmount = spotCashEnabled && typeof cashReceived === 'number' ? cashReceived : 0;
  const remainingDue = Math.max(0, grandTotal - cashAmount);

  // Order Submission with RAPID RE-ENTRY autofocus (supports Form submit and Ctrl+S)
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submitting) return;

    if (!customerId) {
      setStatusMessage({ text: 'Please select a customer for this order.', isError: true });
      return;
    }

    // Collect all valid rows: completed rows + entry row if populated
    const rowsToSubmit: RowItem[] = [...completedRows];
    if (entryRow.productId && typeof entryRow.pieces === 'number' && entryRow.pieces > 0) {
      rowsToSubmit.push(entryRow);
    }

    if (rowsToSubmit.length === 0) {
      setStatusMessage({ text: 'Please add at least one product with valid quantities (PCS > 0).', isError: true });
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
        orderDate,
        billDiscountPaisas: billDiscountEnabled ? Math.round(billDiscount * 100) : 0,
        cashReceivedPaisas: spotCashEnabled ? Math.round(cashAmount * 100) : 0,
        notes: notes || undefined,
        items: rowsToSubmit.map((r) => {
          const prod = products.find((p) => p.id === r.productId);
          const bpc = Math.max(1, prod?.boxes_per_carton || 1);
          const ppb = Math.max(1, prod?.pieces_per_box || 1);
          const ppc = Math.max(1, prod?.total_pieces_per_carton || (bpc * ppb) || prod?.bulk_conversion_factor || 1);
          const qtyBase = Number(r.pieces) || 0;
          const ctn = Math.floor(qtyBase / ppc);
          const box = Math.floor((qtyBase % ppc) / ppb);
          const loose = (qtyBase % ppc) % ppb;

          const fin = calculateLineFinancials(
            prod,
            r.pieces,
            r.unitPrice,
            lineDiscountEnabled ? r.discPkr : 0,
            lineDiscountEnabled ? r.discPercent : 0,
            r.taxPkr,
            r.taxPercent
          );

          return {
            productId: r.productId,
            quantityBase: qtyBase,
            cartonsCount: ctn,
            boxesCount: box,
            loosePiecesCount: loose,
            unitPricePaisas: Math.round((r.unitPrice || 0) * 100),
            discountPercent: fin.discount > 0 && typeof r.discPercent === 'number' ? r.discPercent : 0,
            discountPaisas: Math.round(fin.discount * 100),
            taxPercent: fin.taxPercent,
            taxPaisas: Math.round(fin.taxAmount * 100),
            schemeBonusBase: schemeBonusEnabled && typeof r.schemeBonus === 'number' ? r.schemeBonus : 0,
          };
        }),
      };

      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to post sale bill.');
      }

      setStatusMessage({
        text: `Sale Bill ${data.order.order_number} posted! Inventory relieved and GL balanced. Ready for next entry.`,
        isError: false,
      });

      // Show print preview
      setSavedOrder(data.order);

      // RAPID RE-ENTRY RESET:
      // 1. Keep Salesman, Supply Person, Route intact.
      // 2. Clear customer, notes, bill discount, cash, and items.
      setCustomerId('');
      setNotes('');
      setBillDiscPercent('');
      setBillDiscPkr('');
      setCashReceived('');
      setCompletedRows([]);
      setEntryRow(createEmptyEntryRow());
      setProductError(null);

      // 3. Immediately focus customer dropdown for mouse-free continuous billing
      focusCustomerSelect();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error occurred.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // If Feature is Disabled
  if (!orderBookingEnabled) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <ShieldAlert size={48} color="#f59e0b" style={{ margin: '0 auto 1.5rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '0.75rem' }}>
          Field Order Booking Workflow is Disabled
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 1.75rem' }}>
          The feature flag <code className="font-mono">sales.enable_order_booking</code> is currently toggled OFF in system settings.
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
            Sale
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleNewBill}
            className="btn btn-outline btn-sm"
            title="Reset for a new bill"
          >
            <RotateCcw size={14} style={{ marginRight: '4px' }} /> New Bill
          </button>
          <Link href="/dispatch/load-sheet" className="btn btn-outline btn-sm">
            Load Sheet <ArrowRight size={14} style={{ marginLeft: '4px' }} />
          </Link>
          <Link href="/sales" className="btn btn-outline btn-sm">
            Bills & Orders List
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
            justifyContent: 'space-between',
            gap: '0.6rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{statusMessage.text}</span>
          </div>

          {!statusMessage.isError && savedOrder && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setActivePrintFormat('THERMAL');
                  setPrintModalOpen(true);
                }}
                className="btn btn-primary btn-sm"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                <Printer size={13} style={{ marginRight: '4px' }} /> Print Thermal 80mm
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePrintFormat('A4');
                  setPrintModalOpen(true);
                }}
                className="btn btn-outline btn-sm"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                <Printer size={13} style={{ marginRight: '4px' }} /> Print Standard A4
              </button>
            </div>
          )}
        </div>
      )}

      {/* STICKY SESSION BAR (Salesman, Supply Person, Route) */}
      <div className="filter-section-card p-4 space-y-3.5 mb-6">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Sale Details
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSessionLocked(!sessionLocked)}
            className="btn btn-outline btn-sm"
            style={{
              fontSize: '0.75rem',
              padding: '0.35rem 0.75rem',
              color: sessionLocked ? 'var(--primary)' : '#d97706',
              borderColor: sessionLocked ? 'var(--border-strong)' : '#fde68a',
            }}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Route Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Delivery Route
            </label>
            <SearchableSelect
              value={routeId}
              onChange={setRouteId}
              options={routeOptions}
              clearLabel="All Routes"
              placeholder="All Routes"
              searchPlaceholder="Search route name or code..."
              disabled={sessionLocked}
              size="sm"
            />
          </div>

          {/* Salesman Selector (Conditional Flag) */}
          {salesmanEnabled && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Sales Executive (Booking)
              </label>
              <SearchableSelect
                value={salesmanId}
                onChange={setSalesmanId}
                options={salesmanOptions}
                clearLabel="Unassigned Salesman"
                placeholder="Unassigned Salesman"
                searchPlaceholder="Search salesman..."
                disabled={sessionLocked}
                size="sm"
              />
            </div>
          )}

          {/* Supply Person Selector (Conditional Flag) */}
          {supplyPersonEnabled && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Delivery / Supply Officer
              </label>
              <SearchableSelect
                value={supplyPersonId}
                onChange={setSupplyPersonId}
                options={supplyPersonOptions}
                clearLabel="Unassigned Delivery"
                placeholder="Unassigned Delivery"
                searchPlaceholder="Search delivery staff..."
                disabled={sessionLocked}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Order Booking Form */}
      <form onSubmit={handleSubmit}>
        {/* Customer & Order Dates Card */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Select Customer & Outlet *
              </label>
              <SearchableSelect
                id="customer-select"
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="Select Retail Store / Customer..."
                searchPlaceholder="Search customer name, shop, phone..."
                onEnterNext={() => focusProductSelect('entry')}
                onTabNext={() => focusProductSelect('entry')}
                requireSelectionBeforeTab={true}
                required
              />

              {/* Customer Live Badge */}
              {selectedCust && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span className="badge badge-primary">Route: {selectedCust.route_name || 'Unassigned'}</span>
                  <span className="badge badge-muted tabular-nums">Credit Limit: {formatCurrency(selectedCust.credit_limit)}</span>
                  <span
                    className="badge tabular-nums"
                    style={{
                      color: selectedCust.live_balance > selectedCust.credit_limit ? '#b91c1c' : '#0369a1',
                      background: selectedCust.live_balance > selectedCust.credit_limit ? '#fee2e2' : '#e0f2fe',
                      border: `1px solid ${selectedCust.live_balance > selectedCust.credit_limit ? '#fca5a5' : '#bae6fd'}`,
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
                Booking Date
              </label>
              <input
                type="date"
                className="input tabular-nums"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* Item Rows Table */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-heading)' }}>Order Line Items</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Active blank row is pinned at top. Fill fields and press Enter or Tab on Bonus (or click +) to add below.
              </p>
            </div>
            {completedRows.length > 0 && (
              <span className="badge badge-primary tabular-nums">
                {completedRows.length} item{completedRows.length > 1 ? 's' : ''} added
              </span>
            )}
          </div>

          <div className="table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.75rem' }}>
            <table className="table" style={{ width: '100%', minWidth: '1320px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '0' }}>
              <colgroup>
                <col style={{ width: '450px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '115px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '105px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '40px' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ width: '450px', textAlign: 'left', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Product / SKU</th>
                  <th style={{ width: '105px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quantity PCS</th>
                  <th style={{ width: '115px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TP / PCS</th>
                  <th style={{ width: '90px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Disc %</th>
                  <th style={{ width: '105px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Disc Amount</th>
                  <th style={{ width: '90px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tax %</th>
                  <th style={{ width: '105px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tax Amount</th>
                  <th style={{ width: '100px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bonus PCS</th>
                  <th style={{ width: '120px', textAlign: 'right', padding: '0.65rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Net Line</th>
                  <th style={{ width: '40px', textAlign: 'center', padding: '0.65rem 0.5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {/* 1. PINNED ACTIVE ENTRY ROW (TOP) */}
                {(() => {
                  const entryProd = products.find((p) => p.id === entryRow.productId);
                  const bpc = Math.max(1, entryProd?.boxes_per_carton || 1);
                  const ppb = Math.max(1, entryProd?.pieces_per_box || 1);
                  const ppc = Math.max(1, entryProd?.total_pieces_per_carton || (bpc * ppb) || entryProd?.bulk_conversion_factor || 1);
                  const entryFin = calculateLineFinancials(
                    entryProd,
                    entryRow.pieces,
                    entryRow.unitPrice,
                    entryRow.discPkr,
                    entryRow.discPercent,
                    entryRow.taxPkr,
                    entryRow.taxPercent
                  );

                  return (
                    <tr
                      style={{
                        background: 'rgba(239, 246, 255, 0.75)',
                        borderBottom: '2px solid rgba(59, 130, 246, 0.4)',
                      }}
                      className="dark:bg-blue-950/25"
                    >
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', width: '450px', maxWidth: '450px', overflow: 'hidden' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', width: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                          <SearchableSelect
                            id="product-select-entry"
                            value={entryRow.productId}
                            onChange={handleEntryProductChange}
                            onEnterNext={() => focusPcsInput('entry')}
                            onTabNext={() => focusPcsInput('entry')}
                            options={productOptions}
                            placeholder="Select SKU / Product..."
                            searchPlaceholder="Search SKU, name, brand..."
                            size="sm"
                            required
                            minDropdownWidth={450}
                            requireSelectionBeforeTab={true}
                            onRequireSelection={() => setProductError('Select a product first')}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', width: '100%', maxWidth: '100%', marginTop: '4px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                          {productError ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#e11d48', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              <AlertCircle size={12} />
                              <span>{productError}</span>
                            </div>
                          ) : entryProd ? (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                              <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {formatInteger(ppc)} pcs/CTN
                              </span>
                              <span>•</span>
                              <span className="tabular-nums">
                                {formatInteger(ppb)} pcs/BOX
                              </span>
                              <span>•</span>
                              <span className="tabular-nums font-semibold" style={{ color: 'var(--text-heading)' }}>
                                TP: {formatCurrency(entryProd.trade_price)}
                              </span>
                              <span>•</span>
                              <span
                                className={`tabular-nums ${
                                  entryProd.current_stock_base <= 0
                                    ? 'text-rose-600 font-bold'
                                    : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                }`}
                              >
                                Stock: {formatInteger(entryProd.current_stock_base)} PCS
                              </span>
                            </div>
                          ) : (
                            <div style={{ height: '22px' }} />
                          )}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="pcs-input-entry"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="0"
                            className="input tabular-nums text-right font-semibold"
                            value={entryRow.pieces}
                            onChange={(e) => handleEntryPiecesChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (typeof entryRow.pieces !== 'number' || entryRow.pieces <= 0) {
                                  e.currentTarget.select();
                                  return;
                                }
                                document.getElementById('price-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            required
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                          {entryProd ? (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 text-right tabular-nums whitespace-nowrap">
                              {typeof entryRow.pieces === 'number' && entryRow.pieces > 0 ? (
                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                  ≈ {(entryRow.pieces / ppc).toFixed(2)} CTN
                                </span>
                              ) : (
                                <span>{ppc} pcs/ctn</span>
                              )}
                            </div>
                          ) : (
                            <div style={{ height: '22px' }} />
                          )}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="price-input-entry"
                            type="number"
                            step="0.01"
                            className="input tabular-nums text-right"
                            value={entryRow.unitPrice || ''}
                            onChange={(e) => handleEntryUnitPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('disc-pct-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                          {entryProd && ppc > 1 ? (
                            <div className="text-[10px] text-slate-400 text-right tabular-nums whitespace-nowrap">
                              ≈ {formatCurrency((entryRow.unitPrice || 0) * ppc)}/ctn
                            </div>
                          ) : (
                            <div style={{ height: '22px' }} />
                          )}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="disc-pct-input-entry"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="0%"
                            className="input tabular-nums text-right"
                            value={entryRow.discPercent}
                            onChange={(e) => handleEntryDiscPercentChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('disc-pkr-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="disc-pkr-input-entry"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="input tabular-nums text-right"
                            value={entryRow.discPkr}
                            onChange={(e) => handleEntryDiscPkrChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('tax-pct-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="tax-pct-input-entry"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="0%"
                            className="input tabular-nums text-right"
                            value={entryRow.taxPercent}
                            onChange={(e) => handleEntryTaxPercentChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('tax-pkr-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="tax-pkr-input-entry"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="input tabular-nums text-right"
                            value={entryRow.taxPkr}
                            onChange={(e) => handleEntryTaxPkrChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('bonus-input-entry')?.focus();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                        {/* Fixed input container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="bonus-input-entry"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            className="input tabular-nums text-right"
                            value={entryRow.schemeBonus}
                            onChange={(e) => handleEntrySchemeBonusChange(e.target.value === '' ? '' : Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                e.preventDefault();
                                finalizeEntryRow();
                              }
                            }}
                            style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box', borderColor: 'rgba(52, 211, 153, 0.4)' }}
                          />
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                        {/* Fixed display container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }} className="tabular-nums">
                          {formatCurrency(entryFin.netLineTotal)}
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                      <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                        {/* Fixed button container (32px) */}
                        <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={finalizeEntryRow}
                            title="Add item to order (or press Enter/Tab on Bonus)"
                            className="btn btn-primary btn-sm"
                            style={{ height: '32px', width: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        {/* Fixed helper text container (22px) */}
                        <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })()}

                {/* 2. COMPLETED ROWS (RENDERED UNDERNEATH ACTIVE ROW) */}
                {completedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      style={{
                        textAlign: 'center',
                        padding: '1.75rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                        background: 'rgba(248, 250, 252, 0.5)',
                      }}
                    >
                      No items committed yet. Choose a product above, enter quantity & pricing, then press Enter or Tab on Bonus (or click +) to commit.
                    </td>
                  </tr>
                ) : (
                  completedRows.map((row) => {
                    const prod = products.find((p) => p.id === row.productId);
                    const bpc = Math.max(1, prod?.boxes_per_carton || 1);
                    const ppb = Math.max(1, prod?.pieces_per_box || 1);
                    const ppc = Math.max(1, prod?.total_pieces_per_carton || (bpc * ppb) || prod?.bulk_conversion_factor || 1);
                    const fin = calculateLineFinancials(
                      prod,
                      row.pieces,
                      row.unitPrice,
                      row.discPkr,
                      row.discPercent,
                      row.taxPkr,
                      row.taxPercent
                    );

                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', width: '450px', maxWidth: '450px', overflow: 'hidden' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', width: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                            <SearchableSelect
                              id={`product-select-${row.id}`}
                              value={row.productId}
                              onChange={(val) => handleCompletedRowProductChange(row.id, val)}
                              onTabNext={() => focusPcsInput(row.id)}
                              options={productOptions}
                              placeholder="Select SKU / Product..."
                              searchPlaceholder="Search SKU, name, brand..."
                              size="sm"
                              required
                              minDropdownWidth={450}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', width: '100%', maxWidth: '100%', marginTop: '4px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                            {prod ? (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {formatInteger(ppc)} pcs/CTN
                                </span>
                                <span>•</span>
                                <span className="tabular-nums">
                                  {formatInteger(ppb)} pcs/BOX
                                </span>
                                <span>•</span>
                                <span className="tabular-nums font-semibold" style={{ color: 'var(--text-heading)' }}>
                                  TP: {formatCurrency(prod.trade_price)}
                                </span>
                                <span>•</span>
                                <span
                                  className={`tabular-nums ${
                                    prod.current_stock_base <= 0
                                      ? 'text-rose-600 font-bold'
                                      : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  }`}
                                >
                                  Stock: {formatInteger(prod.current_stock_base)} PCS
                                </span>
                              </div>
                            ) : (
                              <div style={{ height: '22px' }} />
                            )}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`pcs-input-${row.id}`}
                              type="number"
                              min="1"
                              step="1"
                              placeholder="0"
                              className="input tabular-nums text-right font-semibold"
                              value={row.pieces}
                              onChange={(e) => handleCompletedRowPiecesChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                              required
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                            {prod ? (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 text-right tabular-nums whitespace-nowrap">
                                {typeof row.pieces === 'number' && row.pieces > 0 ? (
                                  <span className="font-medium text-blue-600 dark:text-blue-400">
                                    ≈ {(row.pieces / ppc).toFixed(2)} CTN
                                  </span>
                                ) : (
                                  <span>{ppc} pcs/ctn</span>
                                )}
                              </div>
                            ) : (
                              <div style={{ height: '22px' }} />
                            )}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`price-input-${row.id}`}
                              type="number"
                              step="0.01"
                              className="input tabular-nums text-right"
                              value={row.unitPrice || ''}
                              onChange={(e) => handleCompletedRowUnitPriceChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                            {prod && ppc > 1 ? (
                              <div className="text-[10px] text-slate-400 text-right tabular-nums whitespace-nowrap">
                                ≈ {formatCurrency((row.unitPrice || 0) * ppc)}/ctn
                              </div>
                            ) : (
                              <div style={{ height: '22px' }} />
                            )}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`disc-pct-input-${row.id}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="0%"
                              className="input tabular-nums text-right"
                              value={row.discPercent}
                              onChange={(e) => handleCompletedRowDiscPercentChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`disc-pkr-input-${row.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="input tabular-nums text-right"
                              value={row.discPkr}
                              onChange={(e) => handleCompletedRowDiscPkrChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`tax-pct-input-${row.id}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="0%"
                              className="input tabular-nums text-right"
                              value={row.taxPercent}
                              onChange={(e) => handleCompletedRowTaxPercentChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`tax-pkr-input-${row.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="input tabular-nums text-right"
                              value={row.taxPkr}
                              onChange={(e) => handleCompletedRowTaxPkrChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem' }}>
                          {/* Fixed input container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center' }}>
                            <input
                              id={`bonus-input-${row.id}`}
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              className="input tabular-nums text-right"
                              value={row.schemeBonus}
                              onChange={(e) => handleCompletedRowSchemeBonusChange(row.id, e.target.value === '' ? '' : Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              style={{ height: '32px', padding: '0 0.5rem', width: '100%', boxSizing: 'border-box', borderColor: 'rgba(52, 211, 153, 0.4)' }}
                            />
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                          {/* Fixed display container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }} className="tabular-nums">
                            {formatCurrency(fin.netLineTotal)}
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                        <td style={{ verticalAlign: 'top', padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                          {/* Fixed button container (32px) */}
                          <div style={{ height: '32px', minHeight: '32px', maxHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => removeCompletedRow(row.id)}
                              title="Delete line item"
                              style={{
                                height: '32px',
                                width: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: 0,
                                borderRadius: '4px',
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {/* Fixed helper text container (22px) */}
                          <div style={{ height: '22px', minHeight: '22px', maxHeight: '22px', marginTop: '4px' }} aria-hidden="true" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary & Booking Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Special Booking Instructions / Delivery Notes
            </label>
            <textarea
              className="input"
              rows={4}
              placeholder="e.g. Deliver before 12 PM, deliver with secondary order..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Financial Summary Card */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                marginBottom: '1rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Order Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Gross Subtotal:</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(grossSubtotal)}
                </span>
              </div>

              {lineDiscountEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Line Discounts:</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#e11d48' }}>
                    - {formatCurrency(totalLineDiscounts)}
                  </span>
                </div>
              )}

              {/* Bill Discount Row (Conditional Flag) */}
              {billDiscountEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
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

              {/* Net Before Tax */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', paddingTop: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Net Before Tax:</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(netBeforeTax)}
                </span>
              </div>

              {/* Sales Tax */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sales Tax (GST / Output):</span>
                <span className="tabular-nums font-semibold" style={{ color: totalTaxAmount > 0 ? '#2563eb' : 'var(--text-primary)' }}>
                  + {formatCurrency(totalTaxAmount)}
                </span>
              </div>

              {schemeBonusEnabled && totalBonusPcs > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Free Promotional Units:</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#059669' }}>
                    {formatInteger(totalBonusPcs)} Units ({formatCurrency(0)})
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingTop: '0.85rem',
                  borderTop: '2px solid var(--border-subtle)',
                  marginTop: '0.5rem',
                }}
              >
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>Grand Total:</span>
                <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--primary)' }}>
                  {formatCurrency(grandTotal)}
                </span>
              </div>

              {spotCashEnabled && (
                <div style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Spot Cash Received:</span>
                    <input
                      type="number"
                      min="0"
                      max={grandTotal}
                      step="0.01"
                      placeholder="0.00"
                      className="input tabular-nums text-right"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ width: '130px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginBottom: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={() => setCashReceived(grandTotal)}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                    >
                      100% Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashReceived(0)}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                    >
                      Credit Sale
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      background: remainingDue > 0 ? '#fef2f2' : '#f0fdf4',
                      border: `1px solid ${remainingDue > 0 ? '#fecaca' : '#bbf7d0'}`,
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: remainingDue > 0 ? '#be123c' : '#047857',
                    }}
                  >
                    <span>Remaining Due:</span>
                    <span className="tabular-nums font-bold">{formatCurrency(remainingDue)}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
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
                <ClipboardList size={18} />
                <span>{submitting ? 'Posting Sale Order...' : 'Save & Post Sale Order'}</span>
                <kbd
                  style={{
                    marginLeft: '4px',
                    padding: '2px 6px',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.22)',
                    color: '#ffffff',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  Ctrl + S
                </kbd>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Print / Preview Modal */}
      {savedOrder && printModalOpen && (
        <PrintInvoiceModal
          data={savedOrder}
          type="ORDER"
          defaultFormat={activePrintFormat}
          onClose={() => {
            setPrintModalOpen(false);
            setSavedOrder(null);
            focusCustomerSelect();
          }}
        />
      )}
    </div>
  );
}
