import { NextResponse } from 'next/server';
import { SuperAdminService } from '@/core/auth/superadmin.service';
import { SuperAdminAuthError } from '@/core/auth/superadmin-session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const result = await SuperAdminService.initiateLogin(username, password, clientIp);

    if (result.requires2FA) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        challengeToken: result.challengeToken,
        allowedMethods: result.allowedMethods,
        maskedEmail: result.maskedEmail,
        username: result.username,
      });
    }

    const { session, cookieHeader } = result;

    const response = NextResponse.json({
      success: true,
      requires2FA: false,
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
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
