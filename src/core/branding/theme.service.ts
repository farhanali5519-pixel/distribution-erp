import { getDatabaseClient } from '@/core/database/factory';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { isBuildPhase } from '@/core/config/env';
import {
  APPROVED_FONTS,
  APPROVED_NUMERIC_FONTS,
  ApprovedFont,
  ApprovedNumericFont,
  BrandingConfig,
  DEFAULT_SALEFLOW_BRANDING,
  FontSizeScale,
  NumericDigitStyle,
  UiTheme,
} from './theme';

const BRANDING_SETTING_KEY = 'branding_config';

/**
 * Normalizes raw branding data ensuring backward compatibility between old and new typography fields.
 */
function normalizeBranding(parsed: any, base: BrandingConfig = DEFAULT_SALEFLOW_BRANDING): BrandingConfig {
  const chosenTextFont: ApprovedFont =
    parsed?.textFontFamily && (APPROVED_FONTS as readonly string[]).includes(parsed.textFontFamily)
      ? parsed.textFontFamily
      : parsed?.fontFamily && (APPROVED_FONTS as readonly string[]).includes(parsed.fontFamily)
      ? parsed.fontFamily
      : base.textFontFamily || base.fontFamily || 'Inter';

  const chosenNumericFont: ApprovedNumericFont =
    parsed?.numericFontFamily && (APPROVED_NUMERIC_FONTS as readonly string[]).includes(parsed.numericFontFamily)
      ? parsed.numericFontFamily
      : base.numericFontFamily || 'Same as Text Font';

  const chosenSizeScale: FontSizeScale =
    parsed?.sizeScale && ['sm', 'md', 'lg'].includes(parsed.sizeScale)
      ? parsed.sizeScale
      : parsed?.fontSizeScale && ['sm', 'md', 'lg'].includes(parsed.fontSizeScale)
      ? parsed.fontSizeScale
      : base.sizeScale || base.fontSizeScale || 'md';

  const chosenNumericStyle: NumericDigitStyle =
    parsed?.numericStyle && ['tabular', 'proportional'].includes(parsed.numericStyle)
      ? parsed.numericStyle
      : base.numericStyle || 'tabular';

  const chosenUiTheme: UiTheme =
    parsed?.uiTheme === 'modern'
      ? 'modern'
      : parsed?.uiTheme === 'classic'
      ? 'classic'
      : base.uiTheme === 'modern'
      ? 'modern'
      : 'classic';

  // Backward compatibility: support logoImageUrl / companyLogo, faviconUrl / favicon
  const companyLogo = parsed?.companyLogo !== undefined 
    ? parsed.companyLogo 
    : parsed?.logoImageUrl !== undefined 
    ? parsed.logoImageUrl 
    : (base.companyLogo ?? null);

  const favicon = parsed?.favicon !== undefined 
    ? parsed.favicon 
    : parsed?.faviconUrl !== undefined 
    ? parsed.faviconUrl 
    : (base.favicon ?? null);

  const uploadedLogo = parsed?.uploadedLogo !== undefined 
    ? parsed.uploadedLogo 
    : (base.uploadedLogo ?? null);

  const uploadedLogoVersion = parsed?.uploadedLogoVersion !== undefined 
    ? parsed.uploadedLogoVersion 
    : (base.uploadedLogoVersion ?? null);

  const uploadedFavicon = parsed?.uploadedFavicon !== undefined 
    ? parsed.uploadedFavicon 
    : (base.uploadedFavicon ?? null);

  const uploadedFaviconVersion = parsed?.uploadedFaviconVersion !== undefined 
    ? parsed.uploadedFaviconVersion 
    : (base.uploadedFaviconVersion ?? null);

  const uploadedSidebarLogo = parsed?.uploadedSidebarLogo !== undefined 
    ? parsed.uploadedSidebarLogo 
    : parsed?.sidebarLogoAsset !== undefined
    ? parsed.sidebarLogoAsset
    : (base.uploadedSidebarLogo ?? base.sidebarLogoAsset ?? null);

  const uploadedSidebarLogoVersion = parsed?.uploadedSidebarLogoVersion !== undefined 
    ? parsed.uploadedSidebarLogoVersion 
    : parsed?.sidebarLogoVersion !== undefined
    ? parsed.sidebarLogoVersion
    : (base.uploadedSidebarLogoVersion ?? base.sidebarLogoVersion ?? null);

  const sidebarLogoAsset = uploadedSidebarLogo;
  const sidebarLogoVersion = uploadedSidebarLogoVersion;

  const preloaderEnabled = parsed?.preloaderEnabled !== undefined 
    ? Boolean(parsed.preloaderEnabled) 
    : Boolean(base.preloaderEnabled ?? false);

  const displayName = parsed?.displayName?.trim() || base.displayName || 'SaleFlow ERP';

  const tenantLogo = parsed?.tenantLogo !== undefined ? parsed.tenantLogo : (base.tenantLogo ?? null);
  const tenantLogoVersion = parsed?.tenantLogoVersion !== undefined ? parsed.tenantLogoVersion : (base.tenantLogoVersion ?? null);
  const tenantSidebarLogo = parsed?.tenantSidebarLogo !== undefined ? parsed.tenantSidebarLogo : (base.tenantSidebarLogo ?? null);
  const tenantSidebarLogoVersion = parsed?.tenantSidebarLogoVersion !== undefined ? parsed.tenantSidebarLogoVersion : (base.tenantSidebarLogoVersion ?? null);
  const globalLogo = parsed?.globalLogo !== undefined ? parsed.globalLogo : (base.globalLogo ?? null);
  const globalLogoVersion = parsed?.globalLogoVersion !== undefined ? parsed.globalLogoVersion : (base.globalLogoVersion ?? null);
  const globalSidebarLogo = parsed?.globalSidebarLogo !== undefined ? parsed.globalSidebarLogo : (base.globalSidebarLogo ?? null);
  const globalSidebarLogoVersion = parsed?.globalSidebarLogoVersion !== undefined ? parsed.globalSidebarLogoVersion : (base.globalSidebarLogoVersion ?? null);

  return {
    ...base,
    ...parsed,
    displayName,
    companyLogo,
    favicon,
    uploadedLogo,
    uploadedLogoVersion,
    uploadedSidebarLogo,
    uploadedSidebarLogoVersion,
    sidebarLogoAsset,
    sidebarLogoVersion,
    uploadedFavicon,
    uploadedFaviconVersion,
    tenantLogo,
    tenantLogoVersion,
    tenantSidebarLogo,
    tenantSidebarLogoVersion,
    globalLogo,
    globalLogoVersion,
    globalSidebarLogo,
    globalSidebarLogoVersion,
    preloaderEnabled,
    uiTheme: chosenUiTheme,
    fontFamily: chosenTextFont,
    textFontFamily: chosenTextFont,
    numericFontFamily: chosenNumericFont,
    fontSizeScale: chosenSizeScale,
    sizeScale: chosenSizeScale,
    numericStyle: chosenNumericStyle,
    loginBranding: {
      ...base.loginBranding,
      ...(parsed?.loginBranding || {}),
    },
  };
}

