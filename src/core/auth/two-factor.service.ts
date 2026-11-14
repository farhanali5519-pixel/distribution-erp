import crypto from 'node:crypto';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { sendEmail } from './email-transport';
import { generateQrDataUrl } from './qr-code';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to RFC 4648 Base32 string (no padding)
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string to Buffer
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s\-_=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export type TwoFactorPolicy = 'OPTIONAL' | 'REQUIRED' | 'AUTHENTICATOR_ONLY' | 'EMAIL_OTP_ONLY' | 'EITHER';

export interface PlatformUserSecurityProfile {
  id: string;
  username: string;
  email?: string;
  totp_secret?: string | null;
  totp_enabled: number | boolean;
  totpEnabled?: boolean;
  email_otp_enabled: number | boolean;
  emailOtpEnabled?: boolean;
  recovery_codes_hash?: string | null;
  hasRecoveryCodes?: boolean;
  two_factor_policy?: TwoFactorPolicy;
  twoFactorPolicy?: TwoFactorPolicy;
  last_2fa_at?: string | null;
  last2faAt?: string | null;
}

export class TwoFactorService {
  /**
   * Generates a new cryptographically secure Base32 TOTP secret (160-bit / 20 bytes)
   */
  public static generateTotpSecret(): string {
    const randomBytes = crypto.randomBytes(20);
    return base32Encode(randomBytes);
  }

  /**
   * Formats a raw Base32 secret into friendly 4-character chunks: "JBSW Y3DP EHPK 3PXP ..."
   */
  public static formatSecretKey(secret: string): string {
    const clean = secret.toUpperCase().replace(/\s/g, '');
    return clean.match(/.{1,4}/g)?.join(' ') || clean;
  }

