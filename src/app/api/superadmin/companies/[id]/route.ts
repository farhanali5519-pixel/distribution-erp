import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService, UpdateCompanyInput } from '@/core/tenancy/company-provisioning.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    const details = CompanyProvisioningService.getCompanyDetails(id);

    return NextResponse.json({
      success: true,
      data: details,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch company details';
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const body = (await request.json()) as UpdateCompanyInput;

    const updated = CompanyProvisioningService.updateCompany(id, body);

    return NextResponse.json({
      success: true,
      message: `Company "${updated.name}" updated successfully`,
      data: updated,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to update company';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
