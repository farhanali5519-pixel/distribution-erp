'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  FileText,
  Printer,
  Calendar,
  Building2,
  User,
  Truck,
  CreditCard,
  DollarSign,
  Package,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldCheck,
  Ban
} from 'lucide-react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { ResolvedTransactionTarget } from '@/shared/utils/transaction-navigation-resolver';

export interface UniversalTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: ResolvedTransactionTarget | null;
  onNavigate?: (target: ResolvedTransactionTarget) => void;
}

export function UniversalTransactionModal({
  isOpen,
  onClose,
  target,
  onNavigate,
}: UniversalTransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load transaction details whenever target changes
  const loadTransactionData = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      let resolvedId = target.id;
      let resolvedType = target.type;

      // 1. If ID is missing, perform quick reference lookup
      if (!resolvedId && target.reference) {
        const lookupRes = await fetch(
          `/api/transactions/lookup?ref=${encodeURIComponent(target.reference)}`
        );
        const lookupData = await lookupRes.json();
        if (lookupData.success && lookupData.id) {
          resolvedId = lookupData.id;
          resolvedType = lookupData.type || resolvedType;
        } else {
          throw new Error(
            `Source transaction "${target.reference}" is unavailable or no longer exists.`
          );
        }
      }

      if (!resolvedId) {
        throw new Error('Transaction identifier is missing or could not be determined.');
      }

      // 2. Fetch specific transaction data
      let endpoint = '';
      if (resolvedType === 'purchase_bill') {
        endpoint = `/api/purchase/bills/${resolvedId}`;
      } else if (resolvedType === 'sales_order') {
        endpoint = `/api/sales/orders/${resolvedId}`;
      } else if (resolvedType === 'sales_invoice') {
        endpoint = `/api/sales?id=${resolvedId}`;
      } else if (resolvedType === 'payment_received') {
        endpoint = `/api/payments/received/${resolvedId}`;
      } else if (resolvedType === 'payment_made') {
        endpoint = `/api/payments/made/${resolvedId}`;
      } else if (resolvedType === 'sales_return') {
        endpoint = `/api/returns/sales/${resolvedId}`;
      } else if (resolvedType === 'purchase_return') {
        endpoint = `/api/returns/purchase/${resolvedId}`;
      } else if (resolvedType === 'expense') {
        endpoint = `/api/expenses/${resolvedId}`;
      } else if (resolvedType === 'journal_entry') {
        endpoint = `/api/accounting/journal/${resolvedId}`;
      } else if (resolvedType === 'stock_adjustment') {
        endpoint = `/api/inventory/adjust/${resolvedId}`;
      } else {
        // Fallback to journal entry
        endpoint = `/api/accounting/journal/${resolvedId}`;
      }

      const res = await fetch(endpoint);
      const resJson = await res.json();

      if (!res.ok || !resJson.success) {
        throw new Error(
          resJson.message || resJson.error || 'Failed to fetch transaction record.'
        );
      }

      setData({
        type: resolvedType,
        ...resJson,
      });
    } catch (err: any) {
      console.warn('Transaction preview load error:', err);
      setError(err.message || 'Source transaction unavailable.');
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (isOpen && target) {
      loadTransactionData();
    } else {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, target, loadTransactionData]);

  if (!isOpen) return null;

  const displayRef =
    target?.reference ||
    data?.bill?.bill_number ||
    data?.order?.order_number ||
    data?.invoice?.invoice_number ||
    data?.payment?.payment_number ||
    data?.payment?.voucher_number ||
    data?.return?.return_number ||
    data?.expense?.voucher_number ||
    data?.adjustment?.adjustment_number ||
    data?.entry?.entry_number ||
    'Transaction Detail';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
      >
        {/* HEADER */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-[var(--color-primary-soft,rgba(16,185,129,0.1))] text-[var(--color-primary,#059669)] border border-[var(--color-primary,#059669)]/20">
              {target?.label || 'Transaction'}
            </span>
            <h2
              id="transaction-modal-title"
              className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-slate-100 truncate"
            >
              {displayRef}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-700 dark:text-slate-300">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <RotateCw className="animate-spin text-[var(--color-primary,#059669)]" size={30} />
              <p className="text-xs font-medium text-slate-500">Retrieving source transaction details...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg text-amber-800 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Source Transaction Unavailable</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                {error}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Reference: <code className="font-mono font-semibold">{displayRef}</code>. The record may have been archived or removed from the system.
              </p>
            </div>
          ) : data ? (
            renderTransactionContent(data, onNavigate)
          ) : (
            <div className="py-12 text-center text-slate-400">No data available.</div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            SaleFlow Central Reference Navigator
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inner renderer based on transaction record type
 */
function renderTransactionContent(
  data: any,
  onNavigate?: (target: ResolvedTransactionTarget) => void
) {
  // 1. PURCHASE BILL
  if (data.type === 'purchase_bill' && data.bill) {
    const b = data.bill;
    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendor</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{b.vendor_name}</span>
            {b.vendor_phone && <span className="text-[10px] text-slate-500 block">{b.vendor_phone}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Bill Date</span>
            <span className="font-semibold">{b.bill_date}</span>
            {b.due_date && <span className="text-[10px] text-slate-500 block">Due: {b.due_date}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Warehouse</span>
            <span className="font-semibold">{b.warehouse || 'Main Warehouse'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Net Payable</span>
            <span className="font-bold text-sm tabular-nums text-[var(--color-primary,#059669)]">
              {formatCurrency(b.net_amount)}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        {b.items && b.items.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Inward Items ({b.items.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Item / SKU</th>
                    <th className="py-2 px-2 text-right">Cartons</th>
                    <th className="py-2 px-2 text-right">Boxes</th>
                    <th className="py-2 px-2 text-right">Loose</th>
                    <th className="py-2 px-2 text-right font-bold">Total Pcs</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {b.items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{it.product_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">SKU: {it.product_sku || it.sku}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{it.cartons_qty ? formatInteger(it.cartons_qty) : '-'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{it.boxes_qty ? formatInteger(it.boxes_qty) : '-'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{it.loose_pieces_qty ? formatInteger(it.loose_pieces_qty) : '-'}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatInteger(it.total_pieces)} {it.uom_base || 'Pcs'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(it.rate_per_piece)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-[var(--color-primary,#059669)]">
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Linked Double-Entry GL lines */}
        {renderJournalLinesTable(b.journalLines)}
      </div>
    );
  }

  // 2. SALES ORDER
  if (data.type === 'sales_order' && data.order) {
    const o = data.order;
    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{o.customer_name}</span>
            {o.route_name && <span className="text-[10px] text-slate-500 block">Route: {o.route_name}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Order Date</span>
            <span className="font-semibold">{o.order_date}</span>
            <span className="text-[10px] text-slate-500 block">Source: {o.source || 'OFFICE'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Staff Link</span>
            <span className="font-semibold">{o.salesman_name || 'Direct'}</span>
            {o.supply_person_name && <span className="text-[10px] text-slate-500 block">Supply: {o.supply_person_name}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Amount</span>
            <span className="font-bold text-sm tabular-nums text-[var(--color-primary,#059669)]">
              {formatCurrency(o.grand_total)}
            </span>
            {o.cash_received > 0 && (
              <span className="text-[10px] text-slate-500 block">Spot Cash: {formatCurrency(o.cash_received)}</span>
            )}
          </div>
        </div>

        {/* Order Items */}
        {o.items && o.items.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Billed Line Items ({o.items.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-2 text-right">Base Qty</th>
                    <th className="py-2 px-2 text-right">Bonus</th>
                    <th className="py-2 px-2 text-right">Unit Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {o.items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{it.product_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">SKU: {it.sku}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatInteger(it.quantity_base)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-emerald-600">
                        {it.scheme_bonus_base > 0 ? `+${formatInteger(it.scheme_bonus_base)}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-[var(--color-primary,#059669)]">
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Linked Double-Entry GL lines */}
        {renderJournalLinesTable(o.journal_lines || o.journalLines)}
      </div>
    );
  }

  // 3. SALES INVOICE
  if (data.type === 'sales_invoice' && data.invoice) {
    const inv = data.invoice;
    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{inv.customer_name}</span>
            {inv.route_name && <span className="text-[10px] text-slate-500 block">Route: {inv.route_name}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Invoice Date</span>
            <span className="font-semibold">{inv.invoice_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Staff</span>
            <span className="font-semibold">{inv.salesman_name || 'Direct'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Net Amount</span>
            <span className="font-bold text-sm tabular-nums text-[var(--color-primary,#059669)]">
              {formatCurrency(inv.net_amount || inv.grand_total)}
            </span>
          </div>
        </div>

        {/* Invoice items */}
        {inv.items && inv.items.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Billed Items ({inv.items.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {inv.items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{it.product_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatInteger(it.quantity_base || it.quantity)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-[var(--color-primary,#059669)]">
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Linked Double-Entry GL lines */}
        {renderJournalLinesTable(inv.journal_lines || inv.journalLines)}
      </div>
    );
  }

  // 4. CUSTOMER PAYMENT RECEIVED
  if (data.type === 'payment_received' && data.payment) {
    const p = data.payment;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{p.customer_name}</span>
            {p.shop_name && <span className="text-[10px] text-slate-500 block">{p.shop_name}</span>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Receipt Date</span>
            <span className="font-semibold">{p.payment_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Deposit Account</span>
            <span className="font-semibold">{p.account_name || 'Cash in Hand'}</span>
            <span className="text-[10px] text-slate-500 block">Method: {p.payment_method}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount Received</span>
            <span className="font-bold text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(p.amount)}
            </span>
          </div>
        </div>

        {/* Allocations Table */}
        {p.allocations && p.allocations.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Allocated Against Invoices / Orders ({p.allocations.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Document Number</th>
                    <th className="py-2 px-2 text-right font-bold">Allocated Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {p.allocations.map((al: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-mono font-semibold text-sky-600 dark:text-sky-400">
                        {al.order_number || al.invoice_number || al.invoiceNumber || 'Sale Document'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-emerald-600">
                        {formatCurrency(al.allocated_amount || al.amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Linked Double-Entry GL lines */}
        {renderJournalLinesTable(p.journal_lines || p.journalLines)}
      </div>
    );
  }

  // 5. VENDOR PAYMENT MADE
  if (data.type === 'payment_made' && data.payment) {
    const p = data.payment;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendor</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{p.vendor_name}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Payment Date</span>
            <span className="font-semibold">{p.payment_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Paid From</span>
            <span className="font-semibold">{p.account_name || 'Bank Account'}</span>
            <span className="text-[10px] text-slate-500 block">Method: {p.payment_method}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount Paid</span>
            <span className="font-bold text-sm tabular-nums text-rose-600 dark:text-rose-400">
              {formatCurrency(p.amount)}
            </span>
          </div>
        </div>

        {/* Allocations Table */}
        {p.allocations && p.allocations.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Allocated Against Purchase Bills ({p.allocations.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Bill Number</th>
                    <th className="py-2 px-2 text-right font-bold">Allocated Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {p.allocations.map((al: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-mono font-semibold text-sky-600 dark:text-sky-400">
                        {al.bill_number || al.billNumber || 'Purchase Bill'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-rose-600">
                        {formatCurrency(al.allocated_amount || al.amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Linked Double-Entry GL lines */}
        {renderJournalLinesTable(p.journal_lines || p.journalLines)}
      </div>
    );
  }

  // 6. SALES RETURN
  if (data.type === 'sales_return' && data.return) {
    const r = data.return;
    const items = data.items || [];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{r.customer_name}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Return Date</span>
            <span className="font-semibold">{r.return_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Settlement</span>
            <span className="font-semibold text-indigo-600">{r.settlement_type === 'CREDIT_TO_LEDGER' ? 'Credit to Ledger' : 'Cash Refund'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Refund</span>
            <span className="font-bold text-sm tabular-nums text-indigo-700 dark:text-indigo-400">
              {formatCurrency(r.total_refund)}
            </span>
          </div>
        </div>

        {items.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Returned Items ({items.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-2">Condition</th>
                    <th className="py-2 px-2 text-right">Qty (Pcs)</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{it.product_name}</td>
                      <td className="py-2 px-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {it.condition}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatInteger(it.total_base_qty || it.total_pieces)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(it.unit_rate)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-indigo-700">
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 7. PURCHASE RETURN
  if (data.type === 'purchase_return' && data.return) {
    const r = data.return;
    const items = data.items || [];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendor</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{r.vendor_name}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Return Date</span>
            <span className="font-semibold">{r.return_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Warehouse</span>
            <span className="font-semibold">{r.warehouse || 'Main'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Debit Note</span>
            <span className="font-bold text-sm tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(r.total_amount)}
            </span>
          </div>
        </div>

        {items.length > 0 && (
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider">
              Returned Items ({items.length})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-2 text-right">Total Pcs</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{it.product_name}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatInteger(it.total_pieces)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(it.rate_per_piece)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-amber-700">
                        {formatCurrency(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 8. EXPENSE VOUCHER
  if (data.type === 'expense' && data.expense) {
    const e = data.expense;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Expense Head</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{e.expense_account_name || 'Operating Expense'}</span>
            <span className="text-[10px] font-mono text-slate-400 block">{e.expense_account_code}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Expense Date</span>
            <span className="font-semibold">{e.expense_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Paid From</span>
            <span className="font-semibold">{e.paid_from_account_name || 'Cash in Hand'}</span>
            <span className="text-[10px] font-mono text-slate-400 block">{e.paid_from_account_code}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount</span>
            <span className="font-bold text-sm tabular-nums text-rose-600 dark:text-rose-400">
              {formatCurrency(e.amount)}
            </span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Description / Purpose</span>
          <p className="text-xs text-slate-800 dark:text-slate-200 mt-0.5">{e.description || 'No description provided.'}</p>
          {(e.staff_name || e.vehicle_number) && (
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
              {e.staff_name && <span>Staff: <strong>{e.staff_name}</strong></span>}
              {e.vehicle_number && <span>Vehicle: <strong>{e.vehicle_number}</strong></span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 9. GENERAL JOURNAL ENTRY (DEFAULT / DIRECT)
  if ((data.type === 'journal_entry' || data.entry) && (data.entry || data.lines)) {
    const je = data.entry || data;
    const lines = data.lines || je.lines || [];

    const totalDebit = lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);

    return (
      <div className="space-y-4">
        {/* Entry Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Voucher Number</span>
            <span className="font-bold font-mono text-sky-600 dark:text-sky-400">{je.entry_number}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Entry Date</span>
            <span className="font-semibold">{je.entry_date}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Source Module</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {je.source_module || 'MANUAL'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Amount</span>
            <span className="font-bold text-sm tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(totalDebit || je.total_amount || 0)}
            </span>
          </div>
        </div>

        {/* Narration */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Narration</span>
          <p className="text-xs text-slate-800 dark:text-slate-200 mt-0.5">{je.description || 'No narration entered.'}</p>
        </div>

        {/* Double-entry lines */}
        {renderJournalLinesTable(lines)}
      </div>
    );
  }

  // 10. STOCK ADJUSTMENT
  if (data.type === 'stock_adjustment' && data.adjustment) {
    const adj = data.adjustment;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Adjustment #</span>
            <span className="font-bold font-mono text-sky-600 dark:text-sky-400">{adj.adjustment_number}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Date</span>
            <span className="font-semibold">{adj.adjustment_date || adj.created_at?.slice(0, 10)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Warehouse</span>
            <span className="font-semibold">{adj.warehouse || 'Main Warehouse'}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Reason / Notes</span>
          <p className="text-xs text-slate-800 dark:text-slate-200 mt-0.5">{adj.reason || adj.notes || 'Routine stock physical count reconciliation'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 rounded-lg text-slate-600">
      Transaction preview ready for {data.type || 'record'}.
    </div>
  );
}

/**
 * Reusable Double-Entry General Ledger lines table
 */
function renderJournalLinesTable(lines: any[] | undefined) {
  if (!lines || lines.length === 0) return null;

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  return (
    <div>
      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
        <FileText size={13} className="text-sky-600" />
        Double-Entry General Ledger Voucher ({lines.length} lines)
      </h4>
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-2 px-3">Account Code & Name</th>
              <th className="py-2 px-3">Sub-Ledger / Entity</th>
              <th className="py-2 px-3">Memo</th>
              <th className="py-2 px-3 text-right">Debit (Dr)</th>
              <th className="py-2 px-3 text-right">Credit (Cr)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {lines.map((jl, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="py-2 px-3">
                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400 mr-1.5">
                    {jl.account_code || jl.accountCode}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {jl.account_name || jl.accountName}
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-500">
                  {jl.entity_name || jl.entityName || (jl.entity_type ? `[${jl.entity_type}]` : '—')}
                </td>
                <td className="py-2 px-3 text-slate-500 italic max-w-xs truncate">
                  {jl.memo || '—'}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {Number(jl.debit) > 0 ? formatCurrency(jl.debit) : '—'}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                  {Number(jl.credit) > 0 ? formatCurrency(jl.credit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t border-slate-200 dark:border-slate-700">
            <tr>
              <td colSpan={3} className="py-2 px-3 text-right uppercase text-[10px] text-slate-500">
                Voucher Totals:
              </td>
              <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(totalDebit)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
