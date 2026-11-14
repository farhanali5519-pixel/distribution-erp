import { NextRequest, NextResponse } from 'next/server';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    const warehouse = searchParams.get('warehouse') || undefined;
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const status = searchParams.get('status') || undefined;

    const summary = InventoryAuditService.getProductLedger(id, {
      companyId,
      warehouse,
      fromDate,
      toDate,
      status,
    });

    return NextResponse.json({
      success: true,
      ledger: summary,
    });
  } catch (error: any) {
    console.error('Error fetching product stock ledger:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch product stock ledger' },
      { status: 500 }
    );
  }
}
