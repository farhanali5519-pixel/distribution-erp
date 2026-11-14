import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { SuperAdminService } from '@/core/auth/superadmin.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);
    const result = await SuperAdminService.setupTotp(session.userId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to generate TOTP setup';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
