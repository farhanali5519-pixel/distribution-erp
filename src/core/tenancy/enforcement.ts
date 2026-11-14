import { ModuleRegistry } from '@/core/registry/module-registry';
import { FeatureFlagService } from '@/core/settings/flags';
import { CompanySettingsService } from '@/core/settings/company-settings';
import { DEFAULT_COMPANY_ID } from './constants';

/**
 * Thrown when a company attempts to access an endpoint, service, or page for a disabled module.
 * HTTP 403 Forbidden.
 */
export class TenantModuleDisabledError extends Error {
  public readonly status: number = 403;
  public readonly statusCode: number = 403;
  public readonly moduleId: string;
  public readonly companyId: string;

  constructor(moduleId: string, companyId: string = DEFAULT_COMPANY_ID) {
    super(`Module "${moduleId}" is disabled for company "${companyId}".`);
    this.name = 'TenantModuleDisabledError';
    this.moduleId = moduleId;
    this.companyId = companyId;
  }
}

/**
 * Thrown when a company attempts to access functionality guarded by a disabled feature flag.
 * HTTP 403 Forbidden.
 */
export class TenantFeatureDisabledError extends Error {
  public readonly status: number = 403;
  public readonly statusCode: number = 403;
  public readonly featureKey: string;
  public readonly companyId: string;

  constructor(featureKey: string, companyId: string = DEFAULT_COMPANY_ID) {
    super(`Feature "${featureKey}" is disabled for company "${companyId}".`);
    this.name = 'TenantFeatureDisabledError';
    this.featureKey = featureKey;
    this.companyId = companyId;
  }
}

import { NextResponse } from 'next/server';
import { getTenantContext, requireTenantContext } from './context';
import { TenantContext } from './types';

/**
 * Check if a system module is enabled for a specific company.
 * Order of arguments: (companyId, moduleId).
 */
export function isModuleEnabled(companyId: string, moduleId: string): boolean {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  return ModuleRegistry.isModuleEnabled(moduleId, companyId);
}

/**
 * Enforces that a module is enabled for a company.
 * Throws TenantModuleDisabledError (HTTP 403) if disabled.
 * User role (including ADMIN) must NOT bypass this check.
 */
export function requireModuleEnabled(companyId: string, moduleId: string): void {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  if (!isModuleEnabled(companyId, moduleId)) {
    throw new TenantModuleDisabledError(moduleId, companyId);
  }
}

/**
 * Centralized API module entitlement guard.
 * Validates authenticated tenant session and checks that the requested module is active for that tenant.
 * Returns either { context, errorResponse: null } or { context: null, errorResponse: NextResponse (401 or 403) }.
 */
export async function checkApiModuleAccess(
  req: any,
  moduleId: string | string[]
): Promise<
  | { context: TenantContext; errorResponse: null }
  | { context: null; errorResponse: NextResponse }
> {
  try {
    const context = await getTenantContext(req);
    if (!context.isAuthenticated) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { success: false, error: 'Authentication required. Please log in.', code: 'UNAUTHENTICATED' },
          { status: 401 }
        ),
      };
    }

    await ModuleRegistry.loadCompanyModules(context.companyId);

    const moduleList = Array.isArray(moduleId) ? moduleId : [moduleId];
    const isAllowed = moduleList.some((mod) => ModuleRegistry.isModuleEnabled(mod, context.companyId));

    if (!isAllowed) {
      const primaryMod = moduleList[0];
      return {
        context: null,
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Module "${primaryMod}" is disabled for your company.`,
            code: 'MODULE_DISABLED',
            moduleId: primaryMod,
          },
          { status: 403 }
        ),
      };
    }

    return { context, errorResponse: null };
  } catch (err: any) {
    return {
      context: null,
      errorResponse: NextResponse.json(
        { success: false, error: err.message || 'Tenant context error' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Enforces API module entitlement asynchronously, throwing TenantModuleDisabledError (403) if disabled.
 */
export async function requireApiModule(req: any, moduleId: string | string[]): Promise<TenantContext> {
  const result = await checkApiModuleAccess(req, moduleId);
  if (result.errorResponse) {
    const primaryMod = Array.isArray(moduleId) ? moduleId[0] : moduleId;
    throw new TenantModuleDisabledError(primaryMod);
  }
  return result.context;
}

/**
 * Check if a feature flag is enabled for a company.
 * Order of arguments: (companyId, featureKey, defaultValue?).
 * Automatically evaluates to false if the parent module is disabled for this company.
 */
export function isFeatureEnabled(companyId: string, featureKey: string, defaultValue: boolean = true): boolean {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  return FeatureFlagService.isEnabled(featureKey, defaultValue, companyId);
}

/**
 * Enforces that a feature flag is enabled for a company.
 * Throws TenantFeatureDisabledError (HTTP 403) if disabled.
 * User role (including ADMIN) must NOT bypass this check.
 */
export function requireFeatureEnabled(companyId: string, featureKey: string): void {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  if (!isFeatureEnabled(companyId, featureKey, true)) {
    throw new TenantFeatureDisabledError(featureKey, companyId);
  }
}

/**
 * Retrieves a company-scoped configuration setting from app_settings.
 * Order of arguments: (companyId, key, defaultValue?).
 */
export function getCompanySetting(companyId: string, key: string, defaultValue: string = ''): string {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  return CompanySettingsService.getSetting(companyId, key, defaultValue);
}

/**
 * Sets a company-scoped configuration setting in app_settings.
 */
export function setCompanySetting(
  companyId: string, 
  key: string, 
  value: string, 
  description: string = ''
): void {
  if (!companyId) companyId = DEFAULT_COMPANY_ID;
  CompanySettingsService.setSetting(companyId, key, value, description);
}
