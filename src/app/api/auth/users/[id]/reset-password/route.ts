import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can reset passwords.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    if (!body.password || typeof body.password !== 'string' || body.password.length < 3) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 3 characters long.' },
        { status: 400 }
      );
    }

    const updated = AuthService.resetUserPassword(id, body.password, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Password for @${updated.username} reset successfully.`,
      user: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

