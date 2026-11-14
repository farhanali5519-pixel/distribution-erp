'use client';

import React from 'react';
import { Calendar } from 'lucide-react';

export interface DateRangeFilterProps {
  fromDate: string;
  toDate: string;
  onFromDateChange: (val: string) => void;
  onToDateChange: (val: string) => void;
  onClear?: () => void;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function DateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onClear,
  label = 'Date Range',
  className = '',
  size = 'md',
}: DateRangeFilterProps) {
  const isSm = size === 'sm';
  const heightClass = isSm ? 'h-9' : 'h-10';

  return (
    <div className={`date-range-filter ${className}`}>
      {label && (
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
          <Calendar size={12} className="text-slate-500 dark:text-slate-400" />
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-[125px]">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className={`filter-input-control w-full ${heightClass} px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200`}
            title="From Date"
            placeholder="From"
          />
        </div>
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 px-0.5 select-none">
          →
        </span>
        <div className="flex-1 min-w-[125px]">
          <input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className={`filter-input-control w-full ${heightClass} px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200`}
            title="To Date"
            placeholder="To"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Utility helper to evaluate inclusive date range filtering
 */
export function isDateInRange(dateStr: string | null | undefined, fromDate?: string, toDate?: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!dateStr) return false;

  // Extract YYYY-MM-DD
  const itemDate = dateStr.slice(0, 10);

  if (fromDate && toDate) {
    return itemDate >= fromDate && itemDate <= toDate;
  }
  if (fromDate) {
    return itemDate >= fromDate;
  }
  if (toDate) {
    return itemDate <= toDate;
  }
  return true;
}
