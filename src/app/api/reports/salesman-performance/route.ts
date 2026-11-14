import { NextResponse } from 'next/server';
import { ReportsService } from '@/modules/reports/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(request, 'reports:salesman_performance');
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);
    const salesmanId = searchParams.get('salesmanId') || undefined;
    const supplyPersonId = searchParams.get('supplyPersonId') || undefined;
    const routeId = searchParams.get('routeId') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const productId = searchParams.get('productId') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const status = searchParams.get('status') || undefined;
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const viewType = (searchParams.get('viewType') as any) || undefined;

    const distributionReport = ReportsService.getDistributionTeamReport({
      companyId: tenant.companyId,
      salesmanId,
      supplyPersonId,
      routeId,
      customerId,
      productId,
      categoryId,
      status,
      fromDate,
      toDate,
      viewType,
    });

    const legacyReport = ReportsService.getSalesmanPerformanceReport({
      companyId: tenant.companyId,
      salesmanId,
      routeId,
      fromDate,
      toDate,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...legacyReport,
        ...distributionReport,
        salespersonRows: distributionReport.salespersonRows,
        supplyPersonRows: distributionReport.supplyPersonRows,
        itemRows: distributionReport.itemRows,
        customerRows: distributionReport.customerRows,
        transactionRows: distributionReport.transactionRows,
        salesmen: distributionReport.salespersonRows,
        supplyPersons: distributionReport.supplyPersonRows,
        itemSales: distributionReport.itemRows,
        customerSales: distributionReport.customerRows,
        transactions: distributionReport.transactionRows,
      },
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to generate distribution team performance report.' },
      { status }
    );
  }
}
