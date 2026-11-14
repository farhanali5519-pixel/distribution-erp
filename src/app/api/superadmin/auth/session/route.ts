import { NextResponse } from 'next/server';
import { getSuperAdminSession } from '@/core/auth/superadmin-session';

export async function GET() {
  try {
    const session = await getSuperAdminSession();
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
        email: session.email,
        role: session.role,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }
}
