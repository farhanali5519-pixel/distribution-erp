import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '@/modules/purchase/service';
import { getDatabaseClient } from '@/core/database/factory';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const client = getDatabaseClient();
    const vendor = await client.queryOne('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [id, companyId]);

    if (!vendor) {
      return NextResponse.json(
        { success: false, message: 'Vendor not found.' },
        { status: 404 }
      );
    }

    const dependencies = await PurchaseService.checkVendorDependenciesAsync(id, companyId);

    return NextResponse.json({
      success: true,
      vendor,
      dependencies,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch vendor.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const result = await PurchaseService.deleteVendorAsync(id, companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete vendor.' },
      { status: 400 }
    );
  }
}

