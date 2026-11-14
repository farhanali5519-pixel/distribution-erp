'use client';

import { useEffect } from 'react';

export interface DynamicFaviconProps {
  initialUrl?: string;
}

/**
 * Client component to ensure the active browser tab favicon is synchronized with
 * runtime branding configuration and updates instantly without manual browser cache clearing.
 */
export function DynamicFavicon({ initialUrl = '/api/branding/assets/favicon' }: DynamicFaviconProps) {
  useEffect(() => {
    function applyFavicon(url: string) {
      if (typeof document === 'undefined') return;

      let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;

      // Also update shortcut icon for legacy browsers
      let shortcutLink = document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");
      if (!shortcutLink) {
        shortcutLink = document.createElement('link');
        shortcutLink.rel = 'shortcut icon';
        document.head.appendChild(shortcutLink);
      }
      shortcutLink.href = url;
    }

    if (initialUrl) {
      applyFavicon(initialUrl);
    }

    // Listen for live updates dispatched from branding settings
    const handleLiveUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string; version?: number | string }>;
      const version = customEvent.detail?.version || Date.now();
      const updatedUrl = customEvent.detail?.url
        ? `${customEvent.detail.url}?v=${version}`
        : `/api/branding/assets/favicon?v=${version}`;
      applyFavicon(updatedUrl);
    };

    window.addEventListener('saleflow-favicon-update', handleLiveUpdate);
    return () => {
      window.removeEventListener('saleflow-favicon-update', handleLiveUpdate);
    };
  }, [initialUrl]);

  return null;
}

export default DynamicFavicon;
