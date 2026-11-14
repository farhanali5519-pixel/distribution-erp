import { NextResponse } from 'next/server';
import { SalesAnalysisService, SalesAnalysisFilter, SalesAnalysisViewBy } from '@/modules/reports/sales-analysis.service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(request, 'reports:sales_analysis');
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);

    // If requested filter dimensions only
    if (searchParams.get('mode') === 'dimensions') {
      const dimensions = SalesAnalysisService.getFilterDimensions(tenant.companyId);
      return NextResponse.json({ success: true, data: dimensions });
    }

    // Helper to parse comma-separated or repeated query params
    const parseList = (key: string): string[] | undefined => {
      const vals = searchParams.getAll(key);
      if (vals.length === 0) {
        const single = searchParams.get(key);
        if (!single) return undefined;
        const list = single.split(',').map((s) => s.trim()).filter(Boolean);
        return list.length > 0 ? list : undefined;
      }
      const list = vals.flatMap((v) => v.split(',').map((s) => s.trim())).filter(Boolean);
      return list.length > 0 ? list : undefined;
    };

    const filter: SalesAnalysisFilter = {
      companyId: tenant.companyId,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      salesmanIds: parseList('salesmanIds'),
      orderBookerIds: parseList('orderBookerIds'),
      supplyPersonIds: parseList('supplyPersonIds'),
      customerIds: parseList('customerIds'),
      routeIds: parseList('routeIds'),
      productIds: parseList('productIds'),
      categoryIds: parseList('categoryIds'),
      brandIds: parseList('brandIds'),
      companyNames: parseList('companyNames'),
      sources: parseList('sources'),
      statuses: parseList('statuses'),
      warehouses: parseList('warehouses'),
      search: searchParams.get('search') || undefined,
      viewBy: (searchParams.get('viewBy') as SalesAnalysisViewBy) || 'detailed',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 50,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
    };

    const report = SalesAnalysisService.getSalesAnalysisReport(filter);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate Sales Analysis Report' },
      { status: 500 }
    );
  }
}
