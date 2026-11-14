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

    const newUser = CompanyProvisioningService.createCompanyUser(id, body);

    return NextResponse.json({
      success: true,
      message: `User "${newUser.username}" created successfully`,
      data: newUser,
    }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to create user';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
