'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import {
  BookOpen,
  Printer,
  Calendar,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Users,
  FileText,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency';
import { formatBusinessReference } from '@/shared/utils/reference';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { PartyLedgerStatement, PartyType } from '@/modules/reports/types';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';
import { ListPageContainer } from '@/shared/components/ListPageContainer';

interface PartyOption {
  id: string;
  name: string;
  shop_name?: string | null;
  company_name?: string | null;
  live_balance?: number;
  current_balance?: number;
}

export default function PartyLedgersPage() {
  const { profile: companyProfile } = useCompanyProfile();
  const [entityType, setEntityType] = useState<PartyType>('CUSTOMER');
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [vendors, setVendors] = useState<PartyOption[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');

  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = `${today.slice(0, 7)}-01`;
  const [fromDate, setFromDate] = useState<string>(firstDayOfMonth);
  const [toDate, setToDate] = useState<string>(today);

  const [statement, setStatement] = useState<PartyLedgerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch party options
  useEffect(() => {
    async function loadParties() {
      try {
        const [cRes, vRes] = await Promise.all([
          fetch('/api/customers').then((r) => r.json()),
          fetch('/api/vendors').then((r) => r.json()),
        ]);

        if (cRes.success && cRes.customers) {
          setCustomers(cRes.customers);
          if (entityType === 'CUSTOMER' && cRes.customers.length > 0 && !selectedPartyId) {
            setSelectedPartyId(cRes.customers[0].id);
          }
        }
        if (vRes.success && vRes.vendors) {
          setVendors(vRes.vendors);
        }
      } catch {
        setError('Failed to load customer and vendor directories.');
      }
    }
    loadParties();
  }, []);

  // When toggling customer/vendor, switch selected party
  const handleTypeToggle = (type: PartyType) => {
    setEntityType(type);
    setStatement(null);
    if (type === 'CUSTOMER' && customers.length > 0) {
      setSelectedPartyId(customers[0].id);
    } else if (type === 'VENDOR' && vendors.length > 0) {
      setSelectedPartyId(vendors[0].id);
    } else {
      setSelectedPartyId('');
    }
  };

  // 2. Fetch Statement
  const fetchStatement = async () => {
    if (!selectedPartyId) return;
    setLoading(true);
    setError(null);

    try {
      const url = `/api/reports/ledgers?entityType=${entityType}&entityId=${selectedPartyId}&fromDate=${fromDate}&toDate=${toDate}`;
      const res = await fetch(url).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.message || 'Failed to fetch ledger statement.');
      }
      setStatement(res.data);
    } catch (err: any) {
      setError(err.message || 'Error generating statement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPartyId) {
      fetchStatement();
    }
  }, [selectedPartyId, entityType]);

  const activePartyList = entityType === 'CUSTOMER' ? customers : vendors;

  const partyOptions = useMemo(() => {
    return activePartyList.map((p) => {
      const bal = p.live_balance !== undefined ? p.live_balance : (p.current_balance || 0);
      const subName = p.shop_name || p.company_name;
      return {
        value: p.id,
        label: p.name,
        subLabel: [
          subName ? (entityType === 'CUSTOMER' ? `Shop: ${subName}` : `Company: ${subName}`) : null,
          `Bal: ${formatCurrency(bal)}`,
        ].filter(Boolean).join(' • '),
        badge: bal > 0 ? (entityType === 'CUSTOMER' ? 'Receivable' : 'Payable') : undefined,
        badgeColor: bal > 0 ? (entityType === 'CUSTOMER' ? ('amber' as const) : ('rose' as const)) : undefined,
        keywords: [p.name, subName || '', String(bal)],
      };
    });
  }, [activePartyList, entityType]);

  return (
    <ListPageContainer className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Party Ledgers & Account Statements</h1>
              <p className="text-xs text-slate-500">
                View chronological transaction statements and running balances for customers and suppliers.
              </p>
            </div>
          </div>
        </div>

        {/* Print Button */}
        {statement && (
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Statement (A4)
          </button>
        )}
      </div>

      {/* Filter Controls Card */}
      <div className="filter-section-card p-4 space-y-3.5 print:hidden">
        {/* Toggle Party Type & Presets */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Party Khata Type:
            </span>
            <div className="bg-slate-200/80 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-300/80 dark:border-slate-700 flex text-xs">
              <button
                type="button"
                onClick={() => handleTypeToggle('CUSTOMER')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                  entityType === 'CUSTOMER'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Customer Khata (Debtors)
              </button>
              <button
                type="button"
                onClick={() => handleTypeToggle('VENDOR')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                  entityType === 'VENDOR'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Vendor Khata (Creditors)
              </button>
            </div>
          </div>

          {/* Date Range Shortcuts */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Presets:</span>
            <button
              type="button"
              onClick={() => {
                setFromDate(`${today.slice(0, 7)}-01`);
                setToDate(today);
              }}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                setFromDate(d.toISOString().split('T')[0]);
                setToDate(today);
              }}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium"
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => {
                setFromDate('2020-01-01');
                setToDate(today);
              }}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium"
            >
              All Time
            </button>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 block">
              Select {entityType === 'CUSTOMER' ? 'Customer' : 'Vendor'} *
            </label>
            <SearchableSelect
              options={partyOptions}
              value={selectedPartyId}
              onChange={(val) => setSelectedPartyId(val)}
              placeholder={`-- Choose ${entityType === 'CUSTOMER' ? 'Customer' : 'Vendor'} --`}
              className="w-full"
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 block">
              Date Range (From → To)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="filter-input-control w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={fetchStatement}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {loading ? 'Loading...' : 'View Ledger'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Statement Sheet Content (Screen + Clean A4 Print) */}
      {statement && (
        <div
          id="statement-print-sheet"
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 print:border-none print:shadow-none print:p-0 print:m-0"
        >
          {/* Statement Corporate Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3">
              {companyProfile.showLogoOnPrints && companyProfile.logoUrl && (
                <img
                  src={companyProfile.logoUrl}
                  alt="Logo"
                  className="max-h-12 max-w-[120px] object-contain"
                />
              )}
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {companyProfile.businessName || 'SALEFLOW DISTRIBUTION ERP'}
                </h2>
                {companyProfile.tagline && (
                  <p className="text-xs text-slate-500">{companyProfile.tagline}</p>
                )}
                {(companyProfile.address || companyProfile.city || companyProfile.phonePrimary) && (
                  <p className="text-xs text-slate-500">
                    {[companyProfile.address, companyProfile.city].filter(Boolean).join(', ')}
                    {(companyProfile.phonePrimary || companyProfile.phoneSecondary) && ` • Tel: ${[companyProfile.phonePrimary, companyProfile.phoneSecondary].filter(Boolean).join(' / ')}`}
                    {companyProfile.email && ` • ${companyProfile.email}`}
                  </p>
                )}
                {companyProfile.showNtnOnInvoices && companyProfile.ntnStrn && (
                  <p className="text-xs font-bold text-slate-600">{companyProfile.ntnStrn}</p>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div className="inline-block bg-indigo-50 border border-indigo-200 px-3 py-1 rounded text-xs font-extrabold text-indigo-800 tracking-wide uppercase">
                {entityType === 'CUSTOMER' ? 'Customer Account Statement' : 'Vendor Ledger Statement'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Period: <span className="font-semibold text-slate-800">{statement.fromDate}</span> to{' '}
                <span className="font-semibold text-slate-800">{statement.toDate}</span>
              </p>
              <p className="text-[11px] text-slate-400">Generated on: {new Date().toLocaleString()}</p>
            </div>
          </div>

          {/* Party Information Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Account Information:
              </span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">{statement.party.name}</h3>
              {(statement.party.shopName || statement.party.companyName) && (
                <p className="text-slate-700 font-medium">
                  {statement.party.shopName || statement.party.companyName}
                </p>
              )}
              {statement.party.contactPerson && (
                <p className="text-slate-600 mt-1">Contact: {statement.party.contactPerson}</p>
              )}
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Contact & Tax Details:
              </span>
              <p className="text-slate-700">Phone: <span className="numeric-text font-medium">{statement.party.phone || 'N/A'}</span></p>
              <p className="text-slate-600">Address: {statement.party.address || 'Lahore, Pakistan'}</p>
              {statement.party.cnicOrNtn && (
                <p className="text-slate-600">NTN / CNIC: <span className="numeric-text font-medium">{statement.party.cnicOrNtn}</span></p>
              )}
            </div>
          </div>

          {/* Financial KPI Summary Cards (Opening, Debits, Credits, Closing) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs print:gap-2">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-slate-500 text-[11px] block">Opening Balance</span>
              <span className="text-sm font-bold tracking-tight tabular-nums text-slate-900 block mt-0.5">
                {formatCurrency(statement.openingBalance)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-slate-500 text-[11px] block flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-emerald-600" /> Total Debits
              </span>
              <span className="text-sm font-bold tracking-tight tabular-nums text-emerald-700 block mt-0.5">
                {formatCurrency(statement.totalDebits)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <span className="text-slate-500 text-[11px] block flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-rose-600" /> Total Credits
              </span>
              <span className="text-sm font-bold tracking-tight tabular-nums text-rose-700 block mt-0.5">
                {formatCurrency(statement.totalCredits)}
              </span>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-200 p-3 rounded-lg">
              <span className="text-indigo-800 text-[11px] font-bold block">Closing Balance</span>
              <span className="text-base font-bold tracking-tight tabular-nums text-indigo-900 block mt-0.5">
                {formatCurrency(statement.closingBalance)}
              </span>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200 rounded-lg overflow-hidden text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-24">Date</th>
                  <th className="py-2.5 px-3 w-32">Voucher #</th>
                  <th className="py-2.5 px-3 w-36">Type</th>
                  <th className="py-2.5 px-3">Description / Narration</th>
                  <th className="py-2.5 px-3 text-right w-28">Debit (Dr)</th>
                  <th className="py-2.5 px-3 text-right w-28">Credit (Cr)</th>
                  <th className="py-2.5 px-3 text-right w-32 bg-slate-200/50">Running Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Opening Balance Row */}
                <tr className="bg-slate-50/80 font-semibold text-slate-700">
                  <td className="py-2.5 px-3">{statement.fromDate}</td>
                  <td className="py-2.5 px-3">—</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px]">
                      OPENING
                    </span>
                  </td>
                  <td className="py-2.5 px-3 italic text-slate-600">
                    Brought forward opening ledger balance
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">—</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">—</td>
                  <td className="py-2.5 px-3 text-right font-bold tabular-nums bg-slate-100">
                    {formatCurrency(statement.openingBalance)}
                  </td>
                </tr>

                {/* Ledger Lines */}
                {statement.lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      No transactions recorded for this party within the selected date range.
                    </td>
                  </tr>
                ) : (
                  statement.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">{l.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 text-[11px]">
                        <BusinessReferenceLink
                          businessReference={l.businessReference || l.voucherNumber}
                          entryNumber={l.entryNumber}
                          sourceDocumentId={l.sourceDocumentId}
                          journalEntryId={l.journalEntryId}
                          sourceModule={l.sourceModule}
                          transactionType={l.transactionType}
                        >
                          {formatBusinessReference(l.businessReference || l.voucherNumber, l.entryNumber, l.description)}
                        </BusinessReferenceLink>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          l.transactionType === 'Spot Cash'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : l.transactionType === 'Payment Received' || l.transactionType === 'Cash Recovery'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : l.transactionType === 'Sales Return' || l.transactionType === 'Purchase Return'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                          {l.transactionType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-900 font-medium">
                          <DescriptionWithReference
                            text={l.description}
                            sourceModule={l.sourceModule}
                            sourceDocumentId={l.sourceDocumentId}
                            journalEntryId={l.journalEntryId}
                          />
                        </div>
                        {l.memo && l.memo !== l.description && (
                          <div className="text-[10px] text-slate-500 italic mt-0.5">
                            <DescriptionWithReference
                              text={l.memo}
                              sourceModule={l.sourceModule}
                              sourceDocumentId={l.sourceDocumentId}
                              journalEntryId={l.journalEntryId}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700 font-semibold">
                        {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-rose-700 font-semibold">
                        {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50">
                        {formatCurrency(l.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Total Summary Footer */}
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-xs">
                <tr>
                  <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-slate-700">
                    Period Total Activity & Closing Balance:
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-emerald-800">
                    {formatCurrency(statement.totalDebits)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-rose-800">
                    {formatCurrency(statement.totalCredits)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-indigo-900 bg-indigo-100">
                    {formatCurrency(statement.closingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Corporate Signatures Block (For Print) */}
          <div className="pt-14 grid grid-cols-3 gap-8 text-center text-xs text-slate-500 border-t border-slate-200">
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Prepared By</div>
              <div className="text-[10px] text-slate-400">Accountant Incharge</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Verified & Approved</div>
              <div className="text-[10px] text-slate-400">Finance Manager</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">Party Stamp / Receiver</div>
              <div className="text-[10px] text-slate-400">{statement.party.name}</div>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
