import { NextResponse } from 'next/server';
import { SuperAdminService } from '@/core/auth/superadmin.service';
import { SuperAdminAuthError } from '@/core/auth/superadmin-session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { challengeToken, method, code } = body;

    if (!challengeToken || !method || !code) {
      return NextResponse.json(
        { success: false, error: 'Challenge token, method, and code are required.' },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { session, cookieHeader } = await SuperAdminService.verify2faAndLogin(
      challengeToken,
      method,
      code,
      clientIp
    );

    const response = NextResponse.json({
      success: true,
      user: {
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
        email: session.email,
        role: session.role,
      },
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : '2FA verification failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
