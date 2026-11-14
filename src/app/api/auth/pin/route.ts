import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can update the Admin PIN.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { newPin, currentPin } = body;

    const result = AuthService.setAdminPin(newPin, currentPin, tenant.companyId);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

