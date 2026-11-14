import { isCloudMode, isPostgresDriver } from '@/core/config/env';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export interface CompanySettingRecord {
  companyId: string;
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export class CompanySettingsService {
  /**
   * Retrieves a company-scoped configuration setting by key.
   * If not set for this company, falls back to defaultValue.
   */
  public static getSetting(companyId: string = DEFAULT_COMPANY_ID, key: string, defaultValue: string = ''): string {
    if (isCloudMode() || isPostgresDriver()) {
      return defaultValue;
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const row = db.prepare(`
      SELECT value 
      FROM app_settings 
      WHERE company_id = ? AND key = ?
    `).get(cleanCompanyId, key) as { value: string } | undefined;

    if (row !== undefined) {
      return row.value;
    }

    // If company is not default and has not defined this setting, fall back to default company if available
    if (cleanCompanyId !== DEFAULT_COMPANY_ID) {
      const defRow = db.prepare(`
        SELECT value 
        FROM app_settings 
        WHERE company_id = ? AND key = ?
      `).get(DEFAULT_COMPANY_ID, key) as { value: string } | undefined;

      if (defRow !== undefined) {
        return defRow.value;
      }
    }

    return defaultValue;
  }

  /**
   * Sets or updates a company-scoped configuration setting.
   * Scoped strictly to companyId; never mutates other companies' settings.
   */
  public static setSetting(
    companyId: string = DEFAULT_COMPANY_ID, 
    key: string, 
    value: string, 
    description: string = ''
  ): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Setting key is required and must be a string.');
    }

    if (isCloudMode() || isPostgresDriver()) {
      return;
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    db.prepare(`
      INSERT INTO app_settings (company_id, key, value, description, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, key) DO UPDATE SET
        value = excluded.value,
        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE app_settings.description END,
        updated_at = datetime('now')
    `).run(cleanCompanyId, key, value, description);
  }

  /**
   * Returns a key-value dictionary of all configuration settings for a company.
   */
  public static getAllSettings(companyId: string = DEFAULT_COMPANY_ID): Record<string, string> {
    if (isCloudMode() || isPostgresDriver()) {
      return {};
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const result: Record<string, string> = {};

    // Baseline from DEFAULT_COMPANY_ID if querying another company
    if (cleanCompanyId !== DEFAULT_COMPANY_ID) {
      const defRows = db.prepare(`
        SELECT key, value 
        FROM app_settings 
        WHERE company_id = ?
      `).all(DEFAULT_COMPANY_ID) as { key: string; value: string }[];

      for (const r of defRows) {
        result[r.key] = r.value;
      }
    }

    // Company specific overrides
    const compRows = db.prepare(`
      SELECT key, value 
      FROM app_settings 
      WHERE company_id = ?
    `).all(cleanCompanyId) as { key: string; value: string }[];

    for (const r of compRows) {
      result[r.key] = r.value;
    }

    return result;
  }

  /**
   * Returns detailed setting records for a company.
   */
  public static getSettingRecords(companyId: string = DEFAULT_COMPANY_ID): CompanySettingRecord[] {
    if (isCloudMode() || isPostgresDriver()) {
      return [];
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
      SELECT 
        company_id as companyId,
        key,
        value,
        description,
        updated_at as updatedAt
      FROM app_settings
      WHERE company_id = ?
      ORDER BY key ASC
    `).all(cleanCompanyId) as any[];

    return rows.map((r) => ({
      companyId: r.companyId,
      key: r.key,
      value: r.value,
      description: r.description || '',
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Deletes a company-scoped configuration setting.
   */
  public static deleteSetting(companyId: string = DEFAULT_COMPANY_ID, key: string): boolean {
    if (isCloudMode() || isPostgresDriver()) {
      return true;
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const res = db.prepare('DELETE FROM app_settings WHERE company_id = ? AND key = ?').run(cleanCompanyId, key);
    return res.changes > 0;
  }

  /**
   * Universal DAL Async Company Setting Fetch for PostgreSQL & SQLite
   */
  public static async getSettingAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    key: string,
    defaultValue: string = '',
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<string> {
    const { DalService } = await import('../database/dal-services');
    return DalService.getCompanySetting(companyId, key, defaultValue, client);
  }

  /**
   * Universal DAL Async Company Setting Update for PostgreSQL & SQLite
   */
  public static async setSettingAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    key: string,
    value: string,
    description: string = '',
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('../database/dal-services');
    return DalService.setCompanySetting(companyId, key, value, description, client);
  }
}
