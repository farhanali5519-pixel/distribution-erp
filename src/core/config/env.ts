import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { getBaseDomain, getAppProtocol, getCompanyUrl } from '../tenancy/subdomain';

export { getBaseDomain, getAppProtocol, getCompanyUrl };

export type DeploymentMode = 'onpremise' | 'cloud' | 'hostinger';
export type DatabaseDriver = 'sqlite' | 'postgres';

export function isServerlessOrCloud(): boolean {
  const rawMode = (process.env.DEPLOYMENT_MODE || '').toLowerCase().trim();
  const rawDriver = (process.env.DATABASE_DRIVER || '').toLowerCase().trim();
  return (
    rawMode === 'cloud' ||
    rawDriver === 'postgres' ||
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

export function isBuildPhase(): boolean {
  return (
    process.env.SALEFLOW_BUILD_PHASE === 'true' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.__NEXT_BUILDING__ === '1'
  );
}

function loadCanonicalVersion(): string {
  try {
    const versionFile = path.join(process.cwd(), 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (data && typeof data.version === 'string') return data.version.trim();
    }
  } catch {}
  return '1.1.0';
}

export const APP_VERSION = loadCanonicalVersion();

export interface AppConfig {
  deploymentMode: DeploymentMode;
  databaseDriver: DatabaseDriver;
  sqliteDatabasePath: string;
  databaseUrl?: string;
  databaseReadUrl?: string;
  dbPoolMax: number;
  dbPoolIdleTimeout: number;
  dbPoolConnectionTimeout: number;
  baseDomain: string;
  appProtocol: 'http' | 'https';
  serverHost: string;
  serverPort: number;
  appVersion: string;
}

/**
 * Resolves the persistent base root directory for Windows installed mode vs development mode.
 */
export function getSaleFlowPersistentRoot(): string {
  const isInstalled = process.env.SALEFLOW_INSTALLED_MODE === '1';
  if (isInstalled && process.env.PROGRAMDATA) {
    return path.join(process.env.PROGRAMDATA, 'SaleFlow');
  }
  return process.cwd();
}

export function getSaleFlowDataDir(): string {
  if (isServerlessOrCloud()) {
    const tmpDir = path.join(os.tmpdir(), 'saleflow-data');
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    return tmpDir;
  }
  const custom = process.env.SALEFLOW_DATA_DIR?.trim();
  const dir = custom 
    ? (path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom))
    : (process.env.SALEFLOW_INSTALLED_MODE === '1' && process.env.PROGRAMDATA
        ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'data')
        : path.join(process.cwd(), 'data'));
  if (!isBuildPhase() && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSaleFlowBackupDir(): string {
  if (isServerlessOrCloud()) {
    const tmpDir = path.join(os.tmpdir(), 'saleflow-backups');
    try {
      if (!isBuildPhase() && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    return tmpDir;
  }
  const custom = process.env.SQLITE_BACKUP_PATH?.trim() || process.env.SALEFLOW_BACKUP_DIR?.trim() || process.env.BACKUPS_DIR?.trim();
  const dir = custom 
    ? (path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom))
    : (process.env.SALEFLOW_INSTALLED_MODE === '1' && process.env.PROGRAMDATA
        ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'backups')
        : path.join(process.cwd(), 'backups'));
  if (!isBuildPhase() && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSaleFlowLogDir(): string {
  if (isServerlessOrCloud()) {
    const tmpDir = path.join(os.tmpdir(), 'saleflow-logs');
    try {
      if (!isBuildPhase() && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    return tmpDir;
  }
  const custom = process.env.SALEFLOW_LOG_DIR?.trim() || process.env.LOG_DIR?.trim();
  const dir = custom 
    ? (path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom))
    : (process.env.SALEFLOW_INSTALLED_MODE === '1' && process.env.PROGRAMDATA
        ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'logs')
        : path.join(process.cwd(), 'logs'));
  if (!isBuildPhase() && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSaleFlowConfigDir(): string {
  if (isServerlessOrCloud()) {
    const tmpDir = path.join(os.tmpdir(), 'saleflow-config');
    try {
      if (!isBuildPhase() && !fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    return tmpDir;
  }
  const custom = process.env.SALEFLOW_CONFIG_DIR?.trim();
  const dir = custom 
    ? (path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom))
    : (process.env.SALEFLOW_INSTALLED_MODE === '1' && process.env.PROGRAMDATA
        ? path.join(process.env.PROGRAMDATA, 'SaleFlow', 'config')
        : path.join(process.cwd(), 'config'));
  if (!isBuildPhase() && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Normalizes and resolves a database path relative to process.cwd() or SALEFLOW_DATA_DIR.
 * Ensures the parent directory exists.
 */
export function resolveSqlitePath(configuredPath?: string): string {
  // In cloud mode or postgres driver, SQLite is prohibited; NEVER touch filesystem or create directories
  const rawMode = (process.env.DEPLOYMENT_MODE || '').toLowerCase().trim();
  const rawDriver = (process.env.DATABASE_DRIVER || '').toLowerCase().trim();
  if (rawMode === 'cloud' || rawDriver === 'postgres') {
    return '';
  }

  // 1. Explicit SQLITE_DATABASE_PATH (Top Priority: if provided, use exactly that path)
  const targetCandidate = configuredPath?.trim() || process.env.SQLITE_DATABASE_PATH?.trim();
  if (targetCandidate && targetCandidate.length > 0) {
    const absolutePath = path.isAbsolute(targetCandidate) 
      ? targetCandidate 
      : path.resolve(process.cwd(), targetCandidate);
    const parentDir = path.dirname(absolutePath);
    if (!isBuildPhase() && !fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });
      } catch (err: any) {
        console.warn(`[SaleFlow] Unable to create parent directory for SQLite at ${parentDir}:`, err?.message);
      }
    }
    return absolutePath;
  }

  // 2. In installed mode or when SALEFLOW_DATA_DIR is specified, use persistent data directory
  if (process.env.SALEFLOW_INSTALLED_MODE === '1' || process.env.SALEFLOW_DATA_DIR) {
    const dataDir = getSaleFlowDataDir();
    return path.join(dataDir, 'sales_distribution.db');
  }

  // 3. Fallback to SALEFLOW_DATA_DIR / data folder (local Windows default)
  const dataDir = getSaleFlowDataDir();
  return path.join(dataDir, 'sales_distribution.db');
}

/**
 * Returns strongly-typed configuration loaded from process.env with safe defaults.
 */
export function getAppConfig(): AppConfig {
  const rawMode = (process.env.DEPLOYMENT_MODE || 'onpremise').toLowerCase().trim();
  let deploymentMode: DeploymentMode = 'onpremise';
  if (rawMode === 'cloud') {
    deploymentMode = 'cloud';
  } else if (rawMode === 'hostinger') {
    deploymentMode = 'hostinger';
  } else {
    deploymentMode = 'onpremise';
  }

  const rawDriver = (process.env.DATABASE_DRIVER || 'sqlite').toLowerCase().trim();
  const databaseDriver: DatabaseDriver = rawDriver === 'postgres' ? 'postgres' : 'sqlite';

  // In cloud/postgres mode, SQLite path is empty string; never run resolveSqlitePath filesystem operations
  const sqliteDatabasePath = (deploymentMode === 'cloud' || databaseDriver === 'postgres')
    ? ''
    : resolveSqlitePath(process.env.SQLITE_DATABASE_PATH);
  const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
  const databaseReadUrl = process.env.DATABASE_READ_URL?.trim() || undefined;

  const defaultPoolMax = deploymentMode === 'cloud' ? '5' : '20';
  const dbPoolMax = Math.max(2, parseInt(process.env.DB_POOL_MAX || defaultPoolMax, 10) || (deploymentMode === 'cloud' ? 5 : 20));
  const dbPoolIdleTimeout = Math.max(1000, parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10) || 30000);
  const dbPoolConnectionTimeout = Math.max(1000, parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '10000', 10) || 10000);

  const serverHost = process.env.HOST?.trim() || (deploymentMode === 'onpremise' || deploymentMode === 'hostinger' ? '0.0.0.0' : '127.0.0.1');
  const serverPort = parseInt(process.env.PORT || '3000', 10) || 3000;

  return {
    deploymentMode,
    databaseDriver,
    sqliteDatabasePath,
    databaseUrl,
    databaseReadUrl,
    dbPoolMax,
    dbPoolIdleTimeout,
    dbPoolConnectionTimeout,
    baseDomain: getBaseDomain(),
    appProtocol: getAppProtocol(),
    serverHost,
    serverPort,
    appVersion: APP_VERSION,
  };
}

export function getServerHost(): string {
  return getAppConfig().serverHost;
}

export function getServerPort(): number {
  return getAppConfig().serverPort;
}

export function getDbPoolConfig() {
  const cfg = getAppConfig();
  return {
    max: cfg.dbPoolMax,
    idleTimeoutMillis: cfg.dbPoolIdleTimeout,
    connectionTimeoutMillis: cfg.dbPoolConnectionTimeout,
  };
}

export function getAppVersion(): string {
  return APP_VERSION;
}

export function isCloudMode(): boolean {
  return getAppConfig().deploymentMode === 'cloud';
}

export function isHostingerMode(): boolean {
  return getAppConfig().deploymentMode === 'hostinger';
}

export function isOnPremiseMode(): boolean {
  return getAppConfig().deploymentMode === 'onpremise';
}

export function isSqliteDriver(): boolean {
  return getAppConfig().databaseDriver === 'sqlite';
}

export function isPostgresDriver(): boolean {
  return getAppConfig().databaseDriver === 'postgres';
}

/**
 * Non-secret runtime environment verification (Requirement 6)
 * Never exposes DATABASE_URL
 */
export function verifyEnvironmentSafe(): {
  deploymentMode: DeploymentMode;
  databaseDriver: DatabaseDriver;
  databaseUrlPresent: boolean;
} {
  const config = getAppConfig();
  return {
    deploymentMode: config.deploymentMode,
    databaseDriver: config.databaseDriver,
    databaseUrlPresent: Boolean(config.databaseUrl),
  };
}
