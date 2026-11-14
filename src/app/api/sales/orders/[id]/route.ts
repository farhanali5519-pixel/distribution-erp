import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const order = SalesService.getOrderById(id, companyId);

    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Sale order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch order details' },
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
    const { TransactionDeleteService } = await import('@/core/transactions/transaction-delete.service');
    const context = await TransactionDeleteService.extractContext(req);
    const result = TransactionDeleteService.deleteSalesOrder(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete sale order.' },
      { status: 400 }
    );
  }
}

