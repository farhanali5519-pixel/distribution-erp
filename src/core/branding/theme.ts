export const APPROVED_FONTS = [
  'Inter',
  'Roboto',
  'Poppins',
  'Open Sans',
  'Nunito',
  'Manrope',
  'Montserrat',
  'IBM Plex Sans',
  'System UI',
] as const;

export type ApprovedFont = (typeof APPROVED_FONTS)[number];

export const APPROVED_TEXT_FONTS = APPROVED_FONTS;

export const APPROVED_NUMERIC_FONTS = [
  'Same as Text Font',
  'Inter',
  'Roboto',
  'Arial',
  'IBM Plex Sans',
  'Montserrat',
  'Poppins',
  'System UI',
] as const;

export type ApprovedNumericFont = (typeof APPROVED_NUMERIC_FONTS)[number];

export type UiTheme = 'classic' | 'modern';
export const APPROVED_UI_THEMES = ['classic', 'modern'] as const;

export type NumericDigitStyle = 'tabular' | 'proportional';
export type FontSizeScale = 'sm' | 'md' | 'lg';

/**
 * Standardized SaleFlow Vendor Brand Tokens
 */
export const SALEFLOW_BRAND = {
  primaryNavy: '#0F2747',
  deepNavy: '#081A2F',
  emerald: '#16A46A',
  teal: '#12A594',
  softGreen: '#EAF8F2',
  pageBg: '#F5F7FA',
  cardBg: '#FFFFFF',
  primaryText: '#172033',
  secondaryText: '#667085',
  borders: '#E4E7EC',
  danger: '#D92D20',
  warning: '#F79009',
  info: '#2E90FA',
} as const;

export interface BrandingConfig {
  companyLogo: string | null;
  favicon: string | null;
  displayName: string;
  // Global Application UI Theme
  uiTheme?: UiTheme;
  // Uploaded Branding Assets
  uploadedLogo?: string | null;
  uploadedLogoVersion?: number | string | null;
  uploadedSidebarLogo?: string | null;
  uploadedSidebarLogoVersion?: number | string | null;
  sidebarLogoAsset?: string | null;
  sidebarLogoVersion?: number | string | null;
  uploadedFavicon?: string | null;
  uploadedFaviconVersion?: number | string | null;
  // Explicit multi-tier logo resolution
  tenantLogo?: string | null;
  tenantLogoVersion?: number | string | null;
  tenantSidebarLogo?: string | null;
  tenantSidebarLogoVersion?: number | string | null;
  globalLogo?: string | null;
  globalLogoVersion?: number | string | null;
  globalSidebarLogo?: string | null;
  globalSidebarLogoVersion?: number | string | null;
  // Global Preloader Control
  preloaderEnabled?: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  sidebarColor: string;
  headerColor: string;
  backgroundColor: string;
  buttonStyle: 'rounded' | 'square' | 'pill';
  borderRadius: 'sm' | 'md' | 'lg' | 'full';
  // Backward compatibility alias for text font
  fontFamily: ApprovedFont;
  fontSizeScale: FontSizeScale;
  // Controlled Typography System
  textFontFamily?: ApprovedFont;
  numericFontFamily?: ApprovedNumericFont;
  sizeScale?: FontSizeScale;
  numericStyle?: NumericDigitStyle;
  loginBranding: {
    title: string;
    subtitle: string;
    logoUrl: string | null;
    showSaleFlowBadge: boolean;
  };
  isCustomOverride?: boolean;
}

export const DEFAULT_SALEFLOW_BRANDING: BrandingConfig = {
  companyLogo: null,
  favicon: null,
  displayName: 'SaleFlow ERP',
  uiTheme: 'classic',
  uploadedLogo: null,
  uploadedLogoVersion: null,
  uploadedSidebarLogo: null,
  uploadedSidebarLogoVersion: null,
  sidebarLogoAsset: null,
  sidebarLogoVersion: null,
  uploadedFavicon: null,
  uploadedFaviconVersion: null,
  tenantLogo: null,
  tenantLogoVersion: null,
  tenantSidebarLogo: null,
  tenantSidebarLogoVersion: null,
  globalLogo: null,
  globalLogoVersion: null,
  globalSidebarLogo: null,
  globalSidebarLogoVersion: null,
  preloaderEnabled: false,
  primaryColor: '#0F2747',
  secondaryColor: '#12A594',
  accentColor: '#16A46A',
  sidebarColor: '#081A2F',
  headerColor: '#FFFFFF',
  backgroundColor: '#F5F7FA',
  buttonStyle: 'rounded',
  borderRadius: 'md',
  fontFamily: 'Inter',
  fontSizeScale: 'md',
  textFontFamily: 'Inter',
  numericFontFamily: 'Same as Text Font',
  sizeScale: 'md',
  numericStyle: 'tabular',
  loginBranding: {
    title: 'SaleFlow ERP',
    subtitle: 'Enterprise Sales & Distribution System',
    logoUrl: null,
    showSaleFlowBadge: true,
  },
  isCustomOverride: false,
};

/**
 * Returns exact font stack CSS for a given font name
 */
export function getFontFamilyCss(font: string, fallbackTextFont: string = 'Inter'): string {
  switch (font) {
    case 'Same as Text Font':
      return getFontFamilyCss(fallbackTextFont);
    case 'Inter':
      return "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case 'Roboto':
      return "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Arial':
      return "Arial, Helvetica, sans-serif";
    case 'IBM Plex Sans':
      return "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Montserrat':
      return "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Poppins':
      return "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Open Sans':
      return "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Nunito':
      return "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'Manrope':
      return "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'System UI':
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    default:
      return `'${font}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  }
}

/**
 * Generates inline CSS custom properties string from branding config.
 */
export function generateCssVariablesFromBranding(config: BrandingConfig): string {
  const radiusMap = {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '9999px',
  };

  const textFont = config.textFontFamily || config.fontFamily || 'Inter';
  const textFontCss = getFontFamilyCss(textFont);

  const rawNumFont = config.numericFontFamily || 'Same as Text Font';
  const numFontCss = rawNumFont === 'Same as Text Font'
    ? textFontCss
    : getFontFamilyCss(rawNumFont, textFont);

  const isProportional = config.numericStyle === 'proportional';
  const numVariant = isProportional ? 'proportional-nums lining-nums' : 'tabular-nums lining-nums';
  const numFeatures = isProportional ? "'pnum' 1, 'lnum' 1" : "'tnum' 1, 'lnum' 1";

  const sizeScale = config.sizeScale || config.fontSizeScale || 'md';
  const scaleMap = {
    sm: '0.9375',
    md: '1',
    lg: '1.0625',
  };

  return `
    --brand-primary: ${config.primaryColor};
    --brand-secondary: ${config.secondaryColor};
    --brand-accent: ${config.accentColor};
    --brand-sidebar: ${config.sidebarColor};
    --brand-header: ${config.headerColor};
    --brand-bg: ${config.backgroundColor};
    --radius-custom: ${radiusMap[config.borderRadius] || '0.5rem'};
    --font-text: ${textFontCss};
    --font-sans: ${textFontCss};
    --font-numeric: ${numFontCss};
    --numeric-font-variant: ${numVariant};
    --numeric-font-feature-settings: ${numFeatures};
    --font-size-scale: ${scaleMap[sizeScale] || '1'};
    --font-custom: ${textFontCss};
    ${config.isCustomOverride && config.primaryColor ? `--color-primary: ${config.primaryColor}; --color-primary-hover: ${config.secondaryColor || config.primaryColor};` : ''}
  `.trim();
}
