import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can update users.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    const updated = AuthService.updateUser(id, {
      fullName: body.fullName,
      role: body.role,
      password: body.password || undefined,
      staffId: body.staffId,
      isActive: body.isActive,
      permissions: body.permissions,
    }, tenant.companyId);

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can delete or deactivate users.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'delete') {
      const result = AuthService.deleteUser(id, tenant.companyId);
      return NextResponse.json({ success: true, message: result.message });
    }

    const toggled = AuthService.toggleUserStatus(id, tenant.companyId);
    return NextResponse.json({
      success: true,
      user: toggled,
      message: `User ${toggled.username} is now ${toggled.is_active ? 'Active' : 'Inactive'}.`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

