import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { MODULE_GROUPS, ALL_SUBMODULES, getDefaultPermissionsForRole } from '@/modules/auth/permissions-registry';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);
    const { id } = await params;
    const user = AuthService.getUserById(id, tenant.companyId);
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const permissions = AuthService.getUserPermissions(id, tenant.companyId);
    const defaultPermissions = getDefaultPermissionsForRole(user.role);

    return NextResponse.json({
      success: true,
      user,
      permissions,
      defaultPermissions,
      moduleGroups: MODULE_GROUPS,
      allSubModules: ALL_SUBMODULES,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can update permissions.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    if (!body.permissions || typeof body.permissions !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid permissions payload.' },
        { status: 400 }
      );
    }

    const updatedUser = AuthService.saveUserPermissions(id, body.permissions, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Permissions updated successfully for user @${updatedUser.username}.`,
      user: updatedUser,
      permissions: updatedUser.permissions,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

