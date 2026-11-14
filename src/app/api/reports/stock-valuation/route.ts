import { NextResponse } from 'next/server';
import { ReportsService } from '@/modules/reports/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(request, 'reports:stock_valuation');
    if (errorResponse) return errorResponse;

    const valuation = ReportsService.getStockValuation(tenant.companyId);

    return NextResponse.json({
      success: true,
      data: valuation,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to generate stock valuation.' },
      { status }
    );
  }
}
