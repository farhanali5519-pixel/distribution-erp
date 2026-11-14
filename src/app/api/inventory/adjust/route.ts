import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/modules/inventory/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { productId, adjustmentType, quantityBase, cartons, boxes, pieces, reason, postToGL } = body;

    if (!productId || !adjustmentType) {
      return NextResponse.json(
        { success: false, message: 'productId and adjustmentType are required.' },
        { status: 400 }
      );
    }

    if (quantityBase === undefined && cartons === undefined && boxes === undefined && pieces === undefined) {
      return NextResponse.json(
        { success: false, message: 'Either quantityBase or cartons/boxes/pieces must be provided.' },
        { status: 400 }
      );
    }

    InventoryService.adjustStock({
      productId,
      adjustmentType,
      quantityBase: quantityBase !== undefined ? Number(quantityBase) : undefined,
      cartons: cartons !== undefined ? Number(cartons) : undefined,
      boxes: boxes !== undefined ? Number(boxes) : undefined,
      pieces: pieces !== undefined ? Number(pieces) : undefined,
      reason: reason || 'Stock Reconciliation',
      postToGL: postToGL !== false,
    }, companyId);

    return NextResponse.json({
      success: true,
      message: `Stock adjusted successfully (${adjustmentType}).`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
