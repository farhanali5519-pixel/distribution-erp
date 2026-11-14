export type LicenseType = 'PERPETUAL' | 'SUBSCRIPTION' | 'TRIAL';

export type LicenseStatus = 'VALID' | 'GRACE_PERIOD' | 'EXPIRED' | 'INVALID' | 'UNLICENSED';

export interface LicensePayload {
  licenseId: string;
  companyName: string;
  companySlug?: string;
  type: LicenseType;
  issuedAt: string;          // ISO Date
  expiresAt: string | null;   // ISO Date, or null for PERPETUAL
  maxUsers: number;
  maxWarehouses?: number;
  enabledModules: string[];  // e.g. ['sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings']
  enabledFeatures?: string[];
  machineId?: string;        // Hashed hardware identifier, or '*' for unrestricted
  issuer: string;            // 'SaleFlow Platform' or authorized distributor
}

export interface LicenseValidationResult {
  status: LicenseStatus;
  isValid: boolean;
  message: string;
  payload: LicensePayload | null;
  daysRemaining: number | null;
  graceDaysRemaining?: number;
  isGracePeriod: boolean;
  machineIdMatches: boolean;
}

export interface SystemLicenseRecord {
  id: string;
  company_id: string | null;
  license_key: string;
  payload_json: string;
  signature: string;
  status: string;
  installed_at: string;
  last_verified_at: string;
}
