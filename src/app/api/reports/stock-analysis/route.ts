import { NextResponse } from 'next/server';
import {
  StockAnalysisService,
  StockAnalysisFilter,
  StockReportViewType,
  StockViewMode,
} from '@/modules/reports/stock-analysis.service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(request, 'reports:stock_analysis');
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);

    // If requested filter dimensions only
    if (searchParams.get('mode') === 'dimensions') {
      const dimensions = StockAnalysisService.getFilterDimensions(tenant.companyId);
      return NextResponse.json({ success: true, data: dimensions });
    }

    // Helper to parse comma-separated or repeated query params with fallback aliases
    const parseList = (...keys: string[]): string[] | undefined => {
      for (const key of keys) {
        const vals = searchParams.getAll(key);
        if (vals.length > 0) {
          const list = vals.flatMap((v) => v.split(',').map((s) => s.trim())).filter(Boolean);
          if (list.length > 0) return list;
        }
        const single = searchParams.get(key);
        if (single) {
          const list = single.split(',').map((s) => s.trim()).filter(Boolean);
          if (list.length > 0) return list;
        }
      }
      return undefined;
    };

    const filter: StockAnalysisFilter = {
      companyId: tenant.companyId,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      stockView: (searchParams.get('stockView') as StockViewMode) || 'all',
      viewBy: (searchParams.get('viewBy') as StockReportViewType) || 'detailed',
      salesmanIds: parseList('salesmanIds', 'salesmanId'),
      orderBookerIds: parseList('orderBookerIds', 'orderBookerId'),
      supplyPersonIds: parseList('supplyPersonIds', 'supplyPersonId'),
      customerIds: parseList('customerIds', 'customerId'),
      routeIds: parseList('routeIds', 'routeId'),
      productIds: parseList('productIds', 'productId'),
      categoryIds: parseList('categoryIds', 'categoryId'),
      brandIds: parseList('brandIds', 'brandId'),
      companyNames: parseList('companyNames', 'companyName'),
      sources: parseList('sources', 'source'),
      statuses: parseList('statuses', 'status'),
      warehouses: parseList('warehouses', 'warehouse'),
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 50,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
    };

    const report = StockAnalysisService.getStockAnalysisReport(filter);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate Stock & Booking Analysis Report' },
      { status }
    );
  }
}