  /**
   * Generates standard otpauth:// URL for TOTP apps
   */
  public static getTotpUri(username: string, secret: string, issuer = 'SaleFlow'): string {
    const cleanIssuer = encodeURIComponent(issuer.trim());
    const cleanUser = encodeURIComponent(username.trim());
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
    return `otpauth://totp/${cleanIssuer}:${cleanUser}?secret=${cleanSecret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Generates complete TOTP setup payload with pure SVG QR code and formatted manual key
   */
  public static getTotpSetupDetails(username: string, existingSecret?: string) {
    const secret = existingSecret || this.generateTotpSecret();
    const uri = this.getTotpUri(username, secret);
    const formattedKey = this.formatSecretKey(secret);
    const qrDataUrl = generateQrDataUrl(uri, { size: 220, margin: 2 });

    return {
      secret,
      uri,
      formattedKey,
      qrDataUrl,
    };
  }

  /**
   * Generates a 6-digit TOTP code for a specific timestamp (RFC 6238 / RFC 4226)
   */
  public static generateTotpToken(secret: string, timestamp = Date.now(), stepSeconds = 30): string {
    const key = base32Decode(secret);
    const counter = Math.floor(timestamp / 1000 / stepSeconds);

    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binaryCode =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binaryCode % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verifies a submitted 6-digit TOTP code with time-drift tolerance (±1 step = ±30s)
   */
  public static verifyTotpToken(secret: string, token: string, windowSteps = 1): boolean {
    if (!secret || !token) return false;
    const cleanToken = token.trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    const now = Date.now();
    const stepMs = 30 * 1000;

    for (let step = -windowSteps; step <= windowSteps; step++) {
      const candidateTime = now + step * stepMs;
      const expectedToken = this.generateTotpToken(secret, candidateTime);

      const tokenBuf = Buffer.from(cleanToken);
      const expectedBuf = Buffer.from(expectedToken);

      if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // RECOVERY CODES
  // =========================================================================

  /**
   * Generates 8 one-time recovery codes (e.g. "8A4F-29CD-B7E1")
   * Returns plaintext codes for one-time user view, and hashed codes for permanent storage.
   */
  public static generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${part1}-${part2}-${part3}`;

      const hash = crypto.createHash('sha256').update(code).digest('hex');
      plainCodes.push(code);
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Verifies an input recovery code against stored hashed codes for a platform user.
   * If valid, single-use code is immediately consumed and removed from storage.
   */
  public static async verifyAndConsumeRecoveryCode(userId: string, inputCode: string): Promise<boolean> {
    if (!userId || !inputCode) return false;
    const cleanCode = inputCode.trim().toUpperCase();
    const inputHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

    const client = getDatabaseClient();
    const user = await client.queryOne<{ recovery_codes_hash: string | null }>(
      'SELECT recovery_codes_hash FROM platform_users WHERE id = ?',
      [userId]
    );

    if (!user || !user.recovery_codes_hash) return false;

    try {
      const storedHashes: string[] = JSON.parse(user.recovery_codes_hash);
      const matchIndex = storedHashes.findIndex((h) => h === inputHash);

      if (matchIndex === -1) return false;

      // Consume code: remove matching hash from stored list
      storedHashes.splice(matchIndex, 1);
      const updatedJson = JSON.stringify(storedHashes);
      const now = new Date().toISOString();

      await client.execute(
        `UPDATE platform_users 
         SET recovery_codes_hash = ?, last_2fa_at = ?, updated_at = ?
         WHERE id = ?`,
        [updatedJson, now, now, userId]
      );

      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // EMAIL / GMAIL OTP 2FA
  // =========================================================================

  /**
   * Generates a 6-digit numeric OTP, stores the hash with a 5-minute expiry,
   * and emails it to the verified Super Admin.
   * Enforces 60-second cooldown between successive resends.
   */
  public static async generateAndSendEmailOtp(
    userId: string,
    email: string,
    purpose = 'SUPERADMIN_LOGIN'
  ): Promise<{ success: boolean; resendCooldownSeconds: number; error?: string; isTestMode?: boolean }> {
    if (!userId || !email) {
      return { success: false, resendCooldownSeconds: 0, error: 'User ID and email are required.' };
    }

    const client = getDatabaseClient();

    // Check for active token within cooldown (60 seconds)
    const existing = await client.queryOne<{ created_at: string }>(
      `SELECT created_at FROM platform_otp_tokens 
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId, purpose]
    );

    if (existing && existing.created_at) {
      const createdStr = existing.created_at.includes('T')
        ? (existing.created_at.endsWith('Z') ? existing.created_at : existing.created_at + 'Z')
        : existing.created_at.replace(' ', 'T') + 'Z';
      const elapsedMs = Date.now() - new Date(createdStr).getTime();
      const cooldownMs = 60 * 1000;
      if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return {
          success: false,
          resendCooldownSeconds: remainingSec,
          error: `Please wait ${remainingSec} second(s) before requesting a new code.`,
        };
      }
    }

    const now = new Date().toISOString();

    // Invalidate any prior unconsumed tokens for this purpose
    await client.execute(
      `UPDATE platform_otp_tokens 
       SET consumed_at = ? 
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
      [now, userId, purpose]
    );

    // Generate random 6-digit OTP
    const plainOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
    const tokenId = generateUUID();

    // 5 minutes expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await client.execute(
      `INSERT INTO platform_otp_tokens (id, user_id, otp_hash, purpose, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tokenId, userId, otpHash, purpose, expiresAt, now]
    );

    // Dispatch email
    const subject = 'SaleFlow Super Admin — 2FA Verification Code';
    const text = `Your SaleFlow Super Admin verification code is: ${plainOtp}\n\nThis code will expire in 5 minutes. Do not share this code with anyone.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0;">SaleFlow Super Admin</h2>
        <p style="color: #475569; font-size: 15px;">Your two-factor authentication verification code is:</p>
        <div style="padding: 16px; background: #f8fafc; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px dashed #cbd5e1;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; font-family: monospace;">${plainOtp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code expires in <strong>5 minutes</strong>. If you did not attempt to sign in to SaleFlow Super Admin, please review your account security immediately.</p>
      </div>
    `;

    const sendRes = await sendEmail({ to: email, subject, text, html });

    return {
      success: sendRes.success,
      resendCooldownSeconds: 60,
      error: sendRes.error,
      isTestMode: sendRes.isTestMode,
    };
  }

  /**
   * Verifies an input email OTP for a user and purpose.
   * Limits attempts to 3 per token to prevent brute forcing.
   */
  public static async verifyEmailOtp(
    userId: string,
    inputCode: string,
    purpose = 'SUPERADMIN_LOGIN'
  ): Promise<{ valid: boolean; error?: string }> {
    if (!userId || !inputCode) {
      return { valid: false, error: 'User ID and code are required.' };
    }

    const cleanCode = inputCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return { valid: false, error: 'Verification code must be 6 numeric digits.' };
    }

    const client = getDatabaseClient();
    const token = await client.queryOne<{
      id: string;
      otp_hash: string;
      expires_at: string;
      attempts: number;
    }>(
      `SELECT id, otp_hash, expires_at, attempts 
       FROM platform_otp_tokens 
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId, purpose]
    );

    if (!token) {
      return { valid: false, error: 'No active verification code found. Please request a new one.' };
    }

    // Check expiration
    if (new Date(token.expires_at).getTime() < Date.now()) {
      await client.execute(
        `UPDATE platform_otp_tokens SET consumed_at = datetime('now') WHERE id = ?`,
        [token.id]
      );
      return { valid: false, error: 'Verification code has expired. Please request a new one.' };
    }

    // Check attempt limit
    if (token.attempts >= 3) {
      await client.execute(
        `UPDATE platform_otp_tokens SET consumed_at = datetime('now') WHERE id = ?`,
        [token.id]
      );
      return { valid: false, error: 'Maximum attempts exceeded. Please request a new verification code.' };
    }

    const inputHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const inputBuf = Buffer.from(inputHash);
    const storedBuf = Buffer.from(token.otp_hash);

    const isMatch = inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf);

    if (!isMatch) {
      // Increment attempt counter
      await client.execute(
        `UPDATE platform_otp_tokens SET attempts = attempts + 1 WHERE id = ?`,
        [token.id]
      );
      const remaining = 3 - (token.attempts + 1);
      return {
        valid: false,
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code invalidated.'}`,
      };
    }

    // Mark consumed and update user last_2fa_at
    const now = new Date().toISOString();
    await client.execute(
      `UPDATE platform_otp_tokens SET consumed_at = ? WHERE id = ?`,
      [now, token.id]
    );

    await client.execute(
      `UPDATE platform_users SET last_2fa_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, userId]
    );

    return { valid: true };
  }

  // =========================================================================
  // 2FA POLICY & ENFORCEMENT
  // =========================================================================

  /**
   * Determines whether 2FA verification is required before granting session access.
   */
  public static is2faRequired(profile: PlatformUserSecurityProfile): boolean {
    const policy = profile.two_factor_policy || 'REQUIRED';
    if (policy === 'REQUIRED') return true;
    if (policy === 'AUTHENTICATOR_ONLY') return true;
    if (policy === 'EMAIL_OTP_ONLY') return true;
    if (policy === 'EITHER') return true;

    // In OPTIONAL policy: required if either TOTP or Email OTP is actively configured/enabled
    const hasTotp = Boolean(profile.totp_enabled && profile.totp_secret);
    const hasEmail = Boolean(profile.email_otp_enabled && profile.email);
    return hasTotp || hasEmail;
  }

  /**
   * Returns list of configured/available 2FA methods for the user.
   */
  public static getAvailableMethods(profile: PlatformUserSecurityProfile): ('totp' | 'email_otp' | 'recovery_code')[] {
    const methods: ('totp' | 'email_otp' | 'recovery_code')[] = [];
    const policy = profile.two_factor_policy || 'REQUIRED';

    const hasTotp = Boolean(profile.totp_enabled && profile.totp_secret);
    const hasEmail = Boolean(profile.email_otp_enabled && profile.email);

    if (policy === 'AUTHENTICATOR_ONLY') {
      if (hasTotp) methods.push('totp');
    } else if (policy === 'EMAIL_OTP_ONLY') {
      if (hasEmail) methods.push('email_otp');
    } else {
      if (hasTotp) methods.push('totp');
      if (hasEmail) methods.push('email_otp');
    }

    // Fallback: If 2FA is required by policy but neither TOTP nor Email OTP has been enabled yet,
    // allow Email OTP if user has email, or prompt for TOTP setup
    if (methods.length === 0 && (policy === 'REQUIRED' || policy === 'EITHER')) {
      if (profile.email) methods.push('email_otp');
      methods.push('totp');
    }

    // Recovery codes available if user has recovery codes configured
    if (profile.recovery_codes_hash) {
      try {
        const hashes = JSON.parse(profile.recovery_codes_hash);
        if (Array.isArray(hashes) && hashes.length > 0) {
          methods.push('recovery_code');
        }
      } catch {}
    }

    return methods;
  }
}
