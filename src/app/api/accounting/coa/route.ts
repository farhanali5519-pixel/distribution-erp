import { NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const accounts = await DoubleEntryEngine.getAccountsWithBalancesAsync(tenant.companyId);
    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const body = await req.json();

    const account = DoubleEntryEngine.createAccount({
      companyId: tenant.companyId,
      code: body.code,
      name: body.name,
      type: body.type,
      normal_balance: body.normal_balance,
      parent_id: body.parent_id || null,
      account_group: body.account_group || null,
      description: body.description || null,
      is_active: body.is_active !== undefined ? Number(body.is_active) : 1,
      userId: tenant.userId || 'system',
      userName: tenant.fullName || tenant.username || 'System User',
    });

    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Failed to create account.' }, { status: 500 });
  }
}
