import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { SuperAdminService } from '@/core/auth/superadmin.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);
    const body = await request.json();
    const { password } = body;

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    await SuperAdminService.disableTotp(session.userId, password, clientIp);

    return NextResponse.json({
      success: true,
      message: 'Google Authenticator 2FA disabled successfully.',
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to disable Authenticator 2FA';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
