import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';
import { ModuleRegistry } from '@/core/registry/module-registry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    const company = CompanyProvisioningService.getCompanyById(id);
    if (!company) {
      return NextResponse.json(
        { success: false, error: `Company with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const hierarchicalModules = ModuleRegistry.getHierarchicalModulesForCompany(id);

    return NextResponse.json({
      success: true,
      hierarchicalModules,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status || 401 }
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch company modules';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminSession = await requireSuperAdmin(request);
    const { id } = await params;

    const company = CompanyProvisioningService.getCompanyById(id);
    if (!company) {
      return NextResponse.json(
        { success: false, error: `Company with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing JSON payload.' },
        { status: 400 }
      );
    }

    if (!body || !Array.isArray(body.modules)) {
      return NextResponse.json(
        { success: false, error: 'Expected modules array in request body.' },
        { status: 400 }
      );
    }

    const actor = adminSession.username || 'superadmin';
    CompanyProvisioningService.setCompanyModules(id, body.modules, actor, body.submodules);

    const hierarchicalModules = ModuleRegistry.getHierarchicalModulesForCompany(id);

    return NextResponse.json({
      success: true,
      message: 'Company modules and submodules updated successfully',
      hierarchicalModules,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status || 401 }
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to update company modules';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const PUT = POST;
