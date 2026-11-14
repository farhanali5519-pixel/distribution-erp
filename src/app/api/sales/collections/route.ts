import { NextRequest, NextResponse } from 'next/server';
import { CollectionsService } from '@/modules/sales/collections.service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'payments:collections');
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId') || undefined;
    const payments = CollectionsService.getPayments(customerId, companyId);

    return NextResponse.json({
      success: true,
      payments,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch collections' },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'payments:collections');
    const body = await req.json();
    const payment = CollectionsService.recordPayment({ ...body, companyId }, companyId);

    return NextResponse.json({
      success: true,
      message: `Payment of ${body.amount} recorded and posted to General Ledger.`,
      payment,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record payment' },
      { status }
    );
  }
}

