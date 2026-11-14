import { NextResponse } from 'next/server';
import { ReportsService } from '@/modules/reports/service';
import { PartyType } from '@/modules/reports/types';
import { getTenantContext } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'reports:ledgers');
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') as PartyType;
    const entityId = searchParams.get('entityId');
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;

    if (!entityType || !['CUSTOMER', 'VENDOR'].includes(entityType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid or missing entityType ("CUSTOMER" or "VENDOR" required).' },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, message: 'entityId is required.' },
        { status: 400 }
      );
    }

    const statement = ReportsService.getPartyLedgerStatement({
      companyId: tenant.companyId,
      entityType,
      entityId,
      fromDate,
      toDate,
    });

    return NextResponse.json({
      success: true,
      data: statement,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to generate party ledger statement.' },
      { status }
    );
  }
}
