'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { BrandingConfig } from './theme';

export interface ApplicationPreloaderProps {
  config?: BrandingConfig | null;
  companyName?: string;
  isSuperAdmin?: boolean;
  previewMode?: boolean;
  onClosePreview?: () => void;
}

/**
 * Global Centralized Animated Branded Preloader
 *
 * Unified Preloader for Hard Refresh, Direct URL Load, Client-side Route Navigation, and Browser Back/Forward.
 *
 * Strict States:
 * STATE A: Preloader = OFF -> Renders null synchronously (Zero DOM, zero loader, zero overlay).
 * STATE B: Preloader = ON + Valid Main ERP Logo -> [ MAIN ERP LOGO ] + [ PROFESSIONAL LOADING BAR ] only.
 * STATE C: Preloader = ON + No Valid Main ERP Logo -> [ PROFESSIONAL LOADING ICON ONLY ] (no text, no bar, no SaleFlow mark).
 */
export function ApplicationPreloader({
  config,
  companyName,
  isSuperAdmin = false,
  previewMode = false,
  onClosePreview,
}: ApplicationPreloaderProps) {
  try {
    // 1. Strict TRUE OFF STATE (State A): Synchronous exit if preloader is not enabled
    const isEnabled = Boolean(config?.preloaderEnabled) || previewMode;
    if (!isEnabled) {
      return null;
    }

    return (
      <PreloaderRenderer
        config={config}
        companyName={companyName}
        isSuperAdmin={isSuperAdmin}
        previewMode={previewMode}
        onClosePreview={onClosePreview}
      />
    );
  } catch (err) {
    console.warn('[Preloader] Failed to render preloader, failing open:', err);
    return null;
  }
}

