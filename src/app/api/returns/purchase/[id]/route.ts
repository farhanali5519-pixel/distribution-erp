import { NextRequest, NextResponse } from 'next/server';
import { TransactionDeleteService } from '@/core/transactions/transaction-delete.service';
import { getDatabaseClient } from '@/core/database/factory';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;

    const client = getDatabaseClient();
    const returnRow = await client.queryOne('SELECT * FROM purchase_returns WHERE id = ? AND company_id = ?', [id, companyId]);

    if (!returnRow) {
      return NextResponse.json(
        { success: false, message: 'Purchase return not found.' },
        { status: 404 }
      );
    }

    const items = await client.query('SELECT * FROM purchase_return_items WHERE return_id = ? AND company_id = ?', [id, companyId]);

    return NextResponse.json({ success: true, return: returnRow, items });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch purchase return.' },
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
    const result = TransactionDeleteService.deletePurchaseReturn(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete purchase return.' },
      { status: 400 }
    );
  }
}
