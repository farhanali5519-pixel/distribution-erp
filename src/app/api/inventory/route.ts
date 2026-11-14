import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/modules/inventory/service';
import { FeatureFlagService } from '@/core/settings/flags';
import { getTenantContext, getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled, checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, ['inventory', 'sales', 'purchase']);
    if (errorResponse) return errorResponse;
    const companyId = tenant.companyId;
    const categoryParam = searchParams.get('categoryIds') || searchParams.get('categoryId') || undefined;
    const categoryIds = categoryParam ? categoryParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const brandParam = searchParams.get('brandIds') || searchParams.get('brandId') || undefined;
    const brandIds = brandParam ? brandParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const maskFlag = FeatureFlagService.isEnabled('auth.mask_cost_price_for_salesmen', true, companyId);
    const maskCost = maskFlag && tenant.role === 'SALESMAN';

    const products = await InventoryService.getProductsAsync({ maskCost, categoryIds, brandIds, companyId });
    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'inventory');
    if (errorResponse) return errorResponse;
    const companyId = tenant.companyId;
    const body = await req.json();
    const {
      sku,
      barcode,
      name,
      categoryId,
      brandId,
      boxesPerCarton,
      piecesPerBox,
      uomBase,
      uomBulk,
      costPrice,
      tradePrice,
      mrp,
      initialStockBase,
      initialCartons,
      initialBoxes,
      initialPieces,
      minStockAlert,
    } = body;

    if (!sku || !name) {
      return NextResponse.json({ success: false, message: 'SKU and product name are required.' }, { status: 400 });
    }

    const product = InventoryService.createProduct({
      sku: sku.trim().toUpperCase(),
      barcode: barcode?.trim() || undefined,
      name: name.trim(),
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      boxesPerCarton: Number(boxesPerCarton) || 1,
      piecesPerBox: Number(piecesPerBox) || 1,
      uomBase: uomBase || 'PIECE',
      uomBulk: uomBulk || 'CARTON',
      costPrice: Number(costPrice) || 0,
      tradePrice: Number(tradePrice) || 0,
      mrp: Number(mrp) || 0,
      initialStockBase: initialStockBase !== undefined ? Number(initialStockBase) : undefined,
      initialCartons: initialCartons !== undefined ? Number(initialCartons) : undefined,
      initialBoxes: initialBoxes !== undefined ? Number(initialBoxes) : undefined,
      initialPieces: initialPieces !== undefined ? Number(initialPieces) : undefined,
      minStockAlert: Number(minStockAlert) || 0,
    }, companyId);

    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Product ID is required.' }, { status: 400 });
    }

    const product = InventoryService.updateProduct(id, updates, companyId);
    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'inventory');
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Product ID is required.' }, { status: 400 });
    }

    const result = InventoryService.deleteProduct(id, companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}
