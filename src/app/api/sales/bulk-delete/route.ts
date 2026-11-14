import { NextRequest, NextResponse } from 'next/server';
import { TransactionDeleteService } from '@/core/transactions/transaction-delete.service';
import { getDatabaseClient } from '@/core/database/factory';

export async function POST(req: NextRequest) {
  try {
    const context = await TransactionDeleteService.extractContext(req);
    const companyId = context.companyId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company identification missing.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { ids, type, reason, adminPin } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No transaction IDs provided for bulk delete.' },
        { status: 400 }
      );
    }

    // Merge body reason/adminPin into context
    const effectiveContext = {
      ...context,
      reason: reason || context.reason,
      adminPin: adminPin || context.adminPin,
    };

    const client = getDatabaseClient();
    const isOrder = type === 'ORDERS' || type === 'ORDER' || type === 'SALES_ORDER';

    const deleted: Array<{ id: string; number: string }> = [];
    const skipped: Array<{ id: string; number: string; reason: string }> = [];

    for (const id of ids) {
      if (typeof id !== 'string' || !id.trim()) continue;

      let docNumber = id;
      try {
        if (isOrder) {
          const row = (await client.queryOne(
            'SELECT id, order_number FROM sales_orders WHERE id = ? AND company_id = ?',
            [id, companyId]
          )) as any;

          if (!row) {
            skipped.push({ id, number: id, reason: 'Record not found or belongs to another company' });
            continue;
          }
          docNumber = row.order_number || id;
          TransactionDeleteService.deleteSalesOrder(id, effectiveContext);
          deleted.push({ id, number: docNumber });
        } else {
          const row = (await client.queryOne(
            'SELECT id, invoice_number FROM sales_invoices WHERE id = ? AND company_id = ?',
            [id, companyId]
          )) as any;

          if (!row) {
            skipped.push({ id, number: id, reason: 'Record not found or belongs to another company' });
            continue;
          }
          docNumber = row.invoice_number || id;
          TransactionDeleteService.deleteDirectSale(id, effectiveContext);
          deleted.push({ id, number: docNumber });
        }
      } catch (err: any) {
        skipped.push({
          id,
          number: docNumber,
          reason: err.message || 'Operation rejected by transaction safeguard',
        });
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount: deleted.length,
      skippedCount: skipped.length,
      deleted,
      skipped,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Bulk deletion failed' },
      { status: 500 }
    );
  }
}
