import { NextResponse } from 'next/server';
import { BankingService } from '@/modules/banking/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'banking');
    if (errorResponse) return errorResponse;
    const companyId = tenant.companyId;

    const { searchParams } = new URL(req.url);
    const bankAccountId = searchParams.get('bankAccountId');
    const fromDate = searchParams.get('fromDate') || searchParams.get('from') || undefined;
    const toDate = searchParams.get('toDate') || searchParams.get('to') || undefined;

    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, message: 'Bank account ID is required for generating bank statement.' },
        { status: 400 }
      );
    }

    const statement = BankingService.getBankStatement({
      bankAccountId,
      fromDate,
      toDate,
    }, companyId);

    return NextResponse.json({
      success: true,
      statement,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate bank statement.' },
      { status: 500 }
    );
  }
}
