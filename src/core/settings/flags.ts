import { isCloudMode, isPostgresDriver } from '@/core/config/env';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { ModuleRegistry } from '@/core/registry/module-registry';

export interface FeatureFlag {
  key: string;
  moduleId: string;
  value: string;
  label: string;
  description: string;
  updatedAt: string;
  isModuleEnabled?: boolean;
}

export class FeatureFlagService {
  /**
   * Get all registered feature configuration flags with parent module status for a company
   */
  public static getAllFlags(companyId: string = DEFAULT_COMPANY_ID): FeatureFlag[] {
    if (isCloudMode() || isPostgresDriver()) {
      return [];
    }

    const { getDatabase } = require('../database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const rows = db.prepare(`
      SELECT 
        df.key,
        COALESCE(cf.module_id, df.module_id) as moduleId,
        COALESCE(cf.value, df.value) as value,
        df.label,
        df.description,
        COALESCE(cf.updated_at, df.updated_at) as updatedAt,
        COALESCE(cm.is_enabled, sm.is_enabled, 1) as is_module_enabled
      FROM feature_flags df
      LEFT JOIN feature_flags cf ON df.key = cf.key AND cf.company_id = ?
      LEFT JOIN company_modules cm ON COALESCE(cf.module_id, df.module_id) = cm.module_id AND cm.company_id = ?
      LEFT JOIN system_modules sm ON COALESCE(cf.module_id, df.module_id) = sm.id
      WHERE df.company_id = ?
      ORDER BY df.module_id ASC, df.key ASC
    `).all(cleanCompanyId, cleanCompanyId, DEFAULT_COMPANY_ID) as any[];

    return rows.map((r) => ({
      key: r.key,
      moduleId: r.moduleId,
      value: r.value,
      label: r.label,
      description: r.description || '',
      updatedAt: r.updatedAt,
      isModuleEnabled: r.is_module_enabled === 1,
    }));
  }

  /**
   * Check if a boolean feature flag is enabled for a company.
   * If the parent module is disabled in company_modules, this evaluates to false!
   */
  public static isEnabled(key: string, defaultValue = true, companyId: string = DEFAULT_COMPANY_ID): boolean {
    if (isCloudMode() || isPostgresDriver()) {
      return defaultValue;
    }

    const { getDatabase } = require('../database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    // Direct mapping to canonical submodules for reports to ensure module entitlement is the primary source of truth
    if (key === 'reports.enable_party_ledgers') {
      return ModuleRegistry.isModuleEnabled('reports:ledgers', cleanCompanyId);
    }
    if (key === 'reports.enable_profit_and_loss') {
      return ModuleRegistry.isModuleEnabled('reports:profit_loss', cleanCompanyId);
    }
    if (key === 'reports.enable_stock_valuation') {
      return ModuleRegistry.isModuleEnabled('reports:stock_valuation', cleanCompanyId);
    }
    if (key === 'reports.enable_salesman_recovery') {
      return ModuleRegistry.isModuleEnabled('reports:salesman_performance', cleanCompanyId);
    }

    // 1. Fetch company-specific flag value if present
    let row = db.prepare(`
      SELECT f.value, f.module_id
      FROM feature_flags f
      WHERE f.key = ? AND f.company_id = ?
    `).get(key, cleanCompanyId) as { value: string; module_id: string } | undefined;

    // 2. Fall back to default company catalog value if no override exists
    if (!row && cleanCompanyId !== DEFAULT_COMPANY_ID) {
      row = db.prepare(`
        SELECT f.value, f.module_id
        FROM feature_flags f
        WHERE f.key = ? AND f.company_id = ?
      `).get(key, DEFAULT_COMPANY_ID) as { value: string; module_id: string } | undefined;
    }

    if (!row) return defaultValue;

    // 3. If flag belongs to a registered module, enforce company-scoped module enabled check
    if (row.module_id) {
      const isModEnabled = ModuleRegistry.isModuleEnabled(row.module_id, cleanCompanyId);
      if (!isModEnabled) {
        return false;
      }
    }

    return row.value === 'true' || row.value === '1';
  }

  /**
   * Get raw string/JSON value of a feature flag.
   * Returns defaultValue if parent module is disabled.
   */
  public static getValue(key: string, defaultValue = '', companyId: string = DEFAULT_COMPANY_ID): string {
    if (isCloudMode() || isPostgresDriver()) {
      return defaultValue;
    }

    const { getDatabase } = require('../database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    let row = db.prepare(`
      SELECT f.value, f.module_id
      FROM feature_flags f
      WHERE f.key = ? AND f.company_id = ?
    `).get(key, cleanCompanyId) as { value: string; module_id: string } | undefined;

    if (!row && cleanCompanyId !== DEFAULT_COMPANY_ID) {
      row = db.prepare(`
        SELECT f.value, f.module_id
        FROM feature_flags f
        WHERE f.key = ? AND f.company_id = ?
      `).get(key, DEFAULT_COMPANY_ID) as { value: string; module_id: string } | undefined;
    }

    if (!row) return defaultValue;

    if (row.module_id) {
      const isModEnabled = ModuleRegistry.isModuleEnabled(row.module_id, cleanCompanyId);
      if (!isModEnabled) {
        return defaultValue;
      }
    }

    return row.value;
  }

  /**
   * Update a feature flag's value for a company.
   * Modifies only the specified company; zero global cross-contamination.
   */
  public static updateFlag(key: string, value: string, companyId: string = DEFAULT_COMPANY_ID): void {
    if (isCloudMode() || isPostgresDriver()) {
      return;
    }

    const { getDatabase } = require('../database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const flagDef = db.prepare(`
      SELECT module_id, label, description 
      FROM feature_flags 
      WHERE key = ? 
      ORDER BY (CASE WHEN company_id = ? THEN 0 ELSE 1 END) 
      LIMIT 1
    `).get(key, cleanCompanyId) as any;

    if (!flagDef) {
      throw new Error(`Feature flag "${key}" does not exist in the system catalog.`);
    }

    db.prepare(`
      INSERT INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).run(cleanCompanyId, key, flagDef.module_id, value, flagDef.label, flagDef.description || '');
  }

  /**
   * Register or ensure a feature flag exists for a company
   */
  public static registerFlag(flag: Omit<FeatureFlag, 'updatedAt'>, companyId: string = DEFAULT_COMPANY_ID): void {
    if (isCloudMode() || isPostgresDriver()) {
      return;
    }

    const { getDatabase } = require('../database/db');
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    db.prepare(`
      INSERT INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(company_id, key) DO UPDATE SET
        value = excluded.value,
        label = excluded.label,
        description = excluded.description,
        updated_at = datetime('now')
    `).run(
      cleanCompanyId,
      flag.key,
      flag.moduleId,
      flag.value,
      flag.label,
      flag.description
    );
  }

  /**
   * Universal DAL Async Feature Flags Fetch for PostgreSQL & SQLite
   */
  public static async getFeatureFlagsAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('../database/dal-services');
    return DalService.getFeatureFlags(companyId, client);
  }

  /**
   * Universal DAL Async Feature Flag Update for PostgreSQL & SQLite
   */
  public static async setFeatureFlagAsync(
    companyId: string,
    key: string,
    value: string,
    moduleId: string = 'sales',
    label: string = '',
    description: string = '',
    client?: import('../database/types').IDatabaseClient | import('../database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('../database/dal-services');
    return DalService.setFeatureFlag(companyId, key, value, moduleId, label, description, client);
  }
}
