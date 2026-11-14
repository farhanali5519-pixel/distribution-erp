'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Truck,
  FileText,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Layers,
  PackageCheck
} from 'lucide-react';

interface VendorOption {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  cnic_or_ntn: string | null;
  current_balance: number; // AP running balance in PKR
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  category_name: string;
  item_type: 'STANDARD' | 'BATCH' | 'SERVICE';
  uom_base: string;
  uom_bulk: string;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  base_rate_per_piece: number;
  cost_price: number;
  current_stock_base: number;
}

interface BillRow {
  id: string;
  productId: string;
  itemReference: string;
  batchNumber: string;
  expiryDate: string;
  cartonsQty: number | '';
  boxesQty: number | '';
  loosePiecesQty: number | '';
  totalPieces: number;
  ratePerPiece: number | '';
  grossAmount: number;
  taxPercent: number | '';
  taxAmount: number | '';
  discountPercent: number | '';
  discountAmount: number | '';
  lineTotal: number;
}

function NewPurchaseBillContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('editId');

  const { isEnabled } = useFeatureFlags();
  const enable3Tier = isEnabled('purchase.enable_3tier_uom');
  const enableBatch = isEnabled('purchase.enable_batch_tracking');
  const enableLandedCost = isEnabled('purchase.enable_freight_landed_cost');

  // Master options
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const vendorOptions = useMemo(() => {
    return vendors.map((v) => ({
      value: v.id,
      label: v.name,
      subLabel: v.company_name ? `${v.company_name} • AP: ${formatCurrency(v.current_balance)}` : `AP: ${formatCurrency(v.current_balance)}`,
      badge: v.cnic_or_ntn || undefined,
      badgeColor: 'blue' as const,
      keywords: [v.company_name || '', v.phone || '', v.cnic_or_ntn || ''],
    }));
  }, [vendors]);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      subLabel: `${p.category_name ? `${p.category_name} • ` : ''}${p.total_pieces_per_carton || 1} pcs/CTN • Base: ${formatCurrency(p.base_rate_per_piece || p.cost_price)}`,
      badge: p.sku,
      badgeColor: 'emerald' as const,
      keywords: [p.sku, p.category_name || '', p.item_type],
    }));
  }, [products]);

  const warehouseOptions = useMemo(() => [
    { value: 'Main Warehouse', label: 'Main Warehouse', badge: 'Primary', badgeColor: 'blue' as const },
    { value: 'Godown 1 (Rawalpindi)', label: 'Godown 1 (Rawalpindi)', badge: 'Annex', badgeColor: 'slate' as const },
    { value: 'Godown 2 (Lahore Hub)', label: 'Godown 2 (Lahore Hub)', badge: 'Hub', badgeColor: 'slate' as const },
  ], []);

  // Form State
  const [vendorId, setVendorId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [warehouse, setWarehouse] = useState('Main Warehouse');
  const [broker, setBroker] = useState('');
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Freight
  const [freightTreatment, setFreightTreatment] = useState<'LANDED_COST' | 'DIRECT_EXPENSE' | 'NONE'>('LANDED_COST');
  const [freightAmount, setFreightAmount] = useState<number | ''>('');

  // Rows
  const [rows, setRows] = useState<BillRow[]>([
    {
      id: '1',
      productId: '',
      itemReference: '',
      batchNumber: '',
      expiryDate: '',
      cartonsQty: '',
      boxesQty: '',
      loosePiecesQty: '',
      totalPieces: 0,
      ratePerPiece: '',
      grossAmount: 0,
      taxPercent: '',
      taxAmount: '',
      discountPercent: '',
      discountAmount: '',
      lineTotal: 0,
    },
  ]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<{ billNumber: string; netAmount: number; billId: string } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Refs for rapid re-entry
  const invoiceNumRef = useRef<HTMLInputElement>(null);
  const vendorSelectRef = useRef<HTMLSelectElement>(null);

  // Fetch Vendors & Products
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingOptions(true);
        const [vRes, pRes] = await Promise.all([
          fetch('/api/vendors').then((r) => r.json()),
          fetch('/api/inventory').then((r) => r.json()),
        ]);

        if (vRes.success) setVendors(vRes.vendors || []);
        if (pRes.success) setProducts(pRes.products || []);
      } catch (err) {
        console.error('Failed to load master data', err);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadData();
  }, []);

  // Pre-fill if editing an existing bill
  useEffect(() => {
    if (!editId || products.length === 0 || vendors.length === 0) return;

    async function loadBillForEdit() {
      try {
        const res = await fetch(`/api/purchase/bills/${editId}`);
        const data = await res.json();
        if (data.success && data.bill) {
          const b = data.bill;
          setVendorId(b.vendor_id);
          setBillDate(b.bill_date);
          setDueDate(b.due_date || '');
          setWarehouse(b.warehouse || 'Main Warehouse');
          setBroker(b.broker || '');
          setVendorInvoiceNumber(b.vendor_invoice_number);
          setReferenceNumber(b.reference_number || '');
          setFreightTreatment(b.freight_treatment);
          setFreightAmount(b.freight_amount > 0 ? b.freight_amount : '');
          setNotes(b.notes || '');

          if (b.items && b.items.length > 0) {
            const mappedRows: BillRow[] = b.items.map((it: any, idx: number) => {
              const gross = it.total_pieces * it.rate_per_piece;
              const discAmt = it.discount_paisas ? it.discount_paisas / 100 : 0;
              const taxAmt = it.tax_paisas ? it.tax_paisas / 100 : 0;
              return {
                id: String(idx + 1),
                productId: it.product_id,
                itemReference: it.item_reference || '',
                batchNumber: it.batch_number || '',
                expiryDate: it.expiry_date || '',
                cartonsQty: it.cartons_qty > 0 ? it.cartons_qty : '',
                boxesQty: it.boxes_qty > 0 ? it.boxes_qty : '',
                loosePiecesQty: it.loose_pieces_qty > 0 ? it.loose_pieces_qty : '',
                totalPieces: it.total_pieces,
                ratePerPiece: it.rate_per_piece,
                grossAmount: gross,
                taxPercent: it.tax_percent > 0 ? it.tax_percent : '',
                taxAmount: taxAmt > 0 ? taxAmt : '',
                discountPercent: it.discount_percent > 0 ? it.discount_percent : '',
                discountAmount: discAmt > 0 ? discAmt : '',
                lineTotal: it.line_total,
              };
            });
            setRows(mappedRows);
          }
        }
      } catch (err) {
        console.error('Failed to load bill for editing', err);
      }
    }

    loadBillForEdit();
  }, [editId, products, vendors]);

  const selectedVendor = vendors.find((v) => v.id === vendorId);

  // Helper to re-calculate row amounts
  const updateRowCalculations = (row: BillRow, prod?: ProductOption): BillRow => {
    const p = prod || products.find((pr) => pr.id === row.productId);
    if (!p) return row;

    let totalPcs = 0;
    if (p.item_type === 'SERVICE') {
      totalPcs = Number(row.loosePiecesQty) || 1;
    } else {
      const ctn = Number(row.cartonsQty) || 0;
      const box = Number(row.boxesQty) || 0;
      const pcs = Number(row.loosePiecesQty) || 0;
      const boxesPerCarton = Math.max(1, p.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, p.pieces_per_box || 1);
      totalPcs = (ctn * boxesPerCarton * piecesPerBox) + (box * piecesPerBox) + pcs;
    }

    const rate = Number(row.ratePerPiece) || 0;
    const gross = totalPcs * rate;

    // Discounts
    let discAmt = 0;
    let discPct: number | '' = row.discountPercent !== '' ? Number(row.discountPercent) : '';
    if (discPct !== '') {
      discAmt = Math.round(((gross * Number(discPct)) / 100) * 100) / 100;
    } else if (row.discountAmount !== '') {
      discAmt = Number(row.discountAmount);
      discPct = gross > 0 ? Math.round(((discAmt / gross) * 100) * 10) / 10 : 0;
    }

    const afterDisc = Math.max(0, gross - discAmt);

    // Taxes
    let taxAmt = 0;
    let taxPct: number | '' = row.taxPercent !== '' ? Number(row.taxPercent) : '';
    if (taxPct !== '') {
      taxAmt = Math.round(((afterDisc * Number(taxPct)) / 100) * 100) / 100;
    } else if (row.taxAmount !== '') {
      taxAmt = Number(row.taxAmount);
      taxPct = afterDisc > 0 ? Math.round(((taxAmt / afterDisc) * 100) * 10) / 10 : 0;
    }

    const lineTotal = Math.round((afterDisc + taxAmt) * 100) / 100;

    return {
      ...row,
      totalPieces: totalPcs,
      grossAmount: gross,
      discountPercent: discPct,
      discountAmount: discAmt > 0 ? discAmt : '',
      taxPercent: taxPct,
      taxAmount: taxAmt > 0 ? taxAmt : '',
      lineTotal,
    };
  };

  const handleProductChange = (rowId: string, pId: string) => {
    const prod = products.find((p) => p.id === pId);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (!prod) return { ...r, productId: '', totalPieces: 0, grossAmount: 0, lineTotal: 0 };

        const updated: BillRow = {
          ...r,
          productId: pId,
          ratePerPiece: prod.base_rate_per_piece > 0 ? prod.base_rate_per_piece : (prod.cost_price / (prod.total_pieces_per_carton || 1)),
          cartonsQty: prod.item_type === 'SERVICE' ? '' : 1,
          boxesQty: '',
          loosePiecesQty: prod.item_type === 'SERVICE' ? 1 : '',
        };
        return updateRowCalculations(updated, prod);
      })
    );
  };

  const handleQuantityChange = (rowId: string, field: 'cartonsQty' | 'boxesQty' | 'loosePiecesQty', val: string) => {
    const num: number | '' = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated: BillRow = { ...r, [field]: num };
        return updateRowCalculations(updated);
      })
    );
  };

  const handleRateChange = (rowId: string, val: string) => {
    const rate: number | '' = val === '' ? '' : Math.max(0, parseFloat(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated: BillRow = { ...r, ratePerPiece: rate };
        return updateRowCalculations(updated);
      })
    );
  };

  // Two-way reactive Discount
  const handleDiscPercentChange = (rowId: string, val: string) => {
    const pct = val === '' ? '' : Math.min(100, Math.max(0, parseFloat(val) || 0));
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const gross = r.grossAmount;
        const amt = pct !== '' ? Math.round(((gross * Number(pct)) / 100) * 100) / 100 : '';
        const afterDisc = Math.max(0, gross - (Number(amt) || 0));
        const taxAmt = r.taxPercent !== '' ? Math.round(((afterDisc * Number(r.taxPercent)) / 100) * 100) / 100 : (Number(r.taxAmount) || 0);
        return {
          ...r,
          discountPercent: pct,
          discountAmount: amt,
          taxAmount: taxAmt > 0 ? taxAmt : '',
          lineTotal: Math.round((afterDisc + (Number(taxAmt) || 0)) * 100) / 100,
        };
      })
    );
  };

  const handleDiscAmountChange = (rowId: string, val: string) => {
    const amt = val === '' ? '' : Math.max(0, parseFloat(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const gross = r.grossAmount;
        const pct = amt !== '' && gross > 0 ? Math.round(((Number(amt) / gross) * 100) * 10) / 10 : '';
        const afterDisc = Math.max(0, gross - (Number(amt) || 0));
        const taxAmt = r.taxPercent !== '' ? Math.round(((afterDisc * Number(r.taxPercent)) / 100) * 100) / 100 : (Number(r.taxAmount) || 0);
        return {
          ...r,
          discountPercent: pct,
          discountAmount: amt,
          taxAmount: taxAmt > 0 ? taxAmt : '',
          lineTotal: Math.round((afterDisc + (Number(taxAmt) || 0)) * 100) / 100,
        };
      })
    );
  };

  // Two-way reactive Tax
  const handleTaxPercentChange = (rowId: string, val: string) => {
    const pct = val === '' ? '' : Math.max(0, parseFloat(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const afterDisc = Math.max(0, r.grossAmount - (Number(r.discountAmount) || 0));
        const amt = pct !== '' ? Math.round(((afterDisc * Number(pct)) / 100) * 100) / 100 : '';
        return {
          ...r,
          taxPercent: pct,
          taxAmount: amt,
          lineTotal: Math.round((afterDisc + (Number(amt) || 0)) * 100) / 100,
        };
      })
    );
  };

  const handleTaxAmountChange = (rowId: string, val: string) => {
    const amt = val === '' ? '' : Math.max(0, parseFloat(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const afterDisc = Math.max(0, r.grossAmount - (Number(r.discountAmount) || 0));
        const pct = amt !== '' && afterDisc > 0 ? Math.round(((Number(amt) / afterDisc) * 100) * 10) / 10 : '';
        return {
          ...r,
          taxPercent: pct,
          taxAmount: amt,
          lineTotal: Math.round((afterDisc + (Number(amt) || 0)) * 100) / 100,
        };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        productId: '',
        itemReference: '',
        batchNumber: '',
        expiryDate: '',
        cartonsQty: '',
        boxesQty: '',
        loosePiecesQty: '',
        totalPieces: 0,
        ratePerPiece: '',
        grossAmount: 0,
        taxPercent: '',
        taxAmount: '',
        discountPercent: '',
        discountAmount: '',
        lineTotal: 0,
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Bill Totals
  const grossTotal = rows.reduce((sum, r) => sum + (Number(r.grossAmount) || 0), 0);
  const totalDiscount = rows.reduce((sum, r) => sum + (Number(r.discountAmount) || 0), 0);
  const totalTax = rows.reduce((sum, r) => sum + (Number(r.taxAmount) || 0), 0);
  const itemsNetTotal = rows.reduce((sum, r) => sum + (Number(r.lineTotal) || 0), 0);

  const numericFreight = Number(freightAmount) || 0;
  const netPayable = itemsNetTotal + (freightTreatment !== 'NONE' ? numericFreight : 0);

  // Submit Handler with Rapid Re-entry
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (!vendorId) {
      setErrorBanner('Please select a supplier / vendor.');
      return;
    }
    if (!vendorInvoiceNumber.trim()) {
      setErrorBanner("Please provide the vendor's paper invoice / bill number.");
      invoiceNumRef.current?.focus();
      return;
    }

    const validRows = rows.filter((r) => r.productId && r.totalPieces > 0);
    if (validRows.length === 0) {
      setErrorBanner('Please add at least one valid product line item.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        vendorId,
        billDate,
        dueDate: dueDate || undefined,
        warehouse,
        broker: broker || undefined,
        vendorInvoiceNumber: vendorInvoiceNumber.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        freightTreatment,
        freightAmount: numericFreight,
        notes: notes.trim() || undefined,
        status: 'POSTED',
        items: validRows.map((r) => ({
          productId: r.productId,
          itemReference: r.itemReference || undefined,
          batchNumber: r.batchNumber || undefined,
          expiryDate: r.expiryDate || undefined,
          cartonsQty: Number(r.cartonsQty) || 0,
          boxesQty: Number(r.boxesQty) || 0,
          loosePiecesQty: Number(r.loosePiecesQty) || 0,
          ratePerPiece: Number(r.ratePerPiece) || 0,
          taxPercent: Number(r.taxPercent) || 0,
          taxPaisas: Math.round((Number(r.taxAmount) || 0) * 100),
          discountPercent: Number(r.discountPercent) || 0,
          discountPaisas: Math.round((Number(r.discountAmount) || 0) * 100),
        })),
      };

      const endpoint = editId ? `/api/purchase/bills/${editId}` : '/api/purchase/bills';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save purchase bill');
      }

      setSuccessBanner({
        billNumber: data.billNumber,
        netAmount: netPayable,
        billId: data.billId,
      });

      if (editId) {
        // If editing, redirect back to list after short pause
        setTimeout(() => {
          router.push('/purchase/orders-detail');
        }, 1200);
      } else {
        // Rapid Re-entry Mode:
        // Keep Vendor, Date, Warehouse, but reset items and invoice number for immediate next bill!
        setVendorInvoiceNumber('');
        setReferenceNumber('');
        setFreightAmount('');
        setNotes('');
        setRows([
          {
            id: String(Date.now()),
            productId: '',
            itemReference: '',
            batchNumber: '',
            expiryDate: '',
            cartonsQty: '',
            boxesQty: '',
            loosePiecesQty: '',
            totalPieces: 0,
            ratePerPiece: '',
            grossAmount: 0,
            taxPercent: '',
            taxAmount: '',
            discountPercent: '',
            discountAmount: '',
            lineTotal: 0,
          },
        ]);

        // Shift focus back to Invoice Number input immediately
        setTimeout(() => {
          invoiceNumRef.current?.focus();
        }, 100);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'An error occurred while saving the bill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      {/* Header Breadcrumbs & Title */}
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {editId ? 'Edit Purchase' : 'Purchase'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/purchase/orders-detail" className="btn btn-outline btn-sm">
            <FileText size={15} style={{ marginRight: '4px' }} /> Purchase Detail
          </Link>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={24} style={{ color: '#10b981' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.95rem' }}>
                Purchase Bill {successBanner.billNumber} Saved & Posted Successfully!
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Stock incremented in warehouse. Accounts Payable credited with {formatCurrency(successBanner.netAmount)}.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href="/purchase/orders-detail" className="btn btn-sm btn-secondary">
              View In Detail
            </Link>
            <button className="btn btn-sm btn-primary" onClick={() => setSuccessBanner(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorBanner && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={22} style={{ color: '#ef4444' }} />
          <div style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 600 }}>{errorBanner}</div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* SECTION A: Supplier & Logistics Header Card */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Supplier & Logistics Header
            </span>
            {selectedVendor && (
              <span
                className="tabular-nums"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: 'rgba(14, 165, 233, 0.12)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(14, 165, 233, 0.25)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                Payable Balance: {formatCurrency(selectedVendor.current_balance)}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            {/* Vendor Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Vendor / Supplier <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <SearchableSelect
                value={vendorId}
                onChange={setVendorId}
                options={vendorOptions}
                placeholder="-- Select Vendor --"
                searchPlaceholder="Search vendor name, company, phone..."
                required
              />
            </div>

            {/* Vendor Invoice # */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Vendor Invoice # <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                ref={invoiceNumRef}
                type="text"
                className="input doc-identifier"
                placeholder="e.g. NF-99214"
                value={vendorInvoiceNumber}
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                required
                style={{ width: '100%', height: '40px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Bill Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Bill Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                className="input tabular-nums"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                required
                style={{ width: '100%', height: '40px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Warehouse */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Warehouse Godown
              </label>
              <SearchableSelect
                value={warehouse}
                onChange={setWarehouse}
                options={warehouseOptions}
                placeholder="Select Warehouse Godown"
                searchPlaceholder="Search godown..."
              />
            </div>

            {/* Broker */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Broker / Agent
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Tariq Brokerage"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Reference # */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Bilty / Vehicle Ref #
              </label>
              <input
                type="text"
                className="input doc-identifier"
                placeholder="e.g. Bilty #7842 / Faisal Movers"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                style={{ width: '100%', height: '40px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        {/* SECTION B: Items Table Card */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-heading)' }}>
              Purchased Merchandise & 3-Tier Packaging
            </h3>
            <button type="button" onClick={addRow} className="btn btn-outline btn-sm">
              <Plus size={14} style={{ marginRight: '4px' }} /> Add Row
            </button>
          </div>

          {/* SECTION B: Items - Desktop Table (xl:block) */}
          <div className="hidden xl:block table-container">
            <table className="table purchase-items-table" style={{ width: '100%', minWidth: enableBatch ? '980px' : '880px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: '180px' }}>Item Search / Description</th>
                  {enableBatch && <th style={{ width: '130px' }}>Batch & Expiry</th>}
                  <th style={{ width: '70px', textAlign: 'right' }}>CTN</th>
                  <th style={{ width: '70px', textAlign: 'right' }}>Box</th>
                  <th style={{ width: '70px', textAlign: 'right' }}>Pcs</th>
                  <th style={{ width: '80px', textAlign: 'right', background: 'rgba(14, 165, 233, 0.12)', color: 'var(--primary)' }}>Total Pcs</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Rate / Pc</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Gross</th>
                  <th style={{ width: '125px', textAlign: 'right' }}>Disc % / Amt</th>
                  <th style={{ width: '125px', textAlign: 'right' }}>Tax % / Amt</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Net Total</th>
                  <th style={{ width: '36px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const currentProd = products.find((p) => p.id === row.productId);
                  const isService = currentProd?.item_type === 'SERVICE';
                  const isBatch = currentProd?.item_type === 'BATCH';

                  return (
                    <tr key={row.id}>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
                        {index + 1}
                      </td>

                      {/* Product Selection */}
                      <td>
                        <SearchableSelect
                          value={row.productId}
                          onChange={(val) => handleProductChange(row.id, val)}
                          options={productOptions}
                          placeholder="-- Choose Item --"
                          searchPlaceholder="Search SKU, name, category..."
                          size="sm"
                          required
                          minDropdownWidth={300}
                        />

                        {currentProd && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {formatInteger(currentProd.total_pieces_per_carton || 1)} pcs/CTN
                            </span>
                            <span>•</span>
                            <span className="tabular-nums">Base Purchase: {formatCurrency(currentProd.base_rate_per_piece || currentProd.cost_price)}</span>
                          </div>
                        )}
                      </td>

                      {/* Batch Number & Expiry (if batch enabled or item is batch) */}
                      {enableBatch && (
                        <td>
                          {isBatch ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <input
                                type="text"
                                className="input doc-identifier"
                                placeholder="Batch #"
                                value={row.batchNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, batchNumber: val } : r)));
                                }}
                                style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.4rem' }}
                              />
                              <input
                                type="date"
                                className="input table-date"
                                value={row.expiryDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, expiryDate: val } : r)));
                                }}
                                style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.3rem' }}
                              />
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* CTN */}
                      <td style={{ width: '70px' }}>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          disabled={isService}
                          placeholder={isService ? '-' : '0'}
                          value={row.cartonsQty}
                          onChange={(e) => handleQuantityChange(row.id, 'cartonsQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                        />
                      </td>

                      {/* Box */}
                      <td style={{ width: '70px' }}>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          disabled={isService}
                          placeholder={isService ? '-' : '0'}
                          value={row.boxesQty}
                          onChange={(e) => handleQuantityChange(row.id, 'boxesQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                        />
                      </td>

                      {/* Loose Pieces */}
                      <td style={{ width: '70px' }}>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          placeholder={isService ? 'Qty' : '0'}
                          value={row.loosePiecesQty}
                          onChange={(e) => handleQuantityChange(row.id, 'loosePiecesQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                        />
                      </td>

                      {/* Total Pcs */}
                      <td className="tabular-nums" style={{ background: 'rgba(16, 185, 129, 0.12)', fontWeight: 700, color: '#10b981', textAlign: 'right', fontSize: '0.8125rem', padding: '0 0.5rem' }}>
                        {formatInteger(row.totalPieces)} {currentProd?.uom_base || 'Pcs'}
                      </td>

                      {/* Rate per Piece */}
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input tabular-nums text-right"
                          placeholder="0.00"
                          value={row.ratePerPiece}
                          onChange={(e) => handleRateChange(row.id, e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                        />
                      </td>

                      {/* Gross */}
                      <td className="tabular-nums text-right" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {formatCurrency(row.grossAmount)}
                      </td>

                      {/* Discount */}
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            placeholder="%"
                            className="input tabular-nums text-right"
                            value={row.discountPercent}
                            onChange={(e) => handleDiscPercentChange(row.id, e.target.value)}
                            style={{ width: '48px', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="input tabular-nums text-right"
                            value={row.discountAmount}
                            onChange={(e) => handleDiscAmountChange(row.id, e.target.value)}
                            style={{ width: '68px', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                          />
                        </div>
                      </td>

                      {/* Tax */}
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="%"
                            className="input tabular-nums text-right"
                            value={row.taxPercent}
                            onChange={(e) => handleTaxPercentChange(row.id, e.target.value)}
                            style={{ width: '48px', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="input tabular-nums text-right"
                            value={row.taxAmount}
                            onChange={(e) => handleTaxAmountChange(row.id, e.target.value)}
                            style={{ width: '68px', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                          />
                        </div>
                      </td>

                      {/* Net Line Total */}
                      <td className="tabular-nums text-right font-bold" style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {formatCurrency(row.lineTotal)}
                      </td>

                      {/* Delete Action */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: rows.length === 1 ? 'var(--text-secondary)' : '#ef4444',
                            cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                            padding: '0.25rem',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SECTION B: Items - Tablet & Mobile Responsive Cards (< 1280px) */}
          <div className="block xl:hidden space-y-3">
            {rows.map((row, index) => {
              const currentProd = products.find((p) => p.id === row.productId);
              const isService = currentProd?.item_type === 'SERVICE';
              const isBatch = currentProd?.item_type === 'BATCH';

              return (
                <div
                  key={row.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        #{index + 1}
                      </span>
                      {currentProd && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {currentProd.name}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: rows.length === 1 ? 'var(--text-secondary)' : '#ef4444',
                        cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                        padding: '0.25rem',
                      }}
                      title="Remove row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Row 1: Item / Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Item / Description
                    </label>
                    <SearchableSelect
                      value={row.productId}
                      onChange={(val) => handleProductChange(row.id, val)}
                      options={productOptions}
                      placeholder="-- Choose Item --"
                      searchPlaceholder="Search SKU, name, category..."
                      size="sm"
                      required
                      minDropdownWidth={280}
                    />
                    {currentProd && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatInteger(currentProd.total_pieces_per_carton || 1)} pcs/CTN
                        </span>
                        <span>•</span>
                        <span className="tabular-nums">Base: {formatCurrency(currentProd.base_rate_per_piece || currentProd.cost_price)}</span>
                      </div>
                    )}
                  </div>

                  {/* Row 2: Batch | CTN | BOX | PCS | Total PCS */}
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: enableBatch && isBatch ? 'repeat(auto-fit, minmax(65px, 1fr))' : 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'flex-end' }}>
                      {enableBatch && isBatch && (
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                            Batch & Expiry
                          </label>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input
                              type="text"
                              className="input doc-identifier"
                              placeholder="Batch #"
                              value={row.batchNumber}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, batchNumber: val } : r)));
                              }}
                              style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.4rem' }}
                            />
                            <input
                              type="date"
                              className="input table-date"
                              value={row.expiryDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, expiryDate: val } : r)));
                              }}
                              style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.3rem' }}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                          CTN
                        </label>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          disabled={isService}
                          placeholder={isService ? '-' : '0'}
                          value={row.cartonsQty}
                          onChange={(e) => handleQuantityChange(row.id, 'cartonsQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.4rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                          BOX
                        </label>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          disabled={isService}
                          placeholder={isService ? '-' : '0'}
                          value={row.boxesQty}
                          onChange={(e) => handleQuantityChange(row.id, 'boxesQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.4rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                          PCS
                        </label>
                        <input
                          type="number"
                          className="input tabular-nums text-right"
                          min="0"
                          placeholder={isService ? 'Qty' : '0'}
                          value={row.loosePiecesQty}
                          onChange={(e) => handleQuantityChange(row.id, 'loosePiecesQty', e.target.value)}
                          style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.4rem' }}
                        />
                      </div>

                      <div style={{ background: 'rgba(16, 185, 129, 0.12)', borderRadius: 'var(--radius-xs)', padding: '0.2rem 0.4rem', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '32px', boxSizing: 'border-box' }}>
                        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, color: '#047857' }}>
                          Total PCS
                        </span>
                        <span className="tabular-nums" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>
                          {formatInteger(row.totalPieces)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Rate / PCS | Gross | Discount % | Discount Amount */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                        Rate / PCS
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input tabular-nums text-right"
                        placeholder="0.00"
                        value={row.ratePerPiece}
                        onChange={(e) => handleRateChange(row.id, e.target.value)}
                        style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.8125rem', padding: '0 0.4rem' }}
                      />
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '32px', boxSizing: 'border-box' }}>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Gross
                      </span>
                      <span className="tabular-nums" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatCurrency(row.grossAmount)}
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                        Disc %
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="%"
                        className="input tabular-nums text-right"
                        value={row.discountPercent}
                        onChange={(e) => handleDiscPercentChange(row.id, e.target.value)}
                        style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                        Disc Amt
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="input tabular-nums text-right"
                        value={row.discountAmount}
                        onChange={(e) => handleDiscAmountChange(row.id, e.target.value)}
                        style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                      />
                    </div>
                  </div>

                  {/* Row 4: Tax % | Tax Amount | Net Total */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', alignItems: 'flex-end', paddingTop: '0.25rem', borderTop: '1px dashed var(--border-light)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                        Tax %
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="%"
                        className="input tabular-nums text-right"
                        value={row.taxPercent}
                        onChange={(e) => handleTaxPercentChange(row.id, e.target.value)}
                        style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', marginBottom: '0.25rem' }}>
                        Tax Amt
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="input tabular-nums text-right"
                        value={row.taxAmount}
                        onChange={(e) => handleTaxAmountChange(row.id, e.target.value)}
                        style={{ width: '100%', height: '32px', boxSizing: 'border-box', fontSize: '0.75rem', padding: '0 0.35rem' }}
                      />
                    </div>

                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '0.2rem 0.5rem', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '32px', boxSizing: 'border-box' }}>
                      <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Net Total
                      </span>
                      <span className="tabular-nums" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatCurrency(row.lineTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <style>{`
            .purchase-items-table th,
            .purchase-items-table td {
              padding: 0.5rem 0.35rem !important;
            }
          `}</style>
        </div>

        {/* SECTION C: Footer Grid (Logistics/Freight on Left, Summary on Right) */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 mb-8">
          {/* Freight & Notes Column */}
          <div
            style={{
              padding: '1.5rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <h3
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                marginBottom: '1.25rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Truck size={16} color="var(--primary)" /> Freight Treatment & Inward Logistics
            </h3>

            {/* Freight Amount */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Freight / Carriage Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="input tabular-nums text-right"
                value={freightAmount}
                onChange={(e) => setFreightAmount(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', height: '40px', fontSize: '0.9rem' }}
              />
            </div>

            {/* Freight Treatment Segmented Modern Toggle Tabs */}
            {enableLandedCost && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Freight Accounting Treatment
                </label>
                <div
                  style={{
                    background: 'var(--bg-muted)',
                    padding: '4px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFreightTreatment('LANDED_COST')}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'calc(var(--radius-sm) - 2px)',
                      border: 'none',
                      background: freightTreatment === 'LANDED_COST' ? 'var(--bg-surface)' : 'transparent',
                      color: freightTreatment === 'LANDED_COST' ? 'var(--primary)' : 'var(--text-secondary)',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: freightTreatment === 'LANDED_COST' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Add to Landed Cost
                  </button>

                  <button
                    type="button"
                    onClick={() => setFreightTreatment('DIRECT_EXPENSE')}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'calc(var(--radius-sm) - 2px)',
                      border: 'none',
                      background: freightTreatment === 'DIRECT_EXPENSE' ? 'var(--bg-surface)' : 'transparent',
                      color: freightTreatment === 'DIRECT_EXPENSE' ? '#10b981' : 'var(--text-secondary)',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: freightTreatment === 'DIRECT_EXPENSE' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Direct Expense
                  </button>
                </div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '0.45rem' }}>
                  {freightTreatment === 'LANDED_COST'
                    ? '• Adds freight into inventory cost.'
                    : '• Records freight as an operational expense.'}
                </div>
              </div>
            )}

            {/* Remarks / Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Bill Notes & Vehicle Description
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Received via Truck # LES-4412 in undamaged condition."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', resize: 'none' }}
              />
            </div>
          </div>

          {/* Right Column: Financial Totals & Action */}
          <div
            style={{
              padding: '1.5rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  marginBottom: '1rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Bill Financial Summary
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Gross Items Total:</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(grossTotal)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Line Discounts:</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#e11d48' }}>
                    - {formatCurrency(totalDiscount)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Taxes:</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                    + {formatCurrency(totalTax)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Freight ({freightTreatment === 'LANDED_COST' ? 'Landed Cost' : 'Direct Exp'}):
                  </span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--primary)' }}>
                    + {formatCurrency(numericFreight)}
                  </span>
                </div>

                <div
                  style={{
                    borderTop: '2px solid var(--border-subtle)',
                    paddingTop: '0.85rem',
                    marginTop: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Net Payable Amount:</span>
                  <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--primary)' }}>
                    {formatCurrency(netPayable)}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                }}
              >
                <ShieldCheck size={18} />
                {submitting ? 'Posting Bill...' : editId ? 'Update & Re-post Bill' : 'Save & Post Bill (Continuous)'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewPurchaseBillPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: '2rem' }}>Loading purchase bill form...</div>}>
      <NewPurchaseBillContent />
    </Suspense>
  );
}
