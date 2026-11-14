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
    const { ids, reason, adminPin } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No purchase bill IDs provided for bulk delete.' },
        { status: 400 }
      );
    }

    const effectiveContext = {
      ...context,
      reason: reason || context.reason,
      adminPin: adminPin || context.adminPin,
    };

    const client = getDatabaseClient();
    const deleted: Array<{ id: string; number: string }> = [];
    const skipped: Array<{ id: string; number: string; reason: string }> = [];

    for (const id of ids) {
      if (typeof id !== 'string' || !id.trim()) continue;

      let billNumber = id;
      try {
        const row = (await client.queryOne(
          'SELECT id, bill_number FROM purchase_bills WHERE id = ? AND company_id = ?',
          [id, companyId]
        )) as any;

        if (!row) {
          skipped.push({ id, number: id, reason: 'Record not found or belongs to another company' });
          continue;
        }

        billNumber = row.bill_number || id;
        TransactionDeleteService.deletePurchaseBill(id, effectiveContext);
        deleted.push({ id, number: billNumber });
      } catch (err: any) {
        skipped.push({
          id,
          number: billNumber,
          reason: err.message || 'Operation rejected by purchase bill safeguard',
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
