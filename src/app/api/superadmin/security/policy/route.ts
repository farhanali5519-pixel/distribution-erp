import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { SuperAdminService } from '@/core/auth/superadmin.service';
import { TwoFactorPolicy } from '@/core/auth/two-factor.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);
    const profile = await SuperAdminService.getSecurityProfile(session.userId);

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch security profile';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);
    const body = await request.json();
    const { policy } = body as { policy: TwoFactorPolicy };

    if (!policy) {
      return NextResponse.json({ success: false, error: 'Policy is required' }, { status: 400 });
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    await SuperAdminService.update2faPolicy(session.userId, policy, clientIp);

    const updated = await SuperAdminService.getSecurityProfile(session.userId);

    return NextResponse.json({
      success: true,
      message: `2FA Policy updated to ${policy}`,
      data: updated,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to update 2FA policy';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
