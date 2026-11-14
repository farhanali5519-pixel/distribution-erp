import { NextRequest, NextResponse } from 'next/server';
import { ExpenseService } from '@/modules/expenses/service';
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
    const reason = body.reason?.trim() || 'Voided by cashier';
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

    const result = ExpenseService.voidExpense(id, reason, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Expense voucher ${result.originalExpense.voucher_number} voided and reversed in General Ledger.`,
      expense: result.originalExpense,
      reversalEntryId: result.reversalEntryId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to void expense voucher.' },
      { status: 400 }
    );
  }
}

