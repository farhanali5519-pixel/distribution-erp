import { NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(req: Request) {
  try {
    const tenant = await getTenantContext(req);
    const body = await req.json();
    const rows = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid or empty rows array provided for import.' },
        { status: 400 }
      );
    }

    const summary = DoubleEntryEngine.importAccounts(rows, tenant.companyId, {
      userId: tenant.userId || 'system',
      userName: tenant.fullName || tenant.username || 'System User',
    });

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Failed to import accounts.' }, { status: 500 });
  }
}
