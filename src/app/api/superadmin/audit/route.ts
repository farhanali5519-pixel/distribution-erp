import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || undefined;
    const action = searchParams.get('action') || undefined;
    const tenantId = searchParams.get('tenantId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await SuperAdminAuditService.getLogs({
      search,
      action,
      tenantId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.logs,
      total: result.total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch audit logs';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
