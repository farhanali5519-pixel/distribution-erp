import crypto from 'node:crypto';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import {
  buildSuperAdminSessionPayload,
  createSuperAdminCookieHeader,
  SuperAdminAuthError,
  SuperAdminSessionData,
  sign2faChallengeToken,
  verify2faChallengeToken,
} from './superadmin-session';
import { TwoFactorService, TwoFactorPolicy, PlatformUserSecurityProfile } from './two-factor.service';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';
import { RateLimiter } from '@/core/security/rate-limiter';

const PASSWORD_SALT = 'saleflow_user_salt_';

export interface PlatformUserRecord {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR';
  is_active: number;
  totp_secret?: string | null;
  totp_enabled: number;
  email_otp_enabled: number;
  recovery_codes_hash?: string | null;
  two_factor_policy: TwoFactorPolicy;
  last_2fa_at?: string | null;
  failed_login_attempts: number;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
}

export type LoginInitiationResult =
  | {
      requires2FA: false;
      session: SuperAdminSessionData;
      cookieHeader: string;
    }
  | {
      requires2FA: true;
      challengeToken: string;
      allowedMethods: ('totp' | 'email_otp' | 'recovery_code')[];
      maskedEmail?: string;
      username: string;
    };

export class SuperAdminService {
  /**
   * Hashes plain password for platform user.
   */
  public static hashPassword(password: string): string {
    return crypto.createHash('sha256').update(PASSWORD_SALT + password).digest('hex');
  }

  /**
   * Verifies plain password against stored hash with constant-time comparison.
   */
  public static verifyPassword(password: string, hash: string): boolean {
    if (!password || !hash) return false;
    const computed = this.hashPassword(password);
    const computedBuf = Buffer.from(computed);
    const hashBuf = Buffer.from(hash);
    if (computedBuf.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, hashBuf);
  }

  /**
   * Masks email address for secure 2FA prompts: "f***@saleflow.space"
   */
  public static maskEmail(email?: string): string | undefined {
    if (!email) return undefined;
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [name, domain] = parts;
    const maskedName = name.length <= 2 ? name[0] + '***' : name[0] + '***' + name[name.length - 1];
    return `${maskedName}@${domain}`;
  }

  /**
   * STEP 1: Verifies Super Admin credentials and determines if 2FA verification is required.
   */
  public static async initiateLogin(
    username: string,
    password: string,
    clientIp?: string
  ): Promise<LoginInitiationResult> {
    if (!username || !password) {
      throw new SuperAdminAuthError('Username and password are required', 400);
    }

    const cleanUsername = username.trim().toLowerCase();
    const rateLimitKey = `superadmin:login:${cleanUsername}`;
    const limit = RateLimiter.checkLimit(rateLimitKey, 5, 15 * 60 * 1000);

    if (!limit.isAllowed) {
      const waitMin = Math.ceil(limit.resetMs / 60000);
      throw new SuperAdminAuthError(
        `Too many failed attempts. Temporary lockout active. Please try again in ${waitMin} minute(s).`,
        429
      );
    }

    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>(
      `SELECT * FROM platform_users WHERE LOWER(username) = ?`,
      [cleanUsername]
    );

    // Generic error response to prevent user enumeration
    if (!user) {
      RateLimiter.recordFailedAttempt(rateLimitKey);
      await SuperAdminAuditService.log({
        actor: cleanUsername,
        action: 'SUPERADMIN_LOGIN_FAILED',
        ip: clientIp,
        reason: 'Invalid platform credentials (user not found)',
      });
      throw new SuperAdminAuthError('Invalid platform administrator credentials', 401);
    }

    if (user.is_active !== 1) {
      throw new SuperAdminAuthError('Platform administrator account is suspended or inactive', 403);
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const waitMin = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new SuperAdminAuthError(
        `Account is temporarily locked due to multiple failed attempts. Please wait ${waitMin} minute(s).`,
        429
      );
    }

    // Verify password
    if (!this.verifyPassword(password, user.password_hash)) {
      RateLimiter.recordFailedAttempt(rateLimitKey);
      const attempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil: string | null = null;
      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min lock
      }

      await client.execute(
        `UPDATE platform_users SET failed_login_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`,
        [attempts, lockedUntil, user.id]
      );

      await SuperAdminAuditService.log({
        actor: user.username,
        action: 'SUPERADMIN_LOGIN_FAILED',
        target: user.username,
        ip: clientIp,
        reason: `Invalid password (Attempt ${attempts})`,
      });

      throw new SuperAdminAuthError('Invalid platform administrator credentials', 401);
    }

    // Password verified! Reset failed attempts & clear rate limiter
    RateLimiter.clearAttempts(rateLimitKey);
    await client.execute(
      `UPDATE platform_users SET failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`,
      [user.id]
    );

