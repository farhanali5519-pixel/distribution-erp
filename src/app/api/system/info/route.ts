import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireTenantContext } from '@/core/tenancy/context';
import { APP_VERSION, getAppConfig, isOnPremiseMode, isHostingerMode } from '@/core/config/env';
import { LicenseService } from '@/core/licensing/license.service';
import { BackupService } from '@/lib/backup/backup-service';
import { MigrationRunner } from '@/core/database/migration-runner';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { getDatabase } from '@/core/database/db';
import { getDatabaseClient } from '@/core/database/factory';
import { AuditLogService } from '@/core/audit/audit-log.service';

export async function GET(req: NextRequest) {
  try {
    const context = await getTenantContext(req);
    requireTenantContext(context);

    // Only administrators or super administrators can inspect system information
    if (context.role !== 'ADMIN' && (context.role as any) !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden. System Information requires Administrator privileges.' },
        { status: 403 }
      );
    }

    const config = getAppConfig();
    const license = LicenseService.getActiveLicense(context.companyId);
    const backupStats = BackupService.getDatabaseStats();

    // Check database health safely
    let dbHealth = 'OPTIMAL';
    let quickCheckStatus = 'ok';
    if (isOnPremiseMode() || isHostingerMode()) {
      try {
        const db = getDatabase();
        const checkRes = db.prepare('PRAGMA quick_check').get() as { quick_check: string };
        quickCheckStatus = checkRes?.quick_check || 'ok';
        if (quickCheckStatus !== 'ok') {
          dbHealth = 'DEGRADED';
        }
      } catch {
        dbHealth = 'ERROR';
      }
    } else {
      try {
        const client = getDatabaseClient();
        await client.queryOne('SELECT 1');
        quickCheckStatus = 'ok (postgres)';
        dbHealth = 'OPTIMAL';
      } catch {
        dbHealth = 'ERROR';
        quickCheckStatus = 'error';
      }
    }

    const schemaVersion = MigrationRunner.getLatestAppliedVersion();
    const modules = ModuleRegistry.getAllModules(context.companyId);
    const enabledModules = modules.filter(m => m.isEnabled).map(m => ({ id: m.id, name: m.name }));

    const machineFingerprint = LicenseService.generateMachineFingerprint();

    // Calculate total backup storage
    const backups = BackupService.listBackups();
    const totalBackupBytes = backups.reduce((sum, b) => sum + b.sizeBytes, 0);

    return NextResponse.json({
      success: true,
      data: {
        application: {
          name: 'SaleFlow ERP',
          version: APP_VERSION,
          deploymentMode: config.deploymentMode,
          databaseType: config.databaseDriver,
          schemaVersion,
        },
        company: {
          id: context.companyId,
          name: context.companyName,
          slug: context.companySlug,
        },
        database: {
          health: dbHealth,
          integrity: quickCheckStatus,
          sizeFormatted: backupStats.sizeFormatted,
          tableCount: backupStats.tableCount,
          totalRecords: backupStats.totalRecords,
        },
        license: {
          status: license.status,
          isValid: license.isValid,
          type: license.payload?.type || 'TRIAL',
          licenseId: license.payload?.licenseId || 'UNLICENSED',
          expiresAt: license.payload?.expiresAt || null,
          maxUsers: license.payload?.maxUsers || 5,
          daysRemaining: license.daysRemaining,
          isGracePeriod: license.isGracePeriod,
          graceDaysRemaining: license.graceDaysRemaining || 0,
          issuer: license.payload?.issuer || 'Builtin Platform',
          machineFingerprint,
          message: license.message,
        },
        modules: {
          total: modules.length,
          enabledCount: enabledModules.length,
          enabled: enabledModules,
        },
        backups: {
          totalBackupsCount: backupStats.totalBackupsCount,
          lastBackupTimestamp: backupStats.lastBackupTimestamp,
          totalStorageFormatted: BackupService.formatBytes(totalBackupBytes),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to retrieve system information' },
      { status: error.status || 500 }
    );
  }
}

/**
 * Installs or updates a commercial license key
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req);
    requireTenantContext(context);

    if (context.role !== 'ADMIN' && (context.role as any) !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden. License installation requires Administrator privileges.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const licenseKey = body.licenseKey?.trim();

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, message: 'License key is required.' },
        { status: 400 }
      );
    }

    const result = LicenseService.installLicense(licenseKey, context.companyId);

    AuditLogService.logAction({
      companyId: context.companyId,
      userId: context.userId,
      userName: context.username,
      userRole: context.role,
      action: 'LICENSE_INSTALL',
      transactionType: 'COMMERCIAL_LICENSE',
      transactionNumber: result.payload?.licenseId,
      reason: `Installed commercial license (${result.payload?.type})`,
      details: {
        licenseId: result.payload?.licenseId,
        type: result.payload?.type,
        expiresAt: result.payload?.expiresAt,
        maxUsers: result.payload?.maxUsers,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Commercial license installed and verified successfully!',
      license: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to install commercial license' },
      { status: 400 }
    );
  }
}
