import { NextRequest, NextResponse } from 'next/server';
import { SalesService } from '@/modules/sales/service';
import { FeatureFlagService } from '@/core/settings/flags';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);
    const { id } = await params;
    let reason = 'Order cancelled by user';
    let adminPin = req.headers.get('x-admin-pin') || '';

    try {
      const body = await req.json();
      if (body.reason) reason = body.reason;
      if (body.adminPin) adminPin = body.adminPin;
    } catch {
      // Empty body is acceptable
    }

    // Check if Admin PIN is required for voiding
    const requirePin = FeatureFlagService.isEnabled('auth.require_admin_pin_for_void', true, tenant.companyId);
    if (requirePin) {
      if (!adminPin || !AuthService.verifyAdminPin(adminPin, tenant.companyId)) {
        return NextResponse.json(
          { success: false, message: 'Invalid Admin Security PIN. Voiding requires administrative authorization.' },
          { status: 403 }
        );
      }
    }

    const order = SalesService.cancelOrder(id, reason, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Sale Order ${order?.order_number} successfully cancelled, GL entry reversed, and warehouse stock replenished.`,
      order,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to cancel sale order' },
      { status: 400 }
    );
  }
}

