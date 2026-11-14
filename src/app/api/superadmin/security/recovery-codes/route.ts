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

    const result = await SuperAdminService.regenerateRecoveryCodes(session.userId, password, clientIp);

    return NextResponse.json({
      success: true,
      message: 'New recovery codes generated successfully.',
      recoveryCodes: result.recoveryCodes,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to regenerate recovery codes';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
