import { NextRequest, NextResponse } from 'next/server';
import { RouteService } from '@/modules/routes/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const route = RouteService.getRouteById(id, companyId);
    if (!route) {
      return NextResponse.json({ success: false, message: 'Route not found.' }, { status: 404 });
    }

    const dependencies = RouteService.checkDeletionDependencies(id, companyId);
    return NextResponse.json({ success: true, route, dependencies });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const body = await req.json();
    const updated = RouteService.updateRoute(id, body, companyId);
    return NextResponse.json({ success: true, route: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    // Pre-check dependencies
    const depCheck = RouteService.checkDeletionDependencies(id, companyId);
    if (!depCheck.canDelete) {
      return NextResponse.json(
        {
          success: false,
          message: depCheck.message,
          dependencies: depCheck,
        },
        { status: 400 }
      );
    }

    const result = RouteService.deleteRoute(id, companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}
