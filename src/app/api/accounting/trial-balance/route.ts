import { NextResponse } from 'next/server';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const trialBalance = DoubleEntryEngine.getTrialBalance(tenant.companyId);
    return NextResponse.json({ success: true, ...trialBalance });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