    const securityProfile: PlatformUserSecurityProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      totp_secret: user.totp_secret,
      totp_enabled: user.totp_enabled,
      email_otp_enabled: user.email_otp_enabled,
      recovery_codes_hash: user.recovery_codes_hash,
      two_factor_policy: user.two_factor_policy,
      last_2fa_at: user.last_2fa_at,
    };

    const requires2FA = TwoFactorService.is2faRequired(securityProfile);

    if (requires2FA) {
      const allowedMethods = TwoFactorService.getAvailableMethods(securityProfile);
      const challengeToken = sign2faChallengeToken({
        userId: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      });

      return {
        requires2FA: true,
        challengeToken,
        allowedMethods,
        maskedEmail: this.maskEmail(user.email),
        username: user.username,
      };
    }

    // Direct Login without 2FA
    const session = buildSuperAdminSessionPayload({
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    });

    const cookieHeader = createSuperAdminCookieHeader(session);

    await SuperAdminAuditService.log({
      actor: user.username,
      action: 'SUPERADMIN_LOGIN',
      target: user.username,
      ip: clientIp,
      reason: 'Successful direct authentication',
    });

    return {
      requires2FA: false,
      session,
      cookieHeader,
    };
  }

  /**
   * STEP 2: Verifies 2FA factor (TOTP / Email OTP / Recovery Code) and creates authenticated session.
   */
  public static async verify2faAndLogin(
    challengeToken: string,
    method: 'totp' | 'email_otp' | 'recovery_code',
    code: string,
    clientIp?: string
  ): Promise<{ session: SuperAdminSessionData; cookieHeader: string }> {
    const payload = verify2faChallengeToken(challengeToken);
    if (!payload) {
      throw new SuperAdminAuthError('Authentication challenge expired or invalid. Please log in again.', 401);
    }

    const cleanCode = code?.trim();
    if (!cleanCode) {
      throw new SuperAdminAuthError('Verification code is required.', 400);
    }

    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>(
      `SELECT * FROM platform_users WHERE id = ?`,
      [payload.userId]
    );

    if (!user || user.is_active !== 1) {
      throw new SuperAdminAuthError('Platform administrator account is suspended or inactive.', 403);
    }

    let isSuccess = false;

    if (method === 'totp') {
      if (!user.totp_secret) {
        throw new SuperAdminAuthError('Authenticator app is not configured for this account.', 400);
      }
      isSuccess = TwoFactorService.verifyTotpToken(user.totp_secret, cleanCode);
      if (!isSuccess) {
        await SuperAdminAuditService.log({
          actor: user.username,
          action: 'SUPERADMIN_LOGIN_FAILED',
          ip: clientIp,
          reason: 'Invalid 6-digit Authenticator TOTP code',
        });
        throw new SuperAdminAuthError('Invalid 6-digit Authenticator code. Please check your app.', 401);
      }
    } else if (method === 'email_otp') {
      const verifyRes = await TwoFactorService.verifyEmailOtp(user.id, cleanCode, 'SUPERADMIN_LOGIN');
      if (!verifyRes.valid) {
        await SuperAdminAuditService.log({
          actor: user.username,
          action: 'SUPERADMIN_LOGIN_FAILED',
          ip: clientIp,
          reason: `Invalid Email OTP: ${verifyRes.error}`,
        });
        throw new SuperAdminAuthError(verifyRes.error || 'Invalid verification code.', 401);
      }
      isSuccess = true;
    } else if (method === 'recovery_code') {
      isSuccess = await TwoFactorService.verifyAndConsumeRecoveryCode(user.id, cleanCode);
      if (!isSuccess) {
        await SuperAdminAuditService.log({
          actor: user.username,
          action: 'SUPERADMIN_LOGIN_FAILED',
          ip: clientIp,
          reason: 'Invalid or already-used recovery code',
        });
        throw new SuperAdminAuthError('Invalid or already-used recovery code.', 401);
      }
    } else {
      throw new SuperAdminAuthError('Unsupported 2FA method.', 400);
    }

    // 2FA Verified! Record last 2fa timestamp
    const now = new Date().toISOString();
    await client.execute(
      `UPDATE platform_users SET last_2fa_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, user.id]
    );

    const session = buildSuperAdminSessionPayload({
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    });

    const cookieHeader = createSuperAdminCookieHeader(session);

    await SuperAdminAuditService.log({
      actor: user.username,
      action: 'SUPERADMIN_LOGIN',
      target: user.username,
      ip: clientIp,
      reason: `Successful 2FA authentication via ${method.toUpperCase()}`,
      metadata: { method },
    });

    return { session, cookieHeader };
  }

  /**
   * Backward-compatible direct authentication (supports CLI scripts and testing)
   */
  public static async authenticate(
    username: string,
    password: string
  ): Promise<{ session: SuperAdminSessionData; cookieHeader: string }> {
    const res = await this.initiateLogin(username, password);
    if (res.requires2FA) {
      throw new SuperAdminAuthError('Two-factor authentication required for this account.', 403);
    }
    return { session: res.session, cookieHeader: res.cookieHeader };
  }

  /**
   * Retrieves platform user security profile by ID
   */
  public static async getPlatformUserById(id: string): Promise<Omit<PlatformUserRecord, 'password_hash'> | null> {
    const client = getDatabaseClient();
    const user = await client.queryOne<Omit<PlatformUserRecord, 'password_hash'>>(
      `SELECT id, username, full_name, email, phone, role, is_active, totp_enabled, email_otp_enabled,
              two_factor_policy, last_2fa_at, failed_login_attempts, created_at, updated_at
       FROM platform_users 
       WHERE id = ?`,
      [id]
    );
    return user || null;
  }

  /**
   * Prepares TOTP setup details for a Super Admin (returns manual key, secret, and QR SVG data URL)
   */
  public static async setupTotp(userId: string) {
    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>(
      'SELECT id, username, totp_secret FROM platform_users WHERE id = ?',
      [userId]
    );
    if (!user) throw new Error('Platform user not found');

    return TwoFactorService.getTotpSetupDetails(user.username, user.totp_secret || undefined);
  }

  /**
   * Confirms TOTP setup by verifying the first 6-digit code and activates Authenticator 2FA.
   * Generates and returns 8 one-time recovery codes.
   */
  public static async enableTotp(
    userId: string,
    secret: string,
    verificationCode: string,
    clientIp?: string
  ): Promise<{ success: boolean; recoveryCodes: string[] }> {
    if (!TwoFactorService.verifyTotpToken(secret, verificationCode)) {
      throw new Error('Invalid verification code. Please ensure code matches your Authenticator app.');
    }

    const { plainCodes, hashedCodes } = TwoFactorService.generateRecoveryCodes(8);
    const client = getDatabaseClient();
    const now = new Date().toISOString();

    await client.execute(
      `UPDATE platform_users 
       SET totp_secret = ?, totp_enabled = 1, recovery_codes_hash = ?, last_2fa_at = ?, updated_at = ?
       WHERE id = ?`,
      [secret, JSON.stringify(hashedCodes), now, now, userId]
    );

    const user = await client.queryOne<PlatformUserRecord>('SELECT username FROM platform_users WHERE id = ?', [userId]);

    await SuperAdminAuditService.log({
      actor: user?.username || userId,
      action: '2FA_ENABLED',
      target: user?.username || userId,
      ip: clientIp,
      reason: 'Google Authenticator / TOTP 2FA enabled',
    });

    return { success: true, recoveryCodes: plainCodes };
  }

  /**
   * Disables TOTP 2FA after verifying the user's current password.
   */
  public static async disableTotp(userId: string, currentPassword: string, clientIp?: string): Promise<boolean> {
    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>('SELECT * FROM platform_users WHERE id = ?', [userId]);

    if (!user) throw new Error('User not found');
    if (!this.verifyPassword(currentPassword, user.password_hash)) {
      throw new Error('Incorrect password verification');
    }

    const now = new Date().toISOString();
    await client.execute(
      `UPDATE platform_users 
       SET totp_enabled = 0, totp_secret = NULL, recovery_codes_hash = NULL, updated_at = ?
       WHERE id = ?`,
      [now, userId]
    );

    await SuperAdminAuditService.log({
      actor: user.username,
      action: '2FA_DISABLED',
      target: user.username,
      ip: clientIp,
      reason: 'Google Authenticator / TOTP 2FA disabled',
    });

    return true;
  }

  /**
   * Regenerates recovery codes after verifying user's current password.
   */
  public static async regenerateRecoveryCodes(
    userId: string,
    currentPassword: string,
    clientIp?: string
  ): Promise<{ recoveryCodes: string[] }> {
    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>('SELECT * FROM platform_users WHERE id = ?', [userId]);

    if (!user) throw new Error('User not found');
    if (!this.verifyPassword(currentPassword, user.password_hash)) {
      throw new Error('Incorrect password verification');
    }

    const { plainCodes, hashedCodes } = TwoFactorService.generateRecoveryCodes(8);
    const now = new Date().toISOString();

    await client.execute(
      `UPDATE platform_users SET recovery_codes_hash = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(hashedCodes), now, userId]
    );

    await SuperAdminAuditService.log({
      actor: user.username,
      action: 'RECOVERY_CODES_REGENERATED',
      target: user.username,
      ip: clientIp,
      reason: 'Regenerated 8 one-time emergency recovery codes',
    });

    return { recoveryCodes: plainCodes };
  }

  /**
   * Updates platform 2FA policy
   */
  public static async update2faPolicy(
    userId: string,
    policy: TwoFactorPolicy,
    clientIp?: string
  ): Promise<boolean> {
    const client = getDatabaseClient();
    const now = new Date().toISOString();
    await client.execute(
      `UPDATE platform_users SET two_factor_policy = ?, updated_at = ? WHERE id = ?`,
      [policy, now, userId]
    );

    const user = await client.queryOne<PlatformUserRecord>('SELECT username FROM platform_users WHERE id = ?', [userId]);

    await SuperAdminAuditService.log({
      actor: user?.username || userId,
      action: '2FA_POLICY_CHANGED',
      target: user?.username || userId,
      ip: clientIp,
      reason: `2FA security policy set to ${policy}`,
      metadata: { policy },
    });

    return true;
  }

  /**
   * Requests an email OTP given a signed 2FA challenge token.
   */
  public static async requestEmailOtp(
    challengeToken: string,
    clientIp?: string
  ): Promise<{ maskedEmail: string; resendCooldownSeconds: number }> {
    const payload = verify2faChallengeToken(challengeToken);
    if (!payload) {
      throw new SuperAdminAuthError('Authentication challenge expired or invalid. Please log in again.', 401);
    }

    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>(
      'SELECT id, username, email FROM platform_users WHERE id = ?',
      [payload.userId]
    );

    if (!user || !user.email) {
      throw new SuperAdminAuthError('Super Admin user does not have a verified email configured.', 400);
    }

    const res = await TwoFactorService.generateAndSendEmailOtp(user.id, user.email, 'SUPERADMIN_LOGIN');
    if (!res.success) {
      throw new SuperAdminAuthError(res.error || 'Failed to dispatch email verification code.', 400);
    }

    return {
      maskedEmail: this.maskEmail(user.email) || user.email,
      resendCooldownSeconds: res.resendCooldownSeconds || 60,
    };
  }

  /**
   * Gets the security and 2FA profile for a platform user.
   */
  public static async getSecurityProfile(userId: string): Promise<PlatformUserSecurityProfile> {
    const client = getDatabaseClient();
    const user = await client.queryOne<PlatformUserRecord>(
      'SELECT id, username, email, totp_secret, totp_enabled, email_otp_enabled, recovery_codes_hash, two_factor_policy, last_2fa_at FROM platform_users WHERE id = ?',
      [userId]
    );

    if (!user) throw new Error('User not found');

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      totp_secret: user.totp_secret,
      totp_enabled: user.totp_enabled,
      totpEnabled: user.totp_enabled === 1,
      email_otp_enabled: user.email_otp_enabled,
      emailOtpEnabled: user.email_otp_enabled === 1,
      recovery_codes_hash: user.recovery_codes_hash,
      hasRecoveryCodes: Boolean(user.recovery_codes_hash && user.recovery_codes_hash !== '[]'),
      two_factor_policy: user.two_factor_policy,
      twoFactorPolicy: user.two_factor_policy,
      last_2fa_at: user.last_2fa_at,
      last2faAt: user.last_2fa_at,
    };
  }

  /**
   * Bootstraps or updates initial platform super administrator account.
   */
  public static async bootstrapInitialSuperAdmin(params: {
    username?: string;
    password: string;
    fullName?: string;
    email?: string;
  }): Promise<{ id: string; username: string; isNew: boolean }> {
    const cleanUsername = (params.username || 'superadmin').trim().toLowerCase();
    const password = params.password?.trim();

    if (!password || password.length < 8) {
      throw new Error('Super administrator password must be at least 8 characters long.');
    }

    const client = getDatabaseClient();
    const existing = await client.queryOne<{ id: string; username: string }>(
      'SELECT id, username FROM platform_users WHERE LOWER(username) = ?',
      [cleanUsername]
    );

    const passwordHash = this.hashPassword(password);
    const fullName = params.fullName?.trim() || 'Platform Super Administrator';
    const email = params.email?.trim() || `${cleanUsername}@salesflow.space`;
    const now = new Date().toISOString();

    if (existing) {
      await client.execute(
        `UPDATE platform_users 
         SET password_hash = ?, full_name = ?, email = ?, is_active = 1, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
         WHERE id = ?`,
        [passwordHash, fullName, email, now, existing.id]
      );

      return { id: existing.id, username: existing.username, isNew: false };
    } else {
      const id = generateUUID();
      await client.execute(
        `INSERT INTO platform_users (id, username, password_hash, full_name, email, role, is_active, two_factor_policy, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'SUPER_ADMIN', 1, 'OPTIONAL', ?, ?)`,
        [id, cleanUsername, passwordHash, fullName, email, now, now]
      );

      return { id, username: cleanUsername, isNew: true };
    }
  }
}
