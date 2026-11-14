import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { getDatabaseClient } from '@/core/database/factory';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const client = getDatabaseClient();

    // 1. Platform Super Admin users
    const platformUsers = await client.query<any>(
      `SELECT id, username, full_name, email, phone, role, is_active, 
              totp_enabled, email_otp_enabled, two_factor_policy, last_2fa_at, created_at, updated_at
       FROM platform_users 
       ORDER BY role ASC, username ASC`
    );

    // 2. Tenant users list (cross-tenant overview)
    const tenantUsers = await client.query<any>(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at, u.company_id,
              c.name as company_name, c.slug as company_slug
       FROM app_users u
       LEFT JOIN companies c ON u.company_id = c.id
       ORDER BY u.created_at DESC
       LIMIT 100`
    );

    return NextResponse.json({
      success: true,
      data: {
        platformUsers,
        tenantUsers,
      },
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch users';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
