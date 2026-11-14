import { NextResponse } from 'next/server';
import { PaymentsMadeService } from '@/modules/payments/service';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(req: Request) {
  try {
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;

    const { searchParams } = new URL(req.url);
    const vendorId = searchParams.get('vendorId');

    if (!vendorId) {
      return NextResponse.json(
        { success: false, message: 'Vendor ID is required.' },
        { status: 400 }
      );
    }

    const bills = PaymentsMadeService.getVendorOutstandingBills(vendorId, companyId);
    const totalOutstanding = bills.reduce((sum, b) => sum + (Number(b.outstanding_balance) || Number(b.remaining_balance) || Number(b.remainingBalance) || 0), 0);

    return NextResponse.json({
      success: true,
      bills,
      totalOutstanding,
      count: bills.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch vendor purchase bills.' },
      { status: 500 }
    );
  }
}
