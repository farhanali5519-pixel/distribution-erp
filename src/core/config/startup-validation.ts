import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getAppConfig, APP_VERSION, getSaleFlowBackupDir } from './env';
import { MigrationRunner } from '../database/migration-runner';
import { LicenseService } from '../licensing/license.service';

export interface StartupValidationReport {
  isReady: boolean;
  errors: string[];
  warnings: string[];
  environment: {
    appVersion: string;
    deploymentMode: string;
    databaseDriver: string;
    serverHost: string;
    serverPort: number;
  };
  storage: {
    dataDirWritable: boolean;
    backupsDirWritable: boolean;
  };
  database: {
    exists: boolean;
    integrity: 'ok' | 'failed' | 'untested';
    schemaVersion: string;
    pendingMigrationsCount: number;
  };
  license: {
    status: string;
    isValid: boolean;
    type?: string;
    daysRemaining?: number | null;
  };
}

export class StartupValidator {
  /**
   * Tests if a directory exists and is writable by writing and deleting a temporary probe file
   */
  private static isDirectoryWritable(dirPath: string): boolean {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const probeFile = path.join(dirPath, `.write-probe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      fs.writeFileSync(probeFile, 'probe');
      fs.unlinkSync(probeFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs complete environment validation for on-premise commercial deployment
   */
  public static validate(): StartupValidationReport {
    const config = getAppConfig();
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Storage Directories
    const dataDir = path.dirname(config.sqliteDatabasePath);
    const backupsDir = getSaleFlowBackupDir();

    const dataDirWritable = this.isDirectoryWritable(dataDir);
    if (!dataDirWritable) {
      errors.push(`Data directory "${dataDir}" is not writable. Check file system permissions.`);
    }

    const backupsDirWritable = this.isDirectoryWritable(backupsDir);
    if (!backupsDirWritable) {
      warnings.push(`Backups directory "${backupsDir}" is not writable. Automated snapshots may fail.`);
    }

    // 2. Database Existence and Integrity
    let dbExists = false;
    let integrityStatus: 'ok' | 'failed' | 'untested' = 'untested';
    let schemaVersion = 'unknown';
    let pendingMigrationsCount = 0;

    if (config.databaseDriver === 'sqlite') {
      dbExists = fs.existsSync(config.sqliteDatabasePath);
      if (dbExists) {
        try {
          const db = new DatabaseSync(config.sqliteDatabasePath);
          const check = db.prepare('PRAGMA quick_check').get() as { quick_check: string };
          if (check?.quick_check === 'ok') {
            integrityStatus = 'ok';
          } else {
            integrityStatus = 'failed';
            errors.push(`Database integrity check failed: ${check?.quick_check}`);
          }

          schemaVersion = MigrationRunner.getLatestAppliedVersion(db);
          pendingMigrationsCount = MigrationRunner.getPendingMigrations(db).length;
          db.close();

          if (pendingMigrationsCount > 0) {
            warnings.push(`Database has ${pendingMigrationsCount} unapplied migration(s). Run node scripts/onprem-update.mjs to update.`);
          }
        } catch (dbErr: any) {
          integrityStatus = 'failed';
          errors.push(`Failed to open database: ${dbErr.message}`);
        }
      } else {
        warnings.push(`Database file does not exist at ${config.sqliteDatabasePath}. Will be created on first start.`);
      }
    }

    // 3. Commercial Licensing
    let licenseStatus = 'UNLICENSED';
    let licenseValid = true;
    let licenseType = 'TRIAL';
    let daysRemaining: number | null = null;

    try {
      const licenseResult = LicenseService.getActiveLicense();
      licenseStatus = licenseResult.status;
      licenseValid = licenseResult.isValid;
      licenseType = licenseResult.payload?.type || 'TRIAL';
      daysRemaining = licenseResult.daysRemaining;

      if (licenseResult.status === 'EXPIRED') {
        warnings.push('Commercial license subscription has expired. Please renew.');
      } else if (licenseResult.status === 'GRACE_PERIOD') {
        warnings.push(`Commercial license is currently in grace period (${licenseResult.graceDaysRemaining} days remaining).`);
      }
    } catch (licErr: any) {
      warnings.push(`License check warning: ${licErr.message}`);
    }

    const isReady = errors.length === 0;

    return {
      isReady,
      errors,
      warnings,
      environment: {
        appVersion: APP_VERSION,
        deploymentMode: config.deploymentMode,
        databaseDriver: config.databaseDriver,
        serverHost: config.serverHost,
        serverPort: config.serverPort,
      },
      storage: {
        dataDirWritable,
        backupsDirWritable,
      },
      database: {
        exists: dbExists,
        integrity: integrityStatus,
        schemaVersion,
        pendingMigrationsCount,
      },
      license: {
        status: licenseStatus,
        isValid: licenseValid,
        type: licenseType,
        daysRemaining,
      },
    };
  }
}
