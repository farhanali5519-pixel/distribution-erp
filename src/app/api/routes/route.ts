import { NextRequest, NextResponse } from 'next/server';
import { RouteService } from '@/modules/routes/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { searchParams } = new URL(req.url);

    if (searchParams.get('staffOptions') === 'true') {
      const staffOptions = RouteService.getStaffOptions(companyId);
      return NextResponse.json({ success: true, ...staffOptions });
    }

    const all = searchParams.get('all') === 'true';
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;
    const search = searchParams.get('search') || undefined;
    const city = searchParams.get('city') || undefined;

    const routes = RouteService.getRoutes({
      all,
      isActive,
      search,
      city,
    }, companyId);

    return NextResponse.json({ success: true, routes });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const route = RouteService.createRoute(body, companyId);
    return NextResponse.json({ success: true, route });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}
