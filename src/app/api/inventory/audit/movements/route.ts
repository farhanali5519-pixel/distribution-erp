import { NextRequest, NextResponse } from 'next/server';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const { searchParams } = new URL(request.url);

    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const productId = searchParams.get('productId') || undefined;
    const sku = searchParams.get('sku') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const warehouse = searchParams.get('warehouse') || undefined;
    const movementType = searchParams.get('movementType') || undefined;
    const sourceModule = searchParams.get('sourceModule') || undefined;
    const documentNumber = searchParams.get('documentNumber') || undefined;
    const user = searchParams.get('user') || undefined;
    const status = (searchParams.get('status') as any) || undefined;
    const transactionCategory = (searchParams.get('transactionCategory') as any) || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

    const result = InventoryAuditService.getMovements({
      companyId,
      fromDate,
      toDate,
      productId,
      sku,
      categoryId,
      warehouse,
      movementType,
      sourceModule,
      documentNumber,
      user,
      status,
      transactionCategory,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      movements: result.movements,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error fetching inventory movements:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch inventory movements' },
      { status: 500 }
    );
  }
}
