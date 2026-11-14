'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Building2, 
  Printer, 
  Eye, 
  Upload, 
  Trash2, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Receipt, 
  Layers, 
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Image as ImageIcon,
  Check
} from 'lucide-react';
import { useAuth } from '@/shared/context/auth-context';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { CompanyProfile, DEFAULT_COMPANY_PROFILE } from '@/modules/settings/types';

export default function CompanySettingsPage() {
  const { role, isAdmin } = useAuth();
  // All hooks declared unconditionally at the top
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState<'THERMAL' | 'A4'>('THERMAL');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/company');
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
      }
    } catch (err: any) {
      console.error('Failed to fetch company profile:', err);
      setStatusMessage({
        text: 'Failed to load company profile. Using default values.',
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleInputChange = (field: keyof CompanyProfile, value: any) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatusMessage({
        text: 'Logo file size exceeds 2MB limit. Please upload an image under 2MB.',
        isError: true,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      handleInputChange('logoUrl', base64);
      setStatusMessage({
        text: 'Logo uploaded. Remember to click "Save Profile & Print Settings" to apply.',
        isError: false,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    handleInputChange('logoUrl', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!profile.businessName.trim()) {
      setStatusMessage({
        text: 'Business / Agency Name is required.',
        isError: true,
      });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/settings/company', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': role || 'ADMIN',
        },
        body: JSON.stringify({
          ...profile,
          role: role || 'ADMIN',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setStatusMessage({
          text: 'Business profile and print configurations saved successfully!',
          isError: false,
        });
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({
          text: data.message || 'Failed to save settings.',
          isError: true,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err.message || 'Network error saving settings.',
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ListPageContainer className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Company Profile & Print Setup
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage company contact information, invoice headers, and receipt print formats.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchProfile}
            disabled={loading || saving}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw size={16} className={`mr-1.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            Reset
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={loading || saving}
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
          >
            <Save size={16} className={`mr-2 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving Changes...' : 'Save Profile & Print Settings'}
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-sm transition-all ${
            statusMessage.isError
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {statusMessage.isError ? (
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{statusMessage.text}</p>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Form on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Cards 1 & 2 */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Business Identity & Contact Details */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
              <div className="p-2 bg-sky-50 text-sky-700 rounded-lg">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Business Identity & Contact Details</h2>
                <p className="text-xs text-slate-500">Official agency branding shown at the top of commercial bills</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Business Logo Upload */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                  Company / Agency Logo
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                    {profile.logoUrl ? (
                      <img
                        src={profile.logoUrl}
                        alt="Business Logo Preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="text-slate-300" size={28} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
                      >
                        <Upload size={13} className="mr-1.5" />
                        {profile.logoUrl ? 'Replace Logo' : 'Upload Logo'}
                      </button>

                      {profile.logoUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg"
                        >
                          <Trash2 size={13} className="mr-1" /> Remove
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Recommended: Square PNG/JPEG under 2MB. Translucent or white background.
                    </p>
                  </div>
                </div>
              </div>

              {/* Business Name & Tagline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Business / Agency Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profile.businessName}
                    onChange={(e) => handleInputChange('businessName', e.target.value)}
                    placeholder="e.g. SaleFlow Distribution"
                    className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={profile.tagline}
                    onChange={(e) => handleInputChange('tagline', e.target.value)}
                    placeholder="e.g. Wholesale & FMCG Distribution"
                    className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                </div>
              </div>

              {/* Phone Primary & Secondary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Primary Phone (Billing & Orders)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profile.phonePrimary}
                      onChange={(e) => handleInputChange('phonePrimary', e.target.value)}
                      placeholder="e.g. 0300-1234567"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                    <Phone size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Secondary Phone / WhatsApp
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profile.phoneSecondary}
                      onChange={(e) => handleInputChange('phoneSecondary', e.target.value)}
                      placeholder="e.g. 0321-7654321"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                    <Phone size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Email & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Official Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="e.g. orders@saleflow.pk"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                    <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    City / Region
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profile.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="e.g. Karachi"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                    <MapPin size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Godown / Office Full Address
                </label>
                <textarea
                  rows={2}
                  value={profile.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="e.g. Plot 45-B, Sector 12, Industrial Area, Karachi"
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
              </div>

              {/* NTN / STRN */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Tax Registration Identifiers (NTN / STRN / Sales Tax Reg)
                </label>
                <input
                  type="text"
                  value={profile.ntnStrn}
                  onChange={(e) => handleInputChange('ntnStrn', e.target.value)}
                  placeholder="e.g. NTN: 1234567-8 | STRN: 9876543210"
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Appears on official commercial invoices and tax receipts when enabled.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Bill & Receipt Print Customization */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                <Printer size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Bill & Receipt Print Customization</h2>
                <p className="text-xs text-slate-500">Tailor thermal receipts and corporate A4 invoice layouts</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Currency Symbol */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Currency Symbol
                  </label>
                  <input
                    type="text"
                    value={profile.currencySymbol}
                    onChange={(e) => handleInputChange('currencySymbol', e.target.value)}
                    placeholder="e.g. Rs. (optional)"
                    className="w-full px-3 py-2 text-sm font-semibold text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">Optional prefix on print amounts (leave empty for clean numeric display)</p>
                </div>
              </div>

              {/* Thermal 80mm Slip Footer Message */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Thermal 80mm Slip Footer Message
                </label>
                <textarea
                  rows={2}
                  value={profile.thermalFooterNote}
                  onChange={(e) => handleInputChange('thermalFooterNote', e.target.value)}
                  placeholder="Computer Generated Bill. Software Powered by SaleFlow."
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none font-mono text-xs"
                />
                <p className="text-xs text-slate-400 mt-1">Printed centered at the bottom of thermal rolls.</p>
              </div>

              {/* Standard A4 Corporate Invoice Terms & Conditions */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Standard A4 Corporate Invoice Terms & Conditions
                </label>
                <textarea
                  rows={3}
                  value={profile.invoiceTerms}
                  onChange={(e) => handleInputChange('invoiceTerms', e.target.value)}
                  placeholder="1. Goods once sold will only be returned according to company policy..."
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">Appears at the footer of standard A4 invoices.</p>
              </div>

              {/* Toggle Options */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">Show Logo on Prints</span>
                    <span className="text-xs text-slate-500">Include company logo image in headers of thermal and A4 prints</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.showLogoOnPrints}
                    onChange={(e) => handleInputChange('showLogoOnPrints', e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">Show NTN / STRN on Invoices</span>
                    <span className="text-xs text-slate-500">Print tax credentials under business address block</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.showNtnOnInvoices}
                    onChange={(e) => handleInputChange('showNtnOnInvoices', e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">Show Customer Previous Balance on Thermal Bill</span>
                    <span className="text-xs text-slate-500">Print customer previous khata balance & total accumulated payable</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.showCustomerPreviousBalance}
                    onChange={(e) => handleInputChange('showCustomerPreviousBalance', e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Card 3 - Live Print Preview Box */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-50 text-violet-700 rounded-lg">
                  <Eye size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Print Preview</h3>
                  <p className="text-xs text-slate-500">Real-time simulation of bill output</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPreviewTab('THERMAL')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    previewTab === 'THERMAL'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  80mm Thermal
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('A4')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    previewTab === 'A4'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  A4 Corporate
                </button>
              </div>
            </div>

            {/* Preview Canvas */}
            {previewTab === 'THERMAL' ? (
              /* Thermal 80mm Slip Simulation */
              <div className="bg-amber-50/20 border border-slate-300 rounded-lg p-4 text-slate-800 text-xs shadow-inner max-w-sm mx-auto">
                <div className="text-center space-y-1 pb-2 border-b border-dashed border-slate-400">
                  {profile.showLogoOnPrints && profile.logoUrl && (
                    <img
                      src={profile.logoUrl}
                      alt="Logo"
                      className="w-12 h-12 object-contain mx-auto mb-1 filter grayscale"
                    />
                  )}
                  <h4 className="font-bold text-sm tracking-wider uppercase">
                    {profile.businessName || 'SaleFlow Distribution'}
                  </h4>
                  {profile.tagline && (
                    <p className="text-[11px] text-slate-600">{profile.tagline}</p>
                  )}
                  {profile.address && (
                    <p className="text-[10px] text-slate-600">{profile.address}</p>
                  )}
                  {(profile.phonePrimary || profile.phoneSecondary) && (
                    <p className="text-[10px]">
                      Tel: {[profile.phonePrimary, profile.phoneSecondary].filter(Boolean).join(' / ')}
                    </p>
                  )}
                  {profile.showNtnOnInvoices && profile.ntnStrn && (
                    <p className="text-[10px] font-semibold">{profile.ntnStrn}</p>
                  )}
                </div>

                <div className="py-2 text-[10px] border-b border-dashed border-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Bill: INV-202609-0012</span>
                    <span>19/09/2026</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer: Bismillah Karyana</span>
                    <span>Route 1</span>
                  </div>
                </div>

                {/* Sample Items */}
                <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold text-[10px] uppercase">
                    <span>Item</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Amount</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="truncate max-w-[150px]">Tapal Danedar 950g</span>
                    <span className="text-right tabular-nums font-semibold">2 CTN</span>
                    <span className="text-right tabular-nums font-semibold">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}14,400.00</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="truncate max-w-[150px]">Dalda Cooking Oil 1L</span>
                    <span className="text-right tabular-nums font-semibold">1 CTN</span>
                    <span className="text-right tabular-nums font-semibold">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}7,800.00</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Bill Amount:</span>
                    <span className="font-bold tabular-nums">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}22,200.00</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Spot Cash Paid:</span>
                    <span className="font-semibold tabular-nums">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}22,200.00</span>
                  </div>

                  {profile.showCustomerPreviousBalance && (
                    <div className="pt-1 mt-1 border-t border-dotted border-slate-300 space-y-0.5 text-[10px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Previous Khata:</span>
                        <span className="tabular-nums">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}45,000.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>Total Net Balance:</span>
                        <span className="tabular-nums">{profile.currencySymbol ? `${profile.currencySymbol} ` : ''}45,000.00</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Note */}
                <div className="pt-3 text-center space-y-1">
                  <p className="text-[10px] text-slate-600 italic">
                    {profile.thermalFooterNote || 'Computer Generated Bill. Software Powered by SaleFlow.'}
                  </p>
                  <p className="text-[9px] text-slate-400">*** THANK YOU FOR YOUR BUSINESS ***</p>
                </div>
              </div>
            ) : (
              /* A4 Corporate Header & Footer Simulation */
              <div className="bg-white border border-slate-300 rounded-lg p-5 text-slate-800 text-xs shadow-sm space-y-4">
                {/* Header Block */}
                <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800">
                  <div className="space-y-1">
                    {profile.showLogoOnPrints && profile.logoUrl && (
                      <img
                        src={profile.logoUrl}
                        alt="Logo"
                        className="h-10 object-contain mb-1"
                      />
                    )}
                    <h3 className="font-bold text-base text-slate-900 tracking-tight">
                      {profile.businessName || 'SaleFlow Distribution'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">{profile.tagline}</p>
                    <p className="text-[11px] text-slate-600 max-w-xs">{profile.address}</p>
                    {profile.showNtnOnInvoices && profile.ntnStrn && (
                      <p className="text-[11px] font-semibold text-slate-700">{profile.ntnStrn}</p>
                    )}
                  </div>

                  <div className="text-right space-y-1">
                    <span className="inline-block px-2.5 py-0.5 rounded bg-slate-900 text-white font-bold text-xs tracking-wider uppercase">
                      Commercial Bill
                    </span>
                    <p className="text-xs font-semibold text-slate-900">INV-202609-0012</p>
                    <p className="text-[11px] text-slate-500">Date: 19/09/2026</p>
                    {(profile.phonePrimary || profile.email) && (
                      <p className="text-[10px] text-slate-500">
                        {[profile.phonePrimary, profile.email].filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Details Sample */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between text-[11px]">
                  <div>
                    <span className="text-slate-400 uppercase font-semibold text-[10px] block">Billed To</span>
                    <strong className="text-slate-900">Bismillah Karyana Store</strong>
                    <p className="text-slate-500">Route 1 - North Zone, Lahore</p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 uppercase font-semibold text-[10px] block">Payment Terms</span>
                    <strong className="text-slate-900">Credit (15 Days)</strong>
                  </div>
                </div>

                {/* Sample Mock Table */}
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-1.5">Description</th>
                        <th className="p-1.5 text-right">Qty</th>
                        <th className="p-1.5 text-right">Price</th>
                        <th className="p-1.5 text-right">Total{profile.currencySymbol ? ` (${profile.currencySymbol})` : ''}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-1.5">Tapal Danedar 950g Carton</td>
                        <td className="p-1.5 text-right tabular-nums font-semibold">2</td>
                        <td className="p-1.5 text-right tabular-nums">7,200.00</td>
                        <td className="p-1.5 text-right font-semibold tabular-nums">14,400.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Terms and Conditions Footer */}
                <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px]">
                  <strong className="text-slate-800 uppercase tracking-wider block">Terms & Conditions:</strong>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">
                    {profile.invoiceTerms || '1. Goods once sold will only be returned according to company return policy.\n2. Report disputes within 24 hours.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={loading || saving}
            className="w-full flex items-center justify-center px-4 py-3 text-sm font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
          >
            <Save size={18} className={`mr-2 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving Profile & Print Settings...' : 'Save Profile & Print Settings'}
          </button>
        </div>
      </div>
    </ListPageContainer>
  );
}
