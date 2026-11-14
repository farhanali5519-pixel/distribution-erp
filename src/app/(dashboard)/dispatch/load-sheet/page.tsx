'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { 
  Truck, 
  Calendar, 
  MapPin, 
  User, 
  Printer, 
  RefreshCw, 
  PackageCheck, 
  CheckCircle2, 
  AlertTriangle,
  ArrowLeft,
  FileText,
  Boxes,
  ShieldCheck,
  Filter
} from 'lucide-react';

interface RouteOption {
  id: string;
  name: string;
  code: string;
}

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

export default function RouteLoadSheetPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [routeId, setRouteId] = useState<string>('ALL');
  const [supplyPersonId, setSupplyPersonId] = useState<string>('ALL');
  
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadSheet, setLoadSheet] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch routes and staff for dropdown filters
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [rRes, sRes] = await Promise.all([
          fetch('/api/routes'),
          fetch('/api/staff'),
        ]);
        const rData = await rRes.json();
        const sData = await sRes.json();
        if (rData.success) setRoutes(rData.routes);
        if (sData.success) {
          setStaff(sData.staff.filter((s: any) => s.role === 'SUPPLY_PERSON' || s.role === 'DRIVER'));
        }
      } catch (err) {
        console.error('Failed to load master filters:', err);
      }
    };
    fetchMasterData();
  }, []);

  const routeOptions = useMemo(() => [
    { value: 'ALL', label: 'All Routes (Consolidated)' },
    ...routes.map((r) => ({
      value: r.id,
      label: r.name,
      badge: r.code,
      badgeColor: 'blue' as const,
      keywords: [r.name, r.code],
    })),
  ], [routes]);

  const staffOptions = useMemo(() => [
    { value: 'ALL', label: 'All Supply Personnel' },
    ...staff.map((s) => ({
      value: s.id,
      label: s.name,
      badge: s.role,
      badgeColor: 'indigo' as const,
      keywords: [s.name, s.role],
    })),
  ], [staff]);

  // Fetch consolidated load sheet
  const fetchLoadSheet = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date,
        routeId,
        supplyPersonId,
      });
      const res = await fetch(`/api/dispatch/load-sheet?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLoadSheet(data.loadSheet);
      }
    } catch (err) {
      console.error('Failed to load dispatch summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoadSheet();
  }, [date, routeId, supplyPersonId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      {/* Top Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Load Sheet
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={handlePrint} className="btn btn-primary">
            <Printer size={16} style={{ marginRight: '6px' }} /> Print Gate Pass
          </button>
          <Link href="/sales" className="btn btn-outline">
            <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Back to Sales
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-section-card p-4 space-y-3.5 no-print mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Dispatch Filters
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 block">
              <Calendar size={12} className="inline mr-1 text-slate-400" /> Dispatch Date
            </label>
            <input
              type="date"
              className="filter-input-control w-full rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 tabular-nums"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 block">
              <MapPin size={12} className="inline mr-1 text-slate-400" /> Delivery Route
            </label>
            <SearchableSelect
              options={routeOptions}
              value={routeId}
              onChange={(val) => setRouteId(val)}
              placeholder="All Routes"
              className="w-full"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 block">
              <User size={12} className="inline mr-1 text-slate-400" /> Supply Officer / Vehicle
            </label>
            <SearchableSelect
              options={staffOptions}
              value={supplyPersonId}
              onChange={(val) => setSupplyPersonId(val)}
              placeholder="All Supply Personnel"
              className="w-full"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={fetchLoadSheet}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} /> Refresh Load Sheet
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          Consolidating vehicle load sheet...
        </div>
      ) : !loadSheet || loadSheet.total_orders === 0 ? (
        <div className="card text-center py-8 px-4 max-w-lg mx-auto">
          <Boxes size={32} className="mx-auto mb-2 text-sky-600 opacity-80" />
          <h2 className="text-sm font-bold text-[var(--text-heading)] mb-1">
            No Posted Orders for this Route / Date
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            There are currently no posted sale orders scheduled for <strong>{date}</strong> on <strong>{loadSheet?.route_name || 'selected route'}</strong>.
          </p>
          <Link href="/sales/order-booking" className="btn btn-primary text-xs">
            + Book & Post Sale Bill
          </Link>
        </div>
      ) : (
        <>


          {/* ======================================================== */}
          {/* PRINTABLE VEHICLE GATE PASS & LOAD SUMMARY */}
          {/* ======================================================== */}
          <div
            id="printable-load-sheet"
            className="card"
            style={{
              padding: '2rem',
              marginBottom: '2rem',
              background: '#fff',
              color: '#0f172a',
              borderRadius: '6px',
            }}
          >
            {/* Gate Pass Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0284c7', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0284c7', margin: 0 }}>
                  SALEFLOW DISTRIBUTION
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Warehouse Vehicle Gate Pass & Consolidated Route Load Sheet
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Main Logistics Godown: Sector 4-B, Industrial Estate, Lahore
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  VEHICLE GATE PASS
                </div>
                <div className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0284c7' }}>
                  GP-{date.replace(/-/g, '')}-{loadSheet.route_name.replace(/\s+/g, '').slice(0, 4).toUpperCase()}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Dispatch Date: <b>{date}</b>
                </div>
              </div>
            </div>

            {/* Logistics Dispatch Metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Assigned Route</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{loadSheet.route_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Supply Officer / Driver</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{loadSheet.supply_person_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Consolidated Cargo</div>
                <div style={{ fontWeight: 800, color: '#0284c7', fontSize: '1rem' }} className="tabular-nums">
                  {formatInteger(loadSheet.total_cartons)} CTN | {formatInteger(loadSheet.total_pieces_to_load)} Pcs ({formatInteger(loadSheet.total_orders)} Orders)
                </div>
              </div>
            </div>

            {/* Consolidated Products Loading Table */}
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>
              Consolidated Warehouse Loading Quantities
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#0284c7', color: '#fff', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', width: '40px' }}>#</th>
                  <th style={{ padding: '8px 10px' }}>SKU & Product Description</th>
                  <th style={{ padding: '8px 10px' }}>Item Type</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cartons (CTN)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Boxes (Bx)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Loose (Pcs)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>Total Pcs</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '90px' }}>Verified [✓]</th>
                </tr>
              </thead>
              <tbody>
                {loadSheet.items?.map((it: any, idx: number) => (
                  <tr key={it.product_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.product_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        SKU: {it.sku} | 1 CTN = {it.total_pieces_per_carton || it.bulk_conversion_factor} {it.uom_base}s
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.item_type}</td>
                    <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      {it.cartons_to_load > 0 ? formatInteger(it.cartons_to_load) : '—'}
                    </td>
                    <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>
                      {it.boxes_to_load > 0 ? formatInteger(it.boxes_to_load) : '—'}
                    </td>
                    <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>
                      {it.loose_pieces_to_load > 0 ? formatInteger(it.loose_pieces_to_load) : '—'}
                    </td>
                    <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                      {formatInteger(it.total_pieces)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '1.5px solid #94a3b8', borderRadius: '3px' }}></span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                  <td colSpan={3} style={{ padding: '8px 10px' }}>TOTALS FOR VEHICLE:</td>
                  <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right' }}>{formatInteger(loadSheet.total_cartons)} CTN</td>
                  <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right' }}>{formatInteger(loadSheet.total_boxes)} Bx</td>
                  <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right' }}>{formatInteger(loadSheet.total_loose_pieces)} Pcs</td>
                  <td className="tabular-nums" style={{ padding: '8px 10px', textAlign: 'right', color: '#0284c7' }}>{formatInteger(loadSheet.total_pieces_to_load)} Pcs</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Included Orders Summary */}
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>
              Included Sale Bills / Drop Manifest ({formatInteger(loadSheet.orders.length)} Drops)
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#334155', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '6px 8px' }}>Bill #</th>
                  <th style={{ padding: '6px 8px' }}>Retailer Shop & Address</th>
                  <th style={{ padding: '6px 8px' }}>Phone</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total Units</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Bill Amount</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>Customer Signature</th>
                </tr>
              </thead>
              <tbody>
                {loadSheet.orders?.map((ord: any) => (
                  <tr key={ord.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0284c7' }}>
                      {ord.order_number}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 700 }}>{ord.customer_name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{ord.shop_name} - {ord.customer_address || 'Lahore'}</div>
                    </td>
                    <td style={{ padding: '6px 8px', color: '#64748b' }}>{ord.customer_phone || '—'}</td>
                    <td className="tabular-nums" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{formatInteger(ord.total_pieces || 1)} pcs</td>
                    <td className="tabular-nums" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(ord.grand_total)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#e2e8f0', borderRadius: '3px', fontWeight: 600 }}>
                        {ord.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', width: '120px' }}>
                      <div style={{ borderBottom: '1px dashed #94a3b8', height: '18px' }}></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Authorized Dispatch Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginTop: '2.5rem', borderTop: '1px dashed #cbd5e1', paddingTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
              <div>
                <div style={{ height: '35px' }}></div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Warehouse Incharge / Loader</div>
              </div>
              <div>
                <div style={{ height: '35px' }}></div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Delivery Driver / Vehicle Incharge</div>
              </div>
              <div>
                <div style={{ height: '35px' }}></div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>Security Gate Clearance Officer</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
