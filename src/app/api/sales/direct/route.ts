import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled, requireFeatureEnabled } from '@/core/tenancy/enforcement';

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales');
    requireModuleEnabled(companyId, 'sales:direct_sale');
    requireFeatureEnabled(companyId, 'sales.enable_direct_sale');
    const body = await req.json();
    const invoice = SalesService.createDirectSale({ ...body, companyId }, companyId);

    return NextResponse.json({
      success: true,
      message: `Direct sale invoice ${invoice?.invoice_number} created with stock & GL postings committed!`,
      invoice,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to process direct sale' },
      { status }
    );
  }
}

