import crypto from 'node:crypto';
import { SUPERADMIN_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/core/tenancy/constants';

export interface SuperAdminSessionData {
  isPlatformSuperAdmin: true;
  userId: string;
  username: string;
  fullName: string;
  email?: string;
  role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR';
  issuedAt: number;
  expiresAt: number;
}

export class SuperAdminAuthError extends Error {
  public status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'SuperAdminAuthError';
    this.status = status;
  }
}

/**
 * Secret used to sign platform superadmin session tokens.
 */
function getSuperAdminSessionSecret(): string {
  return process.env.SUPERADMIN_SESSION_SECRET?.trim() || 
         process.env.SESSION_SECRET?.trim() || 
         'saleflow-platform-superadmin-secret-key-64b-strictly-secure!';
}

function toBase64Url(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function fromBase64Url(b64url: string): string {
  return Buffer.from(b64url, 'base64url').toString('utf8');
}

function createSignature(payload: string): string {
  const secret = getSuperAdminSessionSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Signs platform superadmin session data into a tamper-proof session token string.
 */
export function signSuperAdminToken(data: SuperAdminSessionData): string {
  const payloadStr = JSON.stringify(data);
  const encodedPayload = toBase64Url(payloadStr);
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed superadmin session token.
 * Returns null if invalid, expired, or not a platform superadmin payload.
 */
export function verifySuperAdminToken(token: string): SuperAdminSessionData | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = createSignature(encodedPayload);

  const providedBuf = Buffer.from(providedSignature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const jsonStr = fromBase64Url(encodedPayload);
    const data = JSON.parse(jsonStr) as SuperAdminSessionData;

    // Must be platform super admin payload
    if (data.isPlatformSuperAdmin !== true || !data.userId || !data.role) {
      return null;
    }

    // Check expiration
    if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Builds standard SuperAdminSessionData payload.
 */
export function buildSuperAdminSessionPayload(params: {
  userId: string;
  username: string;
  fullName: string;
  email?: string;
  role?: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR';
  maxAgeSeconds?: number;
}): SuperAdminSessionData {
  const maxAge = params.maxAgeSeconds || SESSION_MAX_AGE_SECONDS;
  const now = Date.now();
  return {
    isPlatformSuperAdmin: true,
    userId: params.userId,
    username: params.username,
    fullName: params.fullName,
    email: params.email,
    role: params.role || 'SUPER_ADMIN',
    issuedAt: now,
    expiresAt: now + maxAge * 1000,
  };
}

/**
 * Formats Set-Cookie header for Super Admin session.
 */
export function createSuperAdminCookieHeader(
  data: SuperAdminSessionData,
  options?: { maxAgeSeconds?: number; isSecure?: boolean }
): string {
  const token = signSuperAdminToken(data);
  const maxAge = options?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const isHttps = options?.isSecure ?? (process.env.APP_PROTOCOL === 'https' || (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.startsWith('https:')) || false);
  const secureFlag = isHttps ? '; Secure' : '';

  return `${SUPERADMIN_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Formats Set-Cookie header to clear Super Admin session cookie.
 */
export function createClearSuperAdminCookieHeader(): string {
  return `${SUPERADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Extracts raw superadmin token from a Cookie header string.
 */
export function extractSuperAdminTokenFromCookieHeader(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawName, rawVal] = pair.trim().split('=');
    if (rawName === SUPERADMIN_COOKIE_NAME && rawVal) {
      return decodeURIComponent(rawVal);
    }
  }
  return null;
}

/**
 * Resolves Super Admin session from request or cookies.
 */
export async function getSuperAdminSession(
  reqOrCookie?: any
): Promise<SuperAdminSessionData | null> {
  try {
    let token: string | null = null;

    if (!reqOrCookie) {
      try {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        token = cookieStore.get(SUPERADMIN_COOKIE_NAME)?.value || null;
      } catch {
        token = null;
      }
    } else if (typeof reqOrCookie === 'string') {
      if (reqOrCookie.includes('=')) {
        token = extractSuperAdminTokenFromCookieHeader(reqOrCookie);
      } else {
        token = reqOrCookie;
      }
    } else if (typeof reqOrCookie.cookies?.get === 'function') {
      const cookieObj = reqOrCookie.cookies.get(SUPERADMIN_COOKIE_NAME);
      token = typeof cookieObj === 'string' ? cookieObj : cookieObj?.value || null;
    } else if (reqOrCookie.headers) {
      const cookieHeader = typeof reqOrCookie.headers.get === 'function'
        ? reqOrCookie.headers.get('cookie')
        : reqOrCookie.headers['cookie'];
      token = extractSuperAdminTokenFromCookieHeader(cookieHeader);
    }

    if (!token) return null;
    return verifySuperAdminToken(token);
  } catch {
    return null;
  }
}

/**
 * Requires an authenticated Platform Super Administrator.
 * Throws 401 if unauthenticated, 403 if role is insufficient.
 */
export async function requireSuperAdmin(reqOrCookie?: any): Promise<SuperAdminSessionData> {
  const session = await getSuperAdminSession(reqOrCookie);
  if (!session) {
    throw new SuperAdminAuthError('Unauthorized: Platform Super Administrator session required', 401);
  }
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'PLATFORM_OPERATOR') {
    throw new SuperAdminAuthError('Forbidden: Insufficient platform permissions', 403);
  }
  return session;
}

export interface TwoFactorChallengePayload {
  is2faChallenge: true;
  userId: string;
  username: string;
  fullName: string;
  email?: string;
  role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR';
  issuedAt: number;
  expiresAt: number;
}

/**
 * Signs a short-lived (5-minute) 2FA pending challenge token.
 */
export function sign2faChallengeToken(
  data: Omit<TwoFactorChallengePayload, 'is2faChallenge' | 'issuedAt' | 'expiresAt'>
): string {
  const now = Date.now();
  const payload: TwoFactorChallengePayload = {
    ...data,
    is2faChallenge: true,
    issuedAt: now,
    expiresAt: now + 5 * 60 * 1000, // 5 minutes validity
  };
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = toBase64Url(payloadStr);
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed 2FA pending challenge token.
 */
export function verify2faChallengeToken(token: string): TwoFactorChallengePayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = createSignature(encodedPayload);
  const providedBuf = Buffer.from(providedSignature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const jsonStr = fromBase64Url(encodedPayload);
    const data = JSON.parse(jsonStr) as TwoFactorChallengePayload;
    if (data.is2faChallenge !== true || !data.userId) return null;
    if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

