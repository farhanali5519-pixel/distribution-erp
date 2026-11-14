import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { CompanyProfile, DEFAULT_COMPANY_PROFILE } from './types';

export type { CompanyProfile };
export { DEFAULT_COMPANY_PROFILE };

export class CompanyService {
  /**
   * Retrieves active company profile and print configurations
   */
  public static getProfile(companyId: string = DEFAULT_COMPANY_ID): CompanyProfile {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    try {
      const row = db.prepare(`
        SELECT 
          id,
          business_name as businessName,
          tagline,
          phone_primary as phonePrimary,
          phone_secondary as phoneSecondary,
          email,
          address,
          city,
          ntn_strn as ntnStrn,
          logo_url as logoUrl,
          currency_symbol as currencySymbol,
          thermal_footer_note as thermalFooterNote,
          invoice_terms as invoiceTerms,
          show_logo_on_prints as showLogoOnPrints,
          show_ntn_on_invoices as showNtnOnInvoices,
          show_customer_previous_balance as showCustomerPreviousBalance,
          updated_at as updatedAt
        FROM company_profile 
        WHERE company_id = ?
        LIMIT 1
      `).get(cleanCompanyId) as any;

      if (!row) {
        return DEFAULT_COMPANY_PROFILE;
      }

      return {
        id: row.id,
        businessName: row.businessName || DEFAULT_COMPANY_PROFILE.businessName,
        tagline: row.tagline ?? DEFAULT_COMPANY_PROFILE.tagline,
        phonePrimary: row.phonePrimary ?? '',
        phoneSecondary: row.phoneSecondary ?? '',
        email: row.email ?? '',
        address: row.address ?? '',
        city: row.city ?? '',
        ntnStrn: row.ntnStrn ?? '',
        logoUrl: row.logoUrl ?? null,
        currencySymbol: row.currencySymbol ?? '',
        thermalFooterNote: row.thermalFooterNote ?? DEFAULT_COMPANY_PROFILE.thermalFooterNote,
        invoiceTerms: row.invoiceTerms ?? DEFAULT_COMPANY_PROFILE.invoiceTerms,
        showLogoOnPrints: row.showLogoOnPrints === 1 || row.showLogoOnPrints === true,
        showNtnOnInvoices: row.showNtnOnInvoices === 1 || row.showNtnOnInvoices === true,
        showCustomerPreviousBalance: row.showCustomerPreviousBalance === 1 || row.showCustomerPreviousBalance === true,
        updatedAt: row.updatedAt,
      };
    } catch (err) {
      console.warn('Could not query company_profile table, using defaults:', err);
      return DEFAULT_COMPANY_PROFILE;
    }
  }

  /**
   * Updates or inserts business profile and print configurations
   */
  public static updateProfile(data: Partial<CompanyProfile>, companyId: string = DEFAULT_COMPANY_ID): CompanyProfile {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const current = this.getProfile(cleanCompanyId);

    const merged: CompanyProfile = {
      ...current,
      ...data,
      businessName: data.businessName?.trim() || current.businessName || 'SaleFlow Distribution',
      currencySymbol: data.currencySymbol !== undefined ? data.currencySymbol.trim() : (current.currencySymbol ?? ''),
      logoUrl: data.logoUrl !== undefined ? (data.logoUrl || null) : current.logoUrl,
      showLogoOnPrints: data.showLogoOnPrints ?? current.showLogoOnPrints,
      showNtnOnInvoices: data.showNtnOnInvoices ?? current.showNtnOnInvoices,
      showCustomerPreviousBalance: data.showCustomerPreviousBalance ?? current.showCustomerPreviousBalance,
    };

    const existingRow = db.prepare('SELECT id FROM company_profile WHERE company_id = ? LIMIT 1').get(cleanCompanyId) as { id: string } | undefined;

    if (existingRow) {
      db.prepare(`
        UPDATE company_profile SET
          business_name = ?,
          tagline = ?,
          phone_primary = ?,
          phone_secondary = ?,
          email = ?,
          address = ?,
          city = ?,
          ntn_strn = ?,
          logo_url = ?,
          currency_symbol = ?,
          thermal_footer_note = ?,
          invoice_terms = ?,
          show_logo_on_prints = ?,
          show_ntn_on_invoices = ?,
          show_customer_previous_balance = ?,
          updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(
        merged.businessName,
        merged.tagline,
        merged.phonePrimary,
        merged.phoneSecondary,
        merged.email,
        merged.address,
        merged.city,
        merged.ntnStrn,
        merged.logoUrl,
        merged.currencySymbol,
        merged.thermalFooterNote,
        merged.invoiceTerms,
        merged.showLogoOnPrints ? 1 : 0,
        merged.showNtnOnInvoices ? 1 : 0,
        merged.showCustomerPreviousBalance ? 1 : 0,
        existingRow.id,
        cleanCompanyId
      );
    } else {
      db.prepare(`
        INSERT INTO company_profile (
          id,
          company_id,
          business_name,
          tagline,
          phone_primary,
          phone_secondary,
          email,
          address,
          city,
          ntn_strn,
          logo_url,
          currency_symbol,
          thermal_footer_note,
          invoice_terms,
          show_logo_on_prints,
          show_ntn_on_invoices,
          show_customer_previous_balance,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        merged.id || 'default-company-profile',
        cleanCompanyId,
        merged.businessName,
        merged.tagline,
        merged.phonePrimary,
        merged.phoneSecondary,
        merged.email,
        merged.address,
        merged.city,
        merged.ntnStrn,
        merged.logoUrl,
        merged.currencySymbol,
        merged.thermalFooterNote,
        merged.invoiceTerms,
        merged.showLogoOnPrints ? 1 : 0,
        merged.showNtnOnInvoices ? 1 : 0,
        merged.showCustomerPreviousBalance ? 1 : 0
      );
    }

    return this.getProfile(cleanCompanyId);
  }
}

