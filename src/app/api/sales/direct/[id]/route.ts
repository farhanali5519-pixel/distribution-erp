import { NextRequest, NextResponse } from 'next/server';
import { TransactionDeleteService } from '@/core/transactions/transaction-delete.service';
import { getDatabaseClient } from '@/core/database/factory';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const client = getDatabaseClient();
    const invoice = await client.queryOne('SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?', [id, companyId]);

    if (!invoice) {
      return NextResponse.json(
        { success: false, message: 'Direct sale invoice not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch direct sale invoice.' },
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
    const result = TransactionDeleteService.deleteDirectSale(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete direct sale.' },
      { status: 400 }
    );
  }
}
