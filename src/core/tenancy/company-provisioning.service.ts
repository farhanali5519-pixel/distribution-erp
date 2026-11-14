import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { AuthService } from '@/modules/auth/service';
import { ALL_SUBMODULES } from '@/modules/auth/permissions-registry';
import { RESERVED_COMPANY_SLUGS, DEFAULT_COMPANY_ID } from './constants';
import { CompanySettingsService } from '@/core/settings/company-settings';
import { FeatureFlagService } from '@/core/settings/flags';
import { getCompanyUrl } from '@/core/config/env';
import { CompanyPlan, PLAN_CONFIGS, AVAILABLE_SYSTEM_MODULES } from './plans';
import { SuperAdminAuditService } from '@/core/audit/superadmin-audit.service';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { ensureDefaultChartOfAccounts } from '@/core/accounting/default-coa';

export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'INACTIVE';
export type { CompanyPlan };

export interface CompanyRecord {
  id: string;
  name: string;
  legal_name?: string | null;
  tenant_code?: string | null;
  slug: string;
  status: CompanyStatus;
  plan: CompanyPlan;
  is_active: number;
  primary_contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  trial_ends_at: string | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  max_users: number;
  max_warehouses: number;
  created_at: string;
  updated_at: string;
  /** Direct canonical ERP URL (e.g. https://slug.salesflow.space or http://slug.localhost:3000) */
  erpUrl?: string;
}

export interface ProvisionCompanyInput {
  name: string;
  legalName?: string;
  tenantCode?: string;
  slug?: string;
  primaryContactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  plan?: CompanyPlan;
  status?: CompanyStatus;
  trialEndsAt?: string | null;
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt?: string | null;
  maxUsers?: number;
  maxWarehouses?: number;
  enabledModules?: string[];
  featureFlagOverrides?: Record<string, string>;
  settings?: Record<string, string>;
  initialAdmin: {
    username: string;
    password: string;
    fullName: string;
    email?: string;
    phone?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  };
}

export interface UpdateCompanyInput {
  name?: string;
  legalName?: string;
  tenantCode?: string;
  primaryContactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  plan?: CompanyPlan;
  status?: CompanyStatus;
  trialEndsAt?: string | null;
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt?: string | null;
  maxUsers?: number;
  maxWarehouses?: number;
}

export interface ProvisionedCompanyResult {
  company: CompanyRecord;
  initialAdminUser: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    companyId: string;
  };
  enabledModuleCount: number;
  seededFeatureFlagCount: number;
}

export class CompanyProvisioningService {
  /**
   * Converts input string to URL/subdomain safe slug.
   */
  public static slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  /**
   * Checks if a slug is in the system reserved list.
   */
  public static isSlugReserved(slug: string): boolean {
    const cleanSlug = this.slugify(slug);
    return (RESERVED_COMPANY_SLUGS as readonly string[]).includes(cleanSlug);
  }

  /**
   * Generates a unique tenant slug.
   * Format: 'abc-traders', or if duplicate: 'abc-traders-2', 'abc-traders-3'
   * Rejects reserved slugs.
   */
  public static generateUniqueSlug(name: string, customSlug?: string): string {
    const rawCandidate = customSlug && customSlug.trim() ? customSlug : name;
    const baseSlug = this.slugify(rawCandidate);

    if (!baseSlug) {
      throw new Error('Company name or slug must contain at least one alphanumeric character');
    }

    if (this.isSlugReserved(baseSlug)) {
      throw new Error(`The slug "${baseSlug}" is reserved for system use and cannot be assigned to a company.`);
    }

    const db = getDatabase();
    const checkStmt = db.prepare('SELECT id FROM companies WHERE slug = ?');

    if (!checkStmt.get(baseSlug)) {
      return baseSlug;
    }

    // Slug exists; generate incremental suffix: base-2, base-3, ...
    let counter = 2;
    while (counter < 1000) {
      const candidate = `${baseSlug}-${counter}`;
      if (!checkStmt.get(candidate)) {
        return candidate;
      }
      counter++;
    }

    throw new Error(`Unable to generate a unique slug for "${name}". Please provide a unique custom slug.`);
  }

