import { NextResponse } from 'next/server';
import { SuperAdminService } from '@/core/auth/superadmin.service';
import { SuperAdminAuthError } from '@/core/auth/superadmin-session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { challengeToken } = body;

    if (!challengeToken) {
      return NextResponse.json(
        { success: false, error: 'Challenge token is required' },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const result = await SuperAdminService.requestEmailOtp(challengeToken, clientIp);

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${result.maskedEmail}`,
      maskedEmail: result.maskedEmail,
      cooldownSeconds: 60,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to send verification email';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
