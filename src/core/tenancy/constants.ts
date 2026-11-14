/**
 * Central Multi-Tenancy & Company Constants
 * Provides the canonical default company identifier for backward compatibility
 * and single-tenant On-Premise deployments.
 */

export const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_COMPANY_NAME = 'Farhan Distribution';
export const DEFAULT_COMPANY_SLUG = 'farhan';
export const DEFAULT_COMPANY_PLAN = 'COMMERCIAL';

/**
 * HttpOnly Session Cookie Name
 */
export const SESSION_COOKIE_NAME = 'saleflow_session';

/**
 * Tenant resolution HTTP headers
 */
export const TENANT_HEADER_SLUG = 'x-tenant-slug';
export const TENANT_HEADER_ID = 'x-company-id';

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Platform Super Admin Session Cookie Name
 */
export const SUPERADMIN_COOKIE_NAME = 'saleflow_superadmin_session';

/**
 * Reserved slugs forbidden for company tenants
 */
export const RESERVED_COMPANY_SLUGS = [
  'www', 'app', 'api', 'admin', 'superadmin', 'support', 'billing', 'mail',
  'staging', 'dev', 'demo', 'static', 'assets'
] as const;

