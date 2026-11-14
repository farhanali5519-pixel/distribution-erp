import { NextResponse } from 'next/server';
import { ClosingService } from '@/modules/closing/service';
import { getTenantContext } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'closing');
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const reconciliation = ClosingService.calculateDailyReconciliation(date, tenant.companyId);

    return NextResponse.json({
      success: true,
      reconciliation,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to calculate cash reconciliation.' },
      { status }
    );
  }
}
