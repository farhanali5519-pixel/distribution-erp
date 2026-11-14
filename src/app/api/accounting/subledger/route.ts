import { NextResponse } from 'next/server';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { EntityType } from '@/core/accounting/types';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entityType') as EntityType | null;
  const entityId = searchParams.get('entityId');

  if (!entityType || !entityId) {
    return NextResponse.json(
      { success: false, message: 'entityType and entityId query parameters are required.' },
      { status: 400 }
    );
  }

  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const statement = DoubleEntryEngine.getSubLedger(entityType, entityId, tenant.companyId);
    return NextResponse.json({ success: true, statement });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

