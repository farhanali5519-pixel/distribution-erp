import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { getSaleFlowDataDir } from '@/core/config/env';

export type BrandingAssetType = 'logo' | 'favicon' | 'sidebar-logo';

export interface StorageAssetResult {
  filePath: string;
  contentType: string;
  buffer: Buffer;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
  detectedExtension?: string;
}

export interface ProcessedAssetResult {
  buffer: Buffer;
  extension: string;
  contentType: string;
  originalSize: number;
  optimizedSize: number;
  originalSizeFormatted: string;
  optimizedSizeFormatted: string;
  width?: number;
  height?: number;
}

// Generous 25 MB safety ceiling to prevent resource exhaustion while accepting large valid images
export const MAX_SOURCE_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_LOGO_SIZE_BYTES = MAX_SOURCE_UPLOAD_SIZE;
export const MAX_FAVICON_SIZE_BYTES = MAX_SOURCE_UPLOAD_SIZE;

// Target dimensions for automatic proportional resizing
export const MAX_LOGO_WIDTH = 1600;
export const MAX_LOGO_HEIGHT = 600;
export const MAX_SIDEBAR_LOGO_WIDTH = 512;
export const MAX_SIDEBAR_LOGO_HEIGHT = 512;
export const FAVICON_TARGET_SIZE = 64;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Allowed image MIME types and extensions
export const ALLOWED_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const ALLOWED_SIDEBAR_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const ALLOWED_FAVICON_EXTENSIONS = ['.ico', '.png', '.webp', '.jpg', '.jpeg'] as const;

/**
 * Checks file magic bytes to verify actual image format on server-side.
 * Rejects executables, scripts, SVGs, HTML, etc.
 */
export function validateImageMagicBytes(buffer: Buffer, assetType: BrandingAssetType): ValidationResult {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'Empty or unreadable file buffer' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // JPEG: FF D8 FF
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  // WebP: RIFF at 0..3 and WEBP at 8..11
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  // ICO: 00 00 01 00 (Windows Icon header)
  const isIco =
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00;

  if (assetType === 'logo' || assetType === 'sidebar-logo') {
    if (isPng) return { valid: true, detectedType: 'image/png', detectedExtension: '.png' };
    if (isJpeg) return { valid: true, detectedType: 'image/jpeg', detectedExtension: '.jpg' };
    if (isWebp) return { valid: true, detectedType: 'image/webp', detectedExtension: '.webp' };

    return {
      valid: false,
      error: `Invalid ${assetType === 'sidebar-logo' ? 'sidebar logo' : 'logo'} file format. Allowed formats: PNG, JPG, JPEG, WEBP. SVG and non-image files are rejected.`,
    };
  }

  if (assetType === 'favicon') {
    if (isIco) return { valid: true, detectedType: 'image/x-icon', detectedExtension: '.ico' };
    if (isPng) return { valid: true, detectedType: 'image/png', detectedExtension: '.png' };
    if (isWebp) return { valid: true, detectedType: 'image/webp', detectedExtension: '.webp' };
    if (isJpeg) return { valid: true, detectedType: 'image/jpeg', detectedExtension: '.jpg' };

    return {
      valid: false,
      error: 'Invalid favicon file format. Allowed formats: ICO, PNG, WEBP, JPG. SVG and non-image files are rejected.',
    };
  }

  return { valid: false, error: 'Unknown asset type' };
}

/**
 * Server-side automatic image optimization and resizing:
 * - Validates actual decoding stream via sharp (rejects renamed/fake images).
 * - Enforces 25 MB safety ceiling.
 * - Strips EXIF/metadata for privacy and compression.
 * - Auto-orients image based on EXIF orientation.
 * - Proportional resize:
 *     - Logo: target max 1600x600, fit inside, preserve aspect ratio, never crop, preserve alpha transparency, output WebP (quality 85).
 *     - Favicon: square-fit safely into 64x64 contain (transparent background margins for non-square), output optimized PNG (or ICO where applicable).
 */
