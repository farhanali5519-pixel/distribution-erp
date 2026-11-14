import { NextRequest, NextResponse } from 'next/server';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    const body = await request.json();

    if (!body.productId || !body.fromWarehouse || !body.toWarehouse) {
      return NextResponse.json(
        { success: false, message: 'Product, Source Warehouse, and Destination Warehouse are required.' },
        { status: 400 }
      );
    }

    const result = InventoryAuditService.recordTransfer({
      companyId: tenant.companyId,
      productId: body.productId,
      fromWarehouse: body.fromWarehouse,
      toWarehouse: body.toWarehouse,
      quantityBase: body.quantityBase,
      cartons: body.cartons,
      boxes: body.boxes,
      pieces: body.pieces,
      transferDate: body.transferDate,
      referenceNumber: body.referenceNumber,
      notes: body.notes,
      userId: tenant.userId || 'admin',
      userName: tenant.fullName || tenant.username || 'Administrator',
      userRole: tenant.role || 'ADMIN',
    });

    return NextResponse.json({
      success: true,
      message: `Stock transferred successfully between ${body.fromWarehouse} and ${body.toWarehouse}`,
      transfer: result,
    });
  } catch (error: any) {
    console.error('Error recording warehouse transfer:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record warehouse transfer' },
      { status: 500 }
    );
  }
}
