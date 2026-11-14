import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    const users = await AuthService.getUsersAsync(tenant.companyId);
    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can create users.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { username, password, fullName, role, staffId } = body;

    if (!username || !password || !fullName || !role) {
      return NextResponse.json(
        { success: false, message: 'Username, password, full name, and role are required.' },
        { status: 400 }
      );
    }

    const user = AuthService.createUser({
      username,
      password,
      fullName,
      role,
      staffId: staffId || null,
    }, tenant.companyId);

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

