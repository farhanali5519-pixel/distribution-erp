import { isCloudMode, isPostgresDriver, isOnPremiseMode, isBuildPhase } from '@/core/config/env';
import { AppModule, SystemModuleRecord } from './module.interface';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import {
  HIERARCHICAL_MODULES,
  findSubmoduleByRoute,
  findSubmoduleById,
  findMainModuleById,
  MainModuleDefinition,
  SubModuleDefinition,
} from './hierarchical-module-registry';

/**
 * In-memory module manifests registered by code
 */
const registeredModules = new Map<string, AppModule>();

interface CachedCompanyModules {
  enabledSet: Set<string>;
  allModules: (AppModule & { isEnabled: boolean })[];
  hasGranularSubmodules: boolean;
  timestamp: number;
}

const companyModulesCache = new Map<string, CachedCompanyModules>();
const CACHE_TTL_MS = 10000; // 10 seconds TTL, invalidated immediately on module mutation

/**
 * Centralized calculation of enabled main modules and submodules for a company.
 * 
 * Backward Compatibility Guarantee:
 * - If company has explicitly saved submodules (records containing ':'):
 *   Submodule is enabled ONLY if parent module is enabled AND child record is enabled (is_enabled = 1).
 * - If company has NO granular submodule records (existing tenant):
 *   Submodules inherit from parent module. If parent is enabled, children are enabled!
 *   (Unless a legacy submodule like field_order_booking was explicitly set to 0).
 */
export function computeCompanyModuleState(compRows: { module_id: string; is_enabled: any }[]) {
  const compMap = new Map<string, number>(
    (compRows || []).map((r) => [r.module_id, Number(r.is_enabled) === 1 ? 1 : 0])
  );
  const hasCompanyConfig = compRows && compRows.length > 0;
  const hasGranularSubmodules = (compRows || []).some((r) => r.module_id.includes(':'));

  const enabledSet = new Set<string>();

  for (const mainMod of HIERARCHICAL_MODULES) {
    let isParentEnabled = false;
    if (hasCompanyConfig) {
      if (compMap.has(mainMod.id)) {
        isParentEnabled = compMap.get(mainMod.id) === 1;
      } else if (mainMod.legacyModuleIds?.length) {
        // Fallback: Check if any legacy module ID for this group was enabled
        const legacyActive = mainMod.legacyModuleIds.some((legId) => compMap.get(legId) === 1);
        isParentEnabled = Boolean(legacyActive);
      } else {
        isParentEnabled = false;
      }
    } else {
      isParentEnabled = true;
    }

    if (isParentEnabled) {
      enabledSet.add(mainMod.id);

      for (const child of mainMod.children) {
        let isChildEnabled = false;
        if (hasGranularSubmodules) {
          // Explicit granular configuration saved by Super Admin
          // Child MUST be explicitly enabled, and parent must be enabled
          isChildEnabled = compMap.get(child.id) === 1;
        } else {
          // Existing tenant: child inherits parent enabled state
          isChildEnabled = isParentEnabled;
          // If legacy submodule was explicitly turned off (e.g. field_order_booking = 0), respect it
          if (child.legacyModuleId && compMap.has(child.legacyModuleId)) {
            isChildEnabled = isParentEnabled && compMap.get(child.legacyModuleId) === 1;
          }
        }

        if (isChildEnabled) {
          enabledSet.add(child.id);
          if (child.legacyModuleId) {
            enabledSet.add(child.legacyModuleId);
          }
        }
      }
    }
  }

  // Also retain any registered system modules
  const result: (AppModule & { isEnabled: boolean })[] = [];
  for (const [id, mod] of registeredModules.entries()) {
    let isEnabled = false;
    if (hasCompanyConfig) {
      if (enabledSet.has(id)) {
        isEnabled = true;
      } else if (compMap.has(id)) {
        isEnabled = compMap.get(id) === 1;
      }
    } else {
      isEnabled = mod.isCore ?? true;
    }
    if (isEnabled) enabledSet.add(id);
    result.push({ ...mod, isEnabled });
  }

  return { enabledSet, allModules: result, hasGranularSubmodules };
}

export class ModuleRegistry {
  /**
   * Register a module specification into the system
   */
  public static register(module: AppModule): void {
    registeredModules.set(module.id, module);
  }

