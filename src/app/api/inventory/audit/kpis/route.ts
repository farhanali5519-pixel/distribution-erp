import { NextRequest, NextResponse } from 'next/server';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const kpis = InventoryAuditService.getDashboardKPIs(companyId);
    const warehouses = InventoryAuditService.getWarehouseSummaries(companyId);

    return NextResponse.json({
      success: true,
      kpis,
      warehouses,
    });
  } catch (error: any) {
    console.error('Error fetching audit dashboard KPIs:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch audit KPIs' },
      { status: 500 }
    );
  }
}
