'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { formatInteger } from '@/shared/utils/currency';

export type PageSizeOption = 50 | 100 | 150 | 200 | 'All';

export const STANDARD_PAGE_SIZES: PageSizeOption[] = [50, 100, 150, 200, 'All'];

export interface PaginationControlsProps {
  currentPage?: number;
  totalRecords?: number;
  pageSize?: number | 'All';
  pageSizeOptions?: PageSizeOption[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number | 'All') => void;
  pagination?: {
    currentPage: number;
    totalRecords: number;
    pageSize: number | 'All';
    pageSizeOptions?: PageSizeOption[];
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number | 'All') => void;
    setCurrentPage?: (page: number | ((prev: number) => number)) => void;
    setPageSize?: (size: number | 'All') => void;
  };
  className?: string;
  storageKey?: string;
}

export function PaginationControls(props: PaginationControlsProps) {
  const p = props.pagination || props;
  const currentPage = p.currentPage ?? 1;
  const totalRecords = p.totalRecords ?? 0;
  const pageSize = p.pageSize ?? 50;
  const pageSizeOptions = p.pageSizeOptions || props.pageSizeOptions || STANDARD_PAGE_SIZES;
  const onPageChange =
    p.onPageChange ||
    ('setCurrentPage' in p && typeof p.setCurrentPage === 'function' ? (p.setCurrentPage as (page: number) => void) : undefined) ||
    props.onPageChange ||
    (() => {});
  const onPageSizeChange =
    p.onPageSizeChange ||
    ('setPageSize' in p && typeof p.setPageSize === 'function' ? (p.setPageSize as (size: number | 'All') => void) : undefined) ||
    props.onPageSizeChange ||
    (() => {});
  const className = props.className || '';
  const storageKey = props.storageKey || 'saleflow_page_size';
  const isAll = pageSize === 'All';
  const effectivePageSize = isAll ? Math.max(1, totalRecords) : Number(pageSize);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalRecords / effectivePageSize));

  const startRecord = totalRecords === 0 ? 0 : isAll ? 1 : (currentPage - 1) * effectivePageSize + 1;
  const endRecord = isAll ? totalRecords : Math.min(currentPage * effectivePageSize, totalRecords);

  const handlePageSizeChange = (val: string) => {
    const newSize: PageSizeOption = val === 'All' ? 'All' : (parseInt(val, 10) as PageSizeOption);
    if (typeof window !== 'undefined' && storageKey) {
      try {
        localStorage.setItem(storageKey, String(newSize));
      } catch {}
    }
    onPageSizeChange(newSize);
  };

  const selectOptions = useMemo(() => {
    return pageSizeOptions.map((opt) => ({
      value: String(opt),
      label: String(opt),
    }));
  }, [pageSizeOptions]);

  // Compute visible page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];
    pages.push(1);

    const leftBound = Math.max(2, currentPage - 1);
    const rightBound = Math.min(totalPages - 1, currentPage + 1);

    if (leftBound > 2) {
      pages.push('ellipsis');
    }

    for (let i = leftBound; i <= rightBound; i++) {
      pages.push(i);
    }

    if (rightBound < totalPages - 1) {
      pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

  if (totalRecords === 0) {
    return (
      <div
        className={`pagination-container flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 ${className}`}
      >
        <span>No records to display</span>
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <div style={{ width: '80px' }}>
            <SearchableSelect
              mode="single"
              size="sm"
              options={selectOptions}
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              autoFocusSearch={false}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pagination-container flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-300 ${className}`}
    >
      {/* Left: Summary text */}
      <div className="flex items-center gap-1.5 font-medium">
        <span>Showing</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100 numeric-text tabular-nums">
          {formatInteger(startRecord)}–{formatInteger(endRecord)}
        </span>
        <span>of</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100 numeric-text tabular-nums">
          {formatInteger(totalRecords)}
        </span>
        <span>records</span>
      </div>

      {/* Middle/Right: Page navigation & Page size dropdown */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Page size selector with modern SearchableSelect */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Rows per page:</span>
          <div style={{ width: '84px' }}>
            <SearchableSelect
              mode="single"
              size="sm"
              options={selectOptions}
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              autoFocusSearch={false}
              className="w-full text-xs font-semibold"
            />
          </div>
        </div>

        {/* Page navigation buttons */}
        {!isAll && totalPages > 1 && (
          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={currentPage <= 1}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>

            {/* Previous Page */}
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium transition-colors"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Prev</span>
            </button>

            {/* Numeric page buttons */}
            <div className="flex items-center gap-1 mx-1">
              {pageNumbers.map((p, idx) => {
                if (p === 'ellipsis') {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
                      ...
                    </span>
                  );
                }

                const isActive = p === currentPage;
                return (
                  <button
                    key={`page-${p}`}
                    type="button"
                    onClick={() => onPageChange(p as number)}
                    className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-semibold numeric-text tabular-nums transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Next Page */}
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium transition-colors"
              title="Next Page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={14} />
            </button>

            {/* Last Page */}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable hook to handle client-side pagination with persistent localStorage page-size
 */
export function usePagination<T>(
  items: T[],
  defaultSize: PageSizeOption = 50,
  storageKey: string = 'saleflow_page_size'
) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSizeState] = useState<number | 'All'>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'All') return 'All';
        if (saved) {
          const num = parseInt(saved, 10);
          if ([50, 100, 150, 200].includes(num)) return num;
        }
      } catch {}
    }
    return defaultSize;
  });

  const setPageSize = (size: number | 'All') => {
    setPageSizeState(size);
    if (typeof window !== 'undefined' && storageKey) {
      try {
        localStorage.setItem(storageKey, String(size));
      } catch {}
    }
    setCurrentPage(1);
  };

  const totalRecords = items.length;
  const effectivePageSize = pageSize === 'All' ? Math.max(1, totalRecords) : pageSize;
  const totalPages = pageSize === 'All' ? 1 : Math.max(1, Math.ceil(totalRecords / effectivePageSize));

  // Automatically adjust page if out of bounds (e.g. items filtered)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    if (pageSize === 'All') return items;
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    onPageChange: setCurrentPage,
    onPageSizeChange: setPageSize,
    paginatedItems,
    totalPages,
    totalRecords,
  };
}
