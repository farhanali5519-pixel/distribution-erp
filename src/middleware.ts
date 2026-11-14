import { NextRequest, NextResponse } from 'next/server';
import { extractSubdomainFromHost, isApexDomain, isWwwApexDomain, getBaseDomain, getAppProtocol } from '@/core/tenancy/subdomain';
import { TENANT_HEADER_SLUG, SUPERADMIN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/core/tenancy/constants';

function isOnPremiseMode(): boolean {
  const mode = (process.env.DEPLOYMENT_MODE || 'onpremise').toLowerCase().trim();
  return mode !== 'cloud' && mode !== 'hostinger';
}

/**
 * Next.js Edge Middleware for Multi-Tenant Domain Routing & Super Admin Isolation
 *
 * Responsibilities:
 * 1. Handles www redirect: www.salesflow.space -> salesflow.space
 * 2. Apex domain enforcement (salesflow.space):
 *    - Unauthenticated root '/' redirects to /superadmin/login
 *    - Authenticated root '/' redirects to /superadmin
 *    - ERP business routes are strictly prohibited on apex domain (redirects to /superadmin or /superadmin/login)
 * 3. Tenant subdomain enforcement (<tenant>.salesflow.space):
 *    - /superadmin and /api/superadmin are strictly prohibited on tenant subdomains (returns 403 or redirects)
 *    - Injects 'x-tenant-slug' header downstream
 * 4. On-Premise Single-Tenant Mode (offline LAN/127.0.0.1):
 *    - Passes through without friction for offline Windows desktop app
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static files, internal Next.js assets, and common file extensions
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
  const superadminCookie = request.cookies.get(SUPERADMIN_COOKIE_NAME)?.value;
  const hasSuperadminCookie = Boolean(superadminCookie && superadminCookie.includes('.'));

  // 2. Redirect www.salesflow.space -> salesflow.space
  if (host && isWwwApexDomain(host)) {
    const protocol = getAppProtocol();
    const baseDomain = getBaseDomain();
    const redirectUrl = new URL(`${protocol}://${baseDomain}${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl, { status: 307 });
  }

  // 3. Extract candidate tenant subdomain
  const subdomain = extractSubdomainFromHost(host);
  const isApex = host ? isApexDomain(host) : false;

  // -------------------------------------------------------------------
  // A. APEX DOMAIN BEHAVIOR (salesflow.space)
  // -------------------------------------------------------------------
  if (isApex && !subdomain) {
    // A1. Root '/' route behavior
    if (pathname === '/') {
      const target = hasSuperadminCookie ? '/superadmin' : '/superadmin/login';
      return NextResponse.redirect(new URL(target, request.url));
    }

    // A2. /superadmin/login: If already authenticated, redirect to /superadmin
    if (pathname === '/superadmin/login' && hasSuperadminCookie) {
      return NextResponse.redirect(new URL('/superadmin', request.url));
    }

    // A3. /superadmin routes: If not authenticated and trying to access protected /superadmin/*
    if (pathname.startsWith('/superadmin') && pathname !== '/superadmin/login') {
      if (!hasSuperadminCookie) {
        return NextResponse.redirect(new URL('/superadmin/login', request.url));
      }
      return NextResponse.next();
    }

    // A4. /api/superadmin routes: Protected API authorization
    if (pathname.startsWith('/api/superadmin')) {
      if (pathname.startsWith('/api/superadmin/auth')) {
        return NextResponse.next(); // Login, logout, session verification
      }
      if (!hasSuperadminCookie) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Platform Super Administrator session required' },
          { status: 401 }
        );
      }
      return NextResponse.next();
    }

    // A5. Customer ERP modules are strictly forbidden on apex domain!
    // If user accesses /sales, /inventory, /purchase, /customers, /setup, etc. on salesflow.space:
    if (!pathname.startsWith('/api') && !pathname.startsWith('/superadmin')) {
      const target = hasSuperadminCookie ? '/superadmin' : '/superadmin/login';
      return NextResponse.redirect(new URL(target, request.url));
    }

    return NextResponse.next();
  }

  // -------------------------------------------------------------------
  // B. TENANT SUBDOMAIN BEHAVIOR (<tenant>.salesflow.space)
  // -------------------------------------------------------------------
  if (subdomain) {
    // B1. Strictly BLOCK /superadmin and /api/superadmin on tenant subdomains
    if (pathname.startsWith('/superadmin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (pathname.startsWith('/api/superadmin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Super Admin portal cannot be accessed from customer tenant subdomains' },
        { status: 403 }
      );
    }

    const tenantSessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const hasTenantSession = Boolean(tenantSessionCookie && tenantSessionCookie.includes('.'));

    // B2. Tenant Authentication Gate:
    // If accessing protected routes without any tenant session cookie, redirect or block immediately
    const isPublicRoute =
      pathname === '/login' ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/branding/assets');
    if (!hasTenantSession && !isPublicRoute) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Tenant authentication required. Please log in.' },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // B3. Inject canonical tenant slug header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(TENANT_HEADER_SLUG, subdomain);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // -------------------------------------------------------------------
  // C. ON-PREMISE LOCALHOST / LAN MODE (Windows desktop app or dev)
  // -------------------------------------------------------------------
  if (isOnPremiseMode()) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