/**
 * Retrieves branding configuration for a given tenant company.
 * 1. Checks for tenant-specific override in app_settings (WHERE company_id = tenantId)
 * 2. If absent, checks global default in app_settings (WHERE company_id = 'SYSTEM')
 * 3. If absent, returns DEFAULT_SALEFLOW_BRANDING
 */
export async function getBrandingConfig(companyId?: string): Promise<BrandingConfig> {
  if (isBuildPhase()) {
    return { ...DEFAULT_SALEFLOW_BRANDING };
  }

  try {
    const client = getDatabaseClient();

    // Fetch Global Default Branding first as baseline
    let globalDefault = DEFAULT_SALEFLOW_BRANDING;
    const globalRow = await client.queryOne<{ value: string }>(
      'SELECT value FROM app_settings WHERE company_id = ? AND key = ?',
      ['SYSTEM', BRANDING_SETTING_KEY]
    );
    if (globalRow && globalRow.value) {
      try {
        const parsedGlobal = JSON.parse(globalRow.value);
        globalDefault = normalizeBranding(parsedGlobal, DEFAULT_SALEFLOW_BRANDING);
      } catch {}
    }

    // 1. Check tenant override if companyId is provided and not 'SYSTEM'
    if (companyId && companyId !== 'SYSTEM' && companyId !== DEFAULT_COMPANY_ID) {
      const row = await client.queryOne<{ value: string }>(
        'SELECT value FROM app_settings WHERE company_id = ? AND key = ?',
        [companyId, BRANDING_SETTING_KEY]
      );
      if (row && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          // Preserve tenant custom logo if explicitly configured; otherwise inherit global branding assets
          const tenantHasCustomLogo = Boolean(parsed.uploadedLogo || parsed.companyLogo || parsed.logoImageUrl);
          const tenantHasCustomFavicon = Boolean(parsed.uploadedFavicon || parsed.favicon || parsed.faviconUrl);
          const tenantHasCustomSidebarLogo = Boolean(parsed.uploadedSidebarLogo || parsed.sidebarLogoAsset);
          const tenantHasCustomDisplayName = Boolean(parsed.displayName && parsed.displayName.trim() && parsed.displayName.trim() !== 'SaleFlow ERP');

          const effectiveTenantConfig = {
            ...parsed,
            uploadedLogo: tenantHasCustomLogo ? parsed.uploadedLogo : globalDefault.uploadedLogo,
            uploadedLogoVersion: tenantHasCustomLogo ? parsed.uploadedLogoVersion : globalDefault.uploadedLogoVersion,
            companyLogo: tenantHasCustomLogo ? (parsed.companyLogo || parsed.logoImageUrl || null) : globalDefault.companyLogo,
            uploadedSidebarLogo: tenantHasCustomSidebarLogo ? (parsed.uploadedSidebarLogo || parsed.sidebarLogoAsset) : globalDefault.uploadedSidebarLogo,
            uploadedSidebarLogoVersion: tenantHasCustomSidebarLogo ? (parsed.uploadedSidebarLogoVersion || parsed.sidebarLogoVersion) : globalDefault.uploadedSidebarLogoVersion,
            sidebarLogoAsset: tenantHasCustomSidebarLogo ? (parsed.sidebarLogoAsset || parsed.uploadedSidebarLogo) : globalDefault.sidebarLogoAsset,
            sidebarLogoVersion: tenantHasCustomSidebarLogo ? (parsed.sidebarLogoVersion || parsed.uploadedSidebarLogoVersion) : globalDefault.sidebarLogoVersion,
            uploadedFavicon: tenantHasCustomFavicon ? parsed.uploadedFavicon : globalDefault.uploadedFavicon,
            uploadedFaviconVersion: tenantHasCustomFavicon ? parsed.uploadedFaviconVersion : globalDefault.uploadedFaviconVersion,
            favicon: tenantHasCustomFavicon ? (parsed.favicon || parsed.faviconUrl || null) : globalDefault.favicon,
            displayName: tenantHasCustomDisplayName ? parsed.displayName.trim() : globalDefault.displayName,
            preloaderEnabled: parsed.preloaderEnabled !== undefined ? Boolean(parsed.preloaderEnabled) : globalDefault.preloaderEnabled,

            // Explicit multi-tier properties
            tenantLogo: tenantHasCustomLogo ? (parsed.uploadedLogo || parsed.companyLogo || parsed.logoImageUrl || null) : null,
            tenantLogoVersion: tenantHasCustomLogo ? parsed.uploadedLogoVersion : null,
            tenantSidebarLogo: tenantHasCustomSidebarLogo ? (parsed.uploadedSidebarLogo || parsed.sidebarLogoAsset || null) : null,
            tenantSidebarLogoVersion: tenantHasCustomSidebarLogo ? (parsed.uploadedSidebarLogoVersion || parsed.sidebarLogoVersion) : null,
            globalLogo: globalDefault.uploadedLogo || globalDefault.companyLogo || null,
            globalLogoVersion: globalDefault.uploadedLogoVersion || null,
            globalSidebarLogo: globalDefault.uploadedSidebarLogo || globalDefault.sidebarLogoAsset || null,
            globalSidebarLogoVersion: globalDefault.uploadedSidebarLogoVersion || globalDefault.sidebarLogoVersion || null,
            uiTheme: globalDefault.uiTheme || 'classic',
          };

          const tenantConfig = normalizeBranding(effectiveTenantConfig, globalDefault);
          return {
            ...tenantConfig,
            isCustomOverride: true,
          };
        } catch {}
      }
    }

    return {
      ...globalDefault,
      globalLogo: globalDefault.uploadedLogo || globalDefault.companyLogo || null,
      globalLogoVersion: globalDefault.uploadedLogoVersion || null,
      globalSidebarLogo: globalDefault.uploadedSidebarLogo || globalDefault.sidebarLogoAsset || null,
      globalSidebarLogoVersion: globalDefault.uploadedSidebarLogoVersion || globalDefault.sidebarLogoVersion || null,
      tenantLogo: null,
      tenantLogoVersion: null,
      tenantSidebarLogo: null,
      tenantSidebarLogoVersion: null,
      isCustomOverride: false,
    };
  } catch (err) {
    console.warn('[Branding] Failed to load branding config from database:', err);
  }

  return { ...DEFAULT_SALEFLOW_BRANDING };
}

