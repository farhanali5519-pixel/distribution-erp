import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const body = await request.json();

    if (!Array.isArray(body.flags)) {
      return NextResponse.json({ success: false, error: 'Expected flags array' }, { status: 400 });
    }

    CompanyProvisioningService.setCompanyFeatureFlags(id, body.flags);

    return NextResponse.json({
      success: true,
      message: 'Company feature flags updated successfully',
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to update company feature flags';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