  /**
   * Clears module cache for a specific company or all companies.
   * Call whenever Super Admin updates module entitlements.
   */
  public static clearCache(companyId?: string): void {
    if (companyId) {
      companyModulesCache.delete(companyId);
    } else {
      companyModulesCache.clear();
    }
  }

  /**
   * Ensure all registered code modules and hierarchical modules exist in system_modules.
   */
  public static syncWithDatabase(): void {
    if (isCloudMode() || isPostgresDriver() || isBuildPhase()) return;

    try {
      const { getDatabase } = require('../database/db');
      const db = getDatabase();
      const upsertStmt = db.prepare(`
        INSERT INTO system_modules (id, name, description, version, is_enabled, dependencies, settings, installed_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, '{}', datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          version = excluded.version,
          dependencies = excluded.dependencies,
          updated_at = datetime('now')
      `);

      db.exec('BEGIN TRANSACTION');
      try {
        // 1. Sync standard code modules
        for (const [id, mod] of registeredModules.entries()) {
          upsertStmt.run(
            id,
            mod.name,
            mod.description || '',
            mod.version || '1.0.0',
            JSON.stringify(mod.dependencies || [])
          );
        }

        // 2. Sync canonical main modules and submodules
        for (const mainMod of HIERARCHICAL_MODULES) {
          upsertStmt.run(mainMod.id, mainMod.label, mainMod.description, '1.0.0', '[]');
          for (const child of mainMod.children) {
            upsertStmt.run(child.id, child.label, child.description, '1.0.0', '[]');
            if (child.legacyModuleId) {
              upsertStmt.run(child.legacyModuleId, child.label, child.description, '1.0.0', '[]');
            }
          }
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.error('Failed to sync modules with SQLite:', err);
    }
  }

  /**
   * Asynchronously loads company modules from database and populates cache.
   */
  public static async loadCompanyModules(
    companyId: string = DEFAULT_COMPANY_ID
  ): Promise<(AppModule & { isEnabled: boolean })[]> {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const cached = companyModulesCache.get(cleanCompanyId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.allModules;
    }

    try {
      const { getDatabaseClient } = await import('../database/factory');
      const client = getDatabaseClient();
      const compRows = await client.query<{ module_id: string; is_enabled: any }>(
        'SELECT module_id, is_enabled FROM company_modules WHERE company_id = ?',
        [cleanCompanyId]
      );

      const state = computeCompanyModuleState(compRows || []);

      companyModulesCache.set(cleanCompanyId, {
        enabledSet: state.enabledSet,
        allModules: state.allModules,
        hasGranularSubmodules: state.hasGranularSubmodules,
        timestamp: Date.now(),
      });

      return state.allModules;
    } catch (err) {
      console.error('Failed to load company modules from database:', err);
      return this.getAllModules(cleanCompanyId);
    }
  }

  /**
   * Synchronous accessor for all available modules with their enabled state for a company.
   */
  public static getAllModules(
    companyId: string = DEFAULT_COMPANY_ID
  ): (AppModule & { isEnabled: boolean })[] {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const cached = companyModulesCache.get(cleanCompanyId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.allModules;
    }

    if (!isPostgresDriver() && !isCloudMode() && !isBuildPhase()) {
      try {
        const { getDatabase } = require('../database/db');
        const db = getDatabase();

        const compRows = db
          .prepare('SELECT module_id, is_enabled FROM company_modules WHERE company_id = ?')
          .all(cleanCompanyId) as { module_id: string; is_enabled: number }[];

        const state = computeCompanyModuleState(compRows || []);

        companyModulesCache.set(cleanCompanyId, {
          enabledSet: state.enabledSet,
          allModules: state.allModules,
          hasGranularSubmodules: state.hasGranularSubmodules,
          timestamp: Date.now(),
        });

        return state.allModules;
      } catch (e) {
        // Fall through to cached or defaults
      }
    }

    if (cached) {
      return cached.allModules;
    }

    return Array.from(registeredModules.values()).map((mod) => ({
      ...mod,
      isEnabled: mod.isCore ?? false,
    }));
  }

  /**
   * Check if a specific module, submodule, or legacy module ID is enabled for a company.
   */
  public static isModuleEnabled(
    moduleId: string,
    companyId: string = DEFAULT_COMPANY_ID
  ): boolean {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const cached = companyModulesCache.get(cleanCompanyId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.enabledSet.has(moduleId);
    }

    // Load and populate cache
    this.getAllModules(cleanCompanyId);
    const refreshed = companyModulesCache.get(cleanCompanyId);
    if (refreshed) {
      return refreshed.enabledSet.has(moduleId);
    }

    const mod = registeredModules.get(moduleId);
    return mod?.isCore ?? false;
  }

  /**
   * Checks if an individual submodule is enabled for a company.
   */
  public static isSubmoduleEnabled(
    submoduleId: string,
    companyId: string = DEFAULT_COMPANY_ID
  ): boolean {
    return this.isModuleEnabled(submoduleId, companyId);
  }

  /**
   * Checks if a route path is permitted under the company's active module & submodule entitlements.
   * If route is governed by a submodule: parent module MUST be enabled AND submodule MUST be enabled.
   */
  public static isRouteEnabled(
    routePath: string,
    companyId: string = DEFAULT_COMPANY_ID
  ): boolean {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const found = findSubmoduleByRoute(routePath);
    if (!found) {
      // Unguarded common page (e.g. root dashboard /)
      return true;
    }

    // Both parent module AND submodule must be enabled
    const parentOn = this.isModuleEnabled(found.mainModule.id, cleanCompanyId);
    if (!parentOn) return false;

    return this.isModuleEnabled(found.submodule.id, cleanCompanyId);
  }

  /**
   * Returns array of all enabled module and submodule IDs for a company.
   */
  public static getAllEnabledIds(companyId: string = DEFAULT_COMPANY_ID): string[] {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    this.getAllModules(cleanCompanyId);
    const cached = companyModulesCache.get(cleanCompanyId);
    return cached ? Array.from(cached.enabledSet) : [];
  }

  /**
   * Returns complete hierarchical modules structure populated with company-specific enabled states.
   */
  public static getHierarchicalModulesForCompany(companyId: string = DEFAULT_COMPANY_ID) {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    this.getAllModules(cleanCompanyId);
    const cached = companyModulesCache.get(cleanCompanyId);
    const enabledSet = cached ? cached.enabledSet : new Set<string>();
    const isCustomized = cached ? cached.hasGranularSubmodules : false;

    return HIERARCHICAL_MODULES.map((mainMod) => {
      const isParentEnabled = enabledSet.has(mainMod.id);
      const childrenWithState = mainMod.children.map((child) => ({
        ...child,
        is_enabled: isParentEnabled && enabledSet.has(child.id),
      }));

      const enabledCount = childrenWithState.filter((c) => c.is_enabled).length;

      return {
        ...mainMod,
        is_enabled: isParentEnabled,
        enabledCount,
        totalChildren: mainMod.children.length,
        children: childrenWithState,
      };
    });
  }

  /**
   * Alias with (companyId, moduleId) argument order
   */
  public static isModuleEnabledForCompany(companyId: string, moduleId: string): boolean {
    return this.isModuleEnabled(moduleId, companyId);
  }

  /**
   * Toggle a module ON or OFF with dependency synchronization.
   * Clears cache immediately so changes are live without redeploy.
   */
  public static toggleModule(
    moduleId: string,
    enable: boolean,
    companyId: string = DEFAULT_COMPANY_ID
  ): { success: boolean; message: string; affectedModules?: string[]; modules?: (AppModule & { isEnabled: boolean })[] } {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const mod = registeredModules.get(moduleId);
    if (!mod) {
      return { success: false, message: `Module "${moduleId}" is not registered in the system.` };
    }

    if (mod.isCore && !enable) {
      return { success: false, message: 'Core system modules cannot be disabled.' };
    }

    // Invalidate cache immediately
    this.clearCache(cleanCompanyId);

    if (isCloudMode() || isPostgresDriver()) {
      // Async DB write will be performed via setModuleEnabledAsync or API
      return {
        success: true,
        message: `Module "${mod.name}" is now ${enable ? 'ENABLED' : 'DISABLED'}.`,
        affectedModules: [moduleId],
        modules: this.getAllModules(cleanCompanyId),
      };
    }

    const { getDatabase } = require('@/core/database/db');
    const db = getDatabase();
    const affected: string[] = [moduleId];

    if (enable) {
      const toEnable = new Set<string>();
      toEnable.add(moduleId);

      const queue = [...(mod.dependencies || [])];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const depId = queue.shift()!;
        if (visited.has(depId)) continue;
        visited.add(depId);

        const depMod = registeredModules.get(depId);
        const isDepEnabled = this.isModuleEnabled(depId, cleanCompanyId);

        if (!isDepEnabled) {
          toEnable.add(depId);
          if (!affected.includes(depId)) {
            affected.push(depId);
          }
        }

        if (depMod?.dependencies?.length) {
          queue.push(...depMod.dependencies);
        }
      }

      const updateCompStmt = db.prepare(`
        INSERT INTO company_modules (company_id, module_id, is_enabled, updated_at)
        VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(company_id, module_id) DO UPDATE SET
          is_enabled = 1,
          updated_at = datetime('now')
      `);

      db.exec('BEGIN TRANSACTION');
      try {
        for (const id of toEnable) {
          updateCompStmt.run(cleanCompanyId, id);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      this.clearCache(cleanCompanyId);

      const autoEnabledNames = [...toEnable]
        .filter((id) => id !== moduleId)
        .map((id) => registeredModules.get(id)?.name || id);

      let message = `Module "${mod.name}" is now ENABLED.`;
      if (autoEnabledNames.length > 0) {
        message = `Module "${mod.name}" and required dependencies (${autoEnabledNames.map((n) => `"${n}"`).join(', ')}) are now ENABLED.`;
      }

      return {
        success: true,
        message,
        affectedModules: affected,
        modules: this.getAllModules(cleanCompanyId),
      };
    } else {
      const toDisable = new Set<string>();
      toDisable.add(moduleId);

      const allMods = this.getAllModules(cleanCompanyId);
      const activeMap = new Map<string, string[]>();
      for (const m of allMods) {
        if (m.isEnabled) {
          activeMap.set(m.id, m.dependencies || []);
        }
      }

      let changed = true;
      while (changed) {
        changed = false;
        for (const [id, deps] of activeMap.entries()) {
          if (!toDisable.has(id)) {
            if (deps.some((d) => toDisable.has(d))) {
              toDisable.add(id);
              if (!affected.includes(id)) {
                affected.push(id);
              }
              changed = true;
            }
          }
        }
      }

      for (const id of toDisable) {
        const m = registeredModules.get(id);
        if (m?.isCore) {
          return {
            success: false,
            message: `Cannot disable "${mod.name}" because core system module "${m.name}" depends on it.`,
          };
        }
      }

      const disableCompStmt = db.prepare(`
        INSERT INTO company_modules (company_id, module_id, is_enabled, updated_at)
        VALUES (?, ?, 0, datetime('now'))
        ON CONFLICT(company_id, module_id) DO UPDATE SET
          is_enabled = 0,
          updated_at = datetime('now')
      `);

      db.exec('BEGIN TRANSACTION');
      try {
        for (const id of toDisable) {
          disableCompStmt.run(cleanCompanyId, id);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      this.clearCache(cleanCompanyId);

      const autoDisabledNames = [...toDisable]
        .filter((id) => id !== moduleId)
        .map((id) => registeredModules.get(id)?.name || id);

      let message = `Module "${mod.name}" is now DISABLED.`;
      if (autoDisabledNames.length > 0) {
        message = `Module "${mod.name}" and dependent active modules (${autoDisabledNames.map((n) => `"${n}"`).join(', ')}) are now DISABLED.`;
      }

      return {
        success: true,
        message,
        affectedModules: affected,
        modules: this.getAllModules(cleanCompanyId),
      };
    }
  }

  /**
   * Sets module enabled state asynchronously in database and clears cache immediately
   */
  public static async setModuleEnabledAsync(
    moduleId: string,
    isEnabled: boolean,
    companyId: string = DEFAULT_COMPANY_ID
  ): Promise<void> {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const { getDatabaseClient } = await import('../database/factory');
    const client = getDatabaseClient();

    await client.execute(
      `INSERT INTO company_modules (company_id, module_id, is_enabled, dependencies, settings, updated_at)
       VALUES (?, ?, ?, '[]', '{}', CURRENT_TIMESTAMP)
       ON CONFLICT (company_id, module_id) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [cleanCompanyId, moduleId, isEnabled ? 1 : 0]
    );

    this.clearCache(cleanCompanyId);
  }
}
