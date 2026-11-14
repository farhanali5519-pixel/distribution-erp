import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, SuperAdminAuthError } from '@/core/auth/superadmin-session';
import {
  saveBrandingAsset,
  removeBrandingAsset,
  optimizeAndValidateBrandingAsset,
  BrandingAssetType,
  MAX_SOURCE_UPLOAD_SIZE,
} from '@/core/branding/storage';
import { saveBrandingConfig } from '@/core/branding/theme.service';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawType = (formData.get('type') as string | null)?.toLowerCase().trim();
    const normalizedType = rawType === 'sidebar_logo' ? 'sidebar-logo' : rawType;

    if (!normalizedType || (normalizedType !== 'logo' && normalizedType !== 'favicon' && normalizedType !== 'sidebar-logo')) {
      return NextResponse.json(
        { success: false, error: 'Invalid asset type. Expected "logo", "sidebar-logo", or "favicon".' },
        { status: 400 }
      );
    }
    const assetType = normalizedType as BrandingAssetType;

    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'No file provided or file is empty.' },
        { status: 400 }
      );
    }

    // 1. File Size Ceiling Validation (25 MB)
    if (file.size > MAX_SOURCE_UPLOAD_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image is too large to process. Please use an image smaller than 25 MB.',
        },
        { status: 400 }
      );
    }

    // 2. Read bytes into Buffer
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // 3. Server-side validation and automatic image optimization (sharp resize, metadata strip, compression)
    const processed = await optimizeAndValidateBrandingAsset(rawBuffer, assetType);

    // 4. Save optimized asset to persistent storage (<SALEFLOW_DATA_DIR>/branding/global/<assetType>.<ext>)
    const saved = saveBrandingAsset('global', assetType, processed.extension, processed.buffer);
    const version = Date.now();
    const assetUrl = `/api/branding/assets/${assetType}`;

    // 5. Update global branding config in app_settings
    if (assetType === 'logo') {
      await saveBrandingConfig(
        {
          uploadedLogo: assetUrl,
          uploadedLogoVersion: version,
        },
        'SYSTEM'
      );
    } else if (assetType === 'sidebar-logo') {
      await saveBrandingConfig(
        {
          uploadedSidebarLogo: assetUrl,
          uploadedSidebarLogoVersion: version,
          sidebarLogoAsset: assetUrl,
          sidebarLogoVersion: version,
        },
        'SYSTEM'
      );
    } else {
      await saveBrandingConfig(
        {
          uploadedFavicon: assetUrl,
          uploadedFaviconVersion: version,
        },
        'SYSTEM'
      );
    }

    // 6. Audit Trail Logging
    await SuperAdminAuditService.log({
      actor: session.username,
      action: 'GLOBAL_BRANDING_CHANGED',
      target: `Global Branding ${assetType.toUpperCase()} Upload`,
      reason: `Uploaded global branding ${assetType} (${saved.filename}, original: ${processed.originalSizeFormatted}, optimized: ${processed.optimizedSizeFormatted})`,
    });

    return NextResponse.json({
      success: true,
      message: `${assetType === 'logo' ? 'ERP Logo' : assetType === 'sidebar-logo' ? 'Sidebar Logo' : 'Favicon'} uploaded and optimized successfully.`,
      url: assetUrl,
      version,
      filename: saved.filename,
      originalSize: processed.originalSize,
      optimizedSize: processed.optimizedSize,
      originalSizeFormatted: processed.originalSizeFormatted,
      optimizedSizeFormatted: processed.optimizedSizeFormatted,
      width: processed.width,
      height: processed.height,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSuperAdmin(request);

    let rawAssetType: string | null = null;
    const { searchParams } = new URL(request.url);
    rawAssetType = searchParams.get('type')?.toLowerCase().trim() || null;

    if (!rawAssetType) {
      try {
        const body = await request.json();
        rawAssetType = body?.type?.toLowerCase().trim() || null;
      } catch {}
    }

    const assetType = rawAssetType === 'sidebar_logo' ? 'sidebar-logo' : rawAssetType;

    if (!assetType || (assetType !== 'logo' && assetType !== 'favicon' && assetType !== 'sidebar-logo')) {
      return NextResponse.json(
        { success: false, error: 'Invalid asset type to remove. Expected "logo", "sidebar-logo", or "favicon".' },
        { status: 400 }
      );
    }

    // 1. Remove from persistent storage (removes matching files and prevents orphans)
    removeBrandingAsset('global', assetType as BrandingAssetType);

    // 2. Clear reference from global branding config in app_settings
    if (assetType === 'logo') {
      await saveBrandingConfig(
        {
          uploadedLogo: null,
          uploadedLogoVersion: null,
        },
        'SYSTEM'
      );
    } else if (assetType === 'sidebar-logo') {
      await saveBrandingConfig(
        {
          uploadedSidebarLogo: null,
          uploadedSidebarLogoVersion: null,
          sidebarLogoAsset: null,
          sidebarLogoVersion: null,
        },
        'SYSTEM'
      );
    } else {
      await saveBrandingConfig(
        {
          uploadedFavicon: null,
          uploadedFaviconVersion: null,
        },
        'SYSTEM'
      );
    }

    // 3. Audit Trail Logging
    await SuperAdminAuditService.log({
      actor: session.username,
      action: 'GLOBAL_BRANDING_CHANGED',
      target: `Global Branding ${assetType.toUpperCase()} Removal`,
      reason: `Removed uploaded global branding ${assetType}`,
    });

    return NextResponse.json({
      success: true,
      message: `Global ${assetType === 'logo' ? 'ERP Logo' : assetType === 'sidebar-logo' ? 'Sidebar Logo' : 'Favicon'} removed successfully.`,
    });
  } catch (err: unknown) {
    if (err instanceof SuperAdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Removal failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
