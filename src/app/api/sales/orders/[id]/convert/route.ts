import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);
    const { id } = await params;
    const invoice = SalesService.convertOrderToInvoice(id, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Sale order successfully converted to commercial bill ${invoice?.invoice_number}`,
      invoice,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to convert order to invoice' },
      { status: 400 }
    );
  }
}

