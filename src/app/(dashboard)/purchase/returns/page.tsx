'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Undo2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Printer,
  FileText,
  Package,
  Search,
  Building2,
  History,
  X,
  CreditCard,
  Filter
} from 'lucide-react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { BusinessReferenceLink } from '@/shared/components/BusinessReferenceLink';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { DateRangeFilter, isDateInRange } from '@/shared/components/DateRangeFilter';

interface VendorOption {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  current_balance: number; // AP balance
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  base_rate_per_piece: number;
  cost_price: number;
  current_stock_base: number;
}

interface PurchaseReturnRow {
  id: string;
  productId: string;
  cartonsQty: number | '';
  boxesQty: number | '';
  piecesQty: number | '';
  totalPieces: number;
  ratePerPiece: number;
  lineTotal: number;
  availableStock: number;
}

interface PurchaseReturnSummary {
  id: string;
  return_number: string;
  vendor_id: string;
  vendor_name: string;
  return_date: string;
  vendor_invoice_number?: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  items?: any[];
}

export default function PurchaseReturnsPage() {
  const { profile: companyProfile } = useCompanyProfile();
  const [activeTab, setActiveTab] = useState<'NEW_RETURN' | 'HISTORY'>('NEW_RETURN');

  // Master Data
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  // Form State
  const [vendorId, setVendorId] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Item Rows
  const [rows, setRows] = useState<PurchaseReturnRow[]>([
    {
      id: String(Date.now()),
      productId: '',
      cartonsQty: '',
      boxesQty: '',
      piecesQty: 1,
      totalPieces: 1,
      ratePerPiece: 0,
      lineTotal: 0,
      availableStock: 0,
    },
  ]);

  // Submission & History State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    returnId: string;
    returnNumber: string;
    totalAmount: number;
    printDoc?: PurchaseReturnSummary;
  } | null>(null);

  const [historyList, setHistoryList] = useState<PurchaseReturnSummary[]>([]);
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
        (item.vendor_name || '').toLowerCase().includes(q);
      const matchesDate = isDateInRange(item.return_date, dateFrom, dateTo);
      return matchesSearch && matchesDate;
    });
  }, [historyList, historySearch, dateFrom, dateTo]);

  const historyPagination = usePagination(filteredHistory);

  // Print Preview Modal State
  const [printModalDoc, setPrintModalDoc] = useState<PurchaseReturnSummary | null>(null);
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
        const [vRes, pRes] = await Promise.all([
          fetch('/api/vendors').then((r) => r.json()),
          fetch('/api/inventory').then((r) => r.json()),
        ]);

        if (vRes.success && vRes.vendors) setVendors(vRes.vendors);
        if (pRes.success && pRes.products) setProducts(pRes.products);
      } catch {
        setErrorMessage('Failed to load vendors and inventory products.');
      } finally {
        setLoadingMasters(false);
      }
    }
    loadMasters();
  }, []);

  // 2. Fetch History
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/returns/purchase').then((r) => r.json());
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

  const vendorOptions = useMemo(() => {
    return vendors.map((v) => ({
      value: v.id,
      label: v.name,
      subLabel: [
        v.company_name ? `Co: ${v.company_name}` : null,
        v.current_balance ? `AP: ${formatCurrency(v.current_balance)}` : null,
      ].filter(Boolean).join(' • '),
      badge: v.current_balance > 0 ? 'Payable' : undefined,
      badgeColor: v.current_balance > 0 ? ('rose' as const) : undefined,
      keywords: [v.name, v.company_name || '', v.phone || '', String(v.current_balance || '')],
    }));
  }, [vendors]);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      badge: p.sku,
      badgeColor: 'blue' as const,
      subLabel: `Stock: ${formatInteger(p.current_stock_base)} pcs • Cost: ${formatCurrency(p.cost_price || p.base_rate_per_piece)}`,
      keywords: [p.name, p.sku],
    }));
  }, [products]);

  // Selected Vendor
  const selectedVendor = useMemo(() => {
    return vendors.find((v) => v.id === vendorId);
  }, [vendors, vendorId]);

  // Row Calculation Helper
  const recalculateRow = (row: PurchaseReturnRow, prod?: ProductOption): PurchaseReturnRow => {
    const product = prod || products.find((p) => p.id === row.productId);
    if (!product) {
      return { ...row, totalPieces: 0, lineTotal: 0, availableStock: 0 };
    }

    const boxesPerCarton = Math.max(1, product.boxes_per_carton || 1);
    const piecesPerBox = Math.max(1, product.pieces_per_box || 1);
    const totalPiecesPerCarton = Math.max(1, product.total_pieces_per_carton || boxesPerCarton * piecesPerBox);

    const ctn = row.cartonsQty === '' ? 0 : Number(row.cartonsQty);
    const box = row.boxesQty === '' ? 0 : Number(row.boxesQty);
    const pcs = row.piecesQty === '' ? 0 : Number(row.piecesQty);

    const totalPcs = ctn * totalPiecesPerCarton + box * piecesPerBox + pcs;
    const rate = row.ratePerPiece > 0 ? row.ratePerPiece : (product.base_rate_per_piece || Math.round((product.cost_price / totalPiecesPerCarton) * 100) / 100);
    const lineTotal = Math.round(totalPcs * rate * 100) / 100;

    return {
      ...row,
      totalPieces: totalPcs,
      ratePerPiece: rate,
      lineTotal,
      availableStock: product.current_stock_base,
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
            ratePerPiece: 0,
            lineTotal: 0,
            availableStock: 0,
          };
        }

        const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
        const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
        const totalPiecesPerCarton = Math.max(1, prod.total_pieces_per_carton || boxesPerCarton * piecesPerBox);
        const defaultRate = prod.base_rate_per_piece || Math.round((prod.cost_price / totalPiecesPerCarton) * 100) / 100;

        const updated: PurchaseReturnRow = {
          ...r,
          productId: newProdId,
          cartonsQty: '',
          boxesQty: '',
          piecesQty: 1,
          totalPieces: 1,
          ratePerPiece: defaultRate,
          lineTotal: defaultRate,
          availableStock: prod.current_stock_base,
        };

        return updated;
      })
    );
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

  const handleRateChange = (rowId: string, value: string) => {
    const rate = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const lineTotal = Math.round(r.totalPieces * rate * 100) / 100;
        return { ...r, ratePerPiece: rate, lineTotal };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: String(Date.now()) + Math.random().toString(36).substring(2, 5),
        productId: '',
        cartonsQty: '',
        boxesQty: '',
        piecesQty: 1,
        totalPieces: 1,
        ratePerPiece: 0,
        lineTotal: 0,
        availableStock: 0,
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Totals
  const totals = useMemo(() => {
    let amount = 0;
    let totalPcs = 0;

    rows.forEach((r) => {
      amount += r.lineTotal;
      totalPcs += r.totalPieces;
    });

    return {
      amount,
      totalPcs,
    };
  }, [rows]);

  // Validation
  const validation = useMemo(() => {
    if (!vendorId) return { valid: false, message: 'Please select a vendor.' };
    if (rows.length === 0) return { valid: false, message: 'At least one item is required.' };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.productId) return { valid: false, message: `Row ${i + 1}: Please select a product.` };
      if (r.totalPieces <= 0) return { valid: false, message: `Row ${i + 1}: Return quantity must be greater than 0.` };
      if (r.totalPieces > r.availableStock) {
        return {
          valid: false,
          message: `Row ${i + 1}: Return quantity (${r.totalPieces} Pcs) exceeds warehouse stock (${r.availableStock} Pcs).`,
        };
      }
    }

    return { valid: true, message: '' };
  }, [vendorId, rows]);

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
        vendorId,
        returnDate,
        vendorInvoiceNumber: vendorInvoiceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          cartonsQty: Number(r.cartonsQty) || 0,
          boxesQty: Number(r.boxesQty) || 0,
          piecesQty: Number(r.piecesQty) || 0,
          totalBaseQty: r.totalPieces,
          ratePerPiece: r.ratePerPiece,
        })),
      };

      const res = await fetch('/api/returns/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to post purchase return.');
      }

      // Fetch detail for printing
      const detailRes = await fetch(`/api/returns/purchase?id=${data.data.returnId}`).then((r) => r.json());
      const printDoc = detailRes.success ? detailRes.data : undefined;

      setSuccessResult({
        returnId: data.data.returnId,
        returnNumber: data.data.returnNumber,
        totalAmount: data.data.totalAmount,
        printDoc,
      });

      if (printDoc) {
        setPrintModalDoc(printDoc);
      }

      // Reset
      setRows([
        {
          id: String(Date.now()),
          productId: '',
          cartonsQty: '',
          boxesQty: '',
          piecesQty: 1,
          totalPieces: 1,
          ratePerPiece: 0,
          lineTotal: 0,
          availableStock: 0,
        },
      ]);
      setVendorInvoiceNumber('');
      setNotes('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record purchase return.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPrintModalForId = async (returnId: string) => {
    try {
      const res = await fetch(`/api/returns/purchase?id=${returnId}`).then((r) => r.json());
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
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Undo2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Purchase Return</h1>
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
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Debit Note
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Debit Notes History
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
                Purchase Return Debit Note {successResult.returnNumber} Posted Successfully!
              </h3>
              <p className="text-xs text-emerald-700">
                Debit note of {formatCurrency(successResult.totalAmount)} debited to Accounts Payable and warehouse inventory relieved.
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
                Print Debit Note
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

      {/* TAB 1: NEW DEBIT NOTE */}
      {activeTab === 'NEW_RETURN' && (
        <div className="space-y-6">
          {/* Top Form Header Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Purchase Return Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Vendor Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Select Vendor / Supplier *
                </label>
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorId}
                  onChange={(val) => setVendorId(val)}
                  placeholder="-- Choose Vendor --"
                  className="w-full"
                />

                {/* Live AP Balance */}
                {selectedVendor && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Live AP Balance:</span>
                    <span
                      className={`font-semibold tabular-nums px-2 py-0.5 rounded-full ${
                        selectedVendor.current_balance > 0
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {formatCurrency(selectedVendor.current_balance)}
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
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Original Vendor Invoice Ref */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Original Vendor Invoice / Bill #
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-98421"
                  value={vendorInvoiceNumber}
                  onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Items Grid Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  Return Items
                </h2>
              </div>

              <button
                type="button"
                onClick={addRow}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-blue-200 transition-all"
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
                    <th className="py-2.5 px-3 min-w-[280px]">Product & Available Stock</th>
                    <th className="py-2.5 px-2 text-right w-20">Carton</th>
                    <th className="py-2.5 px-2 text-right w-20">Box</th>
                    <th className="py-2.5 px-2 text-right w-20">Pieces</th>
                    <th className="py-2.5 px-3 text-right w-24">Total Pcs</th>
                    <th className="py-2.5 px-3 text-right w-28">Cost Rate (Pcs)</th>
                    <th className="py-2.5 px-3 text-right w-32">Line Total</th>
                    <th className="py-2.5 px-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {rows.map((row) => {
                    const isExceeded = row.productId && row.totalPieces > row.availableStock;

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isExceeded ? 'bg-rose-50/40' : ''
                        }`}
                      >
                        {/* Product Selection */}
                        <td className="py-3 px-3 align-top">
                          <SearchableSelect
                            options={productOptions}
                            value={row.productId}
                            onChange={(val) => handleProductChange(row.id, val)}
                            placeholder="-- Select Product --"
                            className="w-full min-w-[220px]"
                          />

                          {/* Stock Pill */}
                          {row.productId && (
                            <div className="mt-1 flex items-center gap-1 text-[11px]">
                              <span className="text-slate-500">Warehouse Stock:</span>
                              <span
                                className={`font-semibold tabular-nums px-1.5 py-0.2 rounded ${
                                  isExceeded
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {formatInteger(row.availableStock)} Pcs
                              </span>
                              {isExceeded && (
                                <span className="text-rose-600 font-medium ml-1">
                                  (Cannot return more than physical stock)
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Cartons */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.cartonsQty}
                            onChange={(e) => handleQtyChange(row.id, 'cartonsQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Boxes */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.boxesQty}
                            onChange={(e) => handleQtyChange(row.id, 'boxesQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Pieces */}
                        <td className="py-3 px-2 align-top text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.piecesQty}
                            onChange={(e) => handleQtyChange(row.id, 'piecesQty', e.target.value)}
                            className="w-16 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Total Base Pcs */}
                        <td className="py-3 px-3 align-top text-right">
                          <span
                            className={`inline-block font-semibold tabular-nums px-2 py-1 rounded text-xs ${
                              isExceeded
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
                            value={row.ratePerPiece}
                            onChange={(e) => handleRateChange(row.id, e.target.value)}
                            className="w-24 text-right tabular-nums bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="py-3 px-3 align-top text-right font-semibold tabular-nums text-slate-900">
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

          {/* Bottom Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Notes */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Debit Note Remarks / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Return of expired batch, damaged goods returned to vendor..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Base Pieces:</span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatInteger(totals.totalPcs)} Pcs</span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900">Total Debit Note:</span>
                  <span className="text-xl font-bold tracking-tight tabular-nums text-blue-700">
                    {formatCurrency(totals.amount)}
                  </span>
                </div>
              </div>

              {/* Validation Notice */}
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
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl shadow transition-all flex items-center justify-center gap-2 text-sm"
              >
                {submitting ? (
                  <>
                    <Undo2 className="w-4 h-4 animate-spin" />
                    Posting Debit Note...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save & Post Debit Note
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEBIT NOTES HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          {/* Distinct Filter Section Card */}
          <div className="filter-section-card p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Debit Notes History
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <DateRangeFilter
                  fromDate={dateFrom}
                  toDate={dateTo}
                  onFromDateChange={setDateFrom}
                  onToDateChange={setDateTo}
                />
                <div className="relative">
                  <label className="sr-only">Search Debit Notes</label>
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search debit note # or vendor..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="filter-input-control pl-9 pr-3 py-1.5 text-xs rounded-lg text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 w-full sm:w-64"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">

          {loadingHistory ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading debit notes...</div>
          ) : historyList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No debit notes posted yet.</div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No debit notes match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2.5 px-3">Debit Note #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Vendor</th>
                    <th className="py-2.5 px-3">Original Invoice #</th>
                    <th className="py-2.5 px-3 text-right">Total Debit</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {historyPagination.paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-semibold text-blue-700">
                        <BusinessReferenceLink
                          businessReference={item.return_number}
                          sourceDocumentId={item.id}
                          sourceModule="returns"
                          transactionType="Purchase Return"
                        />
                      </td>
                      <td className="py-3 px-3 text-slate-600">{item.return_date}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{item.vendor_name}</td>
                      <td className="py-3 px-3 text-slate-600">{item.vendor_invoice_number || '—'}</td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-slate-900">
                        {formatCurrency(item.total_amount)}
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
                                endpoint: `/api/returns/purchase/${item.id}`,
                              })
                            }
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold p-1.5 rounded transition-colors"
                            title="Delete & Reverse Debit Note"
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

      {/* PRINT MODAL (Thermal 80mm & Standard A4 Debit Note) */}
      {printModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Top Bar */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Debit Note Print Preview • {printModalDoc.return_number}
                </h3>
              </div>

              {/* Format Toggle */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-200 p-0.5 rounded-lg flex text-xs">
                  <button
                    type="button"
                    onClick={() => setPrintFormat('THERMAL')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      printFormat === 'THERMAL' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    80mm Thermal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFormat('A4')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      printFormat === 'A4' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
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

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
              {/* 80mm Thermal */}
              {printFormat === 'THERMAL' && (
                <div
                  id="printable-debit-note"
                  className="bg-white p-4 shadow border border-slate-300 w-[300px] text-[11px] font-mono leading-tight space-y-3"
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
                      DEBIT NOTE
                    </div>
                  </div>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span>Debit Note #:</span>
                      <span className="font-bold">{printModalDoc.return_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{printModalDoc.return_date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vendor:</span>
                      <span className="font-bold">{printModalDoc.vendor_name}</span>
                    </div>
                    {printModalDoc.vendor_invoice_number && (
                      <div className="flex justify-between text-slate-600">
                        <span>Ref Bill #:</span>
                        <span>{printModalDoc.vendor_invoice_number}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-b border-dashed border-slate-400 py-2">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-300">
                          <th className="pb-1">Item</th>
                          <th className="pb-1 text-right">Qty (PCS)</th>
                          <th className="pb-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {printModalDoc.items?.map((it: any) => (
                          <tr key={it.id}>
                            <td className="py-1">
                              <div>{it.product_name}</div>
                              <span className="text-[9px] text-slate-500 tabular-nums">
                                @ {formatCurrency(it.rate_per_piece)}
                              </span>
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums">{formatInteger(it.total_base_qty)}</td>
                            <td className="py-1 text-right font-semibold tabular-nums">{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-1 text-right">
                    <div className="flex justify-between text-xs font-black">
                      <span>TOTAL DEBIT:</span>
                      <span className="tabular-nums">{formatCurrency(printModalDoc.total_amount)}</span>
                    </div>
                  </div>

                  <div className="pt-4 text-center text-[9px] text-slate-500 border-t border-dashed border-slate-300 space-y-1">
                    <p className="whitespace-pre-line">{companyProfile.thermalFooterNote || 'Goods returned to vendor warehouse.\nSaleFlow Distribution ERP'}</p>
                  </div>
                </div>
              )}

              {/* Standard A4 */}
              {printFormat === 'A4' && (
                <div
                  id="printable-debit-note"
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
                            {(companyProfile.phonePrimary || companyProfile.phoneSecondary) && ` • Tel: ${[companyProfile.phonePrimary, companyProfile.phoneSecondary].filter(Boolean).join(' / ')}`}
                          </p>
                        )}
                        {companyProfile.showNtnOnInvoices && companyProfile.ntnStrn && (
                          <p className="text-xs font-bold text-slate-600">{companyProfile.ntnStrn}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-blue-700">PURCHASE DEBIT NOTE</div>
                      <p className="text-xs font-semibold text-slate-800">
                        #{printModalDoc.return_number}
                      </p>
                      <p className="text-xs text-slate-500">Date: {printModalDoc.return_date}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Supplier / Vendor:</span>
                      <p className="text-sm font-bold text-slate-900">{printModalDoc.vendor_name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Reference Details:</span>
                      <p className="text-sm font-semibold text-slate-800">
                        Original Bill Ref: {printModalDoc.vendor_invoice_number || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 text-xs font-bold">
                      <tr>
                        <th className="p-2.5">SKU / Item Description</th>
                        <th className="p-2.5 text-right">Qty (PCS)</th>
                        <th className="p-2.5 text-right">Cost Rate</th>
                        <th className="p-2.5 text-right">Total Debit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {printModalDoc.items?.map((it: any) => (
                        <tr key={it.id}>
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-900">{it.product_name}</span>
                            <span className="text-slate-500 block text-[11px]">SKU: {it.sku}</span>
                          </td>
                          <td className="p-2.5 text-right font-semibold tabular-nums text-slate-900">
                            {formatInteger(it.total_base_qty)}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-slate-700">
                            {formatCurrency(it.rate_per_piece)}
                          </td>
                          <td className="p-2.5 text-right font-bold tabular-nums text-slate-900">
                            {formatCurrency(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-2 text-right">
                      <div className="flex justify-between font-extrabold text-base text-slate-900 border-t-2 border-slate-900 pt-2">
                        <span>Total Debit Amount:</span>
                        <span className="text-blue-700 tabular-nums">{formatCurrency(printModalDoc.total_amount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
                    <div className="border-t border-slate-300 pt-1">Vendor Warehouse Representative</div>
                    <div className="border-t border-slate-300 pt-1">Warehouse Dispatch Incharge</div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
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
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
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
            type: 'Purchase Return',
            number: deleteTarget.number,
            date: deleteTarget.date,
            endpoint: deleteTarget.endpoint,
          }}
        />
      )}
    </ListPageContainer>
  );
}
