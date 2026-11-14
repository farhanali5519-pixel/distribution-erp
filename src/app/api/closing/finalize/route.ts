import { NextResponse } from 'next/server';
import { ClosingService } from '@/modules/closing/service';
import { BackupService } from '@/lib/backup/backup-service';
import { FeatureFlagService } from '@/core/settings/flags';
import { getTenantContext } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function POST(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'closing');
    const body = await request.json();
    const {
      closingDate,
      openingCashPaisas,
      spotCashSalesPaisas,
      debtRecoveriesPaisas,
      spotCashPurchasesPaisas,
      dailyExpensesPaisas,
      bankDepositsPaisas,
      expectedCashPaisas,
      physicalCashPaisas,
      denominations,
      notes,
      closedBy,
    } = body;

    const result = ClosingService.finalizeDailyClosing({
      companyId: tenant.companyId,
      closingDate,
      openingCashPaisas: Number(openingCashPaisas) || 0,
      spotCashSalesPaisas: Number(spotCashSalesPaisas) || 0,
      debtRecoveriesPaisas: Number(debtRecoveriesPaisas) || 0,
      spotCashPurchasesPaisas: Number(spotCashPurchasesPaisas) || 0,
      dailyExpensesPaisas: Number(dailyExpensesPaisas) || 0,
      bankDepositsPaisas: Number(bankDepositsPaisas) || 0,
      expectedCashPaisas: Number(expectedCashPaisas) || 0,
      physicalCashPaisas: Number(physicalCashPaisas) || 0,
      denominations: denominations || {
        note5000: 0,
        note1000: 0,
        note500: 0,
        note100: 0,
        note50: 0,
        note20: 0,
        note10: 0,
        coinsLoose: 0,
      },
      notes: notes || undefined,
      closedBy: tenant.fullName || tenant.username || 'Admin Cashier',
    });

    // Automatic Day-End Backup Hook
    let autoBackup = null;
    if (FeatureFlagService.isEnabled('backup.enable_auto_daily_backup', true, tenant.companyId)) {
      try {
        autoBackup = BackupService.createBackup('DAILY_CLOSING');
        console.log('Automatic day-end backup created:', autoBackup.filename);
      } catch (backupErr) {
        console.error('Failed to create automatic day-end backup:', backupErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily cash closing for ${closingDate} finalized and locked successfully.`,
      reconciliation: result,
      autoBackup,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to finalize daily closing.' },
      { status }
    );
  }
}
