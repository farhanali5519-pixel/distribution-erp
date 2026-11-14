import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '../../../../modules/purchase/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(request);
    requireModuleEnabled(companyId, 'purchase');
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const vendorId = searchParams.get('vendorId') || undefined;
    const statusParams = searchParams.getAll('status');
    const status = statusParams.length > 1
      ? statusParams
      : (searchParams.get('status') || undefined);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    const bills = await PurchaseService.getPurchaseBillsAsync({
      companyId,
      search,
      vendorId,
      status,
      from,
      to,
      page,
      limit,
    }, companyId);

    const pagination = (bills as any).pagination || null;

    return NextResponse.json({ success: true, bills, pagination });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    console.error('Error fetching purchase bills:', error);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(request);
    requireModuleEnabled(companyId, 'purchase');
    const body = await request.json();
    const result = PurchaseService.createPurchaseBill({ ...body, companyId }, companyId);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 400);
    console.error('Error creating purchase bill:', error);
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

