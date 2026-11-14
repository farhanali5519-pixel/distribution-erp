import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales:load_sheet');

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || undefined;
    const routeId = searchParams.get('routeId') || undefined;
    const supplyPersonId = searchParams.get('supplyPersonId') || undefined;

    const loadSheet = SalesService.getRouteLoadSheet({
      companyId,
      date,
      routeId: routeId === 'ALL' ? undefined : routeId,
      supplyPersonId: supplyPersonId === 'ALL' ? undefined : supplyPersonId,
    }, companyId);

    return NextResponse.json({
      success: true,
      loadSheet,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load route dispatch summary' },
      { status }
    );
  }
}

