import { isOnPremiseMode, isHostingerMode } from '@/core/config/env';
import { getDatabaseClient } from '@/core/database/factory';
import {
  DEFAULT_COMPANY_ID,
  DEFAULT_COMPANY_NAME,
  DEFAULT_COMPANY_SLUG,
  TENANT_HEADER_ID,
  TENANT_HEADER_SLUG,
} from './constants';
import { TenantResolution } from './types';
import { extractSubdomainFromHost, isReservedSubdomain, isApexDomain, isWwwApexDomain } from './subdomain';

// Re-export subdomain helpers for unified access
export { extractSubdomainFromHost, isReservedSubdomain, isApexDomain, isWwwApexDomain };

/**
 * Resolves tenant company based on deployment mode, request headers, or hostname.
 *
 * Rules:
 * 1. Apex domain (salesflow.space, www.salesflow.space, localhost without subdomain in cloud/hostinger):
 *    - Strictly reserved for SaleFlow Vendor Super Admin portal.
 *    - Customer ERP is NEVER accessed on apex domain.
 * 2. Tenant Subdomain (<tenant-slug>.salesflow.space or <slug>.localhost):
 *    - Looks up company by slug in database.
 *    - If unknown/missing: returns isValid: false, status: 'NOT_FOUND' (NEVER falls back to another tenant!).
 *    - If SUSPENDED: returns isValid: false, status: 'SUSPENDED'.
 *    - If EXPIRED: returns isValid: false, status: 'EXPIRED'.
 *    - If ACTIVE: returns isValid: true, status: 'ACTIVE'.
 * 3. On-Premise Single-Tenant Mode (offline LAN / Desktop app on 127.0.0.1 without subdomains):
 *    - Seamlessly resolves to DEFAULT_COMPANY_ID ("Farhan Distribution").
 */
export async function resolveTenant(input?: {
  host?: string | null;
  headers?: any;
}): Promise<TenantResolution> {
  const getH = (key: string): string | null => {
    if (!input?.headers) return null;
    if (typeof input.headers.get === 'function') return input.headers.get(key);
    return input.headers[key] || input.headers[key.toLowerCase()] || null;
  };

  const rawHost = input?.host || getH('host') || getH('x-forwarded-host');

  // 1. Check for Apex domain (salesflow.space) in cloud/multi-tenant mode or when accessing salesflow.space
  if (rawHost && (isApexDomain(rawHost) || isWwwApexDomain(rawHost))) {
    const isExplicitSalesflowHost = rawHost.toLowerCase().includes('salesflow.space');
    if (!isOnPremiseMode() || isExplicitSalesflowHost) {
      return {
        companyId: '',
        companyName: 'SaleFlow Vendor Admin',
        companySlug: '',
        source: 'hostname',
        isValid: false,
        status: 'APEX_PLATFORM',
        error: 'Apex domain is reserved for SaleFlow Super Admin portal.',
      };
    }
  }

  // 2. Extract candidate tenant slug from hostname or headers
  let hostSlug: string | null = null;
  if (rawHost) {
    hostSlug = extractSubdomainFromHost(rawHost);
  }

  const headerSlug = getH(TENANT_HEADER_SLUG);
  const headerId = getH(TENANT_HEADER_ID);

  const activeSlug = hostSlug || headerSlug;

  // 3. If no subdomain or slug was detected:
  if (!activeSlug && !headerId) {
    // Only On-Premise mode (single-tenant desktop/offline server) falls back to DEFAULT_COMPANY_ID
    if (isOnPremiseMode()) {
      return {
        companyId: DEFAULT_COMPANY_ID,
        companyName: DEFAULT_COMPANY_NAME,
        companySlug: DEFAULT_COMPANY_SLUG,
        source: 'onpremise_default',
        isValid: true,
        status: 'ACTIVE',
      };
    }

    // In Cloud or Hostinger mode without subdomain, it represents apex platform
    return {
      companyId: '',
      companyName: 'SaleFlow Vendor Admin',
      companySlug: '',
      source: 'hostname',
      isValid: false,
      status: 'APEX_PLATFORM',
      error: 'Apex domain is reserved for SaleFlow Super Admin portal.',
    };
  }

  // 4. Query company in database with authoritative slug/ID match
  try {
    const client = getDatabaseClient();
    let row: any = null;
    const source: 'hostname' | 'header' = hostSlug ? 'hostname' : 'header';

    if (activeSlug) {
      row = await client.queryOne(
        `SELECT id, name, slug, is_active, status, plan, trial_ends_at, subscription_starts_at, subscription_ends_at
         FROM companies 
         WHERE LOWER(slug) = ?`,
        [activeSlug.toLowerCase().trim()]
      );
    } else if (headerId) {
      row = await client.queryOne(
        `SELECT id, name, slug, is_active, status, plan, trial_ends_at, subscription_starts_at, subscription_ends_at
         FROM companies 
         WHERE id = ?`,
        [headerId.trim()]
      );
    }

    // Tenant NOT FOUND
    if (!row) {
      const identifier = activeSlug || headerId || '';
      return {
        companyId: '',
        companyName: '',
        companySlug: identifier,
        source,
        isValid: false,
        status: 'NOT_FOUND',
        error: `Company workspace "${identifier}" not found.`,
      };
    }

    // Status Validations:
    // A. Explicit EXPIRED status
    if (row.status === 'EXPIRED') {
      return {
        companyId: row.id,
        companyName: row.name,
        companySlug: row.slug,
        source,
        isValid: false,
        status: 'EXPIRED',
        error: `Company "${row.name}" subscription has expired.`,
      };
    }

    // B. Inactive or SUSPENDED status
    if (Number(row.is_active) === 0 || row.status === 'SUSPENDED') {
      return {
        companyId: row.id,
        companyName: row.name,
        companySlug: row.slug,
        source,
        isValid: false,
        status: 'SUSPENDED',
        error: `Company "${row.name}" account is suspended.`,
      };
    }

    // C. TRIAL date expiry
    if (row.status === 'TRIAL' && row.trial_ends_at) {
      const trialEndTime = new Date(row.trial_ends_at).getTime();
      if (!isNaN(trialEndTime) && trialEndTime < Date.now()) {
        return {
          companyId: row.id,
          companyName: row.name,
          companySlug: row.slug,
          source,
          isValid: false,
          status: 'EXPIRED',
          error: `Company "${row.name}" trial period has expired.`,
        };
      }
    }

    // D. Subscription date expiry
    if (row.subscription_ends_at) {
      const subEndTime = new Date(row.subscription_ends_at).getTime();
      if (!isNaN(subEndTime) && subEndTime < Date.now()) {
        return {
          companyId: row.id,
          companyName: row.name,
          companySlug: row.slug,
          source,
          isValid: false,
          status: 'EXPIRED',
          error: `Company "${row.name}" subscription period has expired.`,
        };
      }
    }

    // Valid active tenant
    return {
      companyId: row.id,
      companyName: row.name,
      companySlug: row.slug,
      source,
      isValid: true,
      status: row.status || 'ACTIVE',
    };
  } catch (err: any) {
    return {
      companyId: '',
      companyName: '',
      companySlug: activeSlug || '',
      source: 'hostname',
      isValid: false,
      status: 'ERROR',
      error: `Failed to resolve tenant company: ${err.message}`,
    };
  }
}
