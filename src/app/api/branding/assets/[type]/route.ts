import { NextRequest, NextResponse } from 'next/server';
import { getBrandingAsset, BrandingAssetType, DEFAULT_SALEFLOW_FAVICON_SVG } from '@/core/branding/storage';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { extractSubdomainFromHost } from '@/core/tenancy/subdomain';
import { CompanyProvisioningService } from '@/core/tenancy/company-provisioning.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const assetType = type.toLowerCase() as BrandingAssetType;

  if (assetType !== 'logo' && assetType !== 'favicon' && assetType !== 'sidebar-logo') {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const version = searchParams.get('v');
  let companyId = searchParams.get('companyId')?.trim();

  // If companyId is not explicitly in query, inspect request host
  if (!companyId) {
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const subdomain = extractSubdomainFromHost(host);
    if (subdomain) {
      try {
        const company = CompanyProvisioningService.getCompanyBySlug(subdomain);
        if (company) {
          companyId = company.id;
        }
      } catch (err) {
        console.warn('[Branding Asset] Failed resolving company by slug:', err);
      }
    }
  }

  // 1. Try tenant-specific uploaded asset if companyId is present
  if (companyId && companyId !== 'SYSTEM') {
    const tenantAsset = getBrandingAsset(companyId, assetType);
    if (tenantAsset) {
      return new NextResponse(new Uint8Array(tenantAsset.buffer), {
        status: 200,
        headers: {
          'Content-Type': tenantAsset.contentType,
          'Content-Length': String(tenantAsset.size),
          'Cache-Control': version
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600, stale-while-revalidate=86400',
        },
      });
    }
  }

  // 2. Try global uploaded asset
  const globalAsset = getBrandingAsset('global', assetType);
  if (globalAsset) {
    return new NextResponse(new Uint8Array(globalAsset.buffer), {
      status: 200,
      headers: {
        'Content-Type': globalAsset.contentType,
        'Content-Length': String(globalAsset.size),
        'Cache-Control': version
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  }

  // 3. For sidebar-logo: if dedicated sidebar logo was not uploaded, fall back to main logo
  if (assetType === 'sidebar-logo') {
    if (companyId && companyId !== 'SYSTEM') {
      const tenantMainLogo = getBrandingAsset(companyId, 'logo');
      if (tenantMainLogo) {
        return new NextResponse(new Uint8Array(tenantMainLogo.buffer), {
          status: 200,
          headers: {
            'Content-Type': tenantMainLogo.contentType,
            'Content-Length': String(tenantMainLogo.size),
            'Cache-Control': version
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600, stale-while-revalidate=86400',
          },
        });
      }
    }

    const globalMainLogo = getBrandingAsset('global', 'logo');
    if (globalMainLogo) {
      return new NextResponse(new Uint8Array(globalMainLogo.buffer), {
        status: 200,
        headers: {
          'Content-Type': globalMainLogo.contentType,
          'Content-Length': String(globalMainLogo.size),
          'Cache-Control': version
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600, stale-while-revalidate=86400',
        },
      });
    }
  }

  // 4. Fallbacks when no uploaded asset exists on disk:
  const config = await getBrandingConfig(companyId || 'SYSTEM');

  if (assetType === 'logo' || assetType === 'sidebar-logo') {
    // If an external logo URL was configured, redirect to it
    if (config.companyLogo) {
      return NextResponse.redirect(config.companyLogo, { status: 307 });
    }
    // Otherwise 404 so client component falls back to Display Name
    return NextResponse.json({ error: 'No logo configured' }, { status: 404 });
  }

  if (assetType === 'favicon') {
    // If external favicon URL was configured, redirect to it
    if (config.favicon) {
      return NextResponse.redirect(config.favicon, { status: 307 });
    }
    // Otherwise return default SaleFlow SVG favicon (always valid, no broken favicon state)
    return new NextResponse(DEFAULT_SALEFLOW_FAVICON_SVG, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