/**
 * Saves branding configuration for a given company (or 'SYSTEM' for global default).
 */
export async function saveBrandingConfig(
  first: string | Partial<BrandingConfig>,
  second?: Partial<BrandingConfig> | string
): Promise<BrandingConfig> {
  const targetCompanyId = (typeof first === 'string' ? first : (typeof second === 'string' ? second : 'SYSTEM')).trim() || 'SYSTEM';
  const config = (typeof first === 'object' ? first : (typeof second === 'object' ? second : {})) as Partial<BrandingConfig>;
  const existing = await getBrandingConfig(targetCompanyId === 'SYSTEM' ? undefined : targetCompanyId);

  const merged = normalizeBranding(config, existing);
  merged.isCustomOverride = targetCompanyId !== 'SYSTEM';

  const client = getDatabaseClient();
  const valueJson = JSON.stringify(merged);
  const now = new Date().toISOString();

  // UPSERT into app_settings
  await client.execute(
    `INSERT INTO app_settings (company_id, key, value, description, updated_at)
     VALUES (?, ?, ?, 'Company visual identity & branding configuration', ?)
     ON CONFLICT(company_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [targetCompanyId, BRANDING_SETTING_KEY, valueJson, now]
  );

  return merged;
}

/**
 * Removes tenant branding override so the tenant reverts to global default.
 */
export async function deleteTenantBrandingOverride(companyId: string): Promise<void> {
  if (!companyId || companyId === 'SYSTEM') return;
  const client = getDatabaseClient();
  await client.execute(
    'DELETE FROM app_settings WHERE company_id = ? AND key = ?',
    [companyId, BRANDING_SETTING_KEY]
  );
}

export interface ResolvedBrandIdentity {
  displayName: string;
  logoUrl: string | null;
  sidebarLogoUrl: string | null;
  faviconUrl: string | null;
  preloaderEnabled: boolean;
  uiTheme: UiTheme;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  isCustomOverride: boolean;
}

/**
 * Single Source of Truth for fully resolved ERP Brand Identity.
 * Canonical global / tenant branding resolver.
 */
export async function getResolvedBrandIdentity(companyId?: string): Promise<ResolvedBrandIdentity> {
  const config = await getBrandingConfig(companyId);

  const logoUrl = config.uploadedLogo
    ? config.uploadedLogoVersion
      ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion}`
      : config.uploadedLogo
    : (config.companyLogo || null);

  const effectiveSidebar = config.uploadedSidebarLogo || config.sidebarLogoAsset || null;
  const effectiveSidebarVersion = config.uploadedSidebarLogoVersion || config.sidebarLogoVersion || null;
  const sidebarLogoUrl = effectiveSidebar
    ? effectiveSidebarVersion
      ? `${effectiveSidebar}?v=${effectiveSidebarVersion}`
      : effectiveSidebar
    : logoUrl;

  const faviconUrl = config.uploadedFavicon
    ? config.uploadedFaviconVersion
      ? `${config.uploadedFavicon}?v=${config.uploadedFaviconVersion}`
      : config.uploadedFavicon
    : (config.favicon || '/api/branding/assets/favicon');

  return {
    displayName: config.displayName?.trim() || 'SaleFlow ERP',
    logoUrl,
    sidebarLogoUrl,
    faviconUrl,
    preloaderEnabled: Boolean(config.preloaderEnabled),
    uiTheme: config.uiTheme === 'modern' ? 'modern' : 'classic',
    primaryColor: config.primaryColor || '#0F2747',
    secondaryColor: config.secondaryColor || '#12A594',
    accentColor: config.accentColor || '#16A46A',
    fontFamily: config.fontFamily || 'Inter',
    isCustomOverride: Boolean(config.isCustomOverride),
  };
}

export * from './theme';

