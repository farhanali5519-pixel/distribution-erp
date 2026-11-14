import { NextRequest, NextResponse } from 'next/server';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const report = InventoryAuditService.getReconciliationReport(companyId);
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('Error generating inventory reconciliation report:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate reconciliation report' },
      { status: 500 }
    );
  }
}
