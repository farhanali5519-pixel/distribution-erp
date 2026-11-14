import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService, CompanyStatus } from '@/core/tenancy/company-provisioning.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin(request);
    const { id } = await params;
    const body = await request.json();

    const { status } = body as { status: CompanyStatus };
    if (!status) {
      return NextResponse.json({ success: false, error: 'Status is required' }, { status: 400 });
    }

    const updated = CompanyProvisioningService.setCompanyStatus(id, status, session.username);

    return NextResponse.json({
      success: true,
      message: `Company status changed to ${status}`,
      data: updated,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to update company status';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
