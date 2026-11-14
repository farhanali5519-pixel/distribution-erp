import { NextResponse } from 'next/server';
import { createClearSuperAdminCookieHeader } from '@/core/auth/superadmin-session';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.headers.set('Set-Cookie', createClearSuperAdminCookieHeader());
  return response;
}
