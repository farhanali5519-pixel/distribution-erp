import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/modules/customers/service';
import { toPaisas } from '@/shared/utils/currency';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { customerId, orderAmount } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, message: 'customerId is required.' }, { status: 400 });
    }

    const orderAmountPaisas = toPaisas(orderAmount || 0);
    const result = CustomerService.checkCreditAvailable(customerId, orderAmountPaisas, companyId);

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
