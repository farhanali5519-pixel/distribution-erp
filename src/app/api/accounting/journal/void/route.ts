import { NextRequest, NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { FeatureFlagService } from '@/core/settings/flags';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    const body = await req.json();
    const { journalId, reason, adminPin } = body;

    if (!journalId || !reason) {
      return NextResponse.json(
        { success: false, message: 'journalId and reason are required to void a journal entry.' },
        { status: 400 }
      );
    }

    // Check if Admin PIN is required for voiding
    const requirePin = FeatureFlagService.isEnabled('auth.require_admin_pin_for_void', true, tenant.companyId);
    if (requirePin) {
      const pin = adminPin || (req.headers.get('x-admin-pin') || '');
      if (!pin || !AuthService.verifyAdminPin(pin, tenant.companyId)) {
        return NextResponse.json(
          { success: false, message: 'Invalid Admin Security PIN. Voiding requires administrative authorization.' },
          { status: 403 }
        );
      }
    }

    const result = DoubleEntryEngine.voidEntry(journalId, reason, tenant.companyId);

    return NextResponse.json({
      success: true,
      message: `Journal voucher ${result.originalEntry.entry_number} voided and reversal voucher ${result.reversalEntry.entry_number} posted.`,
      originalEntry: result.originalEntry,
      reversalEntry: result.reversalEntry,
    });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Void failed.' }, { status: 500 });
  }
}

