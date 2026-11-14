'use client';

import React, { useState } from 'react';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { Printer, X } from 'lucide-react';
import { useCompanyProfile } from '@/shared/hooks/useCompanyProfile';

export interface BatchPrintPurchaseModalProps {
  bills: any[];
  defaultFormat?: 'A4' | 'THERMAL';
  onClose: () => void;
}

export function BatchPrintPurchaseModal({
  bills,
  defaultFormat = 'A4',
  onClose,
}: BatchPrintPurchaseModalProps) {
  const [format, setFormat] = useState<'A4' | 'THERMAL'>(defaultFormat);
  const { profile } = useCompanyProfile();

  const handlePrint = () => {
    window.print();
  };

  if (!bills || bills.length === 0) return null;

  return (
    <div
      className="print-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
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
          maxWidth: format === 'THERMAL' ? '540px' : '960px',
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
            <span style={{ fontWeight: 800, color: 'var(--text-heading)' }}>
              Batch Print Preview ({bills.length} Purchase Bills)
            </span>

            {/* Layout Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0,0,0,0.15)',
                padding: '3px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
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
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={15} style={{ marginRight: '4px' }} /> Print All ({bills.length})
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'var(--bg-main)' }}>
          <div id="printable-purchase-batch-area">
            {bills.map((bill, docIdx) => {
              if (format === 'THERMAL') {
                return (
                  <div
                    key={docIdx}
                    className="printable-batch-item thermal-receipt font-sans tabular-nums"
                    style={{
                      width: '320px',
                      margin: '0 auto 2rem auto',
                      background: '#fff',
                      color: '#000',
                      padding: '16px',
                      fontSize: '12px',
                      lineHeight: '1.35',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      pageBreakAfter: docIdx === bills.length - 1 ? 'avoid' : 'always',
                      breakAfter: docIdx === bills.length - 1 ? 'avoid' : 'page',
                    }}
                  >
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase' }}>
                        {profile.businessName || 'SALEFLOW DISTRIBUTION'}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '13px', marginTop: '4px' }}>
                        PURCHASE MERCHANDISE BILL
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                      <div><b>Bill #:</b> <span className="doc-identifier">{bill.bill_number}</span></div>
                      <div><b>Date:</b> <span className="table-date">{bill.bill_date}</span></div>
                      <div><b>Supplier:</b> {bill.vendor_name}</div>
                      {bill.vendor_invoice_number && <div><b>Paper Inv #:</b> <span className="doc-identifier">{bill.vendor_invoice_number}</span></div>}
                      {bill.warehouse && <div><b>Warehouse:</b> {bill.warehouse}</div>}
                    </div>

                    <div style={{ borderBottom: '2px solid #000', margin: '6px 0' }} />

                    {/* Items List */}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ width: '50%' }}>ITEM & PCS</span>
                        <span style={{ width: '22%', textAlign: 'right' }}>RATE</span>
                        <span style={{ width: '28%', textAlign: 'right' }}>NET</span>
                      </div>
                      <div style={{ borderBottom: '1px dashed #000', marginBottom: '4px' }} />

                      {bill.items?.map((item: any, idx: number) => {
                        const totalPcs = item.total_pieces ?? 0;
                        const rate = item.rate_per_piece ?? (item.rate_per_piece_paisas ? item.rate_per_piece_paisas / 100 : 0);
                        const lineTotal = item.line_total ?? (item.line_total_paisas ? item.line_total_paisas / 100 : 0);

                        return (
                          <div key={idx} style={{ marginBottom: '6px' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px' }}>
                              <span className="numeric-text">{idx + 1}</span>. {item.product_name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#222' }}>
                              <span><span className="numeric-text">{formatInteger(totalPcs)}</span> PCS</span>
                              <span className="tabular-nums">{formatCurrency(rate)}</span>
                              <span className="tabular-nums" style={{ fontWeight: 700, color: '#000' }}>{formatCurrency(lineTotal)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

                    {/* Totals */}
                    <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span className="tabular-nums">{formatCurrency(bill.subtotal || 0)}</span>
                      </div>
                      {Number(bill.freight_amount || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Freight:</span>
                          <span className="tabular-nums">+{formatCurrency(bill.freight_amount)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '4px 0', marginTop: '4px' }}>
                        <span>NET PAYABLE:</span>
                        <span className="tabular-nums">{formatCurrency(bill.net_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              {/* Standard A4 Layout */}
              return (
                <div
                  key={docIdx}
                  className="printable-batch-item standard-a4 font-sans"
                  style={{
                    width: '100%',
                    maxWidth: '820px',
                    margin: '0 auto 2.5rem auto',
                    background: '#fff',
                    color: '#0f172a',
                    padding: '2rem',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    pageBreakAfter: docIdx === bills.length - 1 ? 'avoid' : 'always',
                    breakAfter: docIdx === bills.length - 1 ? 'avoid' : 'page',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', color: '#091326' }}>
                        {profile.businessName || 'SALEFLOW DISTRIBUTION'}
                      </h1>
                      {profile.tagline && <p style={{ fontSize: '0.8rem', color: '#64748b' }}>{profile.tagline}</p>}
                      <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                        {[profile.address, profile.city].filter(Boolean).join(', ')}
                        {(profile.phonePrimary || profile.phoneSecondary) && (
                          <> • Tel: <span className="numeric-text">{[profile.phonePrimary, profile.phoneSecondary].filter(Boolean).join(' / ')}</span></>
                        )}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
                        PURCHASE MERCHANDISE BILL
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '4px' }}>
                        #<span className="doc-identifier">{bill.bill_number}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Date: <span className="table-date">{bill.bill_date}</span>
                      </div>
                    </div>
                  </div>

                  {/* Supplier & Warehouse Meta */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem', border: '1px solid #e2e8f0', fontSize: '0.825rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>VENDOR / SUPPLIER:</div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#091326' }}>{bill.vendor_name}</div>
                      {bill.company_name && <div style={{ color: '#475569' }}>Company: {bill.company_name}</div>}
                      {bill.vendor_phone && <div style={{ color: '#475569' }}>Phone: <span className="numeric-text">{bill.vendor_phone}</span></div>}
                      {bill.cnic_or_ntn && <div style={{ color: '#475569' }}>NTN: <span className="numeric-text">{bill.cnic_or_ntn}</span></div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>LOGISTICS & INVOICE:</div>
                      <div>Paper Bill Ref: <b>{bill.vendor_invoice_number || 'N/A'}</b></div>
                      <div>Warehouse: <b>{bill.warehouse || 'Main Warehouse'}</b></div>
                      {bill.broker && <div>Broker: <b>{bill.broker}</b></div>}
                      {bill.reference_number && <div>Bilty / Ref: <b>{bill.reference_number}</b></div>}
                    </div>
                  </div>

                  {/* Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', width: '36px' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item Description</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>CTN</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>Box</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>Pcs</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '80px' }}>Total Pcs</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Rate / Pc</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '100px' }}>Net Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bill.items?.map((it: any, idx: number) => {
                        const totalPcs = it.total_pieces ?? 0;
                        const rate = it.rate_per_piece ?? (it.rate_per_piece_paisas ? it.rate_per_piece_paisas / 100 : 0);
                        const lineTotal = it.line_total ?? (it.line_total_paisas ? it.line_total_paisas / 100 : 0);

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.product_name}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{it.cartons_qty || 0}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{it.boxes_qty || 0}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{it.loose_pieces_qty || 0}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }} className="tabular-nums">{formatInteger(totalPcs)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{formatCurrency(rate)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }} className="tabular-nums">{formatCurrency(lineTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary & Signatures */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                    <div style={{ width: '280px', fontSize: '0.85rem', lineHeight: '1.6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span className="tabular-nums">{formatCurrency(bill.subtotal || 0)}</span>
                      </div>
                      {Number(bill.freight_amount || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Freight:</span>
                          <span className="tabular-nums">+{formatCurrency(bill.freight_amount)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #091326', paddingTop: '6px', marginTop: '6px', fontSize: '1rem', fontWeight: 800 }}>
                        <span>Net Payable:</span>
                        <span className="tabular-nums">{formatCurrency(bill.net_amount || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', textAlign: 'center', fontSize: '0.775rem', color: '#64748b' }}>
                    <div>
                      <div style={{ height: '30px' }}></div>
                      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Store Incharge</div>
                    </div>
                    <div>
                      <div style={{ height: '30px' }}></div>
                      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Accounts Auditor</div>
                    </div>
                    <div>
                      <div style={{ height: '30px' }}></div>
                      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Vendor Authorized Rep</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
          #printable-purchase-batch-area, #printable-purchase-batch-area * {
            visibility: visible;
          }
          #printable-purchase-batch-area {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .printable-batch-item {
            page-break-after: always !important;
            break-after: page !important;
            box-shadow: none !important;
          }
          .printable-batch-item:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
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
