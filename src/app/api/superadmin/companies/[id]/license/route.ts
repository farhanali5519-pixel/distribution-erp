import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin(request);
    const { id } = await params;
    const body = await request.json();

    const { newExpiryDate, notes } = body as { newExpiryDate: string; notes?: string };
    if (!newExpiryDate) {
      return NextResponse.json({ success: false, error: 'New expiry date is required' }, { status: 400 });
    }

    const updated = CompanyProvisioningService.extendLicense(id, newExpiryDate, notes, session.username);

    return NextResponse.json({
      success: true,
      message: `License extended to ${newExpiryDate}`,
      data: updated,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to extend license';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
