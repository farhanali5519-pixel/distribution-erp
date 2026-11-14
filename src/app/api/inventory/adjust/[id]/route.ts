import { NextRequest, NextResponse } from 'next/server';
import { TransactionDeleteService } from '@/core/transactions/transaction-delete.service';
import { getDatabaseClient } from '@/core/database/factory';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);
    const { id } = await params;
    const client = getDatabaseClient();
    const adjustment = await client.queryOne('SELECT * FROM stock_adjustments WHERE id = ? AND company_id = ?', [id, tenant.companyId]);

    if (!adjustment) {
      return NextResponse.json(
        { success: false, message: 'Stock adjustment entry not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, adjustment });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch stock adjustment.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await TransactionDeleteService.extractContext(req);
    const result = TransactionDeleteService.deleteStockAdjustment(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete stock adjustment.' },
      { status: 400 }
    );
  }
}
