import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { getSaleFlowConfigDir, getSaleFlowDataDir, isCloudMode, isPostgresDriver } from '@/core/config/env';
import { getPlatformPublicKey } from './keys';
import { 
  LicensePayload, 
  LicenseStatus, 
  LicenseValidationResult, 
  SystemLicenseRecord 
} from './types';
import { appLog } from '@/core/logging/logger';

export const DEFAULT_GRACE_PERIOD_DAYS = 14;

export class LicenseService {
  /**
   * Generates a deterministic SHA-256 machine/install fingerprint.
   * Based on system network MAC addresses, hostname, platform, and architecture.
   */
  public static generateMachineFingerprint(): string {
    try {
      const interfaces = os.networkInterfaces();
      const macs: string[] = [];

      for (const name of Object.keys(interfaces)) {
        const ifaceList = interfaces[name];
        if (ifaceList) {
          for (const iface of ifaceList) {
            if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
              macs.push(iface.mac.toLowerCase());
            }
          }
        }
      }

      macs.sort();
      const hostname = os.hostname() || 'localhost';
      const platform = os.platform() || 'win32';
      const arch = os.arch() || 'x64';
      const rawFingerprint = `${hostname}|${platform}|${arch}|${macs.join(',')}`;
      const fingerprint = crypto.createHash('sha256').update(rawFingerprint).digest('hex').slice(0, 32);
      appLog.info('FINGERPRINT', `Resolved host machine fingerprint: ${fingerprint.slice(0, 8)}...`);
      return fingerprint;
    } catch (err: any) {
      appLog.error('FINGERPRINT', 'Failed calculating hardware fingerprint, using fallback', err);
      return crypto.createHash('sha256').update(`${os.hostname()}|${os.platform()}|${os.arch()}`).digest('hex').slice(0, 32);
    }
  }

  /**
   * Encodes string to URL-safe base64
   */
  private static toBase64Url(data: string): string {
    return Buffer.from(data, 'utf8').toString('base64url');
  }

  /**
   * Decodes URL-safe base64 to string
   */
  private static fromBase64Url(b64url: string): string {
    return Buffer.from(b64url, 'base64url').toString('utf8');
  }

  /**
   * Issues a signed commercial license key using an Ed25519 Private Key.
   * 
   * SECURITY RULE:
   * Only the software owner/distributor holding the Ed25519 Private Key can issue licenses.
   * Customer application runtime does NOT have the private key and will reject issuance.
   */
  public static issueLicense(params: {
    companyName: string;
    companySlug?: string;
    type: 'PERPETUAL' | 'SUBSCRIPTION' | 'TRIAL';
    expiresAt?: string | null;
    maxUsers?: number;
    maxWarehouses?: number;
    enabledModules?: string[];
    enabledFeatures?: string[];
    machineId?: string;
    issuer?: string;
    privateKey?: string;
  }): { licenseKey: string; payload: LicensePayload } {
    const privateKey = params.privateKey?.trim() || process.env.PLATFORM_LICENSE_PRIVATE_KEY?.trim();

    if (!privateKey) {
      throw new Error(
        'License issuance rejected: Private key not available in customer runtime. Commercial licenses must be signed using the offline vendor tool (scripts/license-tool.mjs).'
      );
    }

    const payload: LicensePayload = {
      licenseId: `LIC-${generateUUID().slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      companyName: params.companyName.trim(),
      companySlug: params.companySlug?.trim(),
      type: params.type,
      issuedAt: new Date().toISOString(),
      expiresAt: params.type === 'PERPETUAL' ? null : (params.expiresAt || null),
      maxUsers: params.maxUsers || 10,
      maxWarehouses: params.maxWarehouses || 1,
      enabledModules: params.enabledModules || [
        'sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings'
      ],
      enabledFeatures: params.enabledFeatures || [],
      machineId: params.machineId?.trim() || '*',
      issuer: params.issuer || 'SaleFlow Commercial Platform',
    };

    const payloadJson = JSON.stringify(payload);
    const encodedPayload = this.toBase64Url(payloadJson);

    // Asymmetric Ed25519 digital signature
    const signature = crypto.sign(null, Buffer.from(encodedPayload, 'utf8'), privateKey).toString('base64url');
    const licenseKey = `${encodedPayload}.${signature}`;

    return { licenseKey, payload };
  }

  /**
   * Verifies an asymmetrically signed commercial license key using the Ed25519 Public Key.
   */
  public static verifyLicense(licenseKey: string, checkMachineId: boolean = true): LicenseValidationResult {
    if (!licenseKey || typeof licenseKey !== 'string') {
      return {
        status: 'INVALID',
        isValid: false,
        message: 'No license key provided.',
        payload: null,
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches: false,
      };
    }

    const parts = licenseKey.trim().split('.');
    if (parts.length !== 2) {
      return {
        status: 'INVALID',
        isValid: false,
        message: 'Malformed license key format.',
        payload: null,
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches: false,
      };
    }

    const [encodedPayload, providedSignature] = parts;
    const publicKey = getPlatformPublicKey();

    // Verify digital signature using Ed25519 public key
    try {
      const payloadBuf = Buffer.from(encodedPayload, 'utf8');
      const sigBuf = Buffer.from(providedSignature, 'base64url');
      const isVerified = crypto.verify(null, payloadBuf, publicKey, sigBuf);

      if (!isVerified) {
        return {
          status: 'INVALID',
          isValid: false,
          message: 'Cryptographic digital signature mismatch. License is unauthorized or has been tampered with.',
          payload: null,
          daysRemaining: null,
          isGracePeriod: false,
          machineIdMatches: false,
        };
      }
    } catch {
      return {
        status: 'INVALID',
        isValid: false,
        message: 'Cryptographic signature verification failed.',
        payload: null,
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches: false,
      };
    }

    let payload: LicensePayload;
    try {
      payload = JSON.parse(this.fromBase64Url(encodedPayload)) as LicensePayload;
    } catch {
      return {
        status: 'INVALID',
        isValid: false,
        message: 'Failed to decode license payload.',
        payload: null,
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches: false,
      };
    }

    // Hardware machine fingerprint check
    const currentMachineId = this.generateMachineFingerprint();
    let machineIdMatches = true;
    if (checkMachineId && payload.machineId && payload.machineId !== '*') {
      if (payload.machineId.toLowerCase() !== currentMachineId.toLowerCase()) {
        machineIdMatches = false;
        return {
          status: 'INVALID',
          isValid: false,
          message: `Hardware binding mismatch. License is registered to machine ${payload.machineId}.`,
          payload,
          daysRemaining: null,
          isGracePeriod: false,
          machineIdMatches: false,
        };
      }
    }

    // Expiry Check
    if (payload.type === 'PERPETUAL' || !payload.expiresAt) {
      return {
        status: 'VALID',
        isValid: true,
        message: 'Perpetual commercial license is active.',
        payload,
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches,
      };
    }

    const now = Date.now();
    const expiryTime = new Date(payload.expiresAt).getTime();
    const diffMs = expiryTime - now;
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining >= 0) {
      return {
        status: 'VALID',
        isValid: true,
        message: `License is active (${daysRemaining} days remaining).`,
        payload,
        daysRemaining,
        isGracePeriod: false,
        machineIdMatches,
      };
    }

    // Past expiry - Check Grace Period
    const daysOverdue = Math.abs(daysRemaining);
    if (daysOverdue <= DEFAULT_GRACE_PERIOD_DAYS) {
      const graceDaysLeft = DEFAULT_GRACE_PERIOD_DAYS - daysOverdue;
      return {
        status: 'GRACE_PERIOD',
        isValid: true, // Functional during grace period
        message: `Subscription expired on ${payload.expiresAt}. In grace period (${graceDaysLeft} days remaining).`,
        payload,
        daysRemaining: 0,
        graceDaysRemaining: graceDaysLeft,
        isGracePeriod: true,
        machineIdMatches,
      };
    }

    return {
      status: 'EXPIRED',
      isValid: false,
      message: `Commercial license expired on ${payload.expiresAt}. Please renew subscription.`,
      payload,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      isGracePeriod: false,
      machineIdMatches,
    };
  }

  /**
   * Installs or updates a license key in the system database.
   */
  public static installLicense(licenseKey: string, companyId: string = DEFAULT_COMPANY_ID): LicenseValidationResult {
    const validation = this.verifyLicense(licenseKey);
    if (!validation.isValid && validation.status !== 'GRACE_PERIOD') {
      throw new Error(`License installation rejected: ${validation.message}`);
    }

    const payload = validation.payload!;
    const db = getDatabase();

    // Ensure system_license table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_license (
          id TEXT PRIMARY KEY,
          company_id TEXT,
          license_key TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          signature TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'VALID',
          installed_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_verified_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const parts = licenseKey.trim().split('.');
    const signature = parts[1];
    const payloadJson = JSON.stringify(payload);

    // Save or update license record
    const existing = db.prepare('SELECT id FROM system_license WHERE company_id = ?').get(companyId) as any;
    if (existing) {
      db.prepare(`
        UPDATE system_license 
        SET license_key = ?, payload_json = ?, signature = ?, status = ?, last_verified_at = datetime('now')
        WHERE id = ?
      `).run(licenseKey.trim(), payloadJson, signature, validation.status, existing.id);
    } else {
      const newId = generateUUID();
      db.prepare(`
        INSERT INTO system_license (id, company_id, license_key, payload_json, signature, status, installed_at, last_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(newId, companyId, licenseKey.trim(), payloadJson, signature, validation.status);
    }

    // Update company plan and limits
    try {
      db.prepare(`
        UPDATE companies
        SET plan = ?, max_users = ?, subscription_ends_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.type, payload.maxUsers, payload.expiresAt || null, companyId);
    } catch (e) {
      console.warn('Failed to update company plan limits:', e);
    }

    // Persist a protected backup copy of license.key to persistent config dir
    try {
      const configDir = getSaleFlowConfigDir();
      const persistentKeyPath = path.join(configDir, 'license.key');
      fs.writeFileSync(persistentKeyPath, licenseKey.trim(), 'utf8');
    } catch (e) {
      console.warn('Failed to persist license.key to config dir:', e);
    }

    return validation;
  }

  /**
   * Returns active license status for a company.
   * If unlicensed, returns safe evaluation defaults (never crashes).
   */
  public static getActiveLicense(companyId: string = DEFAULT_COMPANY_ID): LicenseValidationResult {
    if (isCloudMode() || isPostgresDriver()) {
      return {
        status: 'VALID',
        isValid: true,
        message: 'Cloud Multi-Tenant SaaS License Active.',
        payload: {
          licenseId: 'cloud-saas-enterprise',
          companyName: 'Cloud SaaS Enterprise',
          type: 'PERPETUAL',
          maxUsers: 9999,
          enabledModules: ['*'],
          issuedAt: new Date().toISOString(),
          expiresAt: null,
          machineId: '*',
          issuer: 'SaleFlow Cloud',
        },
        daysRemaining: null,
        isGracePeriod: false,
        machineIdMatches: true,
      };
    }

    const db = getDatabase();

    try {
      // Check database license
      const row = db.prepare(`
        SELECT license_key FROM system_license 
        WHERE company_id = ? OR company_id IS NULL
        ORDER BY installed_at DESC LIMIT 1
      `).get(companyId) as { license_key: string } | undefined;

      if (row?.license_key) {
        return this.verifyLicense(row.license_key);
      }

      // Check fallback license.key file in persistent config dir, data dir, or root
      const candidatePaths = [
        path.join(getSaleFlowConfigDir(), 'license.key'),
        path.join(getSaleFlowDataDir(), 'license.key'),
        path.join(process.cwd(), 'data', 'license.key'),
      ];

      for (const keyPath of candidatePaths) {
        if (fs.existsSync(keyPath)) {
          const fileKey = fs.readFileSync(keyPath, 'utf8').trim();
          if (fileKey) {
            const result = this.verifyLicense(fileKey);
            if (result.isValid) {
              // Auto-restore into database table
              try {
                this.installLicense(fileKey, companyId);
              } catch {}
              return result;
            }
          }
        }
      }
    } catch {
      // Database or table not ready yet
    }

    // Safe Evaluation Fallback: Free trial / Evaluation mode
    return {
      status: 'UNLICENSED',
      isValid: true, // Functional in evaluation mode
      message: 'Running in On-Premise Evaluation Mode (Unlicensed).',
      payload: {
        licenseId: 'EVALUATION-MODE',
        companyName: 'Evaluation Customer',
        type: 'TRIAL',
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        maxUsers: 5,
        maxWarehouses: 1,
        enabledModules: ['sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings'],
        machineId: '*',
        issuer: 'SaleFlow Builtin Evaluation',
      },
      daysRemaining: 30,
      isGracePeriod: false,
      machineIdMatches: true,
    };
  }

  /**
   * Verifies if a given module is permitted by the active commercial license.
   */
  public static isModuleLicensed(moduleKey: string, companyId: string = DEFAULT_COMPANY_ID): boolean {
    const license = this.getActiveLicense(companyId);
    if (!license.payload || !license.payload.enabledModules) {
      return true; // Default allow if unconfigured
    }
    return license.payload.enabledModules.includes(moduleKey);
  }
}