export async function optimizeAndValidateBrandingAsset(
  buffer: Buffer,
  assetType: BrandingAssetType
): Promise<ProcessedAssetResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('No image data provided.');
  }

  if (buffer.length > MAX_SOURCE_UPLOAD_SIZE) {
    throw new Error('Image is too large to process. Please use an image smaller than 25 MB.');
  }

  // Check for SVG signatures to prevent script injection
  const headStr = buffer.slice(0, 100).toString('utf-8').toLowerCase();
  if (headStr.includes('<svg') || headStr.includes('<?xml')) {
    throw new Error('SVG uploads are disabled for security reasons.');
  }

  // Pre-validate magic bytes
  const magicValidation = validateImageMagicBytes(buffer, assetType);
  if (!magicValidation.valid) {
    throw new Error(magicValidation.error || 'Invalid image header.');
  }

  if (assetType === 'logo') {
    try {
      const image = sharp(buffer, { failOn: 'error' });
      const metadata = await image.metadata();

      if (!metadata.format || metadata.format === 'svg') {
        throw new Error('Unsupported or invalid image format.');
      }

      // Proportional resize within 1600x600, preserving aspect ratio and alpha transparency
      const { data: optimizedBuffer, info } = await image
        .rotate()
        .resize({
          width: MAX_LOGO_WIDTH,
          height: MAX_LOGO_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 85,
          alphaQuality: 100,
          effort: 4,
        })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: optimizedBuffer,
        extension: '.webp',
        contentType: 'image/webp',
        originalSize: buffer.length,
        optimizedSize: optimizedBuffer.length,
        originalSizeFormatted: formatFileSize(buffer.length),
        optimizedSizeFormatted: formatFileSize(optimizedBuffer.length),
        width: info.width,
        height: info.height,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid or unreadable image file.';
      throw new Error(`Invalid or unreadable image file. Please provide a valid PNG, JPG, or WebP image. Details: ${msg}`);
    }
  }

  if (assetType === 'sidebar-logo') {
    try {
      const image = sharp(buffer, { failOn: 'error' });
      const metadata = await image.metadata();

      if (!metadata.format || metadata.format === 'svg') {
        throw new Error('Unsupported or invalid image format.');
      }

      // Proportional resize within 512x512, preserving aspect ratio and alpha transparency
      const { data: optimizedBuffer, info } = await image
        .rotate()
        .resize({
          width: MAX_SIDEBAR_LOGO_WIDTH,
          height: MAX_SIDEBAR_LOGO_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 85,
          alphaQuality: 100,
          effort: 4,
        })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: optimizedBuffer,
        extension: '.webp',
        contentType: 'image/webp',
        originalSize: buffer.length,
        optimizedSize: optimizedBuffer.length,
        originalSizeFormatted: formatFileSize(buffer.length),
        optimizedSizeFormatted: formatFileSize(optimizedBuffer.length),
        width: info.width,
        height: info.height,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid or unreadable image file.';
      throw new Error(`Invalid or unreadable sidebar logo file. Please provide a valid PNG, JPG, or WebP image. Details: ${msg}`);
    }
  }

  if (assetType === 'favicon') {
    try {
      let decodeBuffer = buffer;
      const isIco = magicValidation.detectedExtension === '.ico';

      // If ICO format, check if it wraps a PNG
      if (isIco) {
        const pngIndex = buffer.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        if (pngIndex !== -1) {
          decodeBuffer = buffer.slice(pngIndex);
        }
      }

      let parsedBySharp = false;
      try {
        const meta = await sharp(decodeBuffer, { failOn: 'error' }).metadata();
        if (meta.format && meta.format !== 'svg') {
          parsedBySharp = true;
        }
      } catch {
        parsedBySharp = false;
      }

      if (parsedBySharp) {
        // Safe square containment: letterbox with transparent background if non-square, never destructively cropped
        const { data: optimizedBuffer, info } = await sharp(decodeBuffer)
          .rotate()
          .resize(FAVICON_TARGET_SIZE, FAVICON_TARGET_SIZE, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ compressionLevel: 9, effort: 7 })
          .toBuffer({ resolveWithObject: true });

        return {
          buffer: optimizedBuffer,
          extension: '.png',
          contentType: 'image/png',
          originalSize: buffer.length,
          optimizedSize: optimizedBuffer.length,
          originalSizeFormatted: formatFileSize(buffer.length),
          optimizedSizeFormatted: formatFileSize(optimizedBuffer.length),
          width: info.width,
          height: info.height,
        };
      } else if (isIco && buffer.length <= 1024 * 1024) {
        // Supported legacy ICO binary under 1MB
        return {
          buffer,
          extension: '.ico',
          contentType: 'image/x-icon',
          originalSize: buffer.length,
          optimizedSize: buffer.length,
          originalSizeFormatted: formatFileSize(buffer.length),
          optimizedSizeFormatted: formatFileSize(buffer.length),
          width: 32,
          height: 32,
        };
      } else {
        throw new Error('Unable to decode favicon image format.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid or unreadable favicon file.';
      throw new Error(`Invalid or unreadable favicon file. Please provide a valid ICO, PNG, WebP, or JPG image. Details: ${msg}`);
    }
  }

  throw new Error('Unknown asset type.');
}

