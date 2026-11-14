export interface CompanyProfile {
  id: string;
  businessName: string;
  tagline: string;
  phonePrimary: string;
  phoneSecondary: string;
  email: string;
  address: string;
  city: string;
  ntnStrn: string;
  logoUrl: string | null;
  currencySymbol: string;
  thermalFooterNote: string;
  invoiceTerms: string;
  showLogoOnPrints: boolean;
  showNtnOnInvoices: boolean;
  showCustomerPreviousBalance: boolean;
  updatedAt?: string;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: 'default-company-profile',
  businessName: 'SaleFlow Distribution',
  tagline: 'Wholesale & FMCG Distribution',
  phonePrimary: '+92 300 1234567',
  phoneSecondary: '+92 321 7654321',
  email: 'info@saleflow.pk',
  address: 'Plot 45-B, Sector 12, Industrial Area',
  city: 'Karachi',
  ntnStrn: 'NTN: 1234567-8 | STRN: 9876543210',
  logoUrl: null,
  currencySymbol: '',
  thermalFooterNote: 'Computer Generated Bill. Software Powered by SaleFlow.',
  invoiceTerms: '1. Goods once sold will only be returned according to company return policy within 7 days.\n2. In case of any billing dispute, please report within 24 hours.',
  showLogoOnPrints: true,
  showNtnOnInvoices: true,
  showCustomerPreviousBalance: true,
};
