import { NextResponse } from 'next/server';
import { ReturnsService } from '@/modules/returns/service';
import { CreateSalesReturnInput } from '@/modules/returns/types';
import { getTenantContext, requireModuleEnabled } from '@/core/tenancy/tenant-context';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    const companyId = tenant.companyId;
    requireModuleEnabled(companyId, 'sales:customer_returns');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const returnDoc = ReturnsService.getSalesReturnById(id, companyId);
      if (!returnDoc) {
        return NextResponse.json(
          { success: false, message: 'Sales return not found.' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: returnDoc });
    }

    const returnsList = ReturnsService.getSalesReturns(companyId);
    return NextResponse.json({ success: true, data: returnsList });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to fetch sales returns.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'sales:customer_returns');
    const body: CreateSalesReturnInput = await request.json();
    const result = ReturnsService.createSalesReturn({
      ...body,
      companyId: tenant.companyId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Sales Return Credit Note ${result.returnNumber} posted successfully.`,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to process sales return.' },
      { status }
    );
  }
}
