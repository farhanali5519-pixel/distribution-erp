import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { getBrandingConfig, saveBrandingConfig, deleteTenantBrandingOverride } from '@/core/branding/theme.service';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    const config = await getBrandingConfig(id);
    return NextResponse.json({ success: true, data: config });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch branding';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin(request);
    const { id } = await params;
    const body = await request.json();

    const company = CompanyProvisioningService.getCompanyById(id);
    if (!company) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }

    const saved = await saveBrandingConfig(body, id);

    await SuperAdminAuditService.log({
      actor: session.username,
      action: 'TENANT_BRANDING_CHANGED',
      target: company.name,
      tenantId: company.id,
      tenantSlug: company.slug,
      reason: `Updated branding override for company "${company.name}"`,
    });

    return NextResponse.json({
      success: true,
      message: 'Branding override saved successfully',
      data: saved,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to save branding';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin(request);
    const { id } = await params;

    const company = CompanyProvisioningService.getCompanyById(id);
    await deleteTenantBrandingOverride(id);

    await SuperAdminAuditService.log({
      actor: session.username,
      action: 'TENANT_BRANDING_CHANGED',
      target: company?.name || id,
      tenantId: id,
      reason: `Reset tenant branding to global default for company "${company?.name || id}"`,
    });

    const fallback = await getBrandingConfig(id);

    return NextResponse.json({
      success: true,
      message: 'Branding override reset to system default',
      data: fallback,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to reset branding';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
