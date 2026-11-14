'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Printer,
  FileText,
  DollarSign,
  Package,
  ShieldAlert,
  Search,
  ArrowRight,
  Sparkles,
  History,
  X,
  CreditCard,
  UserCheck
} from 'lucide-react';
import { formatCurrency, formatInteger, formatNumber } from '@/shared/utils/currency';
import { NumericValue } from '@/shared/components/NumericValue';
import { BusinessReferenceLink } from '@/shared/components/BusinessReferenceLink';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { DateRangeFilter, isDateInRange } from '@/shared/components/DateRangeFilter';

const conditionOptions = [
  { value: 'FRESH', label: '📦 Fresh (Restock)' },
  { value: 'DAMAGED_EXPIRED', label: '⚠️ Damaged / Expired' },
];

interface CustomerOption {
  id: string;
  name: string;
  shop_name: string | null;
  live_balance: number;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  category_name?: string;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  trade_price: number;
  cost_price: number;
}

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface EligibilityAudit {
  totalDeliveredBase: number;
  alreadyReturnedBase: number;
  maxReturnableBase: number;
  isEligible: boolean;
  loading?: boolean;
}

interface ReturnRow {
  id: string;
  productId: string;
  condition: 'FRESH' | 'DAMAGED_EXPIRED';
  cartonsQty: number | '';
  boxesQty: number | '';
  piecesQty: number | '';
  totalPieces: number;
  unitRate: number; // PKR per piece
  lineTotal: number; // PKR
  audit?: EligibilityAudit;
}

interface SalesReturnSummary {
  id: string;
  return_number: string;
  customer_id: string;
  customer_name: string;
  shop_name?: string | null;
  return_date: string;
  salesman_name?: string | null;
  settlement_type: 'CREDIT_TO_LEDGER' | 'CASH_REFUND';
  total_refund: number;
  status: string;
  created_at: string;
  items?: any[];
}