  /**
   * Generates a tenant code like TEN-XXXX if none provided.
   */
  public static generateTenantCode(customCode?: string): string {
    if (customCode && customCode.trim()) {
      return customCode.trim().toUpperCase();
    }
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SF-${rand}`;
  }

  /**
   * Provisions a brand new company with full multi-tenant isolation.
   */
  public static provisionCompany(input: ProvisionCompanyInput, actor: string = 'superadmin'): ProvisionedCompanyResult {
    if (!input.name || !input.name.trim()) {
      throw new Error('Company name is required');
    }

    if (!input.initialAdmin || !input.initialAdmin.username || !input.initialAdmin.password) {
      throw new Error('Initial company administrator username and password are required');
    }

    const db = getDatabase();
    const slug = this.generateUniqueSlug(input.name, input.slug);
    const companyId = generateUUID();
    const plan = input.plan || 'COMMERCIAL';
    const planConfig = PLAN_CONFIGS[plan] || PLAN_CONFIGS.COMMERCIAL;
    const status = input.status || 'ACTIVE';
    const isActive = status === 'ACTIVE' || status === 'TRIAL' ? 1 : 0;
    const maxUsers = input.maxUsers ?? planConfig.maxUsers;
    const maxWarehouses = input.maxWarehouses ?? planConfig.maxWarehouses;
    const tenantCode = this.generateTenantCode(input.tenantCode);

    db.exec('BEGIN TRANSACTION;');

    try {
      // 1. Create Company Master Record
      db.prepare(`
        INSERT INTO companies (
          id, name, legal_name, tenant_code, slug, status, plan, is_active,
          primary_contact_name, email, phone, address, city, country, notes,
          trial_ends_at, subscription_starts_at, subscription_ends_at, 
          max_users, max_warehouses, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        companyId,
        input.name.trim(),
        input.legalName?.trim() || null,
        tenantCode,
        slug,
        status,
        plan,
        isActive,
        input.primaryContactName?.trim() || null,
        input.email?.trim() || input.initialAdmin.email?.trim() || null,
        input.phone?.trim() || input.initialAdmin.phone?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.country?.trim() || 'Pakistan',
        input.notes?.trim() || null,
        input.trialEndsAt || null,
        input.subscriptionStartsAt || new Date().toISOString().split('T')[0],
        input.subscriptionEndsAt || null,
        maxUsers,
        maxWarehouses
      );

      // 2. Seed Company Modules
      const systemModules = db.prepare('SELECT id FROM system_modules').all() as { id: string }[];
      const defaultModules = input.enabledModules && input.enabledModules.length > 0
        ? input.enabledModules
        : planConfig.modules;

      const enabledSet = new Set(defaultModules);
      const submodulesSet = new Set(planConfig.submodules || []);

      const insertModStmt = db.prepare(`
        INSERT INTO company_modules (company_id, module_id, is_enabled, dependencies, settings, updated_at)
        VALUES (?, ?, ?, '[]', '{}', datetime('now'))
        ON CONFLICT(company_id, module_id) DO UPDATE SET
          is_enabled = excluded.is_enabled,
          updated_at = datetime('now')
      `);

      let enabledCount = 0;
      for (const sm of systemModules) {
        let isEnabled = 0;
        if (sm.id.includes(':')) {
          isEnabled = submodulesSet.has(sm.id) ? 1 : 0;
        } else {
          isEnabled = enabledSet.has(sm.id) ? 1 : 0;
          if (isEnabled) enabledCount++;
        }
        insertModStmt.run(companyId, sm.id, isEnabled);
      }

      // Also ensure any module in enabledSet that wasn't in system_modules is inserted
      for (const modId of defaultModules) {
        if (!systemModules.some((m) => m.id === modId)) {
          insertModStmt.run(companyId, modId, 1);
          enabledCount++;
        }
      }

      // Also ensure any submodule in submodulesSet that wasn't in system_modules is inserted
      for (const subId of submodulesSet) {
        if (!systemModules.some((m) => m.id === subId)) {
          insertModStmt.run(companyId, subId, 1);
        }
      }

      // 3. Seed Feature Flags (inheriting defaults or setting overrides)
      const baselineFlags = db.prepare(`
        SELECT key, module_id, value, label, description 
        FROM feature_flags 
        WHERE company_id = ?
      `).all(DEFAULT_COMPANY_ID) as any[];

      const insertFlagStmt = db.prepare(`
        INSERT INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      let flagCount = 0;
      const reportFlagsPlanMap: Record<string, string> = {
        'reports.enable_party_ledgers': 'reports:ledgers',
        'reports.enable_profit_and_loss': 'reports:profit_loss',
        'reports.enable_stock_valuation': 'reports:stock_valuation',
        'reports.enable_salesman_recovery': 'reports:salesman_performance',
      };

      for (const bf of baselineFlags) {
        let defaultVal = bf.value;
        const subId = reportFlagsPlanMap[bf.key];
        if (subId) {
          const isParentOn = enabledSet.has('reports');
          const isSubOn = isParentOn && submodulesSet.has(subId);
          defaultVal = isSubOn ? 'true' : 'false';
        }
        const overrideVal = input.featureFlagOverrides?.[bf.key] ?? defaultVal;
        insertFlagStmt.run(companyId, bf.key, bf.module_id, overrideVal, bf.label, bf.description);
        flagCount++;
      }

      // 4. Seed App Settings
      const baselineSettings = db.prepare(`
        SELECT key, value 
        FROM app_settings 
        WHERE company_id = ?
      `).all(DEFAULT_COMPANY_ID) as any[];

      const insertSettingStmt = db.prepare(`
        INSERT OR REPLACE INTO app_settings (company_id, key, value, description, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      const companySettingsMap: Record<string, string> = {
        'company.name': input.name.trim(),
        'company.currency': 'PKR',
        'company.currency_symbol': 'Rs.',
        'company.timezone': 'Asia/Karachi',
        'company.email': input.email || input.initialAdmin.email || '',
        'company.phone': input.phone || input.initialAdmin.phone || '',
        'company.address': input.address || '',
        'company.city': input.city || '',
        'company.country': input.country || 'Pakistan',
        ...(input.settings || {}),
      };

      for (const [k, v] of Object.entries(companySettingsMap)) {
        insertSettingStmt.run(companyId, k, v, null);
      }

      // Copy other baseline settings
      for (const bs of baselineSettings) {
        if (!companySettingsMap[bs.key]) {
          insertSettingStmt.run(companyId, bs.key, bs.value, bs.description || null);
        }
      }

      // 5. Seed Initial Company Administrator User
      const adminUserId = generateUUID();
      const pwdHash = AuthService.hashPassword(input.initialAdmin.password);
      const adminStatus = input.initialAdmin.status === 'INACTIVE' ? 0 : 1;

      db.prepare(`
        INSERT INTO app_users (
          id, company_id, username, password_hash, full_name, email, phone, role, is_active, permissions_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', ?, ?, datetime('now'), datetime('now'))
      `).run(
        adminUserId,
        companyId,
        input.initialAdmin.username.trim(),
        pwdHash,
        input.initialAdmin.fullName.trim(),
        input.initialAdmin.email?.trim() || null,
        input.initialAdmin.phone?.trim() || null,
        adminStatus,
        JSON.stringify(ALL_SUBMODULES)
      );

      // 6. Seed Baseline Chart of Accounts idempotently
      ensureDefaultChartOfAccounts(companyId, { db });

      db.exec('COMMIT;');

      const company = this.getCompanyById(companyId)!;

      SuperAdminAuditService.log({
        actor,
        action: 'CUSTOMER_CREATED',
        target: company.name,
        tenantId: company.id,
        tenantSlug: company.slug,
        reason: `Provisioned customer "${company.name}" with subdomain "${company.slug}" under plan "${plan}"`,
        metadata: {
          plan,
          status,
          tenantCode,
          adminUsername: input.initialAdmin.username,
        },
      }).catch(() => {});

      return {
        company,
        initialAdminUser: {
          id: adminUserId,
          username: input.initialAdmin.username.trim(),
          fullName: input.initialAdmin.fullName.trim(),
          role: 'ADMIN',
          companyId,
        },
        enabledModuleCount: enabledCount,
        seededFeatureFlagCount: flagCount,
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Retrieves single company by ID.
   */
  public static getCompanyById(id: string): CompanyRecord | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT 
        id, name, legal_name, tenant_code, slug, 
        COALESCE(status, 'ACTIVE') as status, 
        plan, is_active, 
        primary_contact_name, email, phone, address, city, country, notes,
        trial_ends_at, subscription_starts_at, subscription_ends_at, 
        COALESCE(max_users, 5) as max_users, 
        COALESCE(max_warehouses, 1) as max_warehouses, 
        created_at, updated_at
      FROM companies
      WHERE id = ?
    `).get(id) as CompanyRecord | undefined;

    return row ? { ...row, erpUrl: getCompanyUrl(row.slug) } : null;
  }

  /**
   * Retrieves single company by slug.
   */
  public static getCompanyBySlug(slug: string): CompanyRecord | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT 
        id, name, legal_name, tenant_code, slug, 
        COALESCE(status, 'ACTIVE') as status, 
        plan, is_active, 
        primary_contact_name, email, phone, address, city, country, notes,
        trial_ends_at, subscription_starts_at, subscription_ends_at, 
        COALESCE(max_users, 5) as max_users, 
        COALESCE(max_warehouses, 1) as max_warehouses, 
        created_at, updated_at
      FROM companies
      WHERE slug = ?
    `).get(slug) as CompanyRecord | undefined;

    return row ? { ...row, erpUrl: getCompanyUrl(row.slug) } : null;
  }

  /**
   * Updates an existing company's master record.
   */
  public static updateCompany(companyId: string, input: UpdateCompanyInput, actor: string = 'superadmin'): CompanyRecord {
    const current = this.getCompanyById(companyId);
    if (!current) {
      throw new Error(`Company "${companyId}" not found`);
    }

    const db = getDatabase();
    const name = input.name !== undefined ? input.name.trim() : current.name;
    const legalName = input.legalName !== undefined ? input.legalName.trim() : current.legal_name;
    const tenantCode = input.tenantCode !== undefined ? input.tenantCode.trim() : current.tenant_code;
    const primaryContactName = input.primaryContactName !== undefined ? input.primaryContactName.trim() : current.primary_contact_name;
    const email = input.email !== undefined ? input.email.trim() : current.email;
    const phone = input.phone !== undefined ? input.phone.trim() : current.phone;
    const address = input.address !== undefined ? input.address.trim() : current.address;
    const city = input.city !== undefined ? input.city.trim() : current.city;
    const country = input.country !== undefined ? input.country.trim() : current.country;
    const notes = input.notes !== undefined ? input.notes.trim() : current.notes;
    const plan = input.plan !== undefined ? input.plan : current.plan;
    const status = input.status !== undefined ? input.status : current.status;
    const isActive = status === 'ACTIVE' || status === 'TRIAL' ? 1 : 0;
    const trialEndsAt = input.trialEndsAt !== undefined ? input.trialEndsAt : current.trial_ends_at;
    const subscriptionStartsAt = input.subscriptionStartsAt !== undefined ? input.subscriptionStartsAt : current.subscription_starts_at;
    const subscriptionEndsAt = input.subscriptionEndsAt !== undefined ? input.subscriptionEndsAt : current.subscription_ends_at;
    const maxUsers = input.maxUsers !== undefined ? input.maxUsers : current.max_users;
    const maxWarehouses = input.maxWarehouses !== undefined ? input.maxWarehouses : current.max_warehouses;

    (db.prepare(`
      UPDATE companies 
      SET 
        name = ?, legal_name = ?, tenant_code = ?, primary_contact_name = ?,
        email = ?, phone = ?, address = ?, city = ?, country = ?, notes = ?,
        plan = ?, status = ?, is_active = ?,
        trial_ends_at = ?, subscription_starts_at = ?, subscription_ends_at = ?,
        max_users = ?, max_warehouses = ?, updated_at = datetime('now')
      WHERE id = ?
    `) as any).run(
      name, legalName, tenantCode, primaryContactName,
      email, phone, address, city, country, notes,
      plan, status, isActive,
      trialEndsAt, subscriptionStartsAt, subscriptionEndsAt,
      maxUsers, maxWarehouses,
      companyId
    );

    SuperAdminAuditService.log({
      actor,
      action: 'CUSTOMER_UPDATED',
      target: name,
      tenantId: companyId,
      tenantSlug: current.slug,
      reason: `Updated master profile for company "${name}"`,
      metadata: { plan, status },
    }).catch(() => {});

    return this.getCompanyById(companyId)!;
  }

  /**
   * Sets company lifecycle status (ACTIVE, TRIAL, SUSPENDED, EXPIRED, INACTIVE).
   */
  public static setCompanyStatus(companyId: string, status: CompanyStatus, actor: string = 'superadmin'): CompanyRecord {
    const action = status === 'SUSPENDED' ? 'CUSTOMER_SUSPENDED' : status === 'ACTIVE' ? 'CUSTOMER_ACTIVATED' : 'CUSTOMER_UPDATED';
    const updated = this.updateCompany(companyId, { status }, actor);

    SuperAdminAuditService.log({
      actor,
      action,
      target: updated.name,
      tenantId: companyId,
      tenantSlug: updated.slug,
      reason: `Company lifecycle status transitioned to "${status}"`,
      metadata: { status },
    }).catch(() => {});

    return updated;
  }

  /**
   * Extends company license dates.
   */
  public static extendLicense(companyId: string, newExpiryDate: string, notes?: string, actor: string = 'superadmin'): CompanyRecord {
    const updated = this.updateCompany(companyId, {
      subscriptionEndsAt: newExpiryDate,
      status: 'ACTIVE',
      notes,
    }, actor);

    SuperAdminAuditService.log({
      actor,
      action: 'LICENSE_EXTENDED',
      target: updated.name,
      tenantId: companyId,
      tenantSlug: updated.slug,
      reason: `License extended to ${newExpiryDate}`,
      metadata: { newExpiryDate, notes },
    }).catch(() => {});

    return updated;
  }

  /**
   * Lists companies with search and filters.
   */
  public static listCompanies(params?: { search?: string; status?: string; plan?: string }): (CompanyRecord & { userCount: number; activeModuleCount: number; primaryAdmin?: string })[] {
    const db = getDatabase();
    let query = `
      SELECT 
        c.id, c.name, c.legal_name, c.tenant_code, c.slug, 
        COALESCE(c.status, 'ACTIVE') as status, 
        c.plan, c.is_active, 
        c.primary_contact_name, c.email, c.phone, c.address, c.city, c.country, c.notes,
        c.trial_ends_at, c.subscription_starts_at, 
        c.subscription_ends_at, COALESCE(c.max_users, 5) as max_users, 
        COALESCE(c.max_warehouses, 1) as max_warehouses, 
        c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM app_users u WHERE u.company_id = c.id) as userCount,
        (SELECT COUNT(*) FROM company_modules m WHERE m.company_id = c.id AND m.is_enabled = 1) as activeModuleCount,
        (SELECT u.username FROM app_users u WHERE u.company_id = c.id AND u.role = 'ADMIN' LIMIT 1) as primaryAdmin
      FROM companies c
      WHERE 1=1
    `;

    const args: any[] = [];

    if (params?.status) {
      query += ` AND c.status = ?`;
      args.push(params.status);
    }

    if (params?.plan) {
      query += ` AND c.plan = ?`;
      args.push(params.plan);
    }

    if (params?.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      query += ` AND (c.name LIKE ? OR c.slug LIKE ? OR c.tenant_code LIKE ? OR c.email LIKE ? OR c.primary_contact_name LIKE ?)`;
      args.push(term, term, term, term, term);
    }

    query += ` ORDER BY c.created_at DESC`;

    const rows = db.prepare(query).all(...args) as any[];
    return rows.map(r => ({
      ...r,
      erpUrl: getCompanyUrl(r.slug),
    }));
  }

  /**
   * Returns comprehensive company management details including modules, flags, settings, and users.
   */
  public static getCompanyDetails(companyId: string) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error(`Company "${companyId}" not found`);
    }

    const db = getDatabase();

    // 1. Modules
    const modules = db.prepare(`
      SELECT 
        sm.id, sm.name, sm.description, sm.version,
        COALESCE(cm.is_enabled, 1) as is_enabled
      FROM system_modules sm
      LEFT JOIN company_modules cm ON sm.id = cm.module_id AND cm.company_id = ?
      ORDER BY sm.name ASC
    `).all(companyId) as any[];

    // 2. Feature Flags
    const featureFlags = FeatureFlagService.getAllFlags(companyId);

    // 3. Settings
    const settings = CompanySettingsService.getAllSettings(companyId);

    // 4. Users
    const users = db.prepare(`
      SELECT id, username, full_name, email, phone, role, is_active, created_at, updated_at
      FROM app_users
      WHERE company_id = ?
      ORDER BY role ASC, username ASC
    `).all(companyId) as any[];

    const hierarchicalModules = ModuleRegistry.getHierarchicalModulesForCompany(companyId);

    return {
      company,
      modules: modules.map(m => ({ ...m, is_enabled: m.is_enabled === 1 })),
      hierarchicalModules,
      featureFlags,
      settings,
      users,
    };
  }

