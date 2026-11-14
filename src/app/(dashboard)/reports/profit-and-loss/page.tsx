'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Printer,
  Calendar,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  PieChart,
  Percent,
  Receipt,
  FileSpreadsheet,
  AlertCircle,
  Filter
} from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency';
import { ProfitAndLossStatement } from '@/modules/reports/types';
import { ListPageContainer } from '@/shared/components/ListPageContainer';

export default function ProfitAndLossPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = `${today.slice(0, 7)}-01`;
  const [fromDate, setFromDate] = useState<string>(firstDayOfMonth);
  const [toDate, setToDate] = useState<string>(today);

  const [statement, setStatement] = useState<ProfitAndLossStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatement = async (fDate = fromDate, tDate = toDate) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/profit-and-loss?fromDate=${fDate}&toDate=${tDate}`).then((r) => r.json());
      if (!res.success) {
        throw new Error(res.message || 'Failed to fetch Profit & Loss statement.');
      }
      setStatement(res.data);
    } catch (err: any) {
      setError(err.message || 'Error generating statement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, []);

  const handlePreset = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL') => {
    let f = today;
    const t = today;

    if (preset === 'TODAY') {
      f = today;
    } else if (preset === 'WEEK') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      f = d.toISOString().split('T')[0];
    } else if (preset === 'MONTH') {
      f = firstDayOfMonth;
    } else if (preset === 'ALL') {
      f = '2020-01-01';
    }

    setFromDate(f);
    setToDate(t);
    fetchStatement(f, t);
  };

  return (
    <ListPageContainer className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Profit & Loss Statement</h1>
              <p className="text-xs text-slate-500">
                Gross sales revenue, cost of goods sold, operating expenses, and net profit.
              </p>
            </div>
          </div>
        </div>

        {/* Print Button */}
        {statement && (
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print P&L (A4)
          </button>
        )}
      </div>

      {/* Date Filter Card */}
      <div className="filter-section-card p-4 space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Profit & Loss Period Filters
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mr-1">Period Preset:</span>
            <button
              type="button"
              onClick={() => handlePreset('TODAY')}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset('WEEK')}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset('MONTH')}
              className="bg-emerald-600 text-white border border-emerald-600 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-xs transition-colors"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handlePreset('ALL')}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
            >
              All Time
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Date Range:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="filter-input-control rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="filter-input-control rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => fetchStatement(fromDate, toDate)}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {loading ? 'Calculating...' : 'Update Statement'}
            </button>
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

      {/* Statement Content */}
      {statement && (
        <div
          id="pnl-print-sheet"
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 print:border-none print:shadow-none print:p-0 print:m-0"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-200 pb-5">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">SALEFLOW DISTRIBUTION ERP</h2>
              <p className="text-xs text-slate-500">Official Income & Expenditure Statement (P&L)</p>
              <p className="text-xs text-slate-500">Commercial Distribution Division • Lahore, Pakistan</p>
            </div>

            <div className="text-left sm:text-right">
              <div className="inline-block bg-emerald-50 border border-emerald-200 px-3 py-1 rounded text-xs font-extrabold text-emerald-800 tracking-wide uppercase">
                Profit & Loss Statement
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Period: <span className="font-semibold text-slate-800">{statement.fromDate}</span> to{' '}
                <span className="font-semibold text-slate-800">{statement.toDate}</span>
              </p>
            </div>
          </div>

          {/* Top 3 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 block">Net Sales Revenue</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-slate-900 block mt-1">
                {formatCurrency(statement.netSales)}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block tabular-nums">
                Gross: {formatCurrency(statement.grossSales)} • Ret: {formatCurrency(statement.salesReturns)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 block">Gross Profit</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-emerald-700 block mt-1">
                {formatCurrency(statement.grossProfit)}
              </span>
              <span className="text-[11px] font-bold text-emerald-600 mt-0.5 block tabular-nums">
                Margin: {statement.grossMarginPercentage}%
              </span>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                statement.netProfit >= 0
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <span
                className={`text-xs font-bold block ${
                  statement.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {statement.netProfit >= 0 ? 'Net Profit (Munaffa)' : 'Net Loss'}
              </span>
              <span
                className={`text-2xl font-bold tracking-tight tabular-nums block mt-1 ${
                  statement.netProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'
                }`}
              >
                {formatCurrency(statement.netProfit)}
              </span>
              <span
                className={`text-[11px] font-bold mt-0.5 block tabular-nums ${
                  statement.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                Net Margin: {statement.netMarginPercentage}%
              </span>
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="space-y-6">
            {/* Section 1: Trading Account (Revenue & Direct Costs) */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2.5 font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-slate-200 flex justify-between">
                <span>1. Trading Account (Gross Margin)</span>
                <span>Amount</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2.5 px-4 text-slate-800 hover:bg-slate-50">
                  <span className="font-semibold">Wholesale Sales Revenue (Account 4010)</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatCurrency(statement.grossSales)}
                  </span>
                </div>

                <div className="flex justify-between py-2.5 px-4 text-rose-700 hover:bg-slate-50 pl-8">
                  <span>Less: Customer Sales Returns & Allowances (Account 4030)</span>
                  <span className="font-semibold tabular-nums">
                    ({formatCurrency(statement.salesReturns)})
                  </span>
                </div>

                <div className="flex justify-between py-2.5 px-4 bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                  <span>(=) Net Sales Revenue</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(statement.netSales)}</span>
                </div>

                <div className="flex justify-between py-2.5 px-4 text-slate-800 hover:bg-slate-50 pl-8">
                  <span>Less: Cost of Goods Sold (COGS - Account 5010)</span>
                  <span className="font-semibold tabular-nums text-rose-700">
                    ({formatCurrency(statement.costOfGoodsSold)})
                  </span>
                </div>

                <div className="flex justify-between py-3 px-4 bg-emerald-50/80 font-bold text-sm text-emerald-900 border-t-2 border-emerald-200">
                  <span>(=) GROSS TRADING PROFIT (Gross Margin: <span className="tabular-nums">{statement.grossMarginPercentage}%</span>)</span>
                  <span className="tabular-nums">{formatCurrency(statement.grossProfit)}</span>
                </div>
              </div>
            </div>

            {/* Section 2: Operating Expenses */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2.5 font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-slate-200 flex justify-between">
                <span>2. Operating & Distribution Expenses</span>
                <span>Amount</span>
              </div>

              {statement.operatingExpenses.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 italic">
                  No operational expenses posted during this period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {statement.operatingExpenses.map((exp) => (
                    <div
                      key={exp.code}
                      className="flex justify-between items-center py-2.5 px-4 hover:bg-slate-50"
                    >
                      <div>
                        <span className="text-slate-500 font-bold mr-2">[{exp.code}]</span>
                        <span className="text-slate-800 font-medium">{exp.name}</span>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {exp.percentageOfRevenue}% of rev
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900 w-28 text-right">
                          {formatCurrency(exp.amount)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-between py-2.5 px-4 bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                    <span>Total Operating Expenses</span>
                    <span className="tabular-nums text-rose-700">
                      ({formatCurrency(statement.totalOperatingExpenses)})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Bottom Line Net Profit */}
            <div
              className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                statement.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div>
                <span className="text-xs uppercase font-extrabold tracking-wider block">
                  Bottom Line Net Earnings:
                </span>
                <h3 className="text-lg font-black mt-0.5">
                  {statement.netProfit >= 0 ? 'NET PROFIT FOR THE PERIOD' : 'NET LOSS FOR THE PERIOD'}
                </h3>
                <span className="text-xs font-semibold tabular-nums">
                  Net Profit Margin: {statement.netMarginPercentage}% of Net Revenue
                </span>
              </div>

              <div className="text-right">
                <span className="text-2xl font-bold tracking-tight tabular-nums">
                  {formatCurrency(statement.netProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Corporate Signatures Block (For Print) */}
          <div className="pt-14 grid grid-cols-3 gap-8 text-center text-xs text-slate-500 border-t border-slate-200">
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Prepared By</div>
              <div className="text-[10px] text-slate-400">Accounts Department</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Internal Audit</div>
              <div className="text-[10px] text-slate-400">Chief Internal Auditor</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Chief Financial Officer</div>
              <div className="text-[10px] text-slate-400">Managing Director / Partner</div>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
