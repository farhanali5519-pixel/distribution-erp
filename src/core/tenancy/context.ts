import { getAppConfig, isOnPremiseMode, isHostingerMode, isBuildPhase } from '@/core/config/env';
import { getDatabaseClient } from '@/core/database/factory';
import { getSessionFromRequest } from '@/core/auth/session';
import { DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SLUG } from './constants';
import { resolveTenant } from './resolver';
import { AuthenticatedUser, TenantContext } from './types';

/**
 * Standard Error thrown when tenant or authentication requirements are not met.
 */
export class TenantContextError extends Error {
  public readonly status: number;

  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'TenantContextError';
    this.status = status;
  }
}

/**
 * Helper to fetch fallback default active user for On-Premise desktop mode.
 */
function getOnPremiseDefaultUser(companyId: string) {
  if (!isOnPremiseMode() || isHostingerMode()) return null;
  if (isBuildPhase()) return null;
  try {
    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT id, username, full_name, role 
        FROM app_users 
        WHERE company_id = ? AND is_active = 1 
        ORDER BY (CASE WHEN username = 'admin' THEN 0 ELSE 1 END), full_name ASC 
        LIMIT 1
      `)
      .get(companyId) as any;

    return row || null;
  } catch {
    return null;
  }
}

/**
 * Resolves the full server-side Company/Tenant Context for the current request.
 *
 * 1. Resolves companyId, companyName, companySlug based on On-Premise default or Cloud host/headers.
 * 2. Extracts and verifies the HttpOnly session token (HMAC-SHA256).
 * 3. Enforces tenant membership: In Cloud mode, session companyId MUST match resolved companyId.
 *    (Rule: URL/hostname is NEVER trusted alone without authenticated session verification).
 * 4. In On-Premise mode, seamlessly falls back to default admin user if no session cookie exists yet,
 *    maintaining 100% backward compatibility for local desktop/offline users.
 */
export async function getTenantContext(req?: any): Promise<TenantContext> {
  const config = getAppConfig();
  const deploymentMode = config.deploymentMode;
  const isCloud = deploymentMode === 'cloud';
  const isOnPremise = deploymentMode === 'onpremise';
  const isHostinger = deploymentMode === 'hostinger';

  // 1. Resolve Company
  let host: string | null = null;
  let headers: any = null;

  if (req) {
    headers = req.headers;
    if (typeof req.headers?.get === 'function') {
      host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    } else if (req.headers) {
      host = req.headers['host'] || req.headers['x-forwarded-host'] || null;
    }
  } else {
    // Attempt next/headers if inside Next.js request scope
    try {
      const { headers: nextHeaders } = await import('next/headers');
      const headerStore = await nextHeaders();
      headers = headerStore;
      host = headerStore.get('host') || headerStore.get('x-forwarded-host');
    } catch {
      // Outside request lifecycle (e.g. CLI or background task)
      host = null;
      headers = null;
    }
  }

  const tenantRes = await resolveTenant({ host, headers });

  // If tenant resolution was invalid (Apex platform, Unknown/Not Found, Suspended, Expired)
  if (!tenantRes.isValid) {
    return {
      companyId: tenantRes.companyId || '',
      companyName: tenantRes.companyName || '',
      companySlug: tenantRes.companySlug || '',
      deploymentMode,
      status: tenantRes.status,
      isAuthenticated: false,
      isCloud,
      isOnPremise,
      isHostinger,
      error: tenantRes.error || `Tenant status: ${tenantRes.status}`,
    };
  }

  const companyId = tenantRes.companyId;
  const companyName = tenantRes.companyName;
  const companySlug = tenantRes.companySlug;

  // 2. Resolve Session
  const session = await getSessionFromRequest(req);

  // 3. Authenticated Session Verification
  if (session) {
    // Cross-tenant verification:
    // Session company MUST match resolved company
    if (session.companyId !== companyId) {
      return {
        companyId,
        companyName,
        companySlug,
        deploymentMode,
        status: tenantRes.status,
        isAuthenticated: false,
        isCloud,
        isOnPremise,
        isHostinger,
        error: `Tenant mismatch: Authenticated user does not belong to company "${companySlug}".`,
      };
    }

    // Verify user still exists and is active in DB under this company
    try {
      const client = getDatabaseClient();
      const userRow = await client.queryOne<any>(`
        SELECT id, username, full_name, role, is_active 
        FROM app_users 
        WHERE id = ? AND company_id = ?
      `, [session.userId, companyId]);

      if (userRow && userRow.is_active) {
        return {
          companyId,
          companyName,
          companySlug,
          deploymentMode,
          status: tenantRes.status,
          userId: userRow.id,
          username: userRow.username,
          fullName: userRow.full_name,
          role: userRow.role,
          isAuthenticated: true,
          isCloud,
          isOnPremise,
          isHostinger,
        };
      } else {
        return {
          companyId,
          companyName,
          companySlug,
          deploymentMode,
          isAuthenticated: false,
          isCloud,
          isOnPremise,
          isHostinger,
          error: 'Session user is inactive or deleted.',
        };
      }
    } catch (err: any) {
      return {
        companyId,
        companyName,
        companySlug,
        deploymentMode,
        isAuthenticated: false,
        isCloud,
        isOnPremise,
        isHostinger,
        error: `Database error verifying session user: ${err.message}`,
      };
    }
  }

  // 4. No Session Cookie Present
  // ONLY pure offline on-premise single-tenant mode (with no tenant subdomain)
  // may fall back to default user for local Windows desktop offline users.
  const hasTenantSubdomain = Boolean(tenantRes.companySlug && tenantRes.companySlug !== DEFAULT_COMPANY_SLUG);
  if (isOnPremise && !hasTenantSubdomain && !isCloud && !isHostinger) {
    const defaultUser = getOnPremiseDefaultUser(companyId);
    if (defaultUser) {
      return {
        companyId,
        companyName,
        companySlug,
        deploymentMode,
        userId: defaultUser.id,
        username: defaultUser.username,
        fullName: defaultUser.full_name,
        role: defaultUser.role,
        isAuthenticated: true,
        isCloud: false,
        isOnPremise: true,
        isHostinger: false,
      };
    }
  }

  // Multi-tenant mode (Cloud, Hostinger, or tenant subdomains) without authenticated session
  return {
    companyId,
    companyName,
    companySlug,
    deploymentMode,
    isAuthenticated: false,
    isCloud,
    isOnPremise,
    isHostinger,
  };
}

/**
 * Returns the verified TenantContext, throwing TenantContextError if invalid or unauthorized.
 */
export async function requireTenantContext(req?: any): Promise<TenantContext> {
  const context = await getTenantContext(req);

  if (!context.companyId) {
    throw new TenantContextError(context.error || 'Tenant company could not be resolved.', 400);
  }

  if (context.error) {
    throw new TenantContextError(context.error, 403);
  }

  if (!context.isAuthenticated) {
    throw new TenantContextError('Authentication required to access tenant.', 401);
  }

  return context;
}

/**
 * Reusable helper to get the active companyId.
 * Guaranteed to return DEFAULT_COMPANY_ID in On-Premise mode.
 */
export async function getCurrentCompanyId(req?: any): Promise<string> {
  const context = await getTenantContext(req);
  if (!context.companyId) {
    if (isOnPremiseMode() && !isHostingerMode()) {
      return DEFAULT_COMPANY_ID;
    }
    throw new TenantContextError('No active company ID resolved.', 400);
  }
  return context.companyId;
}

/**
 * Reusable helper to enforce that the request is authenticated by a verified user.
 * Throws 401 if unauthenticated or tenant mismatch.
 */
export async function requireAuthenticatedUser(req?: any): Promise<AuthenticatedUser> {
  const context = await requireTenantContext(req);

  if (!context.isAuthenticated || !context.userId || !context.role) {
    throw new TenantContextError(context.error || 'User authentication required.', 401);
  }

  return {
    userId: context.userId,
    companyId: context.companyId,
    role: context.role,
    username: context.username || '',
    fullName: context.fullName || '',
  };
}
