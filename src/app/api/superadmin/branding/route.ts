import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { getBrandingConfig, saveBrandingConfig } from '@/core/branding/theme.service';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const config = await getBrandingConfig('SYSTEM');
    return NextResponse.json({ success: true, data: config });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch global branding';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);
    const body = await request.json();

    const saved = await saveBrandingConfig(body, 'SYSTEM');

    await SuperAdminAuditService.log({
      actor: session.username,
      action: 'GLOBAL_BRANDING_CHANGED',
      target: 'Platform Global Branding',
      reason: `Updated global default ERP display name to "${saved.displayName}" and refreshed branding`,
    });

    // Invalidate Next.js server layout and page cache system-wide
    try {
      revalidatePath('/', 'layout');
      revalidatePath('/superadmin', 'layout');
      revalidatePath('/login', 'page');
      revalidatePath('/superadmin/login', 'page');
    } catch (revalidateErr) {
      console.warn('[Branding] Cache revalidation warning:', revalidateErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Global branding saved successfully',
      data: saved,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to save global branding';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
