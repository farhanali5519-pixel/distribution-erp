import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export type AuditActionType =
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'MODULE_TOGGLE'
  | 'FEATURE_TOGGLE'
  | 'SETTINGS_CHANGE'
  | 'BACKUP_CREATE'
  | 'BACKUP_RESTORE'
  | 'BACKUP_DELETE'
  | 'LICENSE_INSTALL'
  | 'LICENSE_CHANGE'
  | 'TRANSACTION_DELETE'
  | 'TRANSACTION_VOID'
  | 'CLOSING_OVERRIDE'
  | 'SYSTEM_MIGRATION';

export interface AuditLogEntry {
  companyId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: AuditActionType | string;
  transactionType: string;
  transactionId?: string;
  transactionNumber?: string;
  reason: string;
  isDayClosed?: boolean;
  details?: Record<string, any>;
}

export class AuditLogService {
  /**
   * Logs an administrative, financial or system action to audit_logs
   */
  public static logAction(entry: AuditLogEntry): { id: string; success: boolean } {
    const db = getDatabase();
    const id = generateUUID();
    const companyId = entry.companyId || DEFAULT_COMPANY_ID;
    const now = new Date().toISOString();
    const detailsJson = JSON.stringify(entry.details || {});

    try {
      db.prepare(`
        INSERT INTO audit_logs (
          id, company_id, user_id, user_name, user_role,
          action, transaction_type, transaction_id, transaction_number,
          transaction_date, reason, is_day_closed, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        companyId,
        entry.userId || 'system',
        entry.userName || 'System / Admin',
        entry.userRole || 'ADMIN',
        entry.action,
        entry.transactionType,
        entry.transactionId || id,
        entry.transactionNumber || null,
        now.split('T')[0],
        entry.reason,
        entry.isDayClosed ? 1 : 0,
        detailsJson,
        now
      );

      return { id, success: true };
    } catch (error) {
      console.warn('Failed to record audit log:', error);
      return { id, success: false };
    }
  }

  /**
   * Fetches audit log records with optional filtering
   */
  public static getLogs(params?: {
    companyId?: string;
    action?: string;
    transactionType?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = getDatabase();
    const companyId = params?.companyId || DEFAULT_COMPANY_ID;
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let query = 'SELECT * FROM audit_logs WHERE company_id = ?';
    const queryParams: any[] = [companyId];

    if (params?.action) {
      query += ' AND action = ?';
      queryParams.push(params.action);
    }

    if (params?.transactionType) {
      query += ' AND transaction_type = ?';
      queryParams.push(params.transactionType);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    return db.prepare(query).all(...queryParams);
  }
}
