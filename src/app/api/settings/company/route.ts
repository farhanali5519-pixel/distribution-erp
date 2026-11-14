import { NextRequest, NextResponse } from 'next/server';
import { CompanyService } from '@/modules/settings/company-service';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    const profile = CompanyService.getProfile(tenant.companyId);
    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to retrieve company profile.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);

    // Enforce role authorization: ADMIN role only (strictly from authenticated server context)
    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can update company profile and print settings.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.businessName || !body.businessName.trim()) {
      return NextResponse.json(
        { success: false, message: 'Business Name is required.' },
        { status: 400 }
      );
    }

    const updated = CompanyService.updateProfile({
      businessName: body.businessName,
      tagline: body.tagline,
      phonePrimary: body.phonePrimary,
      phoneSecondary: body.phoneSecondary,
      email: body.email,
      address: body.address,
      city: body.city,
      ntnStrn: body.ntnStrn,
      logoUrl: body.logoUrl,
      currencySymbol: body.currencySymbol,
      thermalFooterNote: body.thermalFooterNote,
      invoiceTerms: body.invoiceTerms,
      showLogoOnPrints: body.showLogoOnPrints,
      showNtnOnInvoices: body.showNtnOnInvoices,
      showCustomerPreviousBalance: body.showCustomerPreviousBalance,
    }, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: 'Business profile and print settings updated successfully.',
      profile: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update company profile.' },
      { status: 500 }
    );
  }
}
