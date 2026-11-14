'use client';

import { useState } from 'react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';

interface PrintModalProps {
  data: any; // Order or Invoice
  type: 'INVOICE' | 'ORDER';
  defaultFormat?: 'THERMAL' | 'A4';
  onClose: () => void;
}

export default function PrintInvoiceModal({
  data,
  type,
  defaultFormat = 'THERMAL',
  onClose,
}: PrintModalProps) {
  const [format, setFormat] = useState<'THERMAL' | 'A4'>(defaultFormat);
  const { profile } = useCompanyProfile();

  const handlePrint = () => {
    window.print();
  };

  const docNumber = data.invoice_number || data.order_number;
  const docDate = data.invoice_date || data.order_date;

  return (
    <div
      className="print-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--bg-modal-overlay)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        className="print-modal-container"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          width: '100%',
          maxWidth: format === 'THERMAL' ? '460px' : '900px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-dropdown)',
        }}
      >
        {/* Modal Header & Format Switcher (Hidden in print) */}
        <div
          className="no-print"
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>
              Print Preview: {docNumber}
            </span>

            {/* Layout Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0,0,0,0.3)',
                padding: '3px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setFormat('THERMAL')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: format === 'THERMAL' ? 'var(--primary)' : 'transparent',
                  color: format === 'THERMAL' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Thermal (80mm)
              </button>
              <button
                type="button"
                onClick={() => setFormat('A4')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: format === 'A4' ? 'var(--primary)' : 'transparent',
                  color: format === 'A4' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Standard A4
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={15} style={{ marginRight: '4px' }} /> Print Document
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.25rem',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'var(--bg-main)' }}>
          {format === 'THERMAL' ? (
            /* ========================================================== */
            /* 80mm THERMAL RECEIPT LAYOUT */
            /* ========================================================== */
            <div
              id="printable-area"
              className="thermal-receipt font-sans tabular-nums"
              style={{
                width: '320px',
                margin: '0 auto',
                background: '#fff',
                color: '#000',
                padding: '16px',
                fontSize: '12px',
                lineHeight: '1.35',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                {profile.showLogoOnPrints && profile.logoUrl && (
                  <img
                    src={profile.logoUrl}
                    alt="Logo"
                    style={{
                      maxHeight: '44px',
                      maxWidth: '120px',
                      objectFit: 'contain',
                      margin: '0 auto 6px auto',
                      display: 'block',
                      filter: 'grayscale(100%)',
                    }}
                  />
                )}
                <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                  {profile.businessName || 'SALEFLOW DISTRIBUTION'}
                </div>
                {profile.tagline && <div style={{ fontSize: '10px' }}>{profile.tagline}</div>}
                {(profile.address || profile.city) && (
                  <div style={{ fontSize: '10px' }}>
                    {[profile.address, profile.city].filter(Boolean).join(', ')}
                  </div>
                )}
                {(profile.phonePrimary || profile.phoneSecondary) && (
                  <div style={{ fontSize: '10px' }}>
                    Tel: {[profile.phonePrimary, profile.phoneSecondary].filter(Boolean).join(' / ')}
                  </div>
                )}
                {profile.showNtnOnInvoices && profile.ntnStrn && (
                  <div style={{ fontSize: '10px', fontWeight: 700 }}>{profile.ntnStrn}</div>
                )}
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
                <div style={{ fontWeight: 800, fontSize: '13px' }}>
                  {type === 'INVOICE' ? 'TAX INVOICE / CASH MEMO' : 'COMMERCIAL SALE BILL & DELIVERY MEMO'}
                </div>
              </div>

              {/* Meta */}
              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                <div><b>Bill #:</b> <span className="doc-identifier">{docNumber}</span></div>
                <div><b>Date:</b> <span className="table-date">{docDate}</span></div>
                {data.route_name && <div><b>Route:</b> {data.route_name}</div>}
                {data.salesman_name && <div><b>Salesman:</b> {data.salesman_name}</div>}
                {data.supply_person_name && <div><b>Delivery Officer:</b> {data.supply_person_name}</div>}
                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
                <div><b>Customer:</b> {data.customer_name}</div>
                {data.shop_name && <div><b>Shop:</b> {data.shop_name}</div>}
                {data.customer_phone && <div><b>Phone:</b> <span className="numeric-text">{data.customer_phone}</span></div>}
                {data.cnic_or_ntn && <div><b>NTN/CNIC:</b> <span className="numeric-text">{data.cnic_or_ntn}</span></div>}
              </div>

              <div style={{ borderBottom: '2px solid #000', margin: '6px 0' }} />

              {/* Items List */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ width: '50%' }}>ITEM & QTY (PCS)</span>
                  <span style={{ width: '22%', textAlign: 'right' }}>RATE</span>
                  <span style={{ width: '28%', textAlign: 'right' }}>NET AMOUNT</span>
                </div>
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '4px' }} />

                {data.items?.map((item: any, idx: number) => {
                  const qtyPcs = item.quantity_base ?? item.quantity ?? 0;
                  const bonusPcs = item.scheme_bonus_base ?? item.bonus_pieces ?? 0;
                  const tp = item.unit_price ?? (item.unit_price_paisas ? item.unit_price_paisas / 100 : 0);
                  const discountVal = item.discount_amount ?? (item.discount_paisas ? item.discount_paisas / 100 : 0);
                  const taxVal = item.tax ?? item.tax_amount ?? (item.tax_paisas ? item.tax_paisas / 100 : 0);
                  const lineTotal = item.line_total ?? (item.line_total_paisas ? item.line_total_paisas / 100 : 0);

                  return (
                    <div key={idx} style={{ marginBottom: '6px' }}>
                      <div style={{ fontWeight: 700, fontSize: '11px' }}>
                        {idx + 1}. {item.product_name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#222' }}>
                        <span>
                          Qty: <b>{formatInteger(qtyPcs)} PCS</b>
                          {bonusPcs > 0 && <span style={{ marginLeft: '4px' }}>+ <b>{formatInteger(bonusPcs)} Bonus</b></span>}
                        </span>
                        <span className="tabular-nums">{formatCurrency(tp)}</span>
                        <span className="tabular-nums" style={{ fontWeight: 700, color: '#000' }}>{formatCurrency(lineTotal)}</span>
                      </div>
                      {(discountVal > 0 || taxVal > 0) && (
                        <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555' }}>
                          <span>
                            {discountVal > 0 && `Disc${item.discount_percent ? ` (${item.discount_percent}%)` : ''}: -${formatCurrency(discountVal)}`}
                            {discountVal > 0 && taxVal > 0 && ' | '}
                            {taxVal > 0 && `Tax${item.tax_percent ? ` (${item.tax_percent}%)` : ''}: +${formatCurrency(taxVal)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              {/* Totals Summary */}
              <div style={{ fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span className="tabular-nums">{formatCurrency(data.subtotal || 0)}</span>
                </div>
                {(data.line_discount > 0 || data.bill_discount > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Discount:</span>
                    <span className="tabular-nums">- {formatCurrency((data.line_discount || 0) + (data.bill_discount || 0))}</span>
                  </div>
                )}
                {data.tax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Sales Tax (GST):</span>
                    <span className="tabular-nums">+ {formatCurrency(data.tax)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '13px', margin: '4px 0', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 0' }}>
                  <span>NET PAYABLE:</span>
                  <span className="tabular-nums">{formatCurrency(data.grand_total || 0)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cash Received:</span>
                  <span className="tabular-nums">{formatCurrency(data.cash_received || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Balance Due:</span>
                  <span className="tabular-nums">{formatCurrency(data.remaining_balance || 0)}</span>
                </div>
                {profile.showCustomerPreviousBalance && data.customer_ledger_balance !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '4px', borderTop: '1px dashed #000', paddingTop: '3px' }}>
                    <span>Total Ledger Outstanding:</span>
                    <span className="tabular-nums">{formatCurrency(data.customer_ledger_balance)}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px dashed #000', marginTop: '10px', paddingTop: '8px', textAlign: 'center', fontSize: '10px' }}>
                <div style={{ whiteSpace: 'pre-line' }}>{profile.thermalFooterNote || 'Computer Generated Bill. Software Powered by SaleFlow.'}</div>
                <div style={{ fontWeight: 800, marginTop: '2px' }}>*** THANK YOU FOR YOUR BUSINESS ***</div>
              </div>
            </div>
          ) : (
            /* ========================================================== */
            /* STANDARD A4 CORPORATE INVOICE LAYOUT */
            /* ========================================================== */
            <div
              id="printable-area"
              className="a4-sheet"
              style={{
                width: '100%',
                maxWidth: '820px',
                margin: '0 auto',
                background: '#fff',
                color: '#1e293b',
                padding: '2.5rem',
                borderRadius: '6px',
                fontSize: '13px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0284c7', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  {profile.showLogoOnPrints && profile.logoUrl && (
                    <img
                      src={profile.logoUrl}
                      alt="Logo"
                      style={{ maxHeight: '60px', maxWidth: '140px', objectFit: 'contain' }}
                    />
                  )}
                  <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0284c7', margin: 0, letterSpacing: '-0.02em' }}>
                      {profile.businessName || 'SALEFLOW DISTRIBUTION'}
                    </h1>
                    {profile.tagline && (
                      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '3px 0 0' }}>
                        {profile.tagline}
                      </p>
                    )}
                    {(profile.address || profile.city || profile.phonePrimary || profile.email) && (
                      <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '2px 0 0' }}>
                        {[profile.address, profile.city].filter(Boolean).join(', ')}
                        {[profile.phonePrimary, profile.phoneSecondary].filter(Boolean).length > 0 && ` | Tel: ${[profile.phonePrimary, profile.phoneSecondary].filter(Boolean).join(' / ')}`}
                        {profile.email && ` | ${profile.email}`}
                      </p>
                    )}
                    {profile.showNtnOnInvoices && profile.ntnStrn && (
                      <p style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700, margin: '2px 0 0' }}>
                        {profile.ntnStrn}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {type === 'INVOICE' ? 'COMMERCIAL TAX INVOICE' : 'COMMERCIAL SALE BILL & DELIVERY MEMO'}
                  </div>
                  <div className="doc-identifier" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0284c7' }}>
                    {docNumber}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Date: <span className="table-date">{docDate}</span></div>
                </div>
              </div>

              {/* Billed To & Route Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', marginBottom: '1.75rem' }}>
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Billed To / Retailer
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{data.customer_name}</div>
                  {data.shop_name && <div style={{ fontSize: '0.85rem', color: '#475569' }}>{data.shop_name}</div>}
                  {data.customer_address && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{data.customer_address}, {data.customer_city || 'Lahore'}</div>}
                  {data.customer_phone && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Phone: <span className="numeric-text">{data.customer_phone}</span></div>}
                  {data.cnic_or_ntn && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>NTN / CNIC: <span className="numeric-text">{data.cnic_or_ntn}</span></div>}
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Distribution Logistics
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: '3px' }}>
                    <b>Route:</b> {data.route_name || 'Direct / Unassigned'}
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: '3px' }}>
                    <b>Sales Executive:</b> {data.salesman_name || 'Standard Counter'}
                  </div>
                  {data.supply_person_name && (
                    <div style={{ fontSize: '0.85rem', marginBottom: '3px' }}>
                      <b>Delivery Officer:</b> {data.supply_person_name}
                    </div>
                  )}
                  <div style={{ fontSize: '0.85rem', marginTop: '4px', fontWeight: 700, color: data.payment_status === 'PAID' ? '#16a34a' : '#ea580c' }}>
                    Payment Status: {data.payment_status || 'POSTED'}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ background: '#0284c7', color: '#fff', fontSize: '0.8rem', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', width: '35px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '8px 10px' }}>Product Description</th>
                    <th style={{ padding: '8px 10px', width: '90px', textAlign: 'right' }}>Qty (PCS)</th>
                    <th style={{ padding: '8px 10px', width: '75px', textAlign: 'right' }}>Bonus</th>
                    <th style={{ padding: '8px 10px', width: '105px', textAlign: 'right' }}>TP / PCS</th>
                    <th style={{ padding: '8px 10px', width: '95px', textAlign: 'right' }}>Discount</th>
                    <th style={{ padding: '8px 10px', width: '85px', textAlign: 'right' }}>Tax</th>
                    <th style={{ padding: '8px 10px', width: '110px', textAlign: 'right' }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items?.map((item: any, idx: number) => {
                    const qtyPcs = item.quantity_base ?? item.quantity ?? 0;
                    const bonusPcs = item.scheme_bonus_base ?? item.bonus_pieces ?? 0;
                    const tp = item.unit_price ?? (item.unit_price_paisas ? item.unit_price_paisas / 100 : 0);
                    const discountVal = item.discount_amount ?? (item.discount_paisas ? item.discount_paisas / 100 : 0);
                    const taxVal = item.tax ?? item.tax_amount ?? (item.tax_paisas ? item.tax_paisas / 100 : 0);
                    const lineTotal = item.line_total ?? (item.line_total_paisas ? item.line_total_paisas / 100 : 0);

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{item.product_name}</td>
                        <td className="tabular-nums font-semibold" style={{ padding: '8px 10px', textAlign: 'right', color: '#0f172a' }}>
                          {formatInteger(qtyPcs)}
                        </td>
                        <td className="tabular-nums font-bold" style={{ padding: '8px 10px', textAlign: 'right', color: bonusPcs > 0 ? '#16a34a' : '#64748b' }}>
                          {bonusPcs > 0 ? formatInteger(bonusPcs) : '—'}
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right' }}>
                          {formatCurrency(tp)}
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>
                          {discountVal > 0 ? `-${formatCurrency(discountVal)}` : '—'}
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', color: '#0369a1' }}>
                          {taxVal > 0 ? `+${formatCurrency(taxVal)}` : '—'}
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  <div style={{ fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Terms & Declarations:</div>
                  <div style={{ whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                    {profile.invoiceTerms || '1. Goods once sold will only be returned according to company return policy within 7 days.\n2. In case of any billing dispute, please report within 24 hours.'}
                  </div>
                  {data.notes && <div style={{ marginTop: '6px', color: '#0f172a' }}><b>Special Note:</b> {data.notes}</div>}
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                    <span>Subtotal:</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(data.subtotal || 0)}</span>
                  </div>
                  {(data.line_discount > 0 || data.bill_discount > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem', color: '#dc2626' }}>
                      <span>Total Discounts:</span>
                      <span className="tabular-nums font-semibold">- {formatCurrency((data.line_discount || 0) + (data.bill_discount || 0))}</span>
                    </div>
                  )}
                  {data.tax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem', color: '#0369a1' }}>
                      <span>Sales Tax (GST):</span>
                      <span className="tabular-nums font-semibold">+ {formatCurrency(data.tax)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.05rem', color: '#0284c7', borderTop: '2px solid #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                    <span>Grand Total:</span>
                    <span className="tabular-nums">{formatCurrency(data.grand_total || 0)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.85rem' }}>
                    <span>Spot Cash Paid:</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(data.cash_received || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                    <span>Bill Balance Due:</span>
                    <span className="tabular-nums font-bold">{formatCurrency(data.remaining_balance || 0)}</span>
                  </div>
                  {profile.showCustomerPreviousBalance && data.customer_ledger_balance !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: '4px', marginTop: '6px' }}>
                      <span>Total Ledger Statement Balance:</span>
                      <span className="tabular-nums font-semibold">{formatCurrency(data.customer_ledger_balance)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginTop: '3rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                <div>
                  <div style={{ height: '35px' }}></div>
                  <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Order Booking Representative</div>
                </div>
                <div>
                  <div style={{ height: '35px' }}></div>
                  <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Delivery / Dispatch Officer</div>
                </div>
                <div>
                  <div style={{ height: '35px' }}></div>
                  <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Customer Stamp & Signature</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .no-print {
            display: none !important;
          }
          .print-modal-overlay {
            position: static !important;
            background: none !important;
            padding: 0 !important;
          }
          .print-modal-container {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            background: transparent !important;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          @page {
            size: auto;
            margin: 5mm;
          }
        }
      `}</style>
    </div>
  );
}
