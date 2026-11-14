import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import { CompanyProvisioningService, ProvisionCompanyInput } from '@/core/tenancy/company-provisioning.service';

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const plan = searchParams.get('plan') || undefined;

    const companies = CompanyProvisioningService.listCompanies({ search, status, plan });

    return NextResponse.json({
      success: true,
      data: companies,
      count: companies.length,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch companies';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin(request);

    const body = (await request.json()) as ProvisionCompanyInput;
    const result = CompanyProvisioningService.provisionCompany(body);

    return NextResponse.json({
      success: true,
      message: `Company "${result.company.name}" provisioned successfully with slug "${result.company.slug}"`,
      data: result,
    }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to provision company';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
