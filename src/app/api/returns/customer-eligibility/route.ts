import { NextResponse } from 'next/server';
import { ReturnsService } from '@/modules/returns/service';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    const companyId = tenant.companyId;

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const productId = searchParams.get('productId');

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'customerId is required.' },
        { status: 400 }
      );
    }

    if (productId) {
      const eligibility = ReturnsService.checkCustomerEligibility(customerId, productId, companyId);
      return NextResponse.json({
        success: true,
        data: eligibility,
      });
    }

    // Return list of all eligible products for this customer
    const eligibleProducts = ReturnsService.getCustomerEligibleProducts(customerId, companyId);
    return NextResponse.json({
      success: true,
      data: eligibleProducts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to check customer eligibility.' },
      { status: 400 }
    );
  }
}
