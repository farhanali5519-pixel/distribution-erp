import crypto from 'node:crypto';
import { UserRole } from '@/modules/auth/types';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/core/tenancy/constants';
import { isHostingerMode, isBuildPhase } from '@/core/config/env';

export interface AuthSessionData {
  userId: string;
  companyId: string;
  role: UserRole;
  username: string;
  fullName: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Returns the secret used to sign session cookies.
 * Can be configured via SESSION_SECRET environment variable.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  const isHostinger = isHostingerMode();
  const isProd = process.env.NODE_ENV === 'production';
  const isBuilding = isBuildPhase();

  if (isHostinger && isProd && !isBuilding) {
    if (!secret || secret === 'saleflow-erp-session-auth-secret-key-32b-default!') {
      throw new Error(
        '[SaleFlow Security Error] SESSION_SECRET is required for Hostinger production deployment. ' +
        'Please set a strong, random SESSION_SECRET (at least 32 characters) in Hostinger environment variables.'
      );
    }
    return secret;
  }

  return secret || 'saleflow-erp-session-auth-secret-key-32b-default!';
}

/**
 * Encodes an object to a URL-safe Base64 string.
 */
function toBase64Url(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

/**
 * Decodes a URL-safe Base64 string to utf8 string.
 */
function fromBase64Url(b64url: string): string {
  return Buffer.from(b64url, 'base64url').toString('utf8');
}

/**
 * Creates an HMAC-SHA256 signature for the given payload string.
 */
function createSignature(payload: string): string {
  const secret = getSessionSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Signs session data into a tamper-proof session token string.
 * Format: `<base64url_json_payload>.<base64url_hmac_signature>`
 */
export function signSessionToken(data: AuthSessionData): string {
  const payloadStr = JSON.stringify(data);
  const encodedPayload = toBase64Url(payloadStr);
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed session token.
 * Returns null if the signature is invalid, token is malformed, or session has expired.
 */
export function verifySessionToken(token: string): AuthSessionData | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = createSignature(encodedPayload);

  // Constant-time comparison to prevent timing attacks
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
    const data = JSON.parse(jsonStr) as AuthSessionData;

    // Validate essential fields
    if (!data.userId || !data.companyId || !data.role) {
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
 * Creates a new AuthSessionData payload with default timestamps.
 */
export function buildSessionPayload(params: {
  userId: string;
  companyId: string;
  role: UserRole;
  username: string;
  fullName: string;
  maxAgeSeconds?: number;
}): AuthSessionData {
  const maxAge = params.maxAgeSeconds || SESSION_MAX_AGE_SECONDS;
  const now = Date.now();
  return {
    userId: params.userId,
    companyId: params.companyId,
    role: params.role,
    username: params.username,
    fullName: params.fullName,
    issuedAt: now,
    expiresAt: now + maxAge * 1000,
  };
}

/**
 * Formats a Set-Cookie header value for the HttpOnly session cookie.
 */
export function createSessionCookieHeader(
  data: AuthSessionData,
  options?: {
    maxAgeSeconds?: number;
    isSecure?: boolean;
  }
): string {
  const token = signSessionToken(data);
  const maxAge = options?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const isHttps = options?.isSecure ?? (process.env.APP_PROTOCOL === 'https' || (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.startsWith('https:')) || false);
  const secureFlag = isHttps ? '; Secure' : '';

  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Formats a Set-Cookie header value to clear/expire the session cookie immediately.
 */
export function createClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Extracts raw session token from a Cookie header string (e.g. "saleflow_session=xxx; other=yyy").
 */
export function extractSessionTokenFromCookieHeader(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawName, rawVal] = pair.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME && rawVal) {
      return decodeURIComponent(rawVal);
    }
  }
  return null;
}

/**
 * Extracts and verifies the session from any given request or header or cookie store.
 * Supports NextRequest, standard Request, next/headers cookies(), or raw cookie header string.
 */
export async function getSessionFromRequest(
  reqOrCookie?: any
): Promise<AuthSessionData | null> {
  try {
    let token: string | null = null;

    if (!reqOrCookie) {
      // Try next/headers cookies() if in Next.js Server Component or Route Handler
      try {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        token = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
      } catch {
        // Outside Next.js request context (e.g. CLI script or unit test)
        token = null;
      }
    } else if (typeof reqOrCookie === 'string') {
      // Raw string token or raw cookie header
      if (reqOrCookie.includes('=')) {
        token = extractSessionTokenFromCookieHeader(reqOrCookie);
      } else {
        token = reqOrCookie;
      }
    } else if (typeof reqOrCookie.cookies?.get === 'function') {
      // NextRequest or ReadonlyRequestCookies
      const cookieObj = reqOrCookie.cookies.get(SESSION_COOKIE_NAME);
      token = typeof cookieObj === 'string' ? cookieObj : cookieObj?.value || null;
    } else if (reqOrCookie.headers) {
      // Standard Request or NextRequest headers
      const cookieHeader = typeof reqOrCookie.headers.get === 'function'
        ? reqOrCookie.headers.get('cookie')
        : reqOrCookie.headers['cookie'];
      token = extractSessionTokenFromCookieHeader(cookieHeader);
    }

    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
