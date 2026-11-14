import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const stats = await CompanyProvisioningService.getDashboardStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard statistics';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
