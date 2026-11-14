'use client';

import React, { useState, useRef } from 'react';
import { ChartOfAccount } from '@/core/accounting/types';
import { 
  X, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  RotateCw,
  FileCheck,
  Info
} from 'lucide-react';

interface ImportAccountsModalProps {
  existingAccounts: ChartOfAccount[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  rowIdx: number;
  account_code: string;
  account_name: string;
  parent_account_code: string;
  account_group: string;
  account_type: string;
  opening_balance: string;
  active_status: string;
  status: 'READY' | 'SKIPPED' | 'ERROR';
  reason: string;
}

export function ImportAccountsModal({
  existingAccounts,
  isOpen,
  onClose,
  onSuccess,
}: ImportAccountsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    created: number;
    skipped: number;
    failed: number;
    reasons: Array<{ row: number; code: string; name: string; status: string; reason: string }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Simple robust CSV parser
  const parseCSVText = (text: string): string[][] => {
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
    const result: string[][] = [];

    for (const line of lines) {
      const row: string[] = [];
      let inQuotes = false;
      let currentField = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      row.push(currentField.trim());
      result.push(row);
    }

    return result;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please upload a valid .csv file.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setImportSummary(null);
    setValidating(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const matrix = parseCSVText(content);
        if (matrix.length < 2) {
          throw new Error('CSV file contains no data rows.');
        }

        // Find header indices
        const headerRow = matrix[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        const getIdx = (candidates: string[]) => {
          for (const c of candidates) {
            const idx = headerRow.findIndex(h => h.includes(c));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const codeIdx = getIdx(['code', 'account_code', 'accountcode']);
        const nameIdx = getIdx(['name', 'title', 'account_name', 'accountname']);
        const parentIdx = getIdx(['parent', 'parent_code', 'parentaccountcode']);
        const groupIdx = getIdx(['group', 'category', 'account_group']);
        const typeIdx = getIdx(['type', 'account_type', 'classification']);
        const opBalIdx = getIdx(['opening', 'balance', 'opening_balance']);
        const activeIdx = getIdx(['status', 'active', 'is_active', 'active_status']);

        if (codeIdx === -1 || nameIdx === -1) {
          throw new Error('CSV must include "account_code" and "account_name" column headers.');
        }

        const existingCodeMap = new Map<string, ChartOfAccount>();
        for (const a of existingAccounts) {
          existingCodeMap.set(a.code.toLowerCase(), a);
        }

        const seenBatchCodes = new Set<string>();
        const rows: ParsedRow[] = [];

        for (let i = 1; i < matrix.length; i++) {
          const raw = matrix[i];
          const account_code = (raw[codeIdx] || '').trim();
          const account_name = (raw[nameIdx] || '').trim();
          const parent_account_code = parentIdx !== -1 ? (raw[parentIdx] || '').trim() : '';
          const account_group = groupIdx !== -1 ? (raw[groupIdx] || '').trim() : '';
          const account_type = typeIdx !== -1 ? (raw[typeIdx] || '').trim().toUpperCase() : '';
          const opening_balance = opBalIdx !== -1 ? (raw[opBalIdx] || '').trim() : '0';
          const active_status = activeIdx !== -1 ? (raw[activeIdx] || '').trim() : '1';

          if (!account_code && !account_name) continue; // blank row

          let status: ParsedRow['status'] = 'READY';
          let reason = 'Ready to import';

          const lowerCode = account_code.toLowerCase();

          if (!account_code || !account_name) {
            status = 'ERROR';
            reason = 'Missing account code or title';
          } else if (existingCodeMap.has(lowerCode)) {
            const existing = existingCodeMap.get(lowerCode)!;
            status = 'SKIPPED';
            reason = existing.is_system === 1 
              ? 'Matches protected system account — will be skipped'
              : 'Account code already exists — will be skipped';
          } else if (seenBatchCodes.has(lowerCode)) {
            status = 'ERROR';
            reason = 'Duplicate code in this file';
          } else {
            seenBatchCodes.add(lowerCode);
          }

          rows.push({
            rowIdx: i,
            account_code,
            account_name,
            parent_account_code,
            account_group,
            account_type,
            opening_balance,
            active_status,
            status,
            reason,
          });
        }

        setParsedRows(rows);
      } catch (err: any) {
        setError(err.message || 'Failed to parse CSV file.');
        setParsedRows([]);
      } finally {
        setValidating(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file from disk.');
      setValidating(false);
    };

    reader.readAsText(selectedFile);
  };

  const handleCommitImport = async () => {
    const readyRows = parsedRows.filter(r => r.status === 'READY');
    if (readyRows.length === 0) {
      setError('No valid rows ready for import.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/accounting/coa/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: readyRows.map(r => ({
            account_code: r.account_code,
            account_name: r.account_name,
            parent_account_code: r.parent_account_code,
            account_group: r.account_group,
            account_type: r.account_type,
            opening_balance: r.opening_balance,
            active_status: r.active_status,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to complete import.');
      }

      setImportSummary(data.summary);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to commit account import.');
    } finally {
      setSubmitting(false);
    }
  };

  const readyCount = parsedRows.filter(r => r.status === 'READY').length;
  const skipCount = parsedRows.filter(r => r.status === 'SKIPPED').length;
  const errorCount = parsedRows.filter(r => r.status === 'ERROR').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Import Chart of Accounts
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bulk upload accounts, classifications, and hierarchy from CSV
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <a
              href="/api/accounting/coa/template"
              download="chart_of_accounts_sample_template.csv"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              title="Download sample CSV template"
            >
              <Download size={13} />
              <span>Sample Template</span>
            </a>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Audit & Opening Balance Notice */}
          <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 text-sky-800 dark:text-sky-300 text-xs flex items-start gap-2.5">
            <Info size={16} className="shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
            <div>
              <strong className="font-semibold block mb-0.5">Audit Integrity Policy:</strong>
              Opening financial balances are intentionally omitted during Chart of Accounts master import to ensure strict double-entry ledger balance. Please use <strong>Opening Balance Journal Entries</strong> to post opening debit/credit figures.
            </div>
          </div>

          {/* File Picker / Dropzone */}
          {!importSummary && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500 rounded-xl p-6 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-800/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet size={36} className="mx-auto text-slate-400 dark:text-slate-500 mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {file ? file.name : 'Click or drag & drop a .csv file to import'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                CSV format with columns: account_code, account_name, parent_account_code, account_group, account_type, active_status
              </p>
            </div>
          )}

          {/* Import Results Summary View */}
          {importSummary && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-around text-center">
                <div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {importSummary.created}
                  </div>
                  <div className="text-xs font-medium text-slate-500">Accounts Created</div>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div>
                  <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {importSummary.skipped}
                  </div>
                  <div className="text-xs font-medium text-slate-500">Skipped (Existing)</div>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div>
                  <div className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {importSummary.failed}
                  </div>
                  <div className="text-xs font-medium text-slate-500">Failed / Errors</div>
                </div>
              </div>

              {/* Reasons Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 w-16">Row</th>
                      <th className="py-2 px-3 w-24">Code</th>
                      <th className="py-2 px-3">Title</th>
                      <th className="py-2 px-3 w-28">Status</th>
                      <th className="py-2 px-3">Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importSummary.reasons.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-slate-500">{r.row}</td>
                        <td className="py-2 px-3 font-mono font-bold">{r.code}</td>
                        <td className="py-2 px-3 font-medium">{r.name}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            r.status === 'CREATED' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : r.status === 'SKIPPED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Validation Preview Table */}
          {!importSummary && parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Import Preview ({parsedRows.length} rows found):
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {readyCount} Ready
                  </span>
                  {skipCount > 0 && (
                    <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {skipCount} Skipped
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="px-2 py-0.5 rounded font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {errorCount} Errors
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 w-14">#</th>
                      <th className="py-2 px-3 w-20">Code</th>
                      <th className="py-2 px-3">Title</th>
                      <th className="py-2 px-3 w-24">Parent</th>
                      <th className="py-2 px-3 w-24">Type</th>
                      <th className="py-2 px-3 w-28">Group</th>
                      <th className="py-2 px-3 w-40">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedRows.slice(0, 50).map((r) => (
                      <tr 
                        key={r.rowIdx}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          r.status === 'ERROR' ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-slate-400">{r.rowIdx}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {r.account_code}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {r.account_name}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {r.parent_account_code || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {r.account_type || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {r.account_group || '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            r.status === 'READY'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : r.status === 'SKIPPED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                          }`}>
                            {r.status === 'READY' ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                            {r.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 50 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Showing first 50 rows of {parsedRows.length} rows. All valid rows will be processed.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div>
            {parsedRows.length > 0 && !importSummary && (
              <button
                onClick={() => {
                  setFile(null);
                  setParsedRows([]);
                  setError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
              >
                Clear file
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              {importSummary ? 'Close' : 'Cancel'}
            </button>

            {!importSummary && (
              <button
                onClick={handleCommitImport}
                disabled={submitting || validating || readyCount === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RotateCw size={13} className="animate-spin" />
                    <span>Importing Accounts...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Commit Import ({readyCount} Accounts)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