/**
 * Resolves persistent storage directory outside build outputs and Git repositories.
 * Uses SALEFLOW_DATA_DIR (or persistent data directory) to survive container/process restarts and redeployments.
 */
export function getBrandingStorageDir(targetId: string = 'global'): string {
  const dataDir = getSaleFlowDataDir();
  // Sanitize targetId to prevent directory traversal
  const safeTarget = (targetId || 'global').replace(/[^a-zA-Z0-9_-]/g, '') || 'global';
  const brandingDir = path.join(dataDir, 'branding', safeTarget);
  if (!fs.existsSync(brandingDir)) {
    fs.mkdirSync(brandingDir, { recursive: true });
  }
  return brandingDir;
}

/**
 * Saves uploaded branding asset to persistent disk.
 * Cleans up any existing files for this asset type to prevent orphan files.
 */
export function saveBrandingAsset(
  targetId: string = 'global',
  assetType: BrandingAssetType,
  extension: string,
  buffer: Buffer
): { filename: string; filePath: string; contentType: string } {
  const dir = getBrandingStorageDir(targetId);

  // Normalize extension
  const safeExt = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;

  // Clean up any existing files for this asset type (e.g. remove old logo.png when saving logo.webp)
  removeBrandingAsset(targetId, assetType);

  const filename = `${assetType}${safeExt}`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, buffer);

  const contentType = getContentTypeForExtension(safeExt);
  return { filename, filePath, contentType };
}

/**
 * Removes persistent branding asset from disk.
 */
export function removeBrandingAsset(targetId: string = 'global', assetType: BrandingAssetType): boolean {
  try {
    const dir = getBrandingStorageDir(targetId);
    if (!fs.existsSync(dir)) return false;

    const files = fs.readdirSync(dir);
    let removed = false;

    for (const file of files) {
      if (file.startsWith(`${assetType}.`)) {
        const fullPath = path.join(dir, file);
        try {
          fs.unlinkSync(fullPath);
          removed = true;
        } catch (err) {
          console.warn(`[BrandingStorage] Failed to delete orphan asset ${fullPath}:`, err);
        }
      }
    }
    return removed;
  } catch {
    return false;
  }
}

/**
 * Reads persistent branding asset from disk.
 */
export function getBrandingAsset(
  targetId: string = 'global',
  assetType: BrandingAssetType
): StorageAssetResult | null {
  try {
    const dir = getBrandingStorageDir(targetId);
    if (!fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir);
    // Find matching asset file (e.g. logo.png, logo.webp, favicon.ico)
    const match = files.find((f) => f.startsWith(`${assetType}.`));
    if (!match) return null;

    const filePath = path.join(dir, match);
    if (!fs.existsSync(filePath)) return null;

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(match).toLowerCase();
    const contentType = getContentTypeForExtension(ext);

    return {
      filePath,
      contentType,
      buffer,
      size: buffer.length,
    };
  } catch {
    return null;
  }
}

export function getContentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * High quality default SaleFlow SVG favicon fallback.
 * Renders Navy (#081A2F) container with Emerald (#16A46A) and Teal (#12A594) flow mark.
 */
export const DEFAULT_SALEFLOW_FAVICON_SVG = `
<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sf-navy-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stopColor="#0F2747" />
      <stop offset="100%" stopColor="#081A2F" />
    </linearGradient>
    <linearGradient id="sf-emerald-teal" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stopColor="#16A46A" />
      <stop offset="100%" stopColor="#12A594" />
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#sf-navy-grad)" stroke="#12A594" stroke-opacity="0.3" stroke-width="1.5" />
  <path d="M31 16C31 14.3431 29.6569 13 28 13H20C17.7909 13 16 14.7909 16 17C16 19.2091 17.7909 21 20 21H28C30.2091 21 32 22.7909 32 25C32 27.2091 30.2091 29 28 29H17" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M26 33L31 37L26 41" stroke="url(#sf-emerald-teal)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="33" cy="14" r="2.2" fill="#16A46A" />
</svg>
`.trim();
