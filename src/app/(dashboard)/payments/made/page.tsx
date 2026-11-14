'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { NumericValue } from '@/shared/components/NumericValue';
import { BusinessReferenceLink, DescriptionWithReference } from '@/shared/components/BusinessReferenceLink';
import { DeleteTransactionModal } from '@/shared/components/DeleteTransactionModal';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import {
  CreditCard,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Printer,
  Eye,
  ArrowUpRight,
  Building2,
  Calendar,
  Wallet,
  Coins,
  FileText,
  Check,
  X,
  RefreshCw,
  Clock,
  Ban,
  Trash2,
  Filter
} from 'lucide-react';

interface PaymentMadeItem {
  id: string;
  voucher_number: string;
  payment_date: string;
  vendor_id: string;
  vendor_name: string;
  company_name: string | null;
  vendor_phone: string | null;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  payment_method: string;
  amount: number;
  unallocated_amount: number;
  reference_no: string | null;
  notes: string | null;
  status: 'POSTED' | 'VOID';
  journal_entry_id: string | null;
  created_at: string;
  allocations_count: number;
  allocated_total: number;
}

interface VendorOption {
  id: string;
  name: string;
  company_name?: string | null;
  current_balance?: number;
  phone?: string | null;
  address?: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  balance?: number;
}

interface OutstandingBill {
  id: string;
  billNumber: string;
  billDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
}

interface BillAllocationRow {
  billId: string;
  billNumber: string;
  billDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  allocatedAmount: number;
  selected: boolean;
}

