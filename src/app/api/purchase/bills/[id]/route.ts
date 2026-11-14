import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '../../../../../modules/purchase/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const { id } = await params;
    const bill = PurchaseService.getPurchaseBillById(id, companyId);
    if (!bill) {
      return NextResponse.json({ success: false, error: 'Purchase bill not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, bill });
  } catch (error: any) {
    console.error('Error fetching purchase bill:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const { id } = await params;
    const body = await request.json();
    const result = PurchaseService.updatePurchaseBill(id, { ...body, companyId }, companyId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error updating purchase bill:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { TransactionDeleteService } = await import('@/core/transactions/transaction-delete.service');
    const context = await TransactionDeleteService.extractContext(request);
    const result = PurchaseService.deleteBill(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error deleting purchase bill:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
