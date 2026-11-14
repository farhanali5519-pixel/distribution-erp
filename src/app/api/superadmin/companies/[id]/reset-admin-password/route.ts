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

    const { userId, newPassword } = body as { userId: string; newPassword: string };
    if (!userId || !newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'User ID and password (min 6 chars) are required' },
        { status: 400 }
      );
    }

    CompanyProvisioningService.resetTenantUserPassword(id, userId, newPassword, session.username);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to reset password';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