  /**
   * Sets module and submodule ON/OFF states for a specific company.
   */
  public static setCompanyModules(
    companyId: string,
    modules: { moduleId: string; isEnabled: boolean }[],
    actor: string = 'superadmin',
    submodules?: { id: string; isEnabled: boolean }[]
  ): void {
    const db = getDatabase();
    const company = this.getCompanyById(companyId);

    const stmt = db.prepare(`
      INSERT INTO company_modules (company_id, module_id, is_enabled, dependencies, settings, updated_at)
      VALUES (?, ?, ?, '[]', '{}', datetime('now'))
      ON CONFLICT(company_id, module_id) DO UPDATE SET 
        is_enabled = excluded.is_enabled,
        updated_at = datetime('now')
    `);

    const ensureSysMod = db.prepare(`
      INSERT OR IGNORE INTO system_modules (id, name, description, version, is_enabled, dependencies, settings, installed_at, updated_at)
      VALUES (?, ?, '', '1.0.0', 1, '[]', '{}', datetime('now'), datetime('now'))
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Save main module toggles
      for (const m of modules) {
        ensureSysMod.run(m.moduleId, m.moduleId);
        stmt.run(companyId, m.moduleId, m.isEnabled ? 1 : 0);
      }

      // 2. Save individual submodule toggles if provided
      if (submodules && submodules.length > 0) {
        for (const sm of submodules) {
          ensureSysMod.run(sm.id, sm.id);
          stmt.run(companyId, sm.id, sm.isEnabled ? 1 : 0);
        }
      }

      // 3. Synchronize corresponding feature flags for reports submodules
      const syncFlagStmt = db.prepare(`
        INSERT INTO feature_flags (company_id, key, module_id, value, label, description, updated_at)
        VALUES (?, ?, 'reports', ?, ?, ?, datetime('now'))
        ON CONFLICT(company_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
      `);

      const reportFlagsMapping: Record<string, { key: string; label: string; desc: string }> = {
        'reports:ledgers': {
          key: 'reports.enable_party_ledgers',
          label: 'Party Ledgers & Statement of Account',
          desc: 'Enables customer and vendor khata jaat with opening and running balances.',
        },
        'reports:profit_loss': {
          key: 'reports.enable_profit_and_loss',
          label: 'Profit & Loss Statement (Munaffa)',
          desc: 'Enables double-entry trading margin, operating expenses, and net profit report.',
        },
        'reports:stock_valuation': {
          key: 'reports.enable_stock_valuation',
          label: 'Stock Valuation & Godown Summary',
          desc: 'Enables 3-tier inventory packaging breakdown, sellable valuation, and quarantine stock audit.',
        },
        'reports:salesman_performance': {
          key: 'reports.enable_salesman_recovery',
          label: 'Salesman Recovery Performance',
          desc: 'Enables salesman order booking performance, recovery metrics, and target tracking.',
        },
      };

      const reportsMod = modules.find((m) => m.moduleId === 'reports');
      const isReportsMainOn = reportsMod !== undefined ? reportsMod.isEnabled : true;

      for (const [subId, meta] of Object.entries(reportFlagsMapping)) {
        let isSubEnabled = isReportsMainOn;
        if (submodules && submodules.length > 0) {
          const sm = submodules.find((s) => s.id === subId);
          if (sm) {
            isSubEnabled = isReportsMainOn && sm.isEnabled;
          }
        }
        syncFlagStmt.run(companyId, meta.key, isSubEnabled ? 'true' : 'false', meta.label, meta.desc);
      }

      db.exec('COMMIT;');

      try {
        ModuleRegistry.clearCache(companyId);
      } catch {}

      const totalCount = modules.length + (submodules?.length || 0);
      SuperAdminAuditService.log({
        actor,
        action: 'MODULES_CHANGED',
        target: company?.name || companyId,
        tenantId: companyId,
        tenantSlug: company?.slug,
        reason: `Updated active modules configuration (${totalCount} modules/submodules updated)`,
        metadata: { modulesCount: modules.length, submodulesCount: submodules?.length || 0 },
      }).catch(() => {});
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Adds an additional user to an existing company.
   */
  public static createCompanyUser(
    companyId: string,
    input: {
      username: string;
      password: string;
      fullName: string;
      email?: string;
      phone?: string;
      role?: string;
    },
    actor: string = 'superadmin'
  ) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      throw new Error(`Company "${companyId}" not found`);
    }

    const db = getDatabase();

    // Check user limit
    const userCount = (db.prepare('SELECT count(*) as c FROM app_users WHERE company_id = ?').get(companyId) as any).c;
    if (userCount >= company.max_users) {
      throw new Error(`Company has reached its maximum user limit of ${company.max_users} users. Upgrade plan or increase limit.`);
    }

    const userId = generateUUID();
    const role = input.role || 'SALESMAN';
    const pwdHash = AuthService.hashPassword(input.password);

    db.prepare(`
      INSERT INTO app_users (
        id, company_id, username, password_hash, full_name, email, phone, role, is_active, permissions_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(
      userId,
      companyId,
      input.username.trim(),
      pwdHash,
      input.fullName.trim(),
      input.email?.trim() || null,
      input.phone?.trim() || null,
      role,
      JSON.stringify(ALL_SUBMODULES)
    );

    SuperAdminAuditService.log({
      actor,
      action: 'TENANT_USER_CREATED',
      target: input.username.trim(),
      tenantId: companyId,
      tenantSlug: company.slug,
      reason: `Created user "${input.username}" with role "${role}" for company "${company.name}"`,
      metadata: { role },
    }).catch(() => {});

    return {
      id: userId,
      companyId,
      username: input.username.trim(),
      fullName: input.fullName.trim(),
      role,
    };
  }

  /**
   * Resets tenant user's password.
   */
  public static resetTenantUserPassword(
    companyId: string,
    userId: string,
    newPassword: string,
    actor: string = 'superadmin'
  ): boolean {
    const db = getDatabase();
    const user = db.prepare('SELECT username FROM app_users WHERE id = ? AND company_id = ?').get(userId, companyId) as any;
    if (!user) throw new Error('Tenant user not found');

    const pwdHash = AuthService.hashPassword(newPassword);
    db.prepare('UPDATE app_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(pwdHash, userId);

    SuperAdminAuditService.log({
      actor,
      action: 'TENANT_ADMIN_PASSWORD_RESET',
      target: user.username,
      tenantId: companyId,
      reason: `Password reset for user "${user.username}"`,
    }).catch(() => {});

    return true;
  }

  /**
   * Updates tenant user profile/role/status.
   */
  public static updateTenantUser(
    companyId: string,
    userId: string,
    data: { fullName?: string; role?: string; isActive?: number },
    actor: string = 'superadmin'
  ): boolean {
    const db = getDatabase();
    const user = db.prepare('SELECT username, role, is_active FROM app_users WHERE id = ? AND company_id = ?').get(userId, companyId) as any;
    if (!user) throw new Error('Tenant user not found');

    const updates: string[] = [];
    const params: any[] = [];

    if (data.fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(data.fullName.trim());
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive);
    }

    if (updates.length === 0) return true;

    updates.push("updated_at = datetime('now')");
    params.push(userId, companyId);

    db.prepare(`UPDATE app_users SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`).run(...params);

    SuperAdminAuditService.log({
      actor,
      action: 'TENANT_USER_UPDATED',
      target: user.username,
      tenantId: companyId,
      reason: `Updated profile/status for user "${user.username}"`,
      metadata: data,
    }).catch(() => {});

    return true;
  }

  /**
   * Aggregates comprehensive dashboard stats for Super Admin.
   */
  public static async getDashboardStats() {
    const db = getDatabase();

    const companies = this.listCompanies();
    const totalCustomers = companies.length;
    const activeCustomers = companies.filter(c => c.status === 'ACTIVE').length;
    const inactiveCustomers = companies.filter(c => c.status === 'INACTIVE').length;
    const trialCustomers = companies.filter(c => c.status === 'TRIAL').length;
    const expiredCustomers = companies.filter(c => c.status === 'EXPIRED').length;
    const suspendedAccounts = companies.filter(c => c.status === 'SUSPENDED').length;

    // Total tenant users
    const totalTenantUsersRow = db.prepare('SELECT COUNT(*) as c FROM app_users').get() as any;
    const totalTenantUsers = Number(totalTenantUsersRow?.c || 0);

    // Active & Expiring licenses
    const now = new Date();
    const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    const activeLicenses = activeCustomers + trialCustomers;
    const expiringLicenses = companies.filter(c => {
      const expDate = c.subscription_ends_at ? new Date(c.subscription_ends_at) : (c.trial_ends_at ? new Date(c.trial_ends_at) : null);
      return expDate && expDate > now && expDate <= in15Days;
    }).length;

    // Recent Customers (top 6)
    const recentCustomers = companies.slice(0, 6);

    // Recent Activity (from Audit log)
    const auditRes = await SuperAdminAuditService.getLogs({ limit: 10 });

    // Module usage distribution across all companies
    const moduleUsageRows = db.prepare(`
      SELECT module_id, COUNT(*) as count 
      FROM company_modules 
      WHERE is_enabled = 1 
      GROUP BY module_id 
      ORDER BY count DESC
    `).all() as { module_id: string; count: number }[];

    const moduleUsage = AVAILABLE_SYSTEM_MODULES.map(m => {
      const found = moduleUsageRows.find(r => r.module_id === m.id);
      return {
        id: m.id,
        name: m.name,
        count: found ? Number(found.count) : 0,
        percentage: totalCustomers > 0 ? Math.round(((found ? Number(found.count) : 0) / totalCustomers) * 100) : 0,
      };
    });

    return {
      kpis: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        trialCustomers,
        expiredCustomers,
        totalTenantUsers,
        activeLicenses,
        expiringLicenses,
        suspendedAccounts,
      },
      subscriptionOverview: {
        active: activeCustomers,
        trial: trialCustomers,
        expiringSoon: expiringLicenses,
        expired: expiredCustomers,
        suspended: suspendedAccounts,
      },
      recentCustomers,
      recentActivity: auditRes.logs,
      moduleUsage,
    };
  }

  /**
   * Updates company feature flags.
   */
  public static setCompanyFeatureFlags(companyId: string, flags: { key: string; value: string }[]): void {
    for (const f of flags) {
      FeatureFlagService.updateFlag(f.key, f.value, companyId);
    }
  }

  /**
   * Updates company settings dictionary.
   */
  public static setCompanySettings(companyId: string, settings: Record<string, string>): void {
    for (const [key, value] of Object.entries(settings)) {
      CompanySettingsService.setSetting(companyId, key, value);
    }
  }
}
