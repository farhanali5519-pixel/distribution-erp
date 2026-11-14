import { DeploymentMode } from '@/core/config/env';
import { UserRole } from '@/modules/auth/types';

/**
 * Server-side Company/Tenant Context
 * Contains verified company, authenticated user, and runtime deployment mode.
 */
export interface TenantContext {
  /** The UUID of the verified tenant company */
  companyId: string;
  /** The display name of the tenant company */
  companyName: string;
  /** The unique URL slug of the tenant company */
  companySlug: string;
  /** Active deployment mode ('onpremise' or 'cloud') */
  deploymentMode: DeploymentMode;
  /** Authenticated user UUID, if logged in */
  userId?: string;
  /** Authenticated user username, if logged in */
  username?: string;
  /** Authenticated user full name, if logged in */
  fullName?: string;
  /** Authenticated user role, if logged in */
  role?: UserRole;
  /** Whether the request has a valid authenticated session */
  isAuthenticated: boolean;
  /** Convenience flag: deploymentMode === 'cloud' */
  isCloud: boolean;
  /** Convenience flag: deploymentMode === 'onpremise' */
  isOnPremise: boolean;
  /** Convenience flag: deploymentMode === 'hostinger' */
  isHostinger?: boolean;
  /** Current company status if resolved (ACTIVE, TRIAL, SUSPENDED, EXPIRED) */
  status?: string;
  /** Error or mismatch reason if resolution or auth failed */
  error?: string;
}

/**
 * Result of resolving a tenant from hostname, header, or deployment defaults
 */
export interface TenantResolution {
  companyId: string;
  companyName: string;
  companySlug: string;
  source: 'onpremise_default' | 'hostinger_default' | 'header' | 'hostname' | 'fallback';
  isValid: boolean;
  status?: string;
  error?: string;
}

/**
 * Minimal authenticated user payload returned by requireAuthenticatedUser()
 */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  role: UserRole;
  username: string;
  fullName: string;
}
