import { NextRequest, NextResponse } from 'next/server';
import { PurchaseService } from '@/modules/purchase/service';
import { FeatureFlagService } from '@/core/settings/flags';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'User requested purchase bill void';
    const adminPin = body.adminPin || request.headers.get('x-admin-pin') || '';

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

    const result = PurchaseService.voidPurchaseBill(id, reason, tenant.companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error voiding purchase bill:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

