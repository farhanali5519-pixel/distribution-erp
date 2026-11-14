import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'closing');
    if (errorResponse) return errorResponse;
    const url = new URL(req.url);
    const date = (url.searchParams.get('date') || '').slice(0, 10);
    if (!date) {
      return NextResponse.json({ success: true, isClosed: false });
    }

    const client = getDatabaseClient();
    const row = await client.queryOne("SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?", [date, tenant.companyId]) as any;

    return NextResponse.json({
      success: true,
      isClosed: !!row,
      closedBy: row?.closed_by || null,
      closedAt: row?.closed_at || null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
