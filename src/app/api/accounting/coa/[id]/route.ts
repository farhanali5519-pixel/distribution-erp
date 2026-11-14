import { NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { getTenantContext } from '@/core/tenancy/context';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const body = await req.json();

    const account = DoubleEntryEngine.updateAccount(id, tenant.companyId, {
      name: body.name,
      description: body.description,
      account_group: body.account_group,
      is_active: body.is_active,
      userId: tenant.userId || 'system',
      userName: tenant.fullName || tenant.username || 'System User',
    });

    return NextResponse.json({ success: true, account });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Failed to update account.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);

    const result = DoubleEntryEngine.deleteAccount(id, tenant.companyId, {
      userId: tenant.userId || 'system',
      userName: tenant.fullName || tenant.username || 'System User',
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete account.' }, { status: 500 });
  }
}
