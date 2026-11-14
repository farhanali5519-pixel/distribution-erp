import React from 'react';

export interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'login';
  theme?: 'light' | 'dark';
  customLogoUrl?: string | null;
  appName?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}

/**
 * Modern SaleFlow Geometric Mark (Pure SVG)
 * Navy (#0F2747, #081A2F) + Emerald (#16A46A) + Teal (#12A594)
 */
export function SaleFlowIcon({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const pixelSizes = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 52,
  };
  const px = pixelSizes[size] || 32;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      <defs>
        {/* Navy base gradient */}
        <linearGradient id="sf-navy-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F2747" />
          <stop offset="100%" stopColor="#081A2F" />
        </linearGradient>

        {/* Emerald to Teal ribbon gradient */}
        <linearGradient id="sf-emerald-teal" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#16A46A" />
          <stop offset="100%" stopColor="#12A594" />
        </linearGradient>

        {/* Soft shadow */}
        <filter id="sf-subtle-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#081A2F" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer rounded container with deep navy fill */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="url(#sf-navy-grad)"
        stroke="#12A594"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        filter="url(#sf-subtle-glow)"
      />

      {/* Dynamic S / Distribution Flow Path */}
      <path
        d="M31 16C31 14.3431 29.6569 13 28 13H20C17.7909 13 16 14.7909 16 17C16 19.2091 17.7909 21 20 21H28C30.2091 21 32 22.7909 32 25C32 27.2091 30.2091 29 28 29H17"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Forward Arrow Flow Indicator (Emerald / Teal) */}
      <path
        d="M26 33L31 37L26 41"
        stroke="url(#sf-emerald-teal)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Emerald Target Dot */}
      <circle cx="33" cy="14" r="2.2" fill="#16A46A" />
    </svg>
  );
}

export { BrandIdentity } from './BrandIdentity';

/**
 * Full Horizontal SaleFlow Logo (Icon + Typography)
 */
export function SaleFlowLogo({
  size = 'md',
  className = '',
  theme = 'dark',
  customLogoUrl,
  appName = 'SaleFlow',
  subtitle = 'VENDOR MANAGEMENT PLATFORM',
  showSubtitle = true,
}: LogoProps) {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [customLogoUrl]);

  if (customLogoUrl && !imgError) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customLogoUrl}
          alt={appName}
          onError={() => setImgError(true)}
          className={`${size === 'sm' ? 'h-7' : size === 'lg' ? 'h-11' : size === 'xl' ? 'h-14' : 'h-9'} w-auto max-w-[180px] object-contain`}
        />
        {showSubtitle && (
          <div className="flex flex-col">
            <span
              className={`font-bold text-sm tracking-tight ${theme === 'dark' ? 'text-white' : 'text-[#0F2747]'}`}
            >
              {appName}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider font-medium ${
                theme === 'dark' ? 'text-slate-400' : 'text-[#667085]'
              }`}
            >
              {subtitle}
            </span>
          </div>
        )}
      </div>
    );
  }

  const textSizes = {
    sm: { title: 'text-sm', sub: 'text-[9px]' },
    md: { title: 'text-base', sub: 'text-[10px]' },
    lg: { title: 'text-lg', sub: 'text-[11px]' },
    xl: { title: 'text-2xl', sub: 'text-xs' },
  };

  const ts = textSizes[size] || textSizes.md;
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <SaleFlowIcon size={size} />
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-2">
          <span
            className={`font-black tracking-tight ${isDark ? 'text-white' : 'text-[#0F2747]'} ${ts.title}`}
          >
            {appName}
          </span>
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              isDark
                ? 'bg-[#16A46A]/20 text-[#16A46A] border border-[#16A46A]/30'
                : 'bg-[#EAF8F2] text-[#16A46A] border border-[#16A46A]/30'
            }`}
          >
            SUPER ADMIN
          </span>
        </div>
        {showSubtitle && (
          <span
            className={`font-semibold tracking-wider uppercase mt-1 ${
              isDark ? 'text-slate-400' : 'text-[#667085]'
            } ${ts.sub}`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Prominent Centered Login / Portal Logo
 */
export function SaleFlowLoginLogo({
  appName = 'SaleFlow',
  subtitle = 'Vendor Management Platform',
  customLogoUrl,
}: {
  appName?: string;
  subtitle?: string;
  customLogoUrl?: string | null;
}) {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [customLogoUrl]);

  return (
    <div className="flex flex-col items-center justify-center text-center">
      {customLogoUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customLogoUrl}
          alt={appName}
          onError={() => setImgError(true)}
          className="h-14 w-auto max-w-[220px] object-contain mb-3"
        />
      ) : (
        <div className="mb-3">
          <SaleFlowIcon size="xl" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-[#0F2747]">
          {appName}
        </h1>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EAF8F2] text-[#16A46A] border border-[#16A46A]/20">
          PRO
        </span>
      </div>
      <p className="text-xs text-[#667085] mt-1 max-w-sm font-medium">
        {subtitle}
      </p>
    </div>
  );
}