function PreloaderRenderer({
  config,
  companyName,
  isSuperAdmin = false,
  previewMode = false,
  onClosePreview,
}: ApplicationPreloaderProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [overrideName, setOverrideName] = useState<string | null>(null);

  // Track the current and previous route paths
  const prevPathRef = useRef<string>(pathname);
  const isNavigatingRef = useRef<boolean>(false);

  // Listen for dynamic branding updates during active session
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ displayName?: string }>;
      if (customEvent.detail?.displayName) {
        setOverrideName(customEvent.detail.displayName.trim());
      }
    };
    window.addEventListener('saleflow-branding-updated', handleUpdate);
    return () => window.removeEventListener('saleflow-branding-updated', handleUpdate);
  }, []);

  // 1. Initial Mount / Hard Refresh (Ctrl+Shift+R)
  useEffect(() => {
    if (previewMode) return;

    // Smooth exit once initial DOM has settled
    const initialTimer = setTimeout(() => {
      setMounted(true);
      const hideTimer = setTimeout(() => {
        setVisible(false);
      }, 200); // 200ms opacity transition
      return () => clearTimeout(hideTimer);
    }, 120);

    return () => clearTimeout(initialTimer);
  }, [previewMode]);

  // 2. Client-side Route Navigation: Detection of route change completion
  useEffect(() => {
    if (previewMode) return;

    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      isNavigatingRef.current = false;

      // Destination route is now rendered and ready: hide preloader immediately (no artificial delay)
      setMounted(true);
      const hideNavTimer = setTimeout(() => {
        setVisible(false);
      }, 200);

      return () => clearTimeout(hideNavTimer);
    }
  }, [pathname, previewMode]);

  // 3. Client-side Route Navigation: Intercept genuine route navigation triggers
  useEffect(() => {
    if (previewMode) return;
    if (!Boolean(config?.preloaderEnabled)) return;

    const startNavPreloader = (destPath: string) => {
      if (destPath === window.location.pathname) return;
      isNavigatingRef.current = true;
      setVisible(true);
      setMounted(false);
    };

    // A. Intercept internal anchor link clicks (sidebar, internal links)
    const handleDocumentClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      try {
        const destUrl = new URL(anchor.href, window.location.origin);
        if (destUrl.origin !== window.location.origin) return;

        // Skip same-route clicks
        if (destUrl.pathname === window.location.pathname && destUrl.search === window.location.search) {
          return;
        }

        startNavPreloader(destUrl.pathname);
      } catch {}
    };

    // B. Intercept browser Back / Forward (popstate)
    const handlePopState = () => {
      if (window.location.pathname !== prevPathRef.current) {
        startNavPreloader(window.location.pathname);
      }
    };

    // C. Intercept programmatic router.push / history.pushState
    const origPushState = window.history.pushState;
    const origReplaceState = window.history.replaceState;

    const handleHistoryChange = (url?: string | URL | null) => {
      if (!url) return;
      try {
        const destUrl = new URL(String(url), window.location.origin);
        if (destUrl.origin === window.location.origin && destUrl.pathname !== window.location.pathname) {
          startNavPreloader(destUrl.pathname);
        }
      } catch {}
    };

    window.history.pushState = function (...args) {
      handleHistoryChange(args[2]);
      return origPushState.apply(this, args);
    };

    window.history.replaceState = function (...args) {
      handleHistoryChange(args[2]);
      return origReplaceState.apply(this, args);
    };

    // D. Custom navigation start event
    const handleCustomNav = (e: Event) => {
      const detail = (e as CustomEvent<{ destination?: string }>)?.detail;
      if (detail?.destination && detail.destination !== window.location.pathname) {
        startNavPreloader(detail.destination);
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('saleflow-navigation-start', handleCustomNav);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('saleflow-navigation-start', handleCustomNav);
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
    };
  }, [previewMode, config?.preloaderEnabled]);

  // 4. Safety auto-fadeout timeout: overlay can NEVER get permanently stuck
  useEffect(() => {
    if (visible && !mounted && !previewMode) {
      const safetyTimer = setTimeout(() => {
        setMounted(true);
        const hideTimer = setTimeout(() => {
          setVisible(false);
        }, 200);
        return () => clearTimeout(hideTimer);
      }, 5000);
      return () => clearTimeout(safetyTimer);
    }
  }, [visible, mounted, previewMode]);

  // Candidate logos list according to strict ERP priority:
  // Tenant: Tenant Main Logo -> Global Main ERP Logo -> generic loader icon.
  // Super Admin: Global Main ERP Logo -> generic loader icon.
  // STRICT RULE: Sidebar Logo is NEVER used in the preloader.
  // STRICT RULE: Default SaleFlow mark is NEVER used in the preloader.
  const candidates = useMemo(() => {
    const list: string[] = [];

    if (isSuperAdmin) {
      // Super Admin: Global Main ERP Logo ONLY
      const globalUrl = config?.globalLogo
        ? config.globalLogoVersion
          ? `${config.globalLogo}?v=${config.globalLogoVersion}`
          : config.globalLogo
        : null;

      if (globalUrl) {
        list.push(globalUrl);
      } else if (config?.uploadedLogo) {
        const mainUrl = config.uploadedLogoVersion
          ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion}`
          : config.uploadedLogo;
        list.push(mainUrl);
      } else if (config?.companyLogo) {
        list.push(config.companyLogo);
      }
    } else {
      // Tenant priority: Tenant Main Logo -> Global Main ERP Logo
      const tenantUrl = config?.tenantLogo
        ? config.tenantLogoVersion
          ? `${config.tenantLogo}?v=${config.tenantLogoVersion}`
          : config.tenantLogo
        : null;

      if (tenantUrl) {
        list.push(tenantUrl);
      } else if (config?.uploadedLogo) {
        const mainUrl = config.uploadedLogoVersion
          ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion}`
          : config.uploadedLogo;
        list.push(mainUrl);
      } else if (config?.companyLogo) {
        list.push(config.companyLogo);
      }

      const globalUrl = config?.globalLogo
        ? config.globalLogoVersion
          ? `${config.globalLogo}?v=${config.globalLogoVersion}`
          : config.globalLogo
        : null;

      if (globalUrl && !list.includes(globalUrl)) {
        list.push(globalUrl);
      }
    }

    return list.filter((url, index, self) => Boolean(url) && self.indexOf(url) === index);
  }, [
    isSuperAdmin,
    config?.tenantLogo,
    config?.tenantLogoVersion,
    config?.globalLogo,
    config?.globalLogoVersion,
    config?.uploadedLogo,
    config?.uploadedLogoVersion,
    config?.companyLogo,
  ]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  // Reset candidate index when candidate list changes
  const candidatesKey = candidates.join('|');
  useEffect(() => {
    setCandidateIndex(0);
  }, [candidatesKey]);

  const currentLogo = candidateIndex < candidates.length ? candidates[candidateIndex] : null;

  const handleImageError = () => {
    // Immediately failover to next candidate or State C generic loading icon
    setCandidateIndex((prev) => prev + 1);
  };

  // Track active data-theme for proper preloader neutral backdrop
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const syncTheme = () => {
      if (typeof document === 'undefined') return;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      setIsDarkMode(isDark);
    };
    syncTheme();

    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          syncTheme();
        }
      }
    });

    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('saleflow-theme-changed', syncTheme);
    }
    return () => {
      observer.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('saleflow-theme-changed', syncTheme);
      }
    };
  }, []);

  // Fail-open: if invisible and not in preview, unmount
  if (!visible && !previewMode) {
    return null;
  }

  const primaryColor = config?.primaryColor || '#0F2747';
  const secondaryColor = config?.secondaryColor || '#12A594';
  const accentColor = config?.accentColor || '#16A46A';
  const bgColor = isDarkMode ? '#081422' : '#FFFFFF';

  // Resolved ERP Display Name for accessibility aria-label only
  const resolvedDisplayName = (
    overrideName ||
    config?.displayName?.trim() ||
    companyName?.trim() ||
    'SaleFlow ERP'
  );

  return (
    <div
      id="saleflow-global-preloader"
      role="status"
      aria-live="polite"
      aria-label={`Loading ${resolvedDisplayName}`}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none overflow-hidden transition-opacity duration-200 ease-out ${
        mounted && !previewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        backgroundColor: bgColor,
        fontFamily: 'var(--font-text, Inter, -apple-system, sans-serif)',
        height: '100dvh',
        width: '100vw',
      }}
    >
      <style>{`
        @keyframes preloader-subtle-breathe {
          0%, 100% {
            opacity: 0.92;
            transform: scale(0.99);
          }
          50% {
            opacity: 1;
            transform: scale(1.015);
          }
        }
        @keyframes preloader-bar-slide {
          0% {
            left: -40%;
            width: 35%;
          }
          50% {
            left: 30%;
            width: 55%;
          }
          100% {
            left: 105%;
            width: 35%;
          }
        }
        @keyframes preloader-arc-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .preloader-breathe,
          .preloader-arc-spin,
          .preloader-bar-slider {
            animation: none !important;
            transform: none !important;
          }
          .preloader-bar-slider {
            left: 0 !important;
            width: 100% !important;
            opacity: 0.75;
          }
        }
      `}</style>

      {/* Subtle ambient brand glow in background */}
      <div
        className="absolute w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] rounded-full blur-3xl pointer-events-none opacity-20 transition-all duration-700"
        style={{
          background: `radial-gradient(circle, ${accentColor} 0%, ${secondaryColor} 40%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center p-6 max-w-sm w-full text-center">
        {/* STATE B: MAIN ERP LOGO + PROFESSIONAL LOADING BAR ONLY */}
        {currentLogo ? (
          <div className="flex flex-col items-center justify-center space-y-5">
            {/* Centered Breathe Logo Container */}
            <div
              className="preloader-breathe relative flex items-center justify-center p-3 rounded-2xl transition-all"
              style={{
                animation: 'preloader-subtle-breathe 2.6s ease-in-out infinite',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={currentLogo}
                src={currentLogo}
                alt=""
                onError={handleImageError}
                loading="eager"
                decoding="async"
                className="w-auto h-auto max-w-[160px] sm:max-w-[220px] max-h-[56px] object-contain transition-all"
              />
            </div>

            {/* Professional Indeterminate Loading Bar */}
            <div className="flex flex-col items-center pt-2">
              <div
                className="relative w-[220px] sm:w-[260px] max-w-[75vw] h-[3.5px] rounded-full overflow-hidden"
                style={{ backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 39, 71, 0.08)' }}
              >
                <div
                  className="preloader-bar-slider absolute inset-y-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 50%, ${accentColor} 100%)`,
                    animation: 'preloader-bar-slide 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* STATE C: NO-LOGO / GENERIC PROFESSIONAL LOADER ICON ONLY */
          <div className="flex flex-col items-center justify-center">
            <div
              className="preloader-arc-spin"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '2.5px solid transparent',
                borderTopColor: accentColor || 'var(--accent-emerald, #16A46A)',
                borderRightColor: `${secondaryColor || '#12A594'}90`,
                animation: 'preloader-arc-spin 0.8s linear infinite',
              }}
            />
          </div>
        )}

        {previewMode && onClosePreview && (
          <button
            type="button"
            onClick={onClosePreview}
            className="mt-6 px-4 py-2 rounded-xl bg-white border border-[#D0D5DD] text-xs font-bold text-[#0F2747] shadow-sm hover:bg-[#F8FAFC] cursor-pointer transition-all"
          >
            Close Preloader Preview
          </button>
        )}
      </div>
    </div>
  );
}

export default ApplicationPreloader;
