import { NextResponse } from 'next/server';
import { ReturnsService } from '@/modules/returns/service';
import { CreatePurchaseReturnInput } from '@/modules/returns/types';
import { getTenantContext, requireModuleEnabled } from '@/core/tenancy/tenant-context';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    const companyId = tenant.companyId;
    requireModuleEnabled(companyId, 'purchase:vendor_returns');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const returnDoc = ReturnsService.getPurchaseReturnById(id, companyId);
      if (!returnDoc) {
        return NextResponse.json(
          { success: false, message: 'Purchase return not found.' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: returnDoc });
    }

    const returnsList = ReturnsService.getPurchaseReturns(companyId);
    return NextResponse.json({ success: true, data: returnsList });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to fetch purchase returns.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'purchase:vendor_returns');
    const body: CreatePurchaseReturnInput = await request.json();
    const result = ReturnsService.createPurchaseReturn({
      ...body,
      companyId: tenant.companyId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Purchase Return Debit Note ${result.returnNumber} posted successfully.`,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to process purchase return.' },
      { status }
    );
  }
}
