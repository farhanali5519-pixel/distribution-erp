import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getDatabase, getDatabasePath } from '@/core/database/db';
import { getDatabaseClient } from '@/core/database/factory';
import { isCloudMode, isPostgresDriver } from '@/core/config/env';
import { generateUUID } from '@/shared/utils/uuid';
import { LicenseService } from '@/core/licensing/license.service';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { buildSessionPayload, createSessionCookieHeader } from '@/core/auth/session';
import { appLog } from '@/core/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/setup
 * Checks if first-run setup is required and returns machine fingerprint.
 */
export async function GET() {
  try {
    appLog.info('SETUP', 'Checking first-run setup status');
    const isCloud = isCloudMode() || isPostgresDriver();
    let setupRequired = false;
    if (isCloud) {
      try {
        const client = getDatabaseClient();
        const userRow = await client.queryOne<{ count: number }>("SELECT count(*) as count FROM app_users WHERE is_active = 1 AND role = 'ADMIN'");
        setupRequired = !userRow || Number(userRow.count) === 0;
      } catch {
        setupRequired = false;
      }
    } else {
      const db = getDatabase();
      const userRow = db.prepare("SELECT count(*) as count FROM app_users WHERE is_active = 1 AND role = 'ADMIN'").get() as { count: number } | undefined;
      setupRequired = !userRow || userRow.count === 0;
    }
    const machineFingerprint = LicenseService.generateMachineFingerprint();
    const dbPath = isCloud ? 'cloud-postgres' : getDatabasePath();

    appLog.info('SETUP', `First-run setup check complete. setupRequired=${setupRequired}`, {
      setupRequired,
      dbPath,
    });

    return NextResponse.json({
      success: true,
      setupRequired,
      machineFingerprint,
      dbPath,
    });
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to check setup status';
    appLog.error('SETUP', `Setup status check failed: ${errorMsg}`, error);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setup
 * Completes first-run initialization for new customer installation.
 */
export async function POST(req: NextRequest) {
  try {
    const isCloud = isCloudMode() || isPostgresDriver();
    if (isCloud) {
      return NextResponse.json(
        {
          success: false,
          error: 'Setup via UI is disabled in cloud mode. Cloud instances are provisioned automatically.',
          message: 'Cloud instance already provisioned.',
        },
        { status: 403 }
      );
    }
    const db = getDatabase();
    const userRow = db.prepare("SELECT count(*) as count FROM app_users WHERE is_active = 1 AND role = 'ADMIN'").get() as { count: number } | undefined;
    if (userRow && userRow.count > 0) {
      appLog.warn('SETUP', 'Rejected setup attempt: Administrator account already exists');
      return NextResponse.json(
        {
          success: false,
          error: 'Setup is already completed. Administrator account already exists.',
          message: 'Setup is already completed. Administrator account already exists.',
        },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON request payload.',
          message: 'Invalid JSON request payload.',
        },
        { status: 400 }
      );
    }

    const { companyName, adminUsername, adminPassword, adminPin, licenseKey } = body || {};

    // Validate Company Name
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Business name must be at least 2 characters.',
          message: 'Business name must be at least 2 characters.',
        },
        { status: 400 }
      );
    }

    // Validate Admin Username
    if (!adminUsername || typeof adminUsername !== 'string' || adminUsername.trim().length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: 'Administrator username must be at least 3 characters.',
          message: 'Administrator username must be at least 3 characters.',
        },
        { status: 400 }
      );
    }

    // Validate Admin Password (must be at least 8 characters)
    if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Administrator password must be at least 8 characters.',
          message: 'Administrator password must be at least 8 characters.',
        },
        { status: 400 }
      );
    }

    // Validate 4-digit Security PIN
    if (!adminPin || typeof adminPin !== 'string' || !/^\d{4}$/.test(adminPin.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Security PIN must be exactly 4 numeric digits.',
          message: 'Security PIN must be exactly 4 numeric digits.',
        },
        { status: 400 }
      );
    }

    const trimmedCompany = companyName.trim();
    const trimmedUsername = adminUsername.trim().toLowerCase();
    const trimmedPin = adminPin.trim();

    appLog.info('SETUP', `Initializing first-run customer setup for: ${trimmedCompany}`, {
      companyName: trimmedCompany,
      adminUsername: trimmedUsername,
    });

    // 1. Update company record and company profile
    db.prepare(`
      UPDATE companies 
      SET name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(trimmedCompany, DEFAULT_COMPANY_ID);

    db.prepare(`
      UPDATE company_profile
      SET business_name = ?, updated_at = datetime('now')
      WHERE id = 'default-company-profile'
    `).run(trimmedCompany);

    // 2. Hash password and PIN with application salts
    const passwordHash = crypto.createHash('sha256').update('saleflow_user_salt_' + adminPassword).digest('hex');
    const pinHash = crypto.createHash('sha256').update('saleflow_admin_pin_' + trimmedPin).digest('hex');

    // 3. Store Security PIN in app_settings
    db.prepare(`
      INSERT OR REPLACE INTO app_settings (company_id, key, value, description, updated_at)
      VALUES (?, 'admin_security_pin', ?, 'Hashed 4-digit security PIN for void authorization', datetime('now'))
    `).run(DEFAULT_COMPANY_ID, pinHash);

    // 4. Create initial Administrator user
    const userId = generateUUID();
    db.prepare(`
      INSERT INTO app_users (id, company_id, username, password_hash, full_name, role, staff_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'System Administrator', 'ADMIN', NULL, 1, datetime('now'), datetime('now'))
    `).run(userId, DEFAULT_COMPANY_ID, trimmedUsername, passwordHash);

    // 5. Activate License if provided
    let licenseStatus = 'EVALUATION';
    if (licenseKey && typeof licenseKey === 'string' && licenseKey.trim().length > 0) {
      try {
        const licenseResult = LicenseService.installLicense(licenseKey.trim(), DEFAULT_COMPANY_ID);
        licenseStatus = licenseResult.status;
        appLog.info('SETUP', `Commercial license activated successfully with status: ${licenseStatus}`);
      } catch (err: any) {
        appLog.error('SETUP', `License activation failed: ${err.message}`, err);
        return NextResponse.json(
          {
            success: false,
            error: `Administrator created, but license activation failed: ${err.message}`,
            message: `Administrator created, but license activation failed: ${err.message}`,
          },
          { status: 400 }
        );
      }
    } else {
      appLog.info('SETUP', 'No commercial license provided; starting in 14-day evaluation mode');
    }

    // 6. Create authenticated session cookie
    const sessionPayload = buildSessionPayload({
      userId,
      companyId: DEFAULT_COMPANY_ID,
      role: 'ADMIN',
      username: trimmedUsername,
      fullName: 'System Administrator',
    });
    const cookieHeader = createSessionCookieHeader(sessionPayload);

    appLog.info('SETUP', 'First-run setup completed successfully. Administrator account created.');

    const res = NextResponse.json({
      success: true,
      message: 'SaleFlow ERP setup completed successfully.',
      licenseStatus,
      redirectUrl: '/',
    });

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (error: any) {
    const errorMsg = error?.message || 'Setup initialization failed';
    appLog.error('SETUP', `Setup initialization failed: ${errorMsg}`, error);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}
