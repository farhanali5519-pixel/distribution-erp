import { NextResponse } from 'next/server';
import { PaymentsReceivedService } from '@/modules/payments/service';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(req: Request) {
  try {
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'Customer ID is required.' },
        { status: 400 }
      );
    }

    const invoices = PaymentsReceivedService.getCustomerOutstandingInvoices(customerId, companyId);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + (Number(inv.outstanding_balance) || Number(inv.remaining_balance) || Number(inv.remainingBalance) || 0), 0);

    return NextResponse.json({
      success: true,
      invoices,
      totalOutstanding,
      count: invoices.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch customer invoices.' },
      { status: 500 }
    );
  }
}
