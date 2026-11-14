import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { appLog } from '@/core/logging/logger';

export type SuperAdminAction =
  | 'SUPERADMIN_LOGIN'
  | 'SUPERADMIN_LOGIN_FAILED'
  | 'SUPERADMIN_LOGOUT'
  | '2FA_ENABLED'
  | '2FA_DISABLED'
  | '2FA_POLICY_CHANGED'
  | 'RECOVERY_CODES_REGENERATED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_SUSPENDED'
  | 'CUSTOMER_ACTIVATED'
  | 'LICENSE_EXTENDED'
  | 'MODULES_CHANGED'
  | 'GLOBAL_BRANDING_CHANGED'
  | 'TENANT_BRANDING_CHANGED'
  | 'TENANT_ADMIN_PASSWORD_RESET'
  | 'TENANT_USER_CREATED'
  | 'TENANT_USER_UPDATED'
  | 'TENANT_USER_STATUS_CHANGED'
  | 'TENANT_USER_PERMISSIONS_CHANGED'
  | 'SYSTEM_SETTINGS_UPDATED';

export interface AuditLogItem {
  id: string;
  actor: string;
  action: SuperAdminAction | string;
  target?: string;
  tenantId?: string;
  tenantSlug?: string;
  ip?: string;
  reason?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export class SuperAdminAuditService {
  /**
   * Sanitizes sensitive fields so passwords, tokens, OTPs, and secrets are NEVER logged.
   */
  private static sanitizeMetadata(meta?: Record<string, any>): Record<string, any> {
    if (!meta) return {};
    const sanitized: Record<string, any> = {};
    const forbiddenKeys = new Set([
      'password',
      'password_hash',
      'temp_password',
      'otp',
      'secret',
      'totp_secret',
      'recovery_code',
      'recovery_codes',
      'session_secret',
      'token',
      'authorization',
      'cookie',
    ]);

    for (const [k, v] of Object.entries(meta)) {
      const lower = k.toLowerCase();
      if (forbiddenKeys.has(lower) || lower.includes('pass') || lower.includes('secret') || lower.includes('otp')) {
        sanitized[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = this.sanitizeMetadata(v);
      } else {
        sanitized[k] = v;
      }
    }

    return sanitized;
  }

  /**
   * Records a Super Admin audit event permanently.
   */
  public static async log(entry: {
    actor: string;
    action: SuperAdminAction | string;
    target?: string;
    tenantId?: string;
    tenantSlug?: string;
    ip?: string;
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; success: boolean }> {
    const id = generateUUID();
    const now = new Date().toISOString();
    const safeMeta = this.sanitizeMetadata({
      ...entry.metadata,
      target: entry.target,
      tenantSlug: entry.tenantSlug,
      ip: entry.ip || 'internal',
    });

    const companyId = entry.tenantId || 'SYSTEM';

    try {
      const client = getDatabaseClient();
      await client.execute(
        `INSERT INTO audit_logs (
          id, company_id, user_id, user_name, user_role,
          action, transaction_type, transaction_id, transaction_number,
          transaction_date, reason, is_day_closed, details_json, created_at
        ) VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, 'SUPER_ADMIN_AUDIT', ?, ?, ?, ?, 0, ?, ?)`,
        [
          id,
          companyId,
          entry.actor,
          entry.actor,
          entry.action,
          id,
          entry.target || null,
          now.split('T')[0],
          entry.reason || `${entry.action}: ${entry.target || 'System'}`,
          JSON.stringify(safeMeta),
          now,
        ]
      );

      appLog.info('AUDIT', `[SUPERADMIN] ${entry.action} by ${entry.actor} on ${entry.target || 'Platform'}`);
      return { id, success: true };
    } catch (err: any) {
      console.warn('[Audit] Failed to record Super Admin audit log:', err?.message);
      return { id, success: false };
    }
  }

  /**
   * Queries audit logs with pagination and filters
   */
  public static async getLogs(params?: {
    search?: string;
    action?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogItem[]; total: number }> {
    try {
      const client = getDatabaseClient();
      const limit = Math.min(100, Math.max(1, params?.limit || 25));
      const offset = Math.max(0, params?.offset || 0);

      const whereClauses: string[] = ["transaction_type = 'SUPER_ADMIN_AUDIT'"];
      const sqlParams: any[] = [];

      if (params?.tenantId) {
        whereClauses.push('company_id = ?');
        sqlParams.push(params.tenantId);
      }

      if (params?.action) {
        whereClauses.push('action = ?');
        sqlParams.push(params.action);
      }

      if (params?.search?.trim()) {
        const term = `%${params.search.trim().toLowerCase()}%`;
        whereClauses.push('(LOWER(user_name) LIKE ? OR LOWER(action) LIKE ? OR LOWER(reason) LIKE ? OR LOWER(details_json) LIKE ?)');
        sqlParams.push(term, term, term, term);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countRow = await client.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM audit_logs ${whereSql}`,
        sqlParams
      );
      const total = Number(countRow?.count || 0);

      const rows = await client.query<any>(
        `SELECT id, user_name, action, transaction_number, company_id, reason, details_json, created_at 
         FROM audit_logs 
         ${whereSql} 
         ORDER BY created_at DESC 
         LIMIT ${limit} OFFSET ${offset}`,
        sqlParams
      );

      const logs: AuditLogItem[] = rows.map((r) => {
        let meta: Record<string, any> = {};
        try {
          if (r.details_json) meta = JSON.parse(r.details_json);
        } catch {}

        return {
          id: r.id,
          actor: r.user_name || 'superadmin',
          action: r.action,
          target: r.transaction_number || meta.target,
          tenantId: r.company_id,
          tenantSlug: meta.tenantSlug,
          ip: meta.ip,
          reason: r.reason,
          metadata: meta,
          timestamp: r.created_at,
        };
      });

      return { logs, total };
    } catch (err: any) {
      console.warn('[Audit] Failed to fetch Super Admin audit logs:', err?.message);
      return { logs: [], total: 0 };
    }
  }
}
