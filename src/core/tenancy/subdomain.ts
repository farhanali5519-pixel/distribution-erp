import { RESERVED_COMPANY_SLUGS } from './constants';

/**
 * Returns configured base domain, defaulting to 'salesflow.space' in production or 'localhost:3000'.
 * Pure function compatible with Edge Runtime, Node.js, and browser.
 */
export function getBaseDomain(): string {
  const envBase = process.env.BASE_DOMAIN?.toLowerCase().trim();
  if (envBase) return envBase;
  return process.env.NODE_ENV === 'production' ? 'salesflow.space' : 'localhost:3000';
}

/**
 * Returns active protocol ('http' or 'https').
 * Pure function compatible with Edge Runtime, Node.js, and browser.
 */
export function getAppProtocol(): 'http' | 'https' {
  const rawProtocol = (process.env.APP_PROTOCOL || '').toLowerCase().trim();
  if (rawProtocol === 'https') return 'https';
  if (rawProtocol === 'http') return 'http';
  const baseDomain = getBaseDomain();
  return process.env.NODE_ENV === 'production' && !baseDomain.includes('localhost') ? 'https' : 'http';
}

/**
 * Returns canonical full URL for a company tenant.
 * e.g. "https://farhan.salesflow.space" or "http://farhan.localhost:3000"
 */
export function getCompanyUrl(companySlug: string): string {
  return `${getAppProtocol()}://${companySlug}.${getBaseDomain()}`;
}

/**
 * Checks if a candidate subdomain is a reserved system or platform slug.
 */
export function isReservedSubdomain(subdomain: string): boolean {
  if (!subdomain) return false;
  const clean = subdomain.toLowerCase().trim();
  return (RESERVED_COMPANY_SLUGS as readonly string[]).includes(clean);
}

/**
 * Checks if a host is the platform apex vendor domain (salesflow.space or configured BASE_DOMAIN)
 */
export function isApexDomain(host?: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0].toLowerCase().trim();
  const baseHostname = getBaseDomain().split(':')[0].toLowerCase().trim();
  return hostname === baseHostname || hostname === 'salesflow.space';
}

/**
 * Checks if a host is the www domain (e.g. www.salesflow.space)
 */
export function isWwwApexDomain(host?: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(':')[0].toLowerCase().trim();
  const baseHostname = getBaseDomain().split(':')[0].toLowerCase().trim();
  return hostname === `www.${baseHostname}` || hostname === 'www.salesflow.space';
}

/**
 * Extracts candidate tenant subdomain slug from a raw request hostname or Host header.
 * Strips port and query information.
 *
 * Supported formats:
 * - "farhan.salesflow.space" -> "farhan"
 * - "farhan.localhost:3000" -> "farhan"
 * - "abc-traders.localhost:3000" -> "abc-traders"
 * - "salesflow.space" -> null (apex)
 * - "www.salesflow.space" -> null (www)
 * - "localhost:3000" -> null
 * - "127.0.0.1:3000" -> null
 * - "admin.salesflow.space" -> null (reserved)
 * - "superadmin.salesflow.space" -> null (reserved)
 */
export function extractSubdomainFromHost(host?: string | null): string | null {
  if (!host) return null;

  // 1. Strip port if present
  const hostname = host.split(':')[0].toLowerCase().trim();
  if (!hostname) return null;

  // 2. IP addresses and bare localhost have no tenant subdomain
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return null;
  }

  // 3. Compare with configured BASE_DOMAIN and salesflow.space
  const baseDomain = getBaseDomain();
  const baseHostname = baseDomain.split(':')[0].toLowerCase().trim();

  // If host exactly equals apex (e.g. "salesflow.space" or "localhost"), it's apex/vendor root
  if (hostname === baseHostname || hostname === 'salesflow.space') {
    return null;
  }

  // If www prefix
  if (hostname === `www.${baseHostname}` || hostname === 'www.salesflow.space') {
    return null;
  }

  // 4. Check if hostname ends with .salesflow.space
  if (hostname.endsWith('.salesflow.space')) {
    const sub = hostname.slice(0, -('.salesflow.space'.length)).trim();
    if (!sub) return null;
    const parts = sub.split('.');
    const candidate = parts[parts.length - 1];
    return isReservedSubdomain(candidate) ? null : candidate;
  }

  // 5. Check if hostname ends with .<baseHostname>
  if (baseHostname && baseHostname !== 'localhost' && hostname.endsWith(`.${baseHostname}`)) {
    const sub = hostname.slice(0, -(baseHostname.length + 1)).trim();
    if (!sub) return null;
    const parts = sub.split('.');
    const candidate = parts[parts.length - 1];
    return isReservedSubdomain(candidate) ? null : candidate;
  }

  // 6. Special local development support for *.localhost (e.g. farhan.localhost)
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.slice(0, -('.localhost'.length)).trim();
    if (!sub) return null;
    const parts = sub.split('.');
    const candidate = parts[parts.length - 1];
    return isReservedSubdomain(candidate) ? null : candidate;
  }

  // 7. Generic wildcard fallback: if host has >= 3 parts (e.g. tenant.domain.com)
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const candidate = parts[0];
    return isReservedSubdomain(candidate) ? null : candidate;
  }

  return null;
}