export default function PaymentsMadePage() {
  const [payments, setPayments] = useState<PaymentMadeItem[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // New Payment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);

  // Form Fields
  const [vendorId, setVendorId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [amountPaid, setAmountPaid] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [allocationRows, setAllocationRows] = useState<BillAllocationRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // View / Print Modal State
  const [viewPayment, setViewPayment] = useState<any | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [printFormat, setPrintFormat] = useState<'A4' | 'THERMAL'>('A4');

  // Void Modal State
  const [voidPaymentId, setVoidPaymentId] = useState<string | null>(null);
  const [voidPaymentNumber, setVoidPaymentNumber] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  // Delete & Reverse Modal State
  const [deletePaymentItem, setDeletePaymentItem] = useState<PaymentMadeItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [paymentsRes, vendorsRes, coaRes, companyRes, bankingRes] = await Promise.all([
        fetch('/api/payments/made'),
        fetch('/api/vendors'),
        fetch('/api/accounting/coa'),
        fetch('/api/settings/company'),
        fetch('/api/banking/accounts?paymentDropdown=true'),
      ]);

      const [paymentsData, vendorsData, coaData, companyData, bankingData] = await Promise.all([
        paymentsRes.json(),
        vendorsRes.json(),
        coaRes.json(),
        companyRes.json(),
        bankingRes.json(),
      ]);

      if (paymentsData.success) {
        setPayments(paymentsData.payments || []);
      }
      if (vendorsData.success) {
        setVendors(vendorsData.vendors || []);
      }
      if (bankingData.success && bankingData.allAccounts && bankingData.allAccounts.length > 0) {
        setCashAccounts(bankingData.cashAccounts || []);
        setBankAccounts(bankingData.bankAccounts || []);
        setAccounts(bankingData.allAccounts || []);
        if (!accountId) {
          setAccountId(bankingData.allAccounts[0].id);
        }
      } else if (coaData.success) {
        const cashBankAccounts = (coaData.accounts || []).filter(
          (a: any) =>
            a.type === 'ASSET' &&
            (a.code.startsWith('101') ||
              a.code.startsWith('102') ||
              a.name.toLowerCase().includes('cash') ||
              a.name.toLowerCase().includes('bank'))
        );
        setAccounts(cashBankAccounts);
        if (cashBankAccounts.length > 0 && !accountId) {
          setAccountId(cashBankAccounts[0].id);
        }
      }
      if (companyData.success && companyData.profile) {
        setCompanyProfile(companyData.profile);
      }
    } catch (err: any) {
      console.error('Error fetching payments made data:', err);
      setNotification({ type: 'error', message: 'Failed to load payments made data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setIsModalOpen(true);
      }
    }
  }, []);

  // When vendor changes in form, fetch their outstanding purchase bills
  useEffect(() => {
    if (!vendorId) {
      setAllocationRows([]);
      return;
    }

    const fetchBills = async () => {
      try {
        setLoadingBills(true);
        const res = await fetch(`/api/payments/made/bills?vendorId=${vendorId}`);
        const data = await res.json();
        if (data.success) {
          const rows: BillAllocationRow[] = (data.bills || []).map((bill: OutstandingBill) => ({
            ...bill,
            allocatedAmount: 0,
            selected: false,
          }));
          setAllocationRows(rows);
        }
      } catch (err) {
        console.error('Failed to fetch bills for vendor:', err);
      } finally {
        setLoadingBills(false);
      }
    };

    fetchBills();
  }, [vendorId]);

  // Combobox Options
  const vendorFilterOptions = useMemo(() => {
    return vendors.map((v) => ({
      value: v.id,
      label: v.name,
      subLabel: v.company_name ? `${v.company_name} • AP: ${formatCurrency(v.current_balance || 0, 'PKR')}` : `AP: ${formatCurrency(v.current_balance || 0, 'PKR')}`,
      keywords: [v.company_name || '', v.phone || '', v.address || ''],
    }));
  }, [vendors]);

  const accountFilterOptions = useMemo(() => {
    return accounts.map((a) => ({
      value: a.id,
      label: `${a.code} - ${a.name}`,
      badge: a.type,
      badgeColor: 'blue' as const,
      keywords: [a.code, a.name, a.type],
    }));
  }, [accounts]);

  const modalAccountOptions = useMemo(() => {
    const list: any[] = [];
    if (cashAccounts.length > 0) {
      cashAccounts.forEach((a) => {
        list.push({
          value: a.id,
          label: a.name,
          badge: a.code || '1010',
          badgeColor: 'amber' as const,
          subLabel: 'Cash Register',
          keywords: [a.code || '', a.name, 'cash'],
        });
      });
    }
    if (bankAccounts.length > 0) {
      bankAccounts.forEach((a) => {
        list.push({
          value: a.id,
          label: a.name,
          badge: a.code || '1020',
          badgeColor: 'blue' as const,
          subLabel: 'Bank Account',
          keywords: [a.code || '', a.name, 'bank'],
        });
      });
    }
    if (list.length === 0) {
      return accounts.map((a) => ({
        value: a.id,
        label: `${a.code} - ${a.name}`,
        badge: a.type,
        badgeColor: 'blue' as const,
        keywords: [a.code, a.name],
      }));
    }
    return list;
  }, [cashAccounts, bankAccounts, accounts]);

  const billQuickOptions = useMemo(() => {
    return allocationRows.map((bill) => ({
      value: bill.billId,
      label: `${bill.billNumber} (${bill.billDate})`,
      subLabel: `Rem: ${formatCurrency(bill.remainingBalance, 'PKR')}${bill.selected ? ' • [ALLOCATED]' : ''}`,
      keywords: [bill.billNumber, bill.billDate],
    }));
  }, [allocationRows]);

  // Selected vendor info
  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === vendorId),
    [vendors, vendorId]
  );

  // Computed allocation totals
  const totalAllocated = useMemo(() => {
    return allocationRows.reduce((sum, r) => sum + (Number(r.allocatedAmount) || 0), 0);
  }, [allocationRows]);

  const numAmountPaid = Number(amountPaid) || 0;
  const unallocatedAmount = Math.max(0, numAmountPaid - totalAllocated);
  const isOverAllocated = totalAllocated > numAmountPaid;

  // Handle bill allocation row toggle
  const toggleBillSelect = (index: number) => {
    setAllocationRows((prev) => {
      const next = [...prev];
      const row = next[index];
      const willSelect = !row.selected;
      row.selected = willSelect;
      if (willSelect) {
        const currentOtherAlloc = next.reduce((s, r, idx) => (idx !== index ? s + (Number(r.allocatedAmount) || 0) : s), 0);
        const available = Math.max(0, numAmountPaid - currentOtherAlloc);
        row.allocatedAmount = Math.min(row.remainingBalance, available > 0 ? available : row.remainingBalance);
      } else {
        row.allocatedAmount = 0;
      }
      return next;
    });
  };

  // Handle manual allocation amount change
  const handleAllocAmountChange = (index: number, val: number) => {
    setAllocationRows((prev) => {
      const next = [...prev];
      const row = next[index];
      const sanitized = isNaN(val) || val < 0 ? 0 : Math.min(row.remainingBalance, val);
      row.allocatedAmount = sanitized;
      row.selected = sanitized > 0;
      return next;
    });
  };

  // Pay Full for a single bill row
  const handlePayFullRow = (index: number) => {
    setAllocationRows((prev) => {
      const next = [...prev];
      const row = next[index];
      row.allocatedAmount = row.remainingBalance;
      row.selected = true;
      return next;
    });
  };

  // Auto-allocate FIFO
  const handleAutoAllocateFIFO = () => {
    if (numAmountPaid <= 0) {
      setFormError('Please enter total payment amount first to auto-allocate.');
      return;
    }
    setFormError(null);
    let remainingToAllocate = numAmountPaid;

    setAllocationRows((prev) => {
      return prev.map((row) => {
        if (remainingToAllocate <= 0) {
          return { ...row, allocatedAmount: 0, selected: false };
        }
        const toPay = Math.min(row.remainingBalance, remainingToAllocate);
        remainingToAllocate -= toPay;
        return {
          ...row,
          allocatedAmount: toPay,
          selected: toPay > 0,
        };
      });
    });
  };

  // Clear all allocations
  const handleClearAllocations = () => {
    setAllocationRows((prev) =>
      prev.map((r) => ({
        ...r,
        allocatedAmount: 0,
        selected: false,
      }))
    );
  };

  // Submit payment form
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vendorId) {
      setFormError('Please select a vendor / supplier.');
      return;
    }
    if (!accountId) {
      setFormError('Please select a Cash/Bank payment source account.');
      return;
    }
    if (numAmountPaid <= 0) {
      setFormError('Payment amount must be greater than zero.');
      return;
    }
    if (isOverAllocated) {
      setFormError(
        `Total allocated amount (${formatCurrency(totalAllocated, 'PKR')}) cannot exceed total payment amount (${formatCurrency(numAmountPaid, 'PKR')}).`
      );
      return;
    }

    const activeAllocations = allocationRows
      .filter((r) => r.allocatedAmount > 0)
      .map((r) => ({
        purchaseBillId: r.billId,
        allocatedAmount: r.allocatedAmount,
      }));

    try {
      setSubmitting(true);
      const res = await fetch('/api/payments/made', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          accountId,
          paymentDate,
          amount: numAmountPaid,
          paymentMethod,
          referenceNo: referenceNo || null,
          notes: notes || null,
          allocations: activeAllocations,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Payment recording failed.');
      }

      setNotification({
        type: 'success',
        message: `Payment Voucher ${data.payment?.voucher_number || ''} recorded successfully!`,
      });

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setVendorId('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setReferenceNo('');
    setAmountPaid('');
    setNotes('');
    setAllocationRows([]);
    setFormError(null);
  };

  // Open single payment view
  const handleOpenView = async (id: string) => {
    try {
      const res = await fetch(`/api/payments/made/${id}`);
      const data = await res.json();
      if (data.success && data.payment) {
        setViewPayment(data.payment);
        setIsViewModalOpen(true);
      } else {
        alert('Failed to load payment details');
      }
    } catch (err) {
      console.error(err);
      alert('Error fetching payment details');
    }
  };

  // Open void modal
  const handlePromptVoid = (payment: PaymentMadeItem) => {
    setVoidPaymentId(payment.id);
    setVoidPaymentNumber(payment.voucher_number);
    setVoidReason('');
    setIsVoidModalOpen(true);
  };

  // Execute void
  const handleConfirmVoid = async () => {
    if (!voidPaymentId) return;
    try {
      setVoidSubmitting(true);
      const res = await fetch(`/api/payments/made/${voidPaymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'void',
          reason: voidReason || 'Voided by user',
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to void voucher.');
      }

      setNotification({
        type: 'success',
        message: `Payment Voucher ${voidPaymentNumber} has been voided. All double-entries and bill balances have been reversed.`,
      });
      setIsVoidModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Void action failed.');
    } finally {
      setVoidSubmitting(false);
    }
  };

  // Open delete modal
  const handlePromptDelete = (payment: PaymentMadeItem) => {
    setDeletePaymentItem(payment);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  // Execute delete & reverse
  const handleConfirmDelete = async () => {
    if (!deletePaymentItem) return;
    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      const res = await fetch(`/api/payments/made/${deletePaymentItem.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete payment voucher.');
      }

      setNotification({
        type: 'success',
        message: `Payment Voucher ${deletePaymentItem.voucher_number} has been deleted and reversed. All ledger entries, vendor balances, and bill balances have been restored.`,
      });
      setIsDeleteModalOpen(false);
      setDeletePaymentItem(null);
      fetchData();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete and reverse voucher.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          p.voucher_number.toLowerCase().includes(q) ||
          p.vendor_name?.toLowerCase().includes(q) ||
          p.company_name?.toLowerCase().includes(q) ||
          p.reference_no?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filterVendor && p.vendor_id !== filterVendor) return false;
      if (filterAccount && p.account_id !== filterAccount) return false;
      if (filterMethod && filterMethod !== 'ALL' && p.payment_method !== filterMethod) return false;
      if (filterStatus && filterStatus !== 'ALL' && p.status !== filterStatus) return false;
      if (dateFrom && p.payment_date < dateFrom) return false;
      if (dateTo && p.payment_date > dateTo) return false;
      return true;
    });
  }, [payments, search, filterVendor, filterAccount, filterMethod, filterStatus, dateFrom, dateTo]);


  const methodFilterOptions = [
    { value: '', label: 'All Methods' },
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'ONLINE', label: 'Online' },
  ];

  const statusFilterOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'VOID', label: 'Void' },
  ];

  const modalMethodOptions = [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'ONLINE', label: 'Online / Wire' },
  ];

  const pagination = usePagination(filteredPayments);

  const handlePrint = () => {
    window.print();
  };

  return (
    <ListPageContainer className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <ArrowUpRight size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">
                Payment Made
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="btn btn-secondary inline-flex items-center gap-1.5 text-xs font-medium"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <PlusCircle size={17} />
            New Payment Voucher
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}



      {/* Filter Toolbar */}
      <div className="filter-section-card p-4 space-y-3.5">
        {/* Top Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Payment Voucher Filters
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredPayments.length}</strong> of{' '}
              <strong className="font-bold text-slate-900 dark:text-slate-100">{payments.length}</strong> vouchers
            </div>

            {(dateFrom || dateTo || search || filterVendor || filterAccount || filterMethod || filterStatus !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                  setFilterVendor('');
                  setFilterAccount('');
                  setFilterMethod('');
                  setFilterStatus('ALL');
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Search Voucher
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search voucher #, vendor, ref..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input-control w-full rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Vendor
            </label>
            <SearchableSelect
              value={filterVendor}
              onChange={setFilterVendor}
              options={vendorFilterOptions}
              clearLabel="All Vendors"
              placeholder="All Vendors"
              searchPlaceholder="Search vendor..."
              size="sm"
            />
          </div>

          {/* Account */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Payment Account
            </label>
            <SearchableSelect
              value={filterAccount}
              onChange={setFilterAccount}
              options={accountFilterOptions}
              clearLabel="All Accounts"
              placeholder="All Accounts"
              searchPlaceholder="Search account..."
              size="sm"
            />
          </div>

          {/* Payment Method */}
          <div className="min-w-[140px]">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Payment Method
            </label>
            <SearchableSelect
              value={filterMethod}
              onChange={setFilterMethod}
              options={methodFilterOptions}
              placeholder="All Methods"
              searchPlaceholder="Search method..."
              size="sm"
            />
          </div>

          {/* Status */}
          <div className="min-w-[130px]">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Voucher Status
            </label>
            <SearchableSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusFilterOptions}
              placeholder="All Statuses"
              searchPlaceholder="Search status..."
              size="sm"
            />
          </div>
        </div>

        {/* Date Row - Visually Grouped */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Date Range:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="filter-input-control text-xs py-1 px-2 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="filter-input-control text-xs py-1 px-2 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Vouchers List Table */}
      <div className="card overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]">
        <div className="overflow-x-auto">
          <table className="table w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-header-bg)] text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-3 px-4">Voucher #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Vendor & Company</th>
                <th className="py-3 px-4">Paid From Account</th>
                <th className="py-3 px-4">Method & Ref</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4 text-right">Allocated</th>
                <th className="py-3 px-4 text-right">On Account</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading payment vouchers...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[var(--text-secondary)]">
                    <div className="max-w-xs mx-auto text-center space-y-2">
                      <CreditCard className="mx-auto text-[var(--text-muted)]" size={32} />
                      <p className="font-medium text-[var(--text-heading)]">No payment vouchers found</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Disburse payment to a supplier or adjust your search filters.
                      </p>
                      <button
                        onClick={() => {
                          resetForm();
                          setIsModalOpen(true);
                        }}
                        className="btn btn-primary text-xs mt-2"
                      >
                        <PlusCircle size={14} className="mr-1 inline" /> Record Payment
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.paginatedItems.map((p: any) => {
                  const isVoid = p.status === 'VOID';
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[var(--hover-bg)] transition-colors"
                    >
                      {/* Voucher # */}
                      <td className="py-3 px-4">
                        <span className="payment-id">
                          <BusinessReferenceLink
                            businessReference={p.voucher_number}
                            sourceDocumentId={p.id}
                            sourceModule="payments"
                            transactionType="Vendor Payment"
                          />
                        </span>
                        {p.allocations_count > 0 ? (
                          <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                            {p.allocations_count} bill{p.allocations_count > 1 ? 's' : ''} allocated
                          </span>
                        ) : (
                          <span className="block text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                            On Account
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 table-date">
                        {p.payment_date}
                      </td>

                      {/* Vendor */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-heading)]">{p.vendor_name}</div>
                        {p.company_name && (
                          <div className="text-[11px] text-[var(--text-muted)]">{p.company_name}</div>
                        )}
                      </td>

                      {/* Account */}
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {p.account_name ? (
                          <div>
                            <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--surface-muted)] mr-1 tabular-nums font-medium">
                              {p.account_code}
                            </span>
                            <span>{p.account_name}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">Cash</span>
                        )}
                      </td>

                      {/* Method */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-[var(--text-heading)]">{p.payment_method}</span>
                        {p.reference_no && (
                          <span className="block text-[11px] text-[var(--text-muted)] tabular-nums">
                            Ref: <DescriptionWithReference text={p.reference_no} />
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[var(--text-heading)]">
                        <NumericValue value={p.amount} type="currency" />
                      </td>

                      {/* Allocated */}
                      <td className="py-3 px-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                        <NumericValue value={p.allocated_total || 0} type="currency" />
                      </td>

                      {/* On Account */}
                      <td className="py-3 px-4 text-right tabular-nums">
                        {p.unallocated_amount > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            <NumericValue value={p.unallocated_amount} type="currency" />
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.status === 'POSTED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenView(p.id)}
                            className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors"
                            title="View / Print Voucher"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => {
                              handleOpenView(p.id);
                              setTimeout(() => window.print(), 300);
                            }}
                            className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors"
                            title="Print"
                          >
                            <Printer size={15} />
                          </button>
                          {p.status === 'POSTED' && (
                            <button
                              onClick={() => handlePromptVoid(p)}
                              className="p-1 rounded hover:bg-rose-50 text-rose-500 hover:text-rose-700 dark:hover:bg-rose-950/40 transition-colors"
                              title="Void Voucher"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handlePromptDelete(p)}
                            className="p-1 rounded hover:bg-rose-50 text-rose-600 hover:text-rose-800 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete & Reverse Voucher"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <PaginationControls {...pagination} />
      </div>

      {/* ========================================================== */}
      {/* RECORD PAYMENT VOUCHER MODAL                               */}
      {/* ========================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
          <div
            className="relative z-[101] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ backgroundColor: 'var(--bg-surface)', opacity: 1 }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0"
              style={{ backgroundColor: 'var(--bg-panel)' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <ArrowUpRight size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--text-heading)] leading-tight">
                    New Vendor Payment Voucher
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={handleSubmitPayment}
              className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-[var(--bg-surface)]"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Step 1: Vendor & Account Setup */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Vendor */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[var(--text-heading)] flex items-center justify-between gap-2">
                    <span className="truncate">Vendor / Supplier *</span>
                    {selectedVendor && (
                      <span className="text-[11px] font-normal text-[var(--text-muted)] shrink-0">
                        Payable:{' '}
                        <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                          {formatCurrency(selectedVendor.current_balance || 0, 'PKR')}
                        </span>
                      </span>
                    )}
                  </label>
                  <SearchableSelect
                    value={vendorId}
                    onChange={(val) => setVendorId(val)}
                    options={vendorFilterOptions}
                    placeholder="-- Select Vendor --"
                    searchPlaceholder="Search vendor name, company, phone..."
                    required
                  />
                </div>

                {/* Payment Account */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[var(--text-heading)] truncate block">
                    Pay From Account *
                  </label>
                  <SearchableSelect
                    value={accountId}
                    onChange={(val) => setAccountId(val)}
                    options={modalAccountOptions}
                    placeholder="-- Select Cash/Bank Account --"
                    searchPlaceholder="Search account name or code..."
                    required
                  />
                </div>

                {/* Date */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[var(--text-heading)] truncate block">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="input w-full text-xs"
                    required
                  />
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[var(--text-heading)] truncate block">
                    Payment Method *
                  </label>
                  <SearchableSelect
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(val as any)}
                    options={modalMethodOptions}
                    placeholder="Select Method"
                    searchPlaceholder="Search method..."
                    size="sm"
                  />
                </div>

                {/* Reference No / Cheque No */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-semibold text-[var(--text-heading)] truncate block">
                    Reference / Cheque #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CHQ-55219, Trx #1029"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="input w-full text-xs font-mono"
                  />
                </div>

                {/* Total Amount Paid */}
                <div className="space-y-1.5 min-w-0">
                  <label className="text-xs font-bold text-[var(--text-heading)] truncate block">
                    Total Amount Paid *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="input w-full text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400"
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-semibold text-[var(--text-heading)] truncate block">
                  Notes / Narration
                </label>
                <input
                  type="text"
                  placeholder="Optional payment remarks, vendor reference, or invoice details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>

              {/* Step 2: Bill Allocation Section */}
              <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-heading)]">
                      Outstanding Purchase Bills Allocation
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Allocate payment to specific unpaid purchase bills. Unallocated remainder is saved On-Account.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {allocationRows.length > 0 && (
                      <div className="w-56 sm:w-64">
                        <SearchableSelect
                          value=""
                          onChange={(billId) => {
                            const idx = allocationRows.findIndex((r) => r.billId === billId);
                            if (idx !== -1) {
                              if (!allocationRows[idx].selected) toggleBillSelect(idx);
                            }
                          }}
                          options={billQuickOptions}
                          placeholder="Quick allocate bill..."
                          searchPlaceholder="Type bill # to allocate..."
                          size="sm"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleAutoAllocateFIFO}
                      disabled={numAmountPaid <= 0 || allocationRows.length === 0}
                      className="btn btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1.5"
                    >
                      <Coins size={13} />
                      Auto-Allocate (FIFO)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllocations}
                      disabled={allocationRows.length === 0}
                      className="btn btn-secondary text-xs py-1 px-2.5"
                    >
                      Clear Allocations
                    </button>
                  </div>
                </div>

                {/* Outstanding Bills Table Container */}
                <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface)] shadow-xs">
                  <div className="overflow-x-auto max-h-60">
                    <table className="alloc-table" style={{ minWidth: '865px' }}>
                      <colgroup>
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '150px' }} />
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '115px' }} />
                        <col style={{ width: '125px' }} />
                        <col style={{ width: '140px' }} />
                        <col style={{ width: '75px' }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-panel)' }}>
                        <tr>
                          <th className="text-center" style={{ width: '40px' }}></th>
                          <th style={{ width: '150px' }}>Bill / Invoice #</th>
                          <th style={{ width: '100px' }}>Bill Date</th>
                          <th className="text-right" style={{ width: '120px' }}>Bill Amount</th>
                          <th className="text-right" style={{ width: '115px' }}>Already Paid</th>
                          <th className="text-right" style={{ width: '125px' }}>Remaining</th>
                          <th className="text-right" style={{ width: '140px' }}>Amount to Allocate</th>
                          <th className="text-center" style={{ width: '75px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-light)]">
                        {loadingBills ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-[var(--text-secondary)]">
                              <RefreshCw className="animate-spin inline-block mr-2" size={14} />
                              Loading purchase bills...
                            </td>
                          </tr>
                        ) : !vendorId ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-[var(--text-muted)] italic">
                              Please select a vendor to view their outstanding purchase bills.
                            </td>
                          </tr>
                        ) : allocationRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-blue-600 dark:text-blue-400 font-medium">
                              Vendor has no unpaid purchase bills. Full payment will be placed On Account as credit.
                            </td>
                          </tr>
                        ) : (
                          allocationRows.map((row, index) => (
                            <tr
                              key={row.billId}
                              className={row.selected ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''}
                            >
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={() => toggleBillSelect(index)}
                                  className="rounded border-[var(--border-subtle)] cursor-pointer"
                                />
                              </td>
                              <td>
                                <span className="payment-id block truncate" title={row.billNumber}>
                                  {row.billNumber}
                                </span>
                              </td>
                              <td>
                                <span className="table-date block">{row.billDate}</span>
                              </td>
                              <td className="text-right tabular-nums text-[var(--text-secondary)] font-medium">
                                <NumericValue value={row.totalAmount} type="currency" />
                              </td>
                              <td className="text-right tabular-nums text-[var(--text-muted)]">
                                <NumericValue value={row.paidAmount} type="currency" />
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[var(--text-heading)]">
                                <NumericValue value={row.remainingBalance} type="currency" />
                              </td>
                              <td className="text-right">
                                <div className="flex justify-end">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={row.remainingBalance}
                                    value={row.allocatedAmount || ''}
                                    onChange={(e) =>
                                      handleAllocAmountChange(index, parseFloat(e.target.value) || 0)
                                    }
                                    className="input text-right text-xs py-1 px-2 font-semibold tabular-nums w-full max-w-[125px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-heading)]"
                                    placeholder="0.00"
                                  />
                                </div>
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() => handlePayFullRow(index)}
                                  className="px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded border border-blue-200 dark:border-blue-800 transition-colors whitespace-nowrap"
                                >
                                  Pay Full
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Allocation Summary Bar */}
                <div
                  className="p-3.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs"
                  style={{ backgroundColor: 'var(--bg-panel)' }}
                >
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-[var(--text-secondary)] block text-[11px]">Total Paid:</span>
                      <span className="font-bold text-sm tabular-nums text-[var(--text-heading)]">
                        {formatCurrency(numAmountPaid, 'PKR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)] block text-[11px]">Total Allocated:</span>
                      <span className="font-bold text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalAllocated, 'PKR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)] block text-[11px]">Held On Account:</span>
                      <span className="font-bold text-sm tabular-nums text-blue-600 dark:text-blue-400">
                        {formatCurrency(unallocatedAmount, 'PKR')}
                      </span>
                    </div>
                  </div>

                  {isOverAllocated && (
                    <div className="text-rose-600 font-semibold text-xs flex items-center gap-1.5">
                      <AlertCircle size={15} />
                      Over-allocated by {formatCurrency(totalAllocated - numAmountPaid, 'PKR')}
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary text-xs"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isOverAllocated || numAmountPaid <= 0 || !vendorId}
                  className="btn btn-primary text-xs inline-flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Check size={15} /> Save & Post Voucher
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW & PRINT PAYMENT VOUCHER MODAL                         */}
      {/* ========================================================== */}
      {isViewModalOpen && viewPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
          <div
            className="relative z-[101] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150"
            style={{ backgroundColor: 'var(--bg-surface)', opacity: 1 }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] print:hidden shrink-0"
              style={{ backgroundColor: 'var(--bg-panel)' }}
            >
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[var(--primary)]" />
                <h2 className="text-base font-bold text-[var(--text-heading)]">
                  Payment Voucher: {viewPayment.voucher_number}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-[var(--bg-panel)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                  <button
                    onClick={() => setPrintFormat('A4')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      printFormat === 'A4'
                        ? 'bg-[var(--bg-card)] text-[var(--primary)] shadow-xs'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    A4 Voucher
                  </button>
                  <button
                    onClick={() => setPrintFormat('THERMAL')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      printFormat === 'THERMAL'
                        ? 'bg-[var(--bg-card)] text-[var(--primary)] shadow-xs'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    80mm Thermal
                  </button>
                </div>
                <button
                  onClick={handlePrint}
                  className="btn btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Printable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white text-black" id="printable-voucher">
              {printFormat === 'A4' ? (
                /* A4 Voucher Layout */
                <div className="space-y-6 text-xs max-w-2xl mx-auto p-4 border border-gray-300 rounded-lg shadow-xs">
                  {/* Header */}
                  <div className="border-b border-gray-300 pb-4 text-center">
                    <h1 className="text-xl font-bold tracking-tight uppercase">
                      {companyProfile?.businessName || 'Farhan Distribution'}
                    </h1>
                    <p className="text-[11px] text-gray-600">
                      {companyProfile?.tagline || 'Wholesale & FMCG Distribution'}
                    </p>
                    {companyProfile?.address && <p className="text-[11px] text-gray-600">{companyProfile.address}</p>}
                    <div className="inline-block mt-2 px-3 py-1 bg-gray-100 rounded-full font-bold text-xs uppercase tracking-wider">
                      Official Payment Voucher
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200">
                    <div>
                      <p className="text-gray-500 font-medium">Paid To (Vendor):</p>
                      <p className="font-bold text-sm text-gray-900">{viewPayment.vendor_name}</p>
                      {viewPayment.company_name && <p className="text-gray-700">{viewPayment.company_name}</p>}
                      {viewPayment.vendor_phone && <p className="text-gray-600">Phone: <span className="numeric-text">{viewPayment.vendor_phone}</span></p>}
                      {viewPayment.vendor_address && <p className="text-gray-600">{viewPayment.vendor_address}</p>}
                    </div>

                    <div className="text-right space-y-1">
                      <div>
                        <span className="text-gray-500">Voucher No: </span>
                        <span className="font-semibold text-gray-900 doc-identifier">{viewPayment.voucher_number}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Date: </span>
                        <span className="font-semibold text-gray-800 table-date">{viewPayment.payment_date}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Payment Mode: </span>
                        <span className="font-semibold text-gray-800">{viewPayment.payment_method}</span>
                      </div>
                      {viewPayment.reference_no && (
                        <div>
                          <span className="text-gray-500">Reference: </span>
                          <span className="text-gray-800 tabular-nums">{viewPayment.reference_no}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Paid From Account: </span>
                        <span className="font-semibold text-gray-800">
                          {viewPayment.account_name || 'Cash in Hand'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Status: </span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            viewPayment.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {viewPayment.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Allocated Bills Table */}
                  <div>
                    <h4 className="font-bold text-gray-800 mb-2 uppercase tracking-wider text-[11px]">
                      Purchase Bills Settlement Breakdown
                    </h4>
                    <table className="w-full text-left border border-gray-300">
                      <thead className="bg-gray-100 text-gray-700 font-semibold border-b border-gray-300">
                        <tr>
                          <th className="py-2 px-3">Purchase Bill #</th>
                          <th className="py-2 px-3">Bill Date</th>
                          <th className="py-2 px-3 text-right">Bill Total</th>
                          <th className="py-2 px-3 text-right">Allocated Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {viewPayment.allocations && viewPayment.allocations.length > 0 ? (
                          viewPayment.allocations.map((a: any) => (
                            <tr key={a.id}>
                              <td className="py-2 px-3 font-semibold text-gray-900 doc-identifier">{a.bill_number}</td>
                              <td className="py-2 px-3 text-gray-600 table-date">{a.bill_date || '-'}</td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {formatCurrency(a.total_amount || 0, 'PKR')}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                {formatCurrency(a.allocated_amount, 'PKR')}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-3 px-3 text-center text-gray-500 italic">
                              Payment disbursed On Account (unallocated advance / balance).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Summary */}
                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-1.5 border-t border-gray-300 pt-2 text-right">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Allocated:</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(
                            (viewPayment.allocations || []).reduce((s: number, a: any) => s + a.allocated_amount, 0),
                            'PKR'
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>On Account Advance:</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(viewPayment.unallocated_amount || 0, 'PKR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-400 pt-1.5">
                        <span>Total Disbursed:</span>
                        <span className="tabular-nums">{formatCurrency(viewPayment.amount, 'PKR')}</span>
                      </div>
                    </div>
                  </div>

                  {viewPayment.notes && (
                    <div className="p-2.5 rounded bg-gray-50 border border-gray-200 text-gray-700">
                      <span className="font-semibold">Notes: </span>
                      <span>{viewPayment.notes}</span>
                    </div>
                  )}

                  {/* Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-12 text-center text-gray-600 text-[11px]">
                    <div className="border-t border-gray-400 pt-1.5">
                      <p className="font-semibold">Prepared By</p>
                    </div>
                    <div className="border-t border-gray-400 pt-1.5">
                      <p className="font-semibold">Vendor Receiver Signature</p>
                    </div>
                    <div className="border-t border-gray-400 pt-1.5">
                      <p className="font-semibold">Authorized Stamp</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* 80mm Thermal Receipt Layout */
                <div className="max-w-[80mm] mx-auto text-[11px] font-mono leading-tight space-y-2 p-2 text-black">
                  <div className="text-center pb-2 border-b border-dashed border-black">
                    <h2 className="font-bold text-sm uppercase">{companyProfile?.businessName || 'Farhan Distribution'}</h2>
                    <p className="text-[10px]">{companyProfile?.tagline || 'Sale & Distribution'}</p>
                    <p className="font-bold mt-1">PAYMENT VOUCHER</p>
                  </div>

                  <div className="space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span>Voucher #:</span>
                      <span className="font-bold doc-identifier">{viewPayment.voucher_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span className="table-date">{viewPayment.payment_date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vendor:</span>
                      <span className="font-bold truncate max-w-[130px]">{viewPayment.vendor_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paid From:</span>
                      <span>{viewPayment.account_name || 'Cash'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mode:</span>
                      <span>{viewPayment.payment_method}</span>
                    </div>
                    {viewPayment.reference_no && (
                      <div className="flex justify-between">
                        <span>Ref #:</span>
                        <span className="doc-identifier">{viewPayment.reference_no}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-b border-dashed border-black py-1.5 my-1">
                    <div className="font-bold text-[10px] mb-1">ALLOCATED BILLS:</div>
                    {viewPayment.allocations && viewPayment.allocations.length > 0 ? (
                      viewPayment.allocations.map((a: any) => (
                        <div key={a.id} className="flex justify-between text-[10px]">
                          <span className="doc-identifier">{a.bill_number}</span>
                          <span className="font-semibold">{formatCurrency(a.allocated_amount, 'PKR')}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-[10px] italic">On Account Payment</div>
                    )}
                  </div>

                  <div className="space-y-1 text-right text-[11px]">
                    {viewPayment.unallocated_amount > 0 && (
                      <div className="flex justify-between text-[10px]">
                        <span>On Account:</span>
                        <span>{formatCurrency(viewPayment.unallocated_amount, 'PKR')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold border-t border-black pt-1">
                      <span>TOTAL DISBURSED:</span>
                      <span>{formatCurrency(viewPayment.amount, 'PKR')}</span>
                    </div>
                  </div>

                  <div className="text-center pt-3 text-[9px] border-t border-dashed border-black">
                    <p>{companyProfile?.thermalFooterNote || 'Computer Generated Voucher'}</p>
                    <p className="mt-1">Software Powered by SaleFlow</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* VOID VOUCHER CONFIRMATION MODAL                            */}
      {/* ========================================================== */}
      {isVoidModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div
            className="relative z-[101] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in duration-150"
            style={{ backgroundColor: 'var(--bg-surface)', opacity: 1 }}
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 dark:bg-rose-950/40">
                <Ban size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-heading)]">Void Payment Voucher</h3>
                <p className="text-xs text-[var(--text-secondary)] doc-identifier">{voidPaymentNumber}</p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Voiding this voucher will immediately reverse the Double-Entry General Ledger journal entry, restore
              the outstanding balance on all allocated purchase bills, and return the vendor ledger to its prior state.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-heading)]">Reason for Voiding *</label>
              <input
                type="text"
                placeholder="e.g. Cheque cancelled, incorrect vendor selected, entered wrong amount"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="input w-full text-xs"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(false)}
                className="btn btn-secondary text-xs"
                disabled={voidSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voidSubmitting}
                className="btn text-xs bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center gap-1.5"
              >
                {voidSubmitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Voiding...
                  </>
                ) : (
                  <>
                    <Ban size={14} /> Confirm Void & Reverse GL
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Delete & Reverse Modal with Day Close & Admin Override */}
      {deletePaymentItem && (
        <DeleteTransactionModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeletePaymentItem(null);
          }}
          onSuccess={() => {
            setIsDeleteModalOpen(false);
            setDeletePaymentItem(null);
            setNotification({
              type: 'success',
              message: `Payment Voucher ${deletePaymentItem.voucher_number} has been deleted and reversed.`,
            });
            fetchData();
          }}
          transaction={{
            id: deletePaymentItem.id,
            type: 'Vendor Payment',
            number: deletePaymentItem.voucher_number,
            date: deletePaymentItem.payment_date,
            endpoint: `/api/payments/made/${deletePaymentItem.id}`,
          }}
        />
      )}
    </ListPageContainer>
  );
}
