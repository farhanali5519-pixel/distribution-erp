import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagService } from '@/core/settings/flags';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    const flags = FeatureFlagService.getAllFlags(tenant.companyId);
    return NextResponse.json({
      success: true,
      flags,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch feature flags' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can update feature flags.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing key or value parameter' },
        { status: 400 }
      );
    }

    FeatureFlagService.updateFlag(key, String(value), tenant.companyId);
    const flags = FeatureFlagService.getAllFlags(tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Feature flag "${key}" updated successfully.`,
      flags,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update feature flag' },
      { status: 400 }
    );
  }
}
