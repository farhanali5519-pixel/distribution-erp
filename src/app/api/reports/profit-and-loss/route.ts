import { NextResponse } from 'next/server';
import { ReportsService } from '@/modules/reports/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(request, 'reports:profit_loss');
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;

    const statement = await ReportsService.getProfitAndLossAsync({ fromDate, toDate, companyId: tenant.companyId });

    return NextResponse.json({
      success: true,
      data: statement,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to generate Profit & Loss statement.' },
      { status }
    );
  }
}
