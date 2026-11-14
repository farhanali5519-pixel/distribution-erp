import { NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const sourceModule = searchParams.get('sourceModule') || undefined;

    const ledger = DoubleEntryEngine.getAccountLedger(id, tenant.companyId, {
      search,
      startDate,
      endDate,
      sourceModule,
    });

    return NextResponse.json({ success: true, ...ledger });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch ledger.' }, { status: 500 });
  }
}
