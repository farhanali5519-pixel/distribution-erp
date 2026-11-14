'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { resolveRouteTitle, formatFullPageTitle } from './route-titles';

export interface DynamicDocumentTitleProps {
  initialAppName?: string;
  isSuperAdmin?: boolean;
}

/**
 * Client-side document title synchronizer.
 *
 * Guarantees that:
 * 1. SPA route navigations immediately update document.title to:
 *    "<Page Name> | <Resolved ERP Display Name>"
 * 2. Saving "Default ERP Display Name" in System Branding instantly updates
 *    document.title on screen with zero reload via custom event.
 */
export function DynamicDocumentTitle({
  initialAppName = 'SaleFlow ERP',
  isSuperAdmin = false,
}: DynamicDocumentTitleProps) {
  const pathname = usePathname();
  const appNameRef = useRef<string>(initialAppName);

  // Sync ref if initialAppName prop updates via server component re-render
  useEffect(() => {
    if (initialAppName && initialAppName.trim()) {
      appNameRef.current = initialAppName.trim();
    }
  }, [initialAppName]);

  // Update title on route navigation
  useEffect(() => {
    const updateTitle = () => {
      const pageTitle = resolveRouteTitle(pathname, isSuperAdmin);
      const fullTitle = formatFullPageTitle(pageTitle, appNameRef.current);
      if (document.title !== fullTitle) {
        document.title = fullTitle;
      }
    };

    updateTitle();

    // Listen for instant branding update events (Save Global Theme)
    const handleBrandingUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ displayName?: string }>;
      if (customEvent.detail?.displayName) {
        appNameRef.current = customEvent.detail.displayName.trim();
        updateTitle();
      }
    };

    window.addEventListener('saleflow-branding-updated', handleBrandingUpdate);
    return () => {
      window.removeEventListener('saleflow-branding-updated', handleBrandingUpdate);
    };
  }, [pathname, isSuperAdmin]);

  return null;
}

export default DynamicDocumentTitle;
