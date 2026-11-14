/**
 * Next.js Server Startup Instrumentation
 * Runs once at application startup in the Node.js runtime environment.
 * Ensures the SQLite database schema and migrations are safely initialized
 * before incoming requests are handled.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Strictly bypass during Next.js production build phase
    const { isBuildPhase, isOnPremiseMode, isHostingerMode, isSqliteDriver } = await import('@/core/config/env');
    if (isBuildPhase()) {
      return;
    }

    // 2. Controlled Runtime Database Startup for On-Premise and Hostinger SQLite deployments
    if ((isOnPremiseMode() || isHostingerMode()) && isSqliteDriver()) {
      try {
        const { getDatabase } = await import('@/core/database/db');
        getDatabase();
      } catch (err: any) {
        console.error('[SaleFlow Startup Error] Failed initializing SQLite database at runtime:', err?.message || err);
        throw err;
      }
    }
  }
}