export default function SalesReturnsPage() {
  const { profile: companyProfile } = useCompanyProfile();
  const [activeTab, setActiveTab] = useState<'NEW_RETURN' | 'HISTORY'>('NEW_RETURN');

  // Master Data
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [salesmen, setSalesmen] = useState<StaffOption[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  // Form State
  const [customerId, setCustomerId] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [salesmanId, setSalesmanId] = useState<string>('');
  const [settlementType, setSettlementType] = useState<'CREDIT_TO_LEDGER' | 'CASH_REFUND'>('CREDIT_TO_LEDGER');
  const [notes, setNotes] = useState<string>('');

  // Item Rows
  const [rows, setRows] = useState<ReturnRow[]>([
    {
      id: String(Date.now()),
      productId: '',
      condition: 'FRESH',
      cartonsQty: '',
      boxesQty: '',
      piecesQty: 1,
      totalPieces: 1,
      unitRate: 0,
      lineTotal: 0,
    },
  ]);

  // Submission & History State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    returnId: string;
    returnNumber: string;
    totalRefund: number;
    printDoc?: SalesReturnSummary;
  } | null>(null);

  const [historyList, setHistoryList] = useState<SalesReturnSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase();
    return historyList.filter((item) => {
      const matchesSearch =
        !q ||
        (item.return_number || '').toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q);
      const matchesDate = isDateInRange(item.return_date, dateFrom, dateTo);
      return matchesSearch && matchesDate;
    });
  }, [historyList, historySearch, dateFrom, dateTo]);

  const historyPagination = usePagination(filteredHistory);

  // Print Preview Modal State
  const [printModalDoc, setPrintModalDoc] = useState<SalesReturnSummary | null>(null);
  const [printFormat, setPrintFormat] = useState<'THERMAL' | 'A4'>('THERMAL');

  // Delete & Reverse Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    number: string;
    date: string;
    endpoint: string;
  } | null>(null);

  // 1. Fetch Masters
  useEffect(() => {
    async function loadMasters() {
      try {
        setLoadingMasters(true);
        const [cRes, pRes, sRes] = await Promise.all([
          fetch('/api/customers').then((r) => r.json()),
          fetch('/api/inventory').then((r) => r.json()),
          fetch('/api/staff').then((r) => r.json()),
        ]);

        if (cRes.success && cRes.customers) setCustomers(cRes.customers);
        if (pRes.success && pRes.products) setProducts(pRes.products);
        if (sRes.success && sRes.staff) {
          setSalesmen(sRes.staff.filter((s: StaffOption) => s.role === 'SALESMAN'));
        }
      } catch (err: any) {
        setErrorMessage('Failed to load customers and inventory data.');
      } finally {
        setLoadingMasters(false);
      }
    }
    loadMasters();
  }, []);

  // 2. Fetch History when tab is opened
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/returns/sales').then((r) => r.json());
      if (res.success && res.data) {
        setHistoryList(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadHistory();
    }
  }, [activeTab]);

  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      value: c.id,
      label: c.name,
      subLabel: [
        c.shop_name ? `Shop: ${c.shop_name}` : null,
        c.live_balance ? `Bal: ${formatCurrency(c.live_balance)}` : null,
      ].filter(Boolean).join(' • '),
      badge: c.live_balance > 0 ? 'Balance Due' : undefined,
      badgeColor: c.live_balance > 0 ? ('amber' as const) : undefined,
      keywords: [c.name, c.shop_name || '', String(c.live_balance || '')],
    }));
  }, [customers]);

  const salesmanOptions = useMemo(() => {
    return [
      { value: '', label: '-- None / Direct --' },
      ...salesmen.map((s) => ({
        value: s.id,
        label: s.name,
        subLabel: 'Salesman',
        keywords: [s.name],
      })),
    ];
  }, [salesmen]);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      badge: p.sku,
      badgeColor: 'blue' as const,
      subLabel: `${p.category_name || 'Standard'} • ${p.total_pieces_per_carton || 1} pcs/ctn • TP: ${formatCurrency(p.trade_price)}`,
      keywords: [p.name, p.sku, p.category_name || ''],
    }));
  }, [products]);

  // Selected Customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === customerId);
  }, [customers, customerId]);

  // Check audit for a row when customer or product changes
  const checkAudit = async (rowId: string, custId: string, prodId: string) => {
    if (!custId || !prodId) return;

    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, audit: { totalDeliveredBase: 0, alreadyReturnedBase: 0, maxReturnableBase: 0, isEligible: false, loading: true } } : r))
    );

    try {
      const res = await fetch(`/api/returns/customer-eligibility?customerId=${custId}&productId=${prodId}`).then((r) => r.json());
      if (res.success && res.data) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  audit: {
                    totalDeliveredBase: res.data.totalDeliveredBase,
                    alreadyReturnedBase: res.data.alreadyReturnedBase,
                    maxReturnableBase: res.data.maxReturnableBase,
                    isEligible: res.data.isEligible,
                    loading: false,
                  },
                }
              : r
          )
        );
      }
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, audit: { totalDeliveredBase: 0, alreadyReturnedBase: 0, maxReturnableBase: 0, isEligible: false, loading: false } } : r))
      );
    }
  };

  // Trigger re-audit on all rows if customer changes
  const handleCustomerChange = (newCustId: string) => {
    setCustomerId(newCustId);
    rows.forEach((r) => {
      if (r.productId && newCustId) {
        checkAudit(r.id, newCustId, r.productId);
      }
    });
  };

  // Row Calculation Helper
  const recalculateRow = (row: ReturnRow, prod?: ProductOption): ReturnRow => {
    const product = prod || products.find((p) => p.id === row.productId);
    if (!product) {
      return { ...row, totalPieces: 0, lineTotal: 0 };
    }

    const boxesPerCarton = Math.max(1, product.boxes_per_carton || 1);
    const piecesPerBox = Math.max(1, product.pieces_per_box || 1);
    const totalPiecesPerCarton = Math.max(1, product.total_pieces_per_carton || boxesPerCarton * piecesPerBox);

    const ctn = row.cartonsQty === '' ? 0 : Number(row.cartonsQty);
    const box = row.boxesQty === '' ? 0 : Number(row.boxesQty);
    const pcs = row.piecesQty === '' ? 0 : Number(row.piecesQty);

    const totalPcs = ctn * totalPiecesPerCarton + box * piecesPerBox + pcs;
    const rate = row.unitRate > 0 ? row.unitRate : Math.round((product.trade_price / totalPiecesPerCarton) * 100) / 100;
    const lineTotal = Math.round(totalPcs * rate * 100) / 100;

    return {
      ...row,
      totalPieces: totalPcs,
      unitRate: rate,
      lineTotal,
    };
  };

  const handleProductChange = (rowId: string, newProdId: string) => {
    const prod = products.find((p) => p.id === newProdId);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (!prod) {
          return {
            ...r,
            productId: '',
            cartonsQty: '',
            boxesQty: '',
            piecesQty: '',
            totalPieces: 0,
            unitRate: 0,
            lineTotal: 0,
            audit: undefined,
          };
        }

        const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
        const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
        const totalPiecesPerCarton = Math.max(1, prod.total_pieces_per_carton || boxesPerCarton * piecesPerBox);
        const defaultRate = Math.round((prod.trade_price / totalPiecesPerCarton) * 100) / 100;

        const updated: ReturnRow = {
          ...r,
          productId: newProdId,
          cartonsQty: '',
          boxesQty: '',
          piecesQty: 1,
          totalPieces: 1,
          unitRate: defaultRate,
          lineTotal: defaultRate,
        };

        return updated;
      })
    );

    if (customerId && newProdId) {
      checkAudit(rowId, customerId, newProdId);
    }
  };

  const handleQtyChange = (rowId: string, field: 'cartonsQty' | 'boxesQty' | 'piecesQty', value: string) => {
    const num = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated = { ...r, [field]: num };
        return recalculateRow(updated);
      })
    );
  };

  const handleConditionChange = (rowId: string, condition: 'FRESH' | 'DAMAGED_EXPIRED') => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, condition } : r)));
  };

  const handleRateChange = (rowId: string, value: string) => {
    const rate = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const lineTotal = Math.round(r.totalPieces * rate * 100) / 100;
        return { ...r, unitRate: rate, lineTotal };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: String(Date.now()) + Math.random().toString(36).substring(2, 5),
        productId: '',
        condition: 'FRESH',
        cartonsQty: '',
        boxesQty: '',
        piecesQty: 1,
        totalPieces: 1,
        unitRate: 0,
        lineTotal: 0,
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Totals calculations
  const totals = useMemo(() => {
    let refund = 0;
    let totalPcs = 0;
    let freshPcs = 0;
    let damagedPcs = 0;

    rows.forEach((r) => {
      refund += r.lineTotal;
      totalPcs += r.totalPieces;
      if (r.condition === 'FRESH') {
        freshPcs += r.totalPieces;
      } else {
        damagedPcs += r.totalPieces;
      }
    });

    return {
      refund,
      totalPcs,
      freshPcs,
      damagedPcs,
    };
  }, [rows]);

  // Validation Check
  const validation = useMemo(() => {
    if (!customerId) return { valid: false, message: 'Please select a customer.' };
    if (rows.length === 0) return { valid: false, message: 'At least one item is required.' };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.productId) return { valid: false, message: `Row ${i + 1}: Please select a product.` };
      if (r.totalPieces <= 0) return { valid: false, message: `Row ${i + 1}: Quantity must be greater than 0.` };

      if (r.audit) {
        if (!r.audit.isEligible || r.audit.totalDeliveredBase === 0) {
          return {
            valid: false,
            message: `Row ${i + 1}: Product has never been delivered to this customer. Returns strictly blocked.`,
          };
        }
        if (r.totalPieces > r.audit.maxReturnableBase) {
          return {
            valid: false,
            message: `Row ${i + 1}: Return quantity (${r.totalPieces} Pcs) exceeds max returnable limit (${r.audit.maxReturnableBase} Pcs).`,
          };
        }
      }
    }

    return { valid: true, message: '' };
  }, [customerId, rows]);

  // Submit Handler
  const handleSubmitReturn = async () => {
    if (!validation.valid) {
      setErrorMessage(validation.message);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        customerId,
        returnDate,
        salesmanId: salesmanId || null,
        settlementType,
        notes: notes.trim() || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          condition: r.condition,
          cartonsQty: Number(r.cartonsQty) || 0,
          boxesQty: Number(r.boxesQty) || 0,
          piecesQty: Number(r.piecesQty) || 0,
          totalBaseQty: r.totalPieces,
          unitRate: r.unitRate,
        })),
      };

      const res = await fetch('/api/returns/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save sales return.');
      }

      // Fetch full details of saved return for print preview
      const detailRes = await fetch(`/api/returns/sales?id=${data.data.returnId}`).then((r) => r.json());
      const printDoc = detailRes.success ? detailRes.data : undefined;

      setSuccessResult({
        returnId: data.data.returnId,
        returnNumber: data.data.returnNumber,
        totalRefund: data.data.totalRefund,
        printDoc,
      });

      if (printDoc) {
        setPrintModalDoc(printDoc);
      }

      // Reset form rows
      setRows([
        {
          id: String(Date.now()),
          productId: '',
          condition: 'FRESH',
          cartonsQty: '',
          boxesQty: '',
          piecesQty: 1,
          totalPieces: 1,
          unitRate: 0,
          lineTotal: 0,
        },
      ]);
      setNotes('');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while saving return.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPrintModalForId = async (returnId: string) => {
    try {
      const res = await fetch(`/api/returns/sales?id=${returnId}`).then((r) => r.json());
      if (res.success && res.data) {
        setPrintModalDoc(res.data);
      }
    } catch {
      // ignore
    }
  };

  return (
    <ListPageContainer className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Sale Return</h1>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('NEW_RETURN');
              setSuccessResult(null);
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'NEW_RETURN'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Credit Note
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Credit Notes History
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successResult && activeTab === 'NEW_RETURN' && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-emerald-900">
                Sales Return Credit Note {successResult.returnNumber} Posted Successfully!
              </h3>
              <p className="text-xs text-emerald-700">
                Refund amount of {formatCurrency(successResult.totalRefund)} has been{' '}
                {settlementType === 'CREDIT_TO_LEDGER' ? 'credited to customer subledger' : 'issued as cash refund'}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {successResult.printDoc && (
              <button
                type="button"
                onClick={() => setPrintModalDoc(successResult.printDoc!)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Credit Note
              </button>
            )}
            <button
              type="button"
              onClick={() => setSuccessResult(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="text-xs text-rose-800 font-medium">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-rose-700 hover:text-rose-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: NEW RETURN SCREEN */}
      {activeTab === 'NEW_RETURN' && (
        <div className="space-y-6">
          {/* Top Form Header Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              Customer & Settlement Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Customer Selector */}
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Select Customer *
                </label>
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={(val) => handleCustomerChange(val)}
                  placeholder="-- Choose Customer --"
                  className="w-full"
                />

                {/* Live Customer Ledger Pill */}
                {selectedCustomer && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Live Ledger Balance:</span>
                    <span
                      className={`font-bold tabular-nums px-2 py-0.5 rounded-full ${
                        selectedCustomer.live_balance > 0
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {formatCurrency(selectedCustomer.live_balance)}
                    </span>
                  </div>
                )}
              </div>

              {/* Return Date */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Return Date *
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Salesman */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Salesman / Order Booker
                </label>
                <SearchableSelect
                  options={salesmanOptions}
                  value={salesmanId}
                  onChange={(val) => setSalesmanId(val)}
                  placeholder="-- None / Direct --"
                  className="w-full"
                />
              </div>
            </div>

            {/* Settlement Mode Selection */}
            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 mb-2 block">
                Settlement Mode *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                <button
                  type="button"
                  onClick={() => setSettlementType('CREDIT_TO_LEDGER')}
                  className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                    settlementType === 'CREDIT_TO_LEDGER'
                      ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center ${
                      settlementType === 'CREDIT_TO_LEDGER'
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {settlementType === 'CREDIT_TO_LEDGER' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      Credit to Customer Ledger (Recommended)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Cr. 1030 Accounts Receivable • Reduces customer’s outstanding debt immediately.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSettlementType('CASH_REFUND')}
                  className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                    settlementType === 'CASH_REFUND'
                      ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center ${
                      settlementType === 'CASH_REFUND'
                        ? 'border-emerald-600 bg-emerald-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {settlementType === 'CASH_REFUND' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      Cash Refund on Spot
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Cr. 1010 Cash in Hand • Physical cash disbursed back to customer directly.
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Items Grid Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-600" />
                  Returned Items
                </h2>
              </div>

              <button
                type="button"
                onClick={addRow}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-indigo-200 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/70">
                    <th className="py-2.5 px-3 min-w-[280px]">Product</th>
                    <th className="py-2.5 px-3 min-w-[170px]">Condition</th>
                    <th className="py-2.5 px-2 text-right w-20">Carton</th>
                    <th className="py-2.5 px-2 text-right w-20">Box</th>
                    <th className="py-2.5 px-2 text-right w-20">Pieces</th>
                    <th className="py-2.5 px-3 text-right w-24">Total Pcs</th>
                    <th className="py-2.5 px-3 text-right w-28">Rate (Pcs)</th>
                    <th className="py-2.5 px-3 text-right w-32">Refund Total</th>
                    <th className="py-2.5 px-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {rows.map((row, idx) => {
                    const isExceeded = row.audit && row.audit.isEligible && row.totalPieces > row.audit.maxReturnableBase;
                    const isNeverPurchased = row.audit && (!row.audit.isEligible || row.audit.totalDeliveredBase === 0);

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isExceeded || isNeverPurchased ? 'bg-rose-50/40' : ''
                        }`}
                      >
                        {/* Product Selection & Audit Badge */}
                        <td className="py-3 px-3 align-top">
                          <SearchableSelect
                            options={productOptions}
                            value={row.productId}
                            onChange={(val) => handleProductChange(row.id, val)}
                            placeholder="-- Select Product --"
                            className="w-full min-w-[220px]"
                          />

                          {/* Live Audit Pill */}
                          <div className="mt-1.5">
                            {!customerId && (
                              <span className="text-[11px] text-slate-400 italic">
                                Select a customer to verify return eligibility
                              </span>
                            )}

                            {customerId && row.productId && (
                              <>
                                {row.audit?.loading && (
                                  <span className="text-[11px] text-slate-500 animate-pulse">
                                    Auditing sales history...
                                  </span>
                                )}

                                {!row.audit?.loading && row.audit && (
                                  <div>
                                    {isNeverPurchased ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                        <ShieldAlert className="w-3 h-3" />
                                        Never Purchased by Customer (0 Pcs Delivered)
                                      </span>
                                    ) : (
                                      <div className="space-y-1">
                                        <span
                                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                            isExceeded
                                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          }`}
                                        >
                                          <span className="tabular-nums">Delivered: {formatInteger(row.audit.totalDeliveredBase)}</span>
                                          <span>•</span>
                                          <span className="tabular-nums">Returned: {formatInteger(row.audit.alreadyReturnedBase)}</span>
                                          <span>•</span>
                                          <span className="font-bold underline tabular-nums">
                                            Max Returnable: {formatInteger(row.audit.maxReturnableBase)} Pcs
                                          </span>
                                        </span>

                                        {isExceeded && (
                                          <p className="text-[11px] font-bold text-rose-600 tabular-nums">
                                            ⚠️ Return qty exceeds available limit by{' '}
                                            {formatInteger(row.totalPieces - row.audit.maxReturnableBase)} Pcs!
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        {/* Condition Dropdown */}
                        <td className="py-3 px-3 align-top min-w-[170px]">
                          <SearchableSelect
                            value={row.condition}
                            onChange={(val) =>
                              handleConditionChange(row.id, val as 'FRESH' | 'DAMAGED_EXPIRED')
                            }
                            options={conditionOptions}
                            size="sm"
                          />
                          <span className="text-[10px] text-slate-500 block mt-1">
                            {row.condition === 'FRESH'
                              ? 'Increments Sellable Stock'
                              : 'Quarantine (Unsellable)'}
                          </span>
                        </td>

                        {/* Cartons */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            disabled={isNeverPurchased}
                            value={row.cartonsQty}
                            onChange={(e) => handleQtyChange(row.id, 'cartonsQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>

                        {/* Boxes */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            disabled={isNeverPurchased}
                            value={row.boxesQty}
                            onChange={(e) => handleQtyChange(row.id, 'boxesQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>

                        {/* Pieces */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            disabled={isNeverPurchased}
                            value={row.piecesQty}
                            onChange={(e) => handleQtyChange(row.id, 'piecesQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>

                        {/* Total Base Pcs */}
                        <td className="py-3 px-3 align-top text-right">
                          <span
                            className={`inline-block tabular-nums font-bold px-2 py-1 rounded text-xs ${
                              isExceeded || isNeverPurchased
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {formatInteger(row.totalPieces)} Pcs
                          </span>
                        </td>

                        {/* Rate */}
                        <td className="py-3 px-3 align-top text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isNeverPurchased}
                            value={row.unitRate}
                            onChange={(e) => handleRateChange(row.id, e.target.value)}
                            className="w-24 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="py-3 px-3 align-top text-right font-bold tabular-nums text-slate-900">
                          {formatCurrency(row.lineTotal)}
                        </td>

                        {/* Delete Row */}
                        <td className="py-3 px-2 align-top text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            className="text-slate-400 hover:text-rose-600 disabled:text-slate-200 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Layout: Accounting Preview & Financial Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Notes */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Return Reason / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Expired batch replacement, damaged carton during transit, retailer stock return..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Right Col: Financial Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Financial Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Base Pieces:</span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatInteger(totals.totalPcs)} Pcs</span>
                </div>

                <div className="flex justify-between text-emerald-700">
                  <span>Fresh Restock:</span>
                  <span className="font-semibold tabular-nums">{formatInteger(totals.freshPcs)} Pcs</span>
                </div>

                <div className="flex justify-between text-amber-700">
                  <span>Damaged Quarantine:</span>
                  <span className="font-semibold tabular-nums">{formatInteger(totals.damagedPcs)} Pcs</span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900">Total Net Refund:</span>
                  <span className="text-xl font-extrabold tabular-nums text-indigo-700">
                    {formatCurrency(totals.refund)}
                  </span>
                </div>
              </div>

              {/* Validation Warning Notice */}
              {!validation.valid && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-medium">
                  {validation.message}
                </div>
              )}

              {/* Post Button */}
              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={submitting || !validation.valid}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl shadow transition-all flex items-center justify-center gap-2 text-sm"
              >
                {submitting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    Posting Return...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save & Post Credit Note
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CREDIT NOTES HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="filter-section-card flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Credit Notes History
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <DateRangeFilter
                fromDate={dateFrom}
                toDate={dateTo}
                onFromDateChange={setDateFrom}
                onToDateChange={setDateTo}
              />
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search return # or customer..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="filter-input-control w-full h-9 pl-9 pr-3 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">

          {loadingHistory ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading credit notes...</div>
          ) : historyList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No returns posted yet.</div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No returns match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2.5 px-3">Return #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Salesman</th>
                    <th className="py-2.5 px-3">Settlement</th>
                    <th className="py-2.5 px-3 text-right">Total Refund</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {historyPagination.paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 doc-identifier font-bold text-indigo-700">
                        <BusinessReferenceLink
                          businessReference={item.return_number}
                          sourceDocumentId={item.id}
                          sourceModule="returns"
                          transactionType="Sale Return"
                        />
                      </td>
                      <td className="py-3 px-3 text-slate-600 table-date">{item.return_date}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{item.customer_name}</div>
                        {item.shop_name && (
                          <div className="text-[11px] text-slate-500">{item.shop_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{item.salesman_name || '—'}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.settlement_type === 'CREDIT_TO_LEDGER'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {item.settlement_type === 'CREDIT_TO_LEDGER' ? 'Credit Note' : 'Cash Refund'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums">
                        {formatCurrency(item.total_refund)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPrintModalForId(item.id)}
                            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                id: item.id,
                                number: item.return_number,
                                date: item.return_date,
                                endpoint: `/api/returns/sales/${item.id}`,
                              })
                            }
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold p-1.5 rounded transition-colors"
                            title="Delete & Reverse Return"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls {...historyPagination} />
          </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL (Thermal 80mm & Standard A4) */}
      {printModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Top Bar */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Credit Note Print Preview • {printModalDoc.return_number}
                </h3>
              </div>

              {/* Format Toggle */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-200 p-0.5 rounded-lg flex text-xs">
                  <button
                    type="button"
                    onClick={() => setPrintFormat('THERMAL')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      printFormat === 'THERMAL'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    80mm Thermal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFormat('A4')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      printFormat === 'A4'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Standard A4
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPrintModalDoc(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Print Preview Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
              {/* 80mm Thermal Format */}
              {printFormat === 'THERMAL' && (
                <div
                  id="printable-credit-note"
                  className="bg-white p-4 shadow border border-slate-300 w-[300px] text-[11px] font-sans tabular-nums leading-tight space-y-3"
                >
                  <div className="text-center border-b border-dashed border-slate-400 pb-2">
                    {companyProfile.showLogoOnPrints && companyProfile.logoUrl && (
                      <img
                        src={companyProfile.logoUrl}
                        alt="Logo"
                        className="max-h-10 max-w-[100px] object-contain mx-auto mb-1 filter grayscale"
                      />
                    )}
                    <h2 className="text-sm font-black uppercase tracking-wider">
                      {companyProfile.businessName || 'SALEFLOW DISTRIBUTION'}
                    </h2>
                    {companyProfile.tagline && (
                      <p className="text-[10px] text-slate-600">{companyProfile.tagline}</p>
                    )}
                    {(companyProfile.address || companyProfile.city) && (
                      <p className="text-[10px] text-slate-600">
                        {[companyProfile.address, companyProfile.city].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {(companyProfile.phonePrimary || companyProfile.phoneSecondary) && (
                      <p className="text-[10px] text-slate-600">
                        Tel: {[companyProfile.phonePrimary, companyProfile.phoneSecondary].filter(Boolean).join(' / ')}
                      </p>
                    )}
                    {companyProfile.showNtnOnInvoices && companyProfile.ntnStrn && (
                      <p className="text-[10px] font-bold text-slate-700">{companyProfile.ntnStrn}</p>
                    )}
                    <div className="text-xs font-bold mt-1 bg-slate-100 py-0.5 border border-slate-300">
                      CREDIT NOTE
                    </div>
                  </div>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span>CR Note #:</span>
                      <span className="doc-identifier font-bold">{printModalDoc.return_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span className="table-date">{printModalDoc.return_date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Customer:</span>
                      <span className="font-bold">{printModalDoc.customer_name}</span>
                    </div>
                    {printModalDoc.shop_name && (
                      <div className="flex justify-between text-slate-600">
                        <span>Shop:</span>
                        <span>{printModalDoc.shop_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Settlement:</span>
                      <span className="font-bold">
                        {printModalDoc.settlement_type === 'CREDIT_TO_LEDGER'
                          ? 'Ledger Credit'
                          : 'Cash Refund'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-b border-dashed border-slate-400 py-2">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-300">
                          <th className="pb-1">Item</th>
                          <th className="pb-1 text-center">Qty (PCS)</th>
                          <th className="pb-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {printModalDoc.items?.map((it: any) => (
                          <tr key={it.id}>
                            <td className="py-1">
                              <div>{it.product_name}</div>
                              <span className="text-[9px] text-slate-500">
                                {it.condition === 'FRESH' ? '[Fresh]' : '[Damaged]'} @ {formatCurrency(it.unit_rate)}
                              </span>
                            </td>
                            <td className="py-1 text-center font-bold tabular-nums">{formatInteger(it.total_base_qty)}</td>
                            <td className="py-1 text-right font-bold tabular-nums">{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-1 text-right">
                    <div className="flex justify-between text-xs font-black">
                      <span>TOTAL REFUND:</span>
                      <span className="tabular-nums">{formatCurrency(printModalDoc.total_refund)}</span>
                    </div>
                  </div>

                  <div className="pt-4 text-center text-[9px] text-slate-500 border-t border-dashed border-slate-300 space-y-1">
                    <p className="whitespace-pre-line">{companyProfile.thermalFooterNote || 'Returned goods verified and credited.\nSoftware Powered by SaleFlow ERP'}</p>
                  </div>
                </div>
              )}

              {/* Standard A4 Format */}
              {printFormat === 'A4' && (
                <div
                  id="printable-credit-note"
                  className="bg-white p-8 shadow border border-slate-300 w-full text-xs font-sans space-y-6"
                >
                  <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                    <div className="flex items-start gap-3">
                      {companyProfile.showLogoOnPrints && companyProfile.logoUrl && (
                        <img
                          src={companyProfile.logoUrl}
                          alt="Logo"
                          className="max-h-12 max-w-[120px] object-contain"
                        />
                      )}
                      <div>
                        <h1 className="text-xl font-black text-slate-900">
                          {companyProfile.businessName || 'SALEFLOW DISTRIBUTION ERP'}
                        </h1>
                        {companyProfile.tagline && (
                          <p className="text-xs text-slate-500">{companyProfile.tagline}</p>
                        )}
                        {(companyProfile.address || companyProfile.city || companyProfile.phonePrimary) && (
                          <p className="text-xs text-slate-500">
                            {[companyProfile.address, companyProfile.city].filter(Boolean).join(', ')}
                            {(companyProfile.phonePrimary || companyProfile.phoneSecondary) && (
                              <> • Tel: <span className="numeric-text">{[companyProfile.phonePrimary, companyProfile.phoneSecondary].filter(Boolean).join(' / ')}</span></>
                            )}
                          </p>
                        )}
                        {companyProfile.showNtnOnInvoices && companyProfile.ntnStrn && (
                          <p className="text-xs font-bold text-slate-600">NTN: <span className="numeric-text">{companyProfile.ntnStrn}</span></p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-indigo-700">CREDIT NOTE / MEMO</div>
                      <p className="text-xs doc-identifier font-bold text-slate-800">
                        #{printModalDoc.return_number}
                      </p>
                      <p className="text-xs text-slate-500">Date: <span className="table-date">{printModalDoc.return_date}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Customer Information:</span>
                      <p className="text-sm font-bold text-slate-900">{printModalDoc.customer_name}</p>
                      {printModalDoc.shop_name && (
                        <p className="text-xs text-slate-600">{printModalDoc.shop_name}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Settlement Method:</span>
                      <p className="text-sm font-bold text-indigo-700">
                        {printModalDoc.settlement_type === 'CREDIT_TO_LEDGER'
                          ? 'Credit to Customer Ledger'
                          : 'Cash Refund on Spot'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Salesman: {printModalDoc.salesman_name || 'Direct'}
                      </p>
                    </div>
                  </div>

                  <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 text-xs font-bold">
                      <tr>
                        <th className="p-2.5">SKU / Item Description</th>
                        <th className="p-2.5">Condition</th>
                        <th className="p-2.5 text-right">Qty (PCS)</th>
                        <th className="p-2.5 text-right">Unit Rate</th>
                        <th className="p-2.5 text-right">Total Refund</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {printModalDoc.items?.map((it: any) => (
                        <tr key={it.id}>
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-900">{it.product_name}</span>
                            <span className="text-slate-500 block text-[11px]">SKU: {it.sku}</span>
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                it.condition === 'FRESH'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {it.condition === 'FRESH' ? 'Fresh (Restock)' : 'Damaged (Quarantine)'}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                            {formatInteger(it.total_base_qty)}
                          </td>
                          <td className="p-2.5 text-right text-slate-700 tabular-nums">
                            {formatCurrency(it.unit_rate)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                            {formatCurrency(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-2 text-right">
                      <div className="flex justify-between font-extrabold text-base text-slate-900 border-t-2 border-slate-900 pt-2">
                        <span>Total Refund:</span>
                        <span className="text-indigo-700 tabular-nums">{formatCurrency(printModalDoc.total_refund)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
                    <div className="border-t border-slate-300 pt-1">Customer Acceptance Signature</div>
                    <div className="border-t border-slate-300 pt-1">Authorized Distribution Officer</div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPrintModalDoc(null)}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete & Reverse Modal */}
      {deleteTarget && (
        <DeleteTransactionModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadHistory();
          }}
          transaction={{
            id: deleteTarget.id,
            type: 'Sales Return',
            number: deleteTarget.number,
            date: deleteTarget.date,
            endpoint: deleteTarget.endpoint,
          }}
        />
      )}
    </ListPageContainer>
  );
}
