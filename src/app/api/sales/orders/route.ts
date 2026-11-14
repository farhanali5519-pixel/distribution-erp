import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { getCurrentCompanyId, getTenantContext } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales');
    const tenantCtx = await getTenantContext(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const order = SalesService.getOrderById(id, companyId);
      if (!order) {
        return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, order });
    }

    const status = searchParams.get('status') || undefined;
    const routeId = searchParams.get('routeId') || undefined;
    const date = searchParams.get('date') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const search = searchParams.get('search') || undefined;
    const sourceChannel = searchParams.get('sourceChannel') || undefined;
    const bookerId = searchParams.get('bookerId') || undefined;
    const salesmanId = searchParams.get('salesmanId') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    // Use server tenant context for userRole / userId if role is restricted
    const userRole = tenantCtx.role;
    const userId = tenantCtx.userId;

    const orders = SalesService.getOrders({
      companyId,
      status,
      routeId,
      date,
      startDate,
      endDate,
      search,
      sourceChannel,
      bookerId,
      salesmanId,
      customerId,
      userRole,
      userId,
      page,
      limit,
    }, companyId);

    const pagination = (orders as any).pagination || null;

    return NextResponse.json({
      success: true,
      orders,
      pagination,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch orders' },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales');
    const tenantCtx = await getTenantContext(req);
    const body = await req.json();

    const order = SalesService.createOrder({
      ...body,
      companyId,
      createdByUserId: tenantCtx.userId,
    }, companyId);

    return NextResponse.json({
      success: true,
      message: `Sale Bill ${order?.order_number} posted and stock relieved!`,
      order,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to post sale bill' },
      { status }
    );
  }
}

