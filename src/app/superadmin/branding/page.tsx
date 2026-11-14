'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Palette,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Sparkles,
  Type,
  Layout,
  Sliders,
  Upload,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  X,
  Play,
} from 'lucide-react';
import {
  APPROVED_FONTS,
  APPROVED_TEXT_FONTS,
  APPROVED_NUMERIC_FONTS,
  getFontFamilyCss,
  type BrandingConfig,
  type ApprovedFont,
  type ApprovedNumericFont,
  type NumericDigitStyle,
  type FontSizeScale,
  DEFAULT_SALEFLOW_BRANDING,
} from '@/core/branding/theme';
import { BrandIdentity } from '@/core/branding/BrandIdentity';
import { ApplicationPreloader } from '@/core/branding/ApplicationPreloader';

export default function GlobalBrandingPage() {
  const router = useRouter();
  const [config, setConfig] = useState<BrandingConfig>(DEFAULT_SALEFLOW_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Direct Upload & Preview states
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingSidebarLogo, setIsUploadingSidebarLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [showSidebarLogoModal, setShowSidebarLogoModal] = useState(false);
  const [showFaviconModal, setShowFaviconModal] = useState(false);
  const [showPreloaderPreview, setShowPreloaderPreview] = useState(false);
  const [showAdvancedUrls, setShowAdvancedUrls] = useState(false);
  const [logoOptimization, setLogoOptimization] = useState<{ original: string; optimized: string } | null>(null);
  const [sidebarLogoOptimization, setSidebarLogoOptimization] = useState<{ original: string; optimized: string } | null>(null);
  const [faviconOptimization, setFaviconOptimization] = useState<{ original: string; optimized: string } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const sidebarLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const fetchBranding = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/superadmin/branding');
      const json = await res.json();
      if (json.success && json.data) {
        setConfig(json.data);
      }
    } catch (err) {
      console.error('Failed to load global branding:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  const currentTextFont = config.textFontFamily || config.fontFamily || 'Inter';
  const currentNumFont = config.numericFontFamily || 'Same as Text Font';
  const currentSizeScale = config.sizeScale || config.fontSizeScale || 'md';
  const currentNumericStyle = config.numericStyle || 'tabular';

  const previewTextFontCss = getFontFamilyCss(currentTextFont);
  const previewNumFontCss =
    currentNumFont === 'Same as Text Font'
      ? previewTextFontCss
      : getFontFamilyCss(currentNumFont, currentTextFont);

  const isProportional = currentNumericStyle === 'proportional';
  const previewNumVariant = isProportional ? 'proportional-nums lining-nums' : 'tabular-nums lining-nums';
  const previewNumFeatures = isProportional ? "'pnum' 1, 'lnum' 1" : "'tnum' 1, 'lnum' 1";

  // Reflect live theme variables onto the document root dynamically during editing
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--font-text', previewTextFontCss);
      root.style.setProperty('--font-numeric', previewNumFontCss);
      root.style.setProperty('--numeric-font-variant', previewNumVariant);
      root.style.setProperty('--numeric-font-feature-settings', previewNumFeatures);
    }
  }, [previewTextFontCss, previewNumFontCss, previewNumVariant, previewNumFeatures]);

  // Handle Direct Logo File Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side quick check: generous 25 MB safety ceiling
    const MAX_UPLOAD_CEILING = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_CEILING) {
      setStatusMessage({ type: 'error', text: 'Image is too large to process. Please use an image smaller than 25 MB.' });
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    setIsUploadingLogo(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'logo');

      const res = await fetch('/api/superadmin/branding/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload logo.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedLogo: data.url,
        uploadedLogoVersion: data.version,
      }));

      if (data.originalSizeFormatted && data.optimizedSizeFormatted) {
        setLogoOptimization({
          original: data.originalSizeFormatted,
          optimized: data.optimizedSizeFormatted,
        });
      }

      setStatusMessage({
        type: 'success',
        text: 'ERP Logo uploaded, optimized, and applied successfully.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Logo upload failed',
      });
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  // Handle Logo Removal
  const handleRemoveLogo = async () => {
    setIsUploadingLogo(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/branding/upload?type=logo', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove logo.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedLogo: null,
        uploadedLogoVersion: null,
      }));
      setLogoOptimization(null);

      setStatusMessage({
        type: 'success',
        text: 'Uploaded ERP Logo removed. Reverted to external URL or display name.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove logo',
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Handle Direct Sidebar Logo File Upload
  const handleSidebarLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_UPLOAD_CEILING = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_CEILING) {
      setStatusMessage({ type: 'error', text: 'Image is too large to process. Please use an image smaller than 25 MB.' });
      if (sidebarLogoInputRef.current) sidebarLogoInputRef.current.value = '';
      return;
    }

    setIsUploadingSidebarLogo(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'sidebar-logo');

      const res = await fetch('/api/superadmin/branding/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload sidebar logo.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedSidebarLogo: data.url,
        uploadedSidebarLogoVersion: data.version,
        sidebarLogoAsset: data.url,
        sidebarLogoVersion: data.version,
      }));

      if (data.originalSizeFormatted && data.optimizedSizeFormatted) {
        setSidebarLogoOptimization({
          original: data.originalSizeFormatted,
          optimized: data.optimizedSizeFormatted,
        });
      }

      setStatusMessage({
        type: 'success',
        text: 'Sidebar Logo uploaded, optimized, and applied successfully.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Sidebar logo upload failed',
      });
    } finally {
      setIsUploadingSidebarLogo(false);
      if (sidebarLogoInputRef.current) sidebarLogoInputRef.current.value = '';
    }
  };

  // Handle Sidebar Logo Removal
  const handleRemoveSidebarLogo = async () => {
    setIsUploadingSidebarLogo(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/branding/upload?type=sidebar-logo', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove sidebar logo.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedSidebarLogo: null,
        uploadedSidebarLogoVersion: null,
        sidebarLogoAsset: null,
        sidebarLogoVersion: null,
      }));
      setSidebarLogoOptimization(null);

      setStatusMessage({
        type: 'success',
        text: 'Sidebar Logo removed. Sidebar automatically falls back to Main ERP Logo.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove sidebar logo',
      });
    } finally {
      setIsUploadingSidebarLogo(false);
    }
  };

  // Handle Direct Favicon File Upload
  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side quick check: generous 25 MB safety ceiling
    const MAX_UPLOAD_CEILING = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_CEILING) {
      setStatusMessage({ type: 'error', text: 'Image is too large to process. Please use an image smaller than 25 MB.' });
      if (faviconInputRef.current) faviconInputRef.current.value = '';
      return;
    }

    setIsUploadingFavicon(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'favicon');

      const res = await fetch('/api/superadmin/branding/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload favicon.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedFavicon: data.url,
        uploadedFaviconVersion: data.version,
      }));

      if (data.originalSizeFormatted && data.optimizedSizeFormatted) {
        setFaviconOptimization({
          original: data.originalSizeFormatted,
          optimized: data.optimizedSizeFormatted,
        });
      }

      // Immediately sync active tab favicon
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('saleflow-favicon-update', {
            detail: { url: data.url, version: data.version },
          })
        );
      }

      setStatusMessage({
        type: 'success',
        text: 'Favicon uploaded, optimized, and browser tab updated successfully.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Favicon upload failed',
      });
    } finally {
      setIsUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
    }
  };

  // Handle Favicon Removal
  const handleRemoveFavicon = async () => {
    setIsUploadingFavicon(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/branding/upload?type=favicon', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove favicon.');
      }

      setConfig((prev) => ({
        ...prev,
        uploadedFavicon: null,
        uploadedFaviconVersion: null,
      }));
      setFaviconOptimization(null);

      // Sync active tab to default
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('saleflow-favicon-update', {
            detail: { url: '/api/branding/assets/favicon', version: Date.now() },
          })
        );
      }

      setStatusMessage({
        type: 'success',
        text: 'Uploaded Favicon removed. Reverted to external URL or SaleFlow default icon.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove favicon',
      });
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const payload: BrandingConfig = {
        ...config,
        uiTheme: config.uiTheme === 'modern' ? 'modern' : 'classic',
        fontFamily: currentTextFont,
        textFontFamily: currentTextFont,
        numericFontFamily: currentNumFont,
        fontSizeScale: currentSizeScale,
        sizeScale: currentSizeScale,
        numericStyle: currentNumericStyle,
      };

      const res = await fetch('/api/superadmin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Global platform default branding saved successfully' });
        setConfig(json.data);

        // Apply selected theme globally now that user has explicitly saved
        const effectiveTheme = json.data?.uiTheme === 'modern' ? 'modern' : 'classic';
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-ui-theme', effectiveTheme);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('saleflow_ui_theme', effectiveTheme);
          window.dispatchEvent(
            new CustomEvent('saleflow-branding-updated', {
              detail: { displayName: json.data?.displayName, uiTheme: effectiveTheme },
            })
          );
        }

        router.refresh();
      } else {
        throw new Error(json.error || 'Failed to save branding');
      }
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const hasAssets = Boolean(config.uploadedLogo || config.uploadedSidebarLogo || config.sidebarLogoAsset || config.uploadedFavicon);
    let removeUploadedAssets = false;

    if (hasAssets) {
      removeUploadedAssets = confirm(
        'Reset global branding to default SaleFlow theme settings?\n\nClick OK to also remove uploaded logo, sidebar logo, and favicon assets from server storage, or Cancel to abort.'
      );
      if (!removeUploadedAssets) return;
    } else {
      if (!confirm('Reset global branding to default SaleFlow theme settings?')) {
        return;
      }
    }

    try {
      if (removeUploadedAssets) {
        if (config.uploadedLogo) {
          await fetch('/api/superadmin/branding/upload?type=logo', { method: 'DELETE' });
        }
        if (config.uploadedSidebarLogo || config.sidebarLogoAsset) {
          await fetch('/api/superadmin/branding/upload?type=sidebar-logo', { method: 'DELETE' });
        }
        if (config.uploadedFavicon) {
          await fetch('/api/superadmin/branding/upload?type=favicon', { method: 'DELETE' });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('saleflow-favicon-update', {
              detail: { url: '/api/branding/assets/favicon', version: Date.now() },
            })
          );
        }
      }
      const res = await fetch('/api/superadmin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_SALEFLOW_BRANDING),
      });
      const json = await res.json();
      const newConfig = json.data || DEFAULT_SALEFLOW_BRANDING;
      setConfig(newConfig);

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-ui-theme', 'classic');
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('saleflow_ui_theme', 'classic');
        window.dispatchEvent(
          new CustomEvent('saleflow-branding-updated', {
            detail: { displayName: newConfig.displayName, uiTheme: 'classic' },
          })
        );
      }

      router.refresh();
      setStatusMessage({ type: 'success', text: 'Global branding reset to SaleFlow default theme settings.' });
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  // Resolved active favicon for browser tab preview
  const resolvedFaviconUrl = config.uploadedFavicon
    ? `${config.uploadedFavicon}?v=${config.uploadedFaviconVersion || ''}`
    : config.favicon || '/api/branding/assets/favicon';

  // Resolved active logo preview source
  const resolvedLogoUrl = config.uploadedLogo
    ? `${config.uploadedLogo}?v=${config.uploadedLogoVersion || ''}`
    : config.companyLogo || null;

  // Resolved active sidebar logo preview source
  const resolvedSidebarLogoUrl = config.uploadedSidebarLogo || config.sidebarLogoAsset
    ? `${config.uploadedSidebarLogo || config.sidebarLogoAsset}?v=${config.uploadedSidebarLogoVersion || config.sidebarLogoVersion || ''}`
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#16A46A]" />
        <span className="text-sm text-[#667085] font-medium">
          Loading branding configuration...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
            Global Branding & Theme Customizer
          </h2>
          <p className="text-xs text-[#667085] mt-0.5">
            Default platform aesthetic applied across all tenant ERP workspaces unless individually overridden
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl border border-[#E4E7EC] bg-white hover:bg-[#F5F7FA] text-xs font-semibold text-[#667085] hover:text-[#172033] cursor-pointer shadow-sm transition-all"
          >
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#16A46A] hover:bg-[#12A594] text-white text-xs font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Global Theme</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Form Column */}
        <div className="space-y-6">
          {/* ============================================================ */}
          {/* APPLICATION UI THEME SELECTOR                                */}
          {/* ============================================================ */}
          <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
                <Layout className="w-4 h-4 text-[#16A46A]" />
                <span>Application UI Theme</span>
              </h3>
              <span className="text-[10px] font-semibold text-[#667085] bg-[#F5F7FA] px-2.5 py-0.5 rounded-full border border-[#E4E7EC]">
                Global ERP Shell
              </span>
            </div>

            <p className="text-[11px] text-[#667085] leading-relaxed">
              Select the active global user interface theme. Changes preview in real-time on the right and take global effect upon clicking <strong>Save Global Theme</strong>.
            </p>

            {/* Radio Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Option 1: Classic SaleFlow */}
              <div
                onClick={() => setConfig({ ...config, uiTheme: 'classic' })}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (config.uiTheme || 'classic') === 'classic'
                    ? 'border-[#0F2747] bg-slate-50/70 shadow-sm ring-1 ring-[#0F2747]/20'
                    : 'border-[#E4E7EC] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${
                        (config.uiTheme || 'classic') === 'classic'
                          ? 'border-[#0F2747] bg-[#0F2747]'
                          : 'border-[#CBD5E1]'
                      }`}
                    >
                      {(config.uiTheme || 'classic') === 'classic' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0F2747] flex items-center gap-1.5">
                        <span>Classic SaleFlow</span>
                        <span className="text-[9px] font-semibold text-[#475467] bg-[#EAECF0] px-1.5 py-0.5 rounded">Default</span>
                      </div>
                      <div className="text-[11px] text-[#667085] mt-1 leading-snug">
                        Current production interface
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual Swatch for Classic */}
                <div className="mt-3.5 p-2 rounded-lg bg-white border border-[#E4E7EC] flex items-center gap-2">
                  <div className="w-5 h-8 rounded bg-white border border-[#CBD5E1] shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2 w-14 rounded bg-[#0F172A]" />
                    <div className="h-1.5 w-20 rounded bg-[#E2E8F0]" />
                  </div>
                </div>
              </div>

              {/* Option 2: Modern Blue-Green */}
              <div
                onClick={() => setConfig({ ...config, uiTheme: 'modern' })}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  config.uiTheme === 'modern'
                    ? 'border-[#10B981] bg-emerald-50/40 shadow-sm ring-1 ring-[#10B981]/30'
                    : 'border-[#E4E7EC] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5 ${
                        config.uiTheme === 'modern'
                          ? 'border-[#10B981] bg-[#10B981]'
                          : 'border-[#CBD5E1]'
                      }`}
                    >
                      {config.uiTheme === 'modern' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0F2747] flex items-center gap-1.5">
                        <span>Modern Blue-Green</span>
                        <span className="text-[9px] font-bold text-[#059669] bg-[#ECFDF5] px-1.5 py-0.5 rounded border border-[#A7F3D0]">Modern SaaS</span>
                      </div>
                      <div className="text-[11px] text-[#667085] mt-1 leading-snug">
                        Clean compact blue/green ERP interface
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual Swatch for Modern */}
                <div className="mt-3.5 p-2 rounded-lg bg-[#F4F6F8] border border-[#E4E7EC] flex items-center gap-2">
                  <div className="w-5 h-8 rounded bg-[#08182B] shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2 w-14 rounded bg-[#10B981]" />
                    <div className="h-1.5 w-20 rounded bg-[#CBD5E1]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* REDESIGNED COMPACT: IDENTITY & APP TITLE                      */}
          {/* ============================================================ */}
          <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#16A46A]" />
              <span>Identity & App Title</span>
            </h3>

            {/* 1. Default ERP Display Name */}
            <div>
              <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                Default ERP Display Name
              </label>
              <input
                type="text"
                value={config.displayName}
                onChange={(e) => setConfig({ ...config, displayName: e.target.value })}
                placeholder="SaleFlow ERP"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A] focus:ring-1 focus:ring-[#16A46A] transition-all"
              />
            </div>

            {/* 2. Direct ERP Logo Upload */}
            <div className="pt-2 border-t border-[#F2F4F7]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-[#344054]">
                  Main ERP Logo
                </label>
                {config.uploadedLogo && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Uploaded File Active
                  </span>
                )}
              </div>

              {/* Logo Preview & Action Row */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Visual Thumbnail */}
                <div className="h-10 px-3 py-1 bg-white border border-[#E4E7EC] rounded-lg flex items-center justify-center max-w-[200px] shrink-0 overflow-hidden">
                  {resolvedLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedLogoUrl}
                      alt={config.displayName?.trim() || 'SaleFlow ERP'}
                      className="max-h-8 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-[#667085] truncate">
                      {config.displayName || 'SaleFlow ERP'}
                    </span>
                  )}
                </div>

                {/* Upload / Preview / Remove Controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingLogo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A46A]" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#16A46A]" />
                    )}
                    <span>Upload Logo</span>
                  </button>

                  {resolvedLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setShowLogoModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer"
                      title="Preview Logo"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#667085]" />
                      <span>Preview</span>
                    </button>
                  )}

                  {config.uploadedLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={isUploadingLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-medium shadow-xs transition-all cursor-pointer"
                      title="Remove uploaded logo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
              {logoOptimization && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Original: {logoOptimization.original} • Optimized: {logoOptimization.optimized}</span>
                </div>
              )}
              <p className="text-[10px] text-[#667085] mt-1.5 font-medium">
                Main ERP Logo: Used on light/default application surfaces and preloader.
              </p>
            </div>

            {/* 3. Direct Sidebar Logo Upload (Optional) */}
            <div className="pt-2 border-t border-[#F2F4F7]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-[#344054]">
                  Sidebar Logo <span className="text-[10px] font-normal text-[#667085]">(Optional)</span>
                </label>
                {(config.uploadedSidebarLogo || config.sidebarLogoAsset) ? (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Uploaded File Active
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                    Using Main ERP Logo
                  </span>
                )}
              </div>

              {/* Sidebar Logo Preview & Action Row */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Visual Thumbnail */}
                <div className="h-10 px-3 py-1 bg-white border border-[#E4E7EC] rounded-lg flex items-center justify-center max-w-[200px] shrink-0 overflow-hidden">
                  {resolvedSidebarLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedSidebarLogoUrl}
                      alt={config.displayName?.trim() ? `${config.displayName.trim()} Sidebar Logo` : 'SaleFlow ERP Sidebar Logo'}
                      className="max-h-8 w-auto object-contain"
                    />
                  ) : resolvedLogoUrl ? (
                    <div className="flex items-center gap-1.5 opacity-60" title="Fallback: Main ERP Logo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolvedLogoUrl}
                        alt={config.displayName?.trim() || 'SaleFlow ERP'}
                        className="max-h-7 w-auto object-contain"
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#667085] italic truncate">
                      Default Mark Fallback
                    </span>
                  )}
                </div>

                {/* Upload / Preview / Remove Controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    ref={sidebarLogoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleSidebarLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => sidebarLogoInputRef.current?.click()}
                    disabled={isUploadingSidebarLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingSidebarLogo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A46A]" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#16A46A]" />
                    )}
                    <span>Upload Sidebar Logo</span>
                  </button>

                  {(resolvedSidebarLogoUrl || resolvedLogoUrl) && (
                    <button
                      type="button"
                      onClick={() => setShowSidebarLogoModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer"
                      title="Preview Sidebar Logo"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#667085]" />
                      <span>Preview</span>
                    </button>
                  )}

                  {(config.uploadedSidebarLogo || config.sidebarLogoAsset) && (
                    <button
                      type="button"
                      onClick={handleRemoveSidebarLogo}
                      disabled={isUploadingSidebarLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-medium shadow-xs transition-all cursor-pointer"
                      title="Remove uploaded sidebar logo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
              {sidebarLogoOptimization && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Original: {sidebarLogoOptimization.original} • Optimized: {sidebarLogoOptimization.optimized}</span>
                </div>
              )}
              <p className="text-[10px] text-[#667085] mt-1.5 font-medium">
                Sidebar Logo: Used on dark surfaces, sidebar, and login screens.
              </p>
            </div>

            {/* 4. Direct Favicon Upload */}
            <div className="pt-2 border-t border-[#F2F4F7]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-[#344054]">
                  Favicon
                </label>
                {config.uploadedFavicon && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Uploaded File Active
                  </span>
                )}
              </div>

              {/* Favicon Preview & Action Row */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Visual Square Thumbnail */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#E4E7EC] p-1 flex items-center justify-center shrink-0 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedFaviconUrl}
                      alt={config.displayName?.trim() ? `${config.displayName.trim()} Favicon` : 'SaleFlow ERP Favicon'}
                      className="w-6 h-6 object-contain"
                    />
                  </div>
                  <span className="text-[11px] text-[#475467] font-medium">
                    {config.uploadedFavicon ? 'Custom Favicon' : 'SaleFlow Default Icon'}
                  </span>
                </div>

                {/* Upload / Preview / Remove Controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/x-icon,image/png,image/webp,image/jpeg"
                    onChange={handleFaviconUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={isUploadingFavicon}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingFavicon ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A46A]" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#16A46A]" />
                    )}
                    <span>Upload Favicon</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFaviconModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D0D5DD] hover:bg-[#F2F4F7] text-[#344054] text-xs font-medium shadow-xs transition-all cursor-pointer"
                    title="Preview Favicon Tab"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#667085]" />
                    <span>Preview</span>
                  </button>

                  {config.uploadedFavicon && (
                    <button
                      type="button"
                      onClick={handleRemoveFavicon}
                      disabled={isUploadingFavicon}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-medium shadow-xs transition-all cursor-pointer"
                      title="Remove uploaded favicon"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
              {faviconOptimization && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Original: {faviconOptimization.original} • Optimized: {faviconOptimization.optimized}</span>
                </div>
              )}
              <p className="text-[10px] text-[#667085] mt-1.5">
                Recommended: square PNG/ICO/WebP, 32×32 or 64×64. Server automatically resizes & compresses up to 25 MB.
              </p>
            </div>

            {/* 4. Preloader Toggle Control */}
            <div className="pt-2 border-t border-[#F2F4F7]">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-[11px] font-semibold text-[#344054]">
                    Preloader
                  </label>
                  <p className="text-[10px] text-[#667085] mt-0.5">
                    Show branded loading screen while the application is initializing.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-bold uppercase tracking-wider ${config.preloaderEnabled ? 'text-[#16A46A]' : 'text-[#98A2B3]'}`}>
                    {config.preloaderEnabled ? 'ON' : 'OFF'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(config.preloaderEnabled)}
                    onClick={() => setConfig({ ...config, preloaderEnabled: !config.preloaderEnabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.preloaderEnabled ? 'bg-[#16A46A]' : 'bg-[#E4E7EC]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        config.preloaderEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 5. Collapsible Advanced / External URLs */}
            <div className="pt-2 border-t border-[#F2F4F7]">
              <button
                type="button"
                onClick={() => setShowAdvancedUrls((prev) => !prev)}
                className="w-full flex items-center justify-between py-1 text-xs font-semibold text-[#475467] hover:text-[#0F2747] transition-colors"
              >
                <span>Advanced / External URLs</span>
                {showAdvancedUrls ? <ChevronUp className="w-4 h-4 text-[#667085]" /> : <ChevronDown className="w-4 h-4 text-[#667085]" />}
              </button>

              {showAdvancedUrls && (
                <div className="mt-3 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#344054] mb-1">
                      Logo Image URL (Optional Fallback)
                    </label>
                    <input
                      type="text"
                      value={config.companyLogo || ''}
                      onChange={(e) => setConfig({ ...config, companyLogo: e.target.value || null })}
                      placeholder="https://.../logo.png"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-[#344054] mb-1">
                      Favicon URL (Optional Fallback)
                    </label>
                    <input
                      type="text"
                      value={config.favicon || ''}
                      onChange={(e) => setConfig({ ...config, favicon: e.target.value || null })}
                      placeholder="https://.../favicon.ico"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Typography */}
          <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Type className="w-4 h-4 text-[#16A46A]" />
              <span>Controlled Typography System</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Text Font Family
                </label>
                <select
                  value={currentTextFont}
                  onChange={(e) => {
                    const val = e.target.value as ApprovedFont;
                    setConfig({ ...config, fontFamily: val, textFontFamily: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                >
                  {APPROVED_TEXT_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Numeric Font Family
                </label>
                <select
                  value={currentNumFont}
                  onChange={(e) => {
                    const val = e.target.value as ApprovedNumericFont;
                    setConfig({ ...config, numericFontFamily: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                >
                  {APPROVED_NUMERIC_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Size Scale
                </label>
                <select
                  value={currentSizeScale}
                  onChange={(e) => {
                    const val = e.target.value as FontSizeScale;
                    setConfig({ ...config, fontSizeScale: val, sizeScale: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                >
                  <option value="sm">Compact (sm)</option>
                  <option value="md">Standard (md)</option>
                  <option value="lg">Expanded (lg)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Digit Style
                </label>
                <select
                  value={currentNumericStyle}
                  onChange={(e) => {
                    const val = e.target.value as NumericDigitStyle;
                    setConfig({ ...config, numericStyle: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A]"
                >
                  <option value="tabular">Tabular / Accounting (Equal-width digits)</option>
                  <option value="proportional">Proportional (Natural digit width)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Color Palette */}
          <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#16A46A]" />
              <span>Color System</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Primary Brand', key: 'primaryColor' as const },
                { label: 'Secondary', key: 'secondaryColor' as const },
                { label: 'Accent / Success', key: 'accentColor' as const },
                { label: 'Sidebar Background', key: 'sidebarColor' as const },
                { label: 'Header Background', key: 'headerColor' as const },
                { label: 'App Background', key: 'backgroundColor' as const },
              ].map((item) => (
                <div key={item.key}>
                  <label className="block text-[10px] font-semibold text-[#667085] mb-1 truncate">
                    {item.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config[item.key]}
                      onChange={(e) => setConfig({ ...config, [item.key]: e.target.value })}
                      className="w-8 h-8 rounded border border-[#E4E7EC] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config[item.key]}
                      onChange={(e) => setConfig({ ...config, [item.key]: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#F5F7FA] border border-[#E4E7EC] font-mono text-[10px] text-[#172033]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Component Styles */}
          <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#16A46A]" />
              <span>Components & Geometry</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Button Style
                </label>
                <select
                  value={config.buttonStyle}
                  onChange={(e) => setConfig({ ...config, buttonStyle: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033]"
                >
                  <option value="rounded">Rounded Corners (Standard)</option>
                  <option value="square">Sharp Square</option>
                  <option value="pill">Full Pill Rounded</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#344054] mb-1">
                  Card Border Radius
                </label>
                <select
                  value={config.borderRadius}
                  onChange={(e) => setConfig({ ...config, borderRadius: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E4E7EC] text-xs text-[#172033]"
                >
                  <option value="sm">Subtle (sm)</option>
                  <option value="md">Balanced (md)</option>
                  <option value="lg">Prominent (lg)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Column */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm sticky top-24 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
                <Layout className="w-4 h-4 text-[#16A46A]" />
                <span>Live Theme Preview</span>
                <span
                  className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    (config.uiTheme || 'classic') === 'modern'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-[#0F2747] border border-slate-200'
                  }`}
                >
                  {(config.uiTheme || 'classic') === 'modern' ? 'Modern Blue-Green' : 'Classic SaleFlow'}
                </span>
              </h3>

              {/* Preloader Preview Trigger */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    config.preloaderEnabled
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                  }`}
                >
                  Preloader Status: {config.preloaderEnabled ? 'ON' : 'OFF'}
                </span>

                <button
                  type="button"
                  onClick={() => setShowPreloaderPreview(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F2747] hover:bg-[#081A2F] text-white text-[11px] font-semibold shadow-xs transition-all cursor-pointer"
                  title="Test Preloader"
                >
                  <Play className="w-3 h-3 text-[#16A46A]" />
                  <span>Preview Preloader</span>
                </button>
              </div>
            </div>

            {/* Browser Tab Favicon Preview Mockup */}
            <div className="p-3 bg-[#F2F4F7] rounded-xl border border-[#E4E7EC] space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#667085] flex items-center justify-between">
                <span>Browser Tab Favicon Preview</span>
                <span className="text-[9px] text-[#98A2B3]">Simulated Chrome Tab</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#D0D5DD] rounded-t-lg shadow-xs max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedFaviconUrl}
                  alt={config.displayName?.trim() ? `${config.displayName.trim()} Favicon` : 'SaleFlow ERP Favicon'}
                  className="w-4 h-4 object-contain shrink-0"
                />
                <span className="text-xs font-medium text-[#344054] truncate max-w-[200px]">
                  {config.displayName || 'SaleFlow ERP'} - Distribution Portal
                </span>
                <span className="text-xs text-[#98A2B3] hover:text-[#344054] cursor-pointer ml-1">×</span>
              </div>
            </div>

            {/* Sidebar Brand Header Preview Mockup */}
            <div className="p-3 bg-[#081A2F] rounded-xl border border-[#172A45] space-y-2 text-white shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Sidebar Brand Preview</span>
                <span className="text-[9px] text-[#16A46A] font-semibold">
                  {resolvedSidebarLogoUrl
                    ? 'Sidebar Logo Active'
                    : resolvedLogoUrl
                    ? 'Auto Fallback: Main ERP Logo'
                    : 'Auto Fallback: Display Name'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                {/* Expanded Sidebar Mockup */}
                <div className="flex-1 p-2.5 rounded-lg bg-[#0D233E] border border-[#1E3A60] flex items-center justify-between overflow-hidden">
                  <BrandIdentity
                    isSidebar={true}
                    isSuperAdmin={true}
                    uploadedSidebarLogo={config.uploadedSidebarLogo}
                    uploadedSidebarLogoVersion={config.uploadedSidebarLogoVersion}
                    sidebarLogoAsset={config.sidebarLogoAsset}
                    sidebarLogoVersion={config.sidebarLogoVersion}
                    uploadedLogo={config.uploadedLogo}
                    uploadedLogoVersion={config.uploadedLogoVersion}
                    companyLogo={config.companyLogo}
                    displayName={config.displayName || 'SaleFlow ERP'}
                    badge="ERP"
                    showBadge={true}
                    subtitle="Expanded Sidebar"
                    showSubtitle={true}
                    size="sm"
                    theme="dark"
                  />
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold shrink-0 ml-2">Expanded</span>
                </div>

                {/* Collapsed Sidebar Mockup */}
                <div className="p-2 rounded-lg bg-[#0D233E] border border-[#1E3A60] flex items-center justify-between sm:flex-col sm:justify-center gap-1 shrink-0">
                  <BrandIdentity
                    isSidebar={true}
                    collapsed={true}
                    uploadedSidebarLogo={config.uploadedSidebarLogo}
                    uploadedSidebarLogoVersion={config.uploadedSidebarLogoVersion}
                    sidebarLogoAsset={config.sidebarLogoAsset}
                    sidebarLogoVersion={config.sidebarLogoVersion}
                    uploadedLogo={config.uploadedLogo}
                    uploadedLogoVersion={config.uploadedLogoVersion}
                    companyLogo={config.companyLogo}
                    displayName={config.displayName || 'SaleFlow ERP'}
                    size="sm"
                    theme="dark"
                  />
                  <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Collapsed</span>
                </div>
              </div>
            </div>

            {/* Embedded Live Theme Layout Box */}
            <div
              data-ui-theme={config.uiTheme || 'classic'}
              className="rounded-2xl border overflow-hidden shadow-xl transition-all"
              style={{
                fontFamily: previewTextFontCss,
              }}
            >
              {(config.uiTheme || 'classic') === 'modern' ? (
                /* ======================================================== */
                /* MODERN BLUE-GREEN LIVE ERP SHELL PREVIEW                  */
                /* ======================================================== */
                <div className="bg-[#F4F6F8] text-[#111827] flex flex-col min-h-[460px]">
                  {/* Top Bar (Crisp White) */}
                  <div className="bg-white border-b border-[#E5E7EB] px-4 py-2.5 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="font-semibold text-[#08182B]">{config.displayName || 'SaleFlow ERP'}</span>
                      <span className="text-zinc-300">/</span>
                      <span className="text-[#6B7280] text-[11px]">Modern Blue-Green Live Preview</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Live Preview (Unsaved)
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#08182B] text-white flex items-center justify-center text-[10px] font-bold">
                        SA
                      </div>
                    </div>
                  </div>

                  {/* Body with Mini-Sidebar + Main Canvas */}
                  <div className="flex flex-1">
                    {/* Slim Deep-Blue Sidebar */}
                    <div className="w-14 bg-[#08182B] border-r border-[#0D243F] py-3 flex flex-col items-center justify-between text-zinc-400 shrink-0">
                      <div className="space-y-3 w-full flex flex-col items-center">
                        <div className="w-8 h-8 rounded-lg bg-[#10B981] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                          SF
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-white/10 text-emerald-400 flex items-center justify-center text-[10px] font-semibold border-l-2 border-[#10B981]">
                          <Layout className="w-4 h-4" />
                        </div>
                        <div className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center">
                          <Sliders className="w-4 h-4" />
                        </div>
                        <div className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center">
                          <Type className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold rotate-180 [writing-mode:vertical-rl]">
                        Modern
                      </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 p-4 space-y-3.5 overflow-hidden">
                      {/* Action Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-[#08182B]">Order Bookings & Dispatch</div>
                          <div className="text-[10px] text-[#6B7280]">Real-time operational distribution console</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition-all"
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-[#10B981] text-white hover:bg-[#059669] shadow-xs flex items-center gap-1 transition-all"
                          >
                            <span>+ New Booking</span>
                          </button>
                        </div>
                      </div>

                      {/* KPI Cards in Clean White */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-[#E5E7EB] shadow-xs text-left">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-[#6B7280]">Total Distribution Sales</div>
                          <div
                            className="text-base font-bold text-[#08182B] mt-1 tabular-nums"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            1,450,200.00
                          </div>
                          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                            +14.8% vs last cycle
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-white border border-[#E5E7EB] shadow-xs text-left">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-[#6B7280]">Collection Efficiency</div>
                          <div
                            className="text-base font-bold text-emerald-600 mt-1 tabular-nums"
                            style={{
                              fontFamily: previewNumFontCss,
                              fontVariantNumeric: previewNumVariant,
                              fontFeatureSettings: previewNumFeatures,
                            }}
                          >
                            94.8%
                          </div>
                          <div className="text-[10px] text-[#2563EB] font-semibold mt-0.5">
                            PKR Settled & Audited
                          </div>
                        </div>
                      </div>

                      {/* Compact ERP Table */}
                      <div className="rounded-xl bg-white border border-[#E5E7EB] shadow-xs overflow-hidden">
                        <div className="bg-[#F8FAFC] border-b border-[#E5E7EB] px-3 py-1.5 grid grid-cols-4 text-[9px] font-bold uppercase tracking-wider text-[#475467]">
                          <span>Invoice #</span>
                          <span>Customer</span>
                          <span className="text-right">Net Amount</span>
                          <span className="text-right">Status</span>
                        </div>
                        <div className="divide-y divide-[#F1F5F9] text-xs">
                          <div className="px-3 py-2 grid grid-cols-4 items-center">
                            <span className="font-semibold text-[#08182B] text-[11px]">INV-10254</span>
                            <span className="text-[#374151] truncate text-[11px]">Al-Madina Traders</span>
                            <span
                              className="text-right font-semibold text-[#08182B] text-[11px] tabular-nums"
                              style={{
                                fontFamily: previewNumFontCss,
                                fontVariantNumeric: previewNumVariant,
                                fontFeatureSettings: previewNumFeatures,
                              }}
                            >
                              48,750.00
                            </span>
                            <span className="text-right">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                                Delivered
                              </span>
                            </span>
                          </div>

                          <div className="px-3 py-2 grid grid-cols-4 items-center bg-[#FAFAFA]">
                            <span className="font-semibold text-[#08182B] text-[11px]">INV-10255</span>
                            <span className="text-[#374151] truncate text-[11px]">Metro Cash & Carry</span>
                            <span
                              className="text-right font-semibold text-[#08182B] text-[11px] tabular-nums"
                              style={{
                                fontFamily: previewNumFontCss,
                                fontVariantNumeric: previewNumVariant,
                                fontFeatureSettings: previewNumFeatures,
                              }}
                            >
                              125,000.00
                            </span>
                            <span className="text-right">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200">
                                Processing
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Commercial Meta / Numeric Font Validation Strip */}
                      <div className="p-2.5 rounded-lg bg-white border border-[#E5E7EB] text-[11px] text-[#475467] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span>Phone: <strong className="text-[#08182B] tabular-nums">03001234567</strong></span>
                          <span>CNIC: <strong className="text-[#08182B] tabular-nums">35202-1234567-1</strong></span>
                          <span>Date: <strong className="text-[#08182B] tabular-nums">17/10/2026</strong></span>
                        </div>
                        <span className="text-[10px] font-mono text-[#6B7280]">
                          {isProportional ? 'Prop' : 'Tabular'} Lining Nums
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ======================================================== */
                /* CLASSIC SALEFLOW LIVE ERP PREVIEW                         */
                /* ======================================================== */
                <div
                  className="p-6 flex flex-col justify-between min-h-[380px]"
                  style={{
                    backgroundColor: config.backgroundColor,
                  }}
                >
                  {/* Header inside preview */}
                  <div
                    className="p-3 rounded-xl flex items-center justify-between border"
                    style={{ backgroundColor: config.headerColor, borderColor: `${config.primaryColor}30` }}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden max-w-[70%]">
                      <BrandIdentity
                        surface="light"
                        uploadedSidebarLogo={config.uploadedSidebarLogo}
                        uploadedSidebarLogoVersion={config.uploadedSidebarLogoVersion}
                        sidebarLogoAsset={config.sidebarLogoAsset}
                        sidebarLogoVersion={config.sidebarLogoVersion}
                        uploadedLogo={config.uploadedLogo}
                        uploadedLogoVersion={config.uploadedLogoVersion}
                        companyLogo={config.companyLogo}
                        displayName={config.displayName || 'SaleFlow ERP'}
                        size="sm"
                        theme="light"
                      />
                    </div>
                    <div
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: `${config.accentColor}20`, color: config.accentColor }}
                    >
                      Classic Active
                    </div>
                  </div>

                  {/* Sample KPI inside preview */}
                  <div className="my-3 grid grid-cols-2 gap-3">
                    <div
                      className="p-3 rounded-xl border text-left"
                      style={{ backgroundColor: config.sidebarColor, borderColor: `${config.primaryColor}20` }}
                    >
                      <div className="text-[10px] uppercase font-bold text-zinc-400">Total Sales</div>
                      <div
                        className="text-base font-bold text-white mt-1 transition-all"
                        style={{
                          fontFamily: previewNumFontCss,
                          fontVariantNumeric: previewNumVariant,
                          fontFeatureSettings: previewNumFeatures,
                        }}
                      >
                        1,450,200.00
                      </div>
                    </div>

                    <div
                      className="p-3 rounded-xl border text-left"
                      style={{ backgroundColor: config.sidebarColor, borderColor: `${config.accentColor}20` }}
                    >
                      <div className="text-[10px] uppercase font-bold text-zinc-400">Recovery Rate</div>
                      <div
                        className="text-base font-bold text-emerald-400 mt-1 transition-all"
                        style={{
                          fontFamily: previewNumFontCss,
                          fontVariantNumeric: previewNumVariant,
                          fontFeatureSettings: previewNumFeatures,
                        }}
                      >
                        94.8%
                      </div>
                    </div>
                  </div>

                  {/* Sample Document / Commercial Invoice & Contact Preview */}
                  <div
                    className="p-3 rounded-xl border mb-3 text-left space-y-2"
                    style={{ backgroundColor: config.sidebarColor, borderColor: `${config.primaryColor}15` }}
                  >
                    <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                      <span>Sample Commercial & Contact Meta</span>
                      <span className="text-[9px] lowercase tracking-normal text-zinc-400 font-mono">
                        {isProportional ? 'proportional digit style' : 'tabular digit style'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-white pt-1 border-t border-white/5">
                      <span className="font-semibold text-zinc-300">
                        Invoice #
                        <span
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          10254
                        </span>
                      </span>
                      <span className="text-zinc-300">
                        Qty{' '}
                        <span
                          className="font-semibold"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          125
                        </span>
                      </span>
                      <span
                        className="font-bold text-emerald-300"
                        style={{
                          fontFamily: previewNumFontCss,
                          fontVariantNumeric: previewNumVariant,
                          fontFeatureSettings: previewNumFeatures,
                        }}
                      >
                        48,750.00
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20"
                        style={{
                          fontFamily: previewNumFontCss,
                          fontVariantNumeric: previewNumVariant,
                          fontFeatureSettings: previewNumFeatures,
                        }}
                      >
                        94.8%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1.5 border-t border-white/5">
                      <div>
                        <span className="text-zinc-400 text-[10px]">Phone: </span>
                        <span
                          className="font-medium text-white"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          03001234567
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px]">CNIC: </span>
                        <span
                          className="font-medium text-white"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          35202-1234567-1
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px]">Date: </span>
                        <span
                          className="font-medium text-white"
                          style={{
                            fontFamily: previewNumFontCss,
                            fontVariantNumeric: previewNumVariant,
                            fontFeatureSettings: previewNumFeatures,
                          }}
                        >
                          17/10/2026
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sample Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                    <div className="flex flex-col text-[10px] text-zinc-400 font-mono leading-tight">
                      <span>Text: {currentTextFont}</span>
                      <span>Num: {currentNumFont} ({isProportional ? 'Prop' : 'Tab'})</span>
                    </div>

                    <button
                      type="button"
                      className={`px-4 py-2 text-xs font-semibold text-white shadow-md transition-all ${
                        config.buttonStyle === 'pill'
                          ? 'rounded-full'
                          : config.buttonStyle === 'square'
                          ? 'rounded-none'
                          : 'rounded-xl'
                      }`}
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      Action Button
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#667085] leading-relaxed">
              Configurable global numeric typography controls digits across tables, reports, balances, currency amounts, and order quantities in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Modal for Logo Detailed Preview */}
      {showLogoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-3">
              <h3 className="text-sm font-bold text-[#0F2747]">ERP Logo Preview</h3>
              <button
                type="button"
                onClick={() => setShowLogoModal(false)}
                className="p-1 text-[#667085] hover:text-[#0F2747] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-[#667085]">Preview on Light Background:</p>
              <div className="p-6 bg-white border border-[#E4E7EC] rounded-xl flex items-center justify-center min-h-[90px]">
                {resolvedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedLogoUrl} alt={config.displayName?.trim() || 'SaleFlow ERP'} className="max-h-12 w-auto object-contain" />
                ) : (
                  <span className="text-base font-bold text-[#0F2747]">{config.displayName || 'SaleFlow ERP'}</span>
                )}
              </div>

              <p className="text-xs text-[#667085]">Preview on Deep Navy Background (Sidebar/Header):</p>
              <div className="p-6 bg-[#081A2F] border border-[#172A45] rounded-xl flex items-center justify-center min-h-[90px]">
                {resolvedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedLogoUrl} alt={config.displayName?.trim() || 'SaleFlow ERP'} className="max-h-12 w-auto object-contain" />
                ) : (
                  <span className="text-base font-bold text-white">{config.displayName || 'SaleFlow ERP'}</span>
                )}
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowLogoModal(false)}
                className="px-4 py-2 rounded-xl bg-[#0F2747] text-white text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Sidebar Logo Detailed Preview */}
      {showSidebarLogoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-3">
              <h3 className="text-sm font-bold text-[#0F2747]">Sidebar Logo Preview</h3>
              <button
                type="button"
                onClick={() => setShowSidebarLogoModal(false)}
                className="p-1 text-[#667085] hover:text-[#0F2747] rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-[#667085]">Preview on Light Background:</p>
              <div className="p-6 bg-white border border-[#E4E7EC] rounded-xl flex items-center justify-center min-h-[90px]">
                {resolvedSidebarLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedSidebarLogoUrl} alt={config.displayName?.trim() ? `${config.displayName.trim()} Sidebar Logo` : 'SaleFlow ERP Sidebar Logo'} className="max-h-10 max-w-[170px] w-auto object-contain" />
                ) : resolvedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedLogoUrl} alt={config.displayName?.trim() || 'SaleFlow ERP'} className="max-h-10 max-w-[170px] w-auto object-contain" />
                ) : (
                  <span className="text-sm font-bold text-[#0F2747]">{config.displayName || 'SaleFlow ERP'}</span>
                )}
              </div>

              <p className="text-xs text-[#667085]">Preview on Deep Navy Sidebar (#081A2F):</p>
              <div className="p-6 bg-[#081A2F] border border-[#172A45] rounded-xl flex items-center justify-center min-h-[90px]">
                {resolvedSidebarLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedSidebarLogoUrl} alt={config.displayName?.trim() ? `${config.displayName.trim()} Sidebar Logo` : 'SaleFlow ERP Sidebar Logo'} className="max-h-10 max-w-[170px] w-auto object-contain" />
                ) : resolvedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolvedLogoUrl} alt={config.displayName?.trim() || 'SaleFlow ERP'} className="max-h-10 max-w-[170px] w-auto object-contain" />
                ) : (
                  <span className="text-sm font-bold text-white">{config.displayName || 'SaleFlow ERP'}</span>
                )}
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSidebarLogoModal(false)}
                className="px-4 py-2 rounded-xl bg-[#0F2747] text-white text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Favicon Detailed Preview */}
      {showFaviconModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-3">
              <h3 className="text-sm font-bold text-[#0F2747]">Favicon Preview</h3>
              <button
                type="button"
                onClick={() => setShowFaviconModal(false)}
                className="p-1 text-[#667085] hover:text-[#0F2747] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl flex items-center gap-4">
                <div className="w-16 h-16 bg-white border border-[#E4E7EC] rounded-xl flex items-center justify-center shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolvedFaviconUrl} alt={config.displayName?.trim() ? `${config.displayName.trim()} Favicon` : 'SaleFlow ERP Favicon'} className="w-10 h-10 object-contain" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F2747]">Tab Icon Resolution</h4>
                  <p className="text-[11px] text-[#667085] mt-0.5">
                    {config.uploadedFavicon ? 'Custom Uploaded Favicon' : 'SaleFlow Platform Icon'}
                  </p>
                  <p className="text-[10px] text-[#98A2B3] mt-1 font-mono break-all">{resolvedFaviconUrl}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowFaviconModal(false)}
                className="px-4 py-2 rounded-xl bg-[#0F2747] text-white text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Preloader Preview Modal */}
      {showPreloaderPreview && (
        <ApplicationPreloader
          config={config}
          previewMode={true}
          onClosePreview={() => setShowPreloaderPreview(false)}
        />
      )}
    </div>
  );
}
