'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import {
  Package,
  Printer,
  Search,
  AlertTriangle,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Filter
} from 'lucide-react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { StockValuationSummary, StockValuationRow } from '@/modules/reports/types';

export default function StockValuationPage() {
  const [valuation, setValuation] = useState<StockValuationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const fetchValuation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/stock-valuation').then((r) => r.json());
      if (!res.success) {
        throw new Error(res.message || 'Failed to fetch stock valuation report.');
      }
      setValuation(res.data);
    } catch (err: any) {
      setError(err.message || 'Error generating stock valuation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValuation();
  }, []);

  const categoryOptions = useMemo(() => {
    if (!valuation) return [];
    const catMap = new Map<string, number>();
    valuation.rows.forEach((r) => {
      catMap.set(r.categoryName, (catMap.get(r.categoryName) || 0) + 1);
    });
    return Array.from(catMap.entries()).map(([name, count]) => ({
      value: name,
      label: name,
      badge: `${count} items`,
      badgeColor: 'emerald' as const,
      keywords: [name],
    }));
  }, [valuation]);

  const filteredRows = useMemo(() => {
    if (!valuation) return [];
    return valuation.rows.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategories.length === 0 || selectedCategories.includes(r.categoryName);
    });
  }, [valuation, search, selectedCategories]);

  const pagination = usePagination(filteredRows);

  return (
    <ListPageContainer className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Stock Valuation Summary</h1>
              <p className="text-xs text-slate-500">
                Warehouse stock valuation, packaging breakdown, and inventory audit.
              </p>
            </div>
          </div>
        </div>

        {/* Print Button */}
        {valuation && (
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Valuation (A4)
          </button>
        )}
      </div>

      {/* Summary KPI Ribbon */}
      {valuation && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
          {/* Sellable Stock Value */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Sellable Inventory Value
            </span>
            <span className="text-xl font-bold tracking-tight tabular-nums text-slate-900 block mt-1">
              {formatCurrency(valuation.totalSellableStockValue)}
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block tabular-nums">
              {formatInteger(valuation.totalSellablePieces)} Total Base Pieces in Warehouse
            </span>
          </div>

          {/* Damaged Quarantine Value */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              Quarantined Damaged Stock
            </span>
            <span className="text-xl font-bold tracking-tight tabular-nums text-amber-900 block mt-1">
              {formatCurrency(valuation.totalDamagedStockValue)}
            </span>
            <span className="text-xs text-amber-700 mt-0.5 block tabular-nums">
              {formatInteger(valuation.totalDamagedPieces)} Damaged / Expired Pieces Isolated
            </span>
          </div>

          {/* Combined Total Value */}
          <div className="bg-blue-50/80 p-4 rounded-xl border border-blue-200 shadow-sm">
            <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
              Combined Total Stock Value
            </span>
            <span className="text-xl font-bold tracking-tight tabular-nums text-blue-900 block mt-1">
              {formatCurrency(valuation.totalCombinedStockValue)}
            </span>
            <span className="text-xs text-blue-700 mt-0.5 block">
              At Baseline Purchase Cost Rate
            </span>
          </div>

          {/* GL Reconciliation Balance */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              GL 1040 Inventory Account
            </span>
            <span className="text-xl font-bold tracking-tight tabular-nums text-slate-900 block mt-1">
              {formatCurrency(valuation.glInventoryAccountBalance)}
            </span>
            <div className="flex items-center gap-1 mt-0.5 text-xs">
              <span className="text-slate-500">Variance:</span>
              <span
                className={`font-semibold tabular-nums ${
                  valuation.varianceWithGL === 0 ? 'text-emerald-700' : 'text-slate-700'
                }`}
              >
                {formatCurrency(valuation.varianceWithGL)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="filter-section-card p-4 space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Stock Valuation Filters
            </span>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredRows.length}</strong> products
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <label className="sr-only">Search Product</label>
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product SKU or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider shrink-0">
              Category:
            </span>
            <SearchableSelect
              mode="multiple"
              options={categoryOptions}
              value={selectedCategories}
              onChange={(vals) => setSelectedCategories(vals)}
              placeholder="All Categories"
              className="w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Inventory Breakdown Table & Printable Audit Sheet */}
      {valuation && (
        <div
          id="stock-valuation-sheet"
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 print:border-none print:shadow-none print:p-0 print:m-0"
        >
          {/* Print Header */}
          <div className="hidden print:flex justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">SALEFLOW DISTRIBUTION ERP</h2>
              <p className="text-xs text-slate-500">Warehouse Godown Physical Inventory & Valuation Report</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700">Audit Date: {new Date().toLocaleDateString()}</span>
              <p className="text-[10px] text-slate-400">Values based on base purchase cost</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200 rounded-lg overflow-hidden text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Product Name & Packaging</th>
                  <th className="py-2.5 px-3 text-right">Packaging Breakdown</th>
                  <th className="py-2.5 px-3 text-right">Total Pcs</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right">Sellable Value</th>
                  <th className="py-2.5 px-3 text-right">Quarantine Pcs</th>
                  <th className="py-2.5 px-3 text-right">Damaged Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                      No matching products found.
                    </td>
                  </tr>
                ) : (
                  pagination.paginatedItems.map((r) => (
                    <tr
                      key={r.productId}
                      className={`hover:bg-slate-50 transition-colors ${
                        r.isLowStock ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-700">{r.sku}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          {r.name}
                          {r.isLowStock && (
                            <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> Low Stock
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {r.categoryName} • 1 Ctn = {formatInteger(r.totalPiecesPerCarton)} Pcs ({formatInteger(r.boxesPerCarton)} Box × {formatInteger(r.piecesPerBox)} Pcs)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 tabular-nums">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {formatInteger(r.cartonsCount)} Ctn, {formatInteger(r.boxesCount)} Box, {formatInteger(r.piecesCount)} Pcs
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatInteger(r.currentStockBase)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                        {formatCurrency(r.unitCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                        {formatCurrency(r.sellableStockValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-800">
                        {r.damagedStockBase > 0 ? (
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[11px] font-bold">
                            {formatInteger(r.damagedStockBase)} Pcs
                          </span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-900 font-semibold">
                        {r.damagedStockValue > 0 ? formatCurrency(r.damagedStockValue) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Table Footer */}
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-xs">
                <tr>
                  <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-slate-700 text-right">
                    Total Warehouse Stock Valuations:
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-900">
                    {formatInteger(valuation.totalSellablePieces)}
                  </td>
                  <td></td>
                  <td className="py-3 px-3 text-right tabular-nums text-blue-900 font-bold">
                    {formatCurrency(valuation.totalSellableStockValue)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-amber-900">
                    {formatInteger(valuation.totalDamagedPieces)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-amber-900 font-bold">
                    {formatCurrency(valuation.totalDamagedStockValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="print:hidden">
            <PaginationControls {...pagination} />
          </div>

          {/* Corporate Signatures Block (For Print) */}
          <div className="pt-14 hidden print:grid grid-cols-3 gap-8 text-center text-xs text-slate-500 border-t border-slate-200">
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Stock Incharge</div>
              <div className="text-[10px] text-slate-400">Warehouse Godown Manager</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Physical Verifier</div>
              <div className="text-[10px] text-slate-400">Internal Audit Associate</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Operations Director</div>
              <div className="text-[10px] text-slate-400">Supply Chain Head</div>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
