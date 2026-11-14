import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/core/database/db';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { isUuid } from '@/shared/utils/reference';

/**
 * Fast Single Transaction Identity Lookup
 * Resolves a human-readable document number (e.g. BILL-202610-0001, ORD-2026-51614)
 * into its internal UUID and transaction type with company isolation.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref')?.trim();
    const typeHint = searchParams.get('type')?.trim();

    if (!ref) {
      return NextResponse.json({ success: false, message: 'Reference number is required.' }, { status: 400 });
    }

    const db = getDatabase();

    // 1. Purchase Bill (BILL-...)
    if (ref.startsWith('BILL-') || typeHint === 'purchase_bill') {
      const row = db.prepare('SELECT id FROM purchase_bills WHERE bill_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'purchase_bill', reference: ref });
    }

    // 2. Sales Order (ORD-...)
    if (ref.startsWith('ORD-') || typeHint === 'sales_order') {
      const row = db.prepare('SELECT id FROM sales_orders WHERE order_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'sales_order', reference: ref });
    }

    // 3. Sales Invoice (INV-...)
    if (ref.startsWith('INV-') || typeHint === 'sales_invoice') {
      const row = db.prepare('SELECT id FROM sales_invoices WHERE invoice_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'sales_invoice', reference: ref });
    }

    // 4. Customer Payment (PR-..., PAY-..., CR-...)
    if (ref.startsWith('PR-') || ref.startsWith('PAY-') || ref.startsWith('CR-') || typeHint === 'payment_received') {
      const row = db.prepare('SELECT id FROM customer_payments WHERE payment_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'payment_received', reference: ref });
    }

    // 5. Vendor Payment (PV-...)
    if (ref.startsWith('PV-') || typeHint === 'payment_made') {
      const row = db.prepare('SELECT id FROM vendor_payments WHERE payment_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'payment_made', reference: ref });
    }

    // 6. Sales Return (SR-...)
    if (ref.startsWith('SR-') || typeHint === 'sales_return') {
      const row = db.prepare('SELECT id FROM sales_returns WHERE return_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'sales_return', reference: ref });
    }

    // 7. Purchase Return (PRN-..., PR-...)
    if (ref.startsWith('PRN-') || ref.startsWith('PR-') || typeHint === 'purchase_return') {
      const row = db.prepare('SELECT id FROM purchase_returns WHERE return_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'purchase_return', reference: ref });
    }

    // 8. Expense (EXP-...)
    if (ref.startsWith('EXP-') || typeHint === 'expense') {
      const row = db.prepare('SELECT id FROM expenses WHERE voucher_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'expense', reference: ref });
    }

    // 9. Stock Adjustment (ADJ-...)
    if (ref.startsWith('ADJ-') || typeHint === 'stock_adjustment') {
      const row = db.prepare('SELECT id FROM stock_adjustments WHERE adjustment_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'stock_adjustment', reference: ref });
    }

    // 10. Journal Entry (JE-..., JV-...)
    if (ref.startsWith('JE-') || ref.startsWith('JV-') || typeHint === 'journal_entry') {
      const row = db.prepare('SELECT id FROM journal_entries WHERE entry_number = ? AND company_id = ?').get(ref, companyId) as any;
      if (row?.id) return NextResponse.json({ success: true, id: row.id, type: 'journal_entry', reference: ref });
    }

    // 11. Generic fallback lookup across all tables if prefix did not match
    const lookupTables = [
      { table: 'sales_orders', col: 'order_number', type: 'sales_order' },
      { table: 'purchase_bills', col: 'bill_number', type: 'purchase_bill' },
      { table: 'customer_payments', col: 'payment_number', type: 'payment_received' },
      { table: 'vendor_payments', col: 'payment_number', type: 'payment_made' },
      { table: 'sales_invoices', col: 'invoice_number', type: 'sales_invoice' },
      { table: 'sales_returns', col: 'return_number', type: 'sales_return' },
      { table: 'purchase_returns', col: 'return_number', type: 'purchase_return' },
      { table: 'expenses', col: 'voucher_number', type: 'expense' },
      { table: 'stock_adjustments', col: 'adjustment_number', type: 'stock_adjustment' },
      { table: 'journal_entries', col: 'entry_number', type: 'journal_entry' },
    ];

    for (const item of lookupTables) {
      const row = db.prepare(`SELECT id FROM ${item.table} WHERE ${item.col} = ? AND company_id = ?`).get(ref, companyId) as any;
      if (row?.id) {
        return NextResponse.json({ success: true, id: row.id, type: item.type, reference: ref });
      }
    }

    return NextResponse.json(
      { success: false, message: 'Source transaction unavailable or not found.' },
      { status: 404 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Lookup failed' },
      { status: 500 }
    );
  }
}
