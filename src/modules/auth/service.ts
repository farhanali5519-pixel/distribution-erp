import crypto from 'crypto';
import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { AppUser, CreateUserInput, UpdateUserInput, UserRole } from './types';
import { 
  ALL_SUBMODULES, 
  getDefaultPermissionsForRole, 
  normalizePermissions, 
  UserPermissionsMap 
} from './permissions-registry';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { CompanySettingsService } from '@/core/settings/company-settings';
import { isCloudMode, isPostgresDriver } from '@/core/config/env';

const PIN_SALT = 'saleflow_admin_pin_';
const PASSWORD_SALT = 'saleflow_user_salt_';

export class AuthService {
  /**
   * Hashes 4-digit PIN with salt
   */
  public static hashPin(pin: string): string {
    return crypto.createHash('sha256').update(PIN_SALT + pin.trim()).digest('hex');
  }

  /**
   * Hashes user password with salt
   */
  public static hashPassword(password: string): string {
    return crypto.createHash('sha256').update(PASSWORD_SALT + password).digest('hex');
  }

  /**
   * Verifies plain password against stored hash with constant-time comparison
   */
  public static verifyPassword(password: string, hash: string): boolean {
    if (!password || !hash) return false;
    const computed = this.hashPassword(password);
    const computedBuf = Buffer.from(computed);
    const hashBuf = Buffer.from(hash);
    if (computedBuf.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, hashBuf);
  }

  /**
   * Verifies if input PIN matches stored Admin Security PIN for a company with constant-time comparison
   */
  public static verifyAdminPin(pin: string, companyId: string = DEFAULT_COMPANY_ID): boolean {
    if (!pin) return false;
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const storedHash = CompanySettingsService.getSetting(cleanCompanyId, 'admin_security_pin');
    if (!storedHash) {
      // Fallback default: '1234'
      const defaultPinBuf = Buffer.from(pin.trim());
      const expectedBuf = Buffer.from('1234');
      if (defaultPinBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(defaultPinBuf, expectedBuf);
    }
    const computed = this.hashPin(pin);
    const computedBuf = Buffer.from(computed);
    const storedBuf = Buffer.from(storedHash);
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }

  /**
   * Sets a new Admin Security PIN for a company
   */
  public static setAdminPin(
    newPin: string, 
    currentPin?: string, 
    companyId: string = DEFAULT_COMPANY_ID
  ): { success: boolean; message: string } {
    if (!newPin || newPin.trim().length !== 4 || !/^\d{4}$/.test(newPin.trim())) {
      throw new Error('Admin PIN must be exactly 4 digits (0-9).');
    }
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    if (currentPin !== undefined) {
      const isValid = this.verifyAdminPin(currentPin, cleanCompanyId);
      if (!isValid) {
        throw new Error('Current Admin PIN is incorrect.');
      }
    }
    const newHash = this.hashPin(newPin);
    CompanySettingsService.setSetting(
      cleanCompanyId, 
      'admin_security_pin', 
      newHash, 
      'Hashed 4-digit security PIN for void authorization'
    );
    return { success: true, message: 'Admin Security PIN updated successfully.' };
  }

  /**
   * Transforms raw DB row into AppUser with parsed permissions
   */
  private static mapRowToUser(row: any): AppUser {
    let parsedPerms: any = null;
    if (row.permissions_json) {
      try {
        parsedPerms = JSON.parse(row.permissions_json);
      } catch {
        parsedPerms = null;
      }
    }
    const permissions = normalizePermissions(parsedPerms, row.role as UserRole);

    return {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      role: row.role as UserRole,
      staff_id: row.staff_id || null,
      staff_name: row.staff_name || null,
      is_active: Number(row.is_active),
      permissions_json: row.permissions_json || null,
      permissions,
      created_at: row.created_at,
      updated_at: row.updated_at,
      company_id: row.company_id || DEFAULT_COMPANY_ID,
    };
  }

  /**
   * Universal DAL Async Users retrieval
   */
  public static async getUsersAsync(companyId?: string): Promise<AppUser[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return await DalService.getUsersDetailed(companyId);
  }

  /**
   * Universal DAL Async User by ID retrieval
   */
  public static async getUserByIdAsync(id: string, companyId?: string): Promise<AppUser | null> {
    const users = await this.getUsersAsync(companyId);
    return users.find((u) => u.id === id) || null;
  }

  /**
   * Universal DAL Async User authentication
   */
  public static async authenticateAsync(username: string, password: string, companyId?: string): Promise<AppUser | null> {
    const { getDatabaseClient } = await import('@/core/database/factory');
    const client = getDatabaseClient();
    const clean = username.trim().toLowerCase();
    let query = `
      SELECT 
        u.id,
        u.username,
        u.password_hash,
        u.full_name,
        u.role,
        u.staff_id,
        s.name as staff_name,
        u.is_active,
        u.permissions_json,
        u.created_at,
        u.updated_at,
        u.company_id
      FROM app_users u
      LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
      WHERE LOWER(u.username) = ?
    `;
    const params: any[] = [clean];
    if (companyId) {
      query += ' AND u.company_id = ?';
      params.push(companyId);
    }
    const row = await client.queryOne<any>(query, params);
    if (!row || !row.is_active) return null;
    if (!this.verifyPassword(password, row.password_hash)) return null;
    return this.mapRowToUser(row);
  }

  /**
   * Returns all application users for a company (On-premise / synchronous)
   */
  public static getUsers(companyId?: string): AppUser[] {
    if (isCloudMode() || isPostgresDriver()) {
      return [];
    }
    const db = getDatabase();
    let query = `
      SELECT 
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.staff_id,
        s.name as staff_name,
        u.is_active,
        u.permissions_json,
        u.created_at,
        u.updated_at,
        u.company_id
      FROM app_users u
      LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
    `;
    const params: any[] = [];
    if (companyId) {
      query += ' WHERE u.company_id = ?';
      params.push(companyId);
    }
    query += ' ORDER BY u.role ASC, u.full_name ASC';
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapRowToUser(r));
  }

  /**
   * Returns a user by ID scoped to company
   */
  public static getUserById(id: string, companyId?: string): AppUser | null {
    const db = getDatabase();
    let query = `
      SELECT 
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.staff_id,
        s.name as staff_name,
        u.is_active,
        u.permissions_json,
        u.created_at,
        u.updated_at,
        u.company_id
      FROM app_users u
      LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
      WHERE u.id = ?
    `;
    const params: any[] = [id];
    if (companyId) {
      query += ' AND u.company_id = ?';
      params.push(companyId);
    }
    const row = db.prepare(query).get(...params) as any;
    return row ? this.mapRowToUser(row) : null;
  }

  /**
   * Registers a new user account for a company
   */
  public static createUser(input: CreateUserInput, companyId: string = DEFAULT_COMPANY_ID): AppUser {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const cleanUsername = input.username.trim().toLowerCase();
    if (!cleanUsername) throw new Error('Username is required.');
    if (!input.fullName.trim()) throw new Error('Full name is required.');
    if (!input.password) throw new Error('Password is required.');

    const existing = db.prepare('SELECT id FROM app_users WHERE username = ? AND company_id = ?').get(cleanUsername, cleanCompanyId);
    if (existing) throw new Error(`Username "${cleanUsername}" is already taken.`);

    const id = generateUUID();
    const passwordHash = this.hashPassword(input.password);
    const defaultPerms = getDefaultPermissionsForRole(input.role);
    const permissionsJson = JSON.stringify(defaultPerms);

    db.prepare(`
      INSERT INTO app_users (id, company_id, username, password_hash, full_name, role, staff_id, is_active, permissions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, cleanCompanyId, cleanUsername, passwordHash, input.fullName.trim(), input.role, input.staffId || null, permissionsJson);

    return this.getUserById(id, cleanCompanyId)!;
  }

  /**
   * Updates an existing user scoped to company
   */
  public static updateUser(id: string, input: UpdateUserInput, companyId?: string): AppUser {
    const db = getDatabase();
    const user = this.getUserById(id, companyId);
    if (!user) throw new Error('User not found.');

    const cleanCompanyId = companyId || user.company_id || DEFAULT_COMPANY_ID;

    if (input.fullName) {
      db.prepare("UPDATE app_users SET full_name = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(input.fullName.trim(), id, cleanCompanyId);
    }
    if (input.role) {
      db.prepare("UPDATE app_users SET role = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(input.role, id, cleanCompanyId);
    }
    if (input.staffId !== undefined) {
      db.prepare("UPDATE app_users SET staff_id = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(input.staffId || null, id, cleanCompanyId);
    }
    if (input.isActive !== undefined) {
      db.prepare("UPDATE app_users SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(input.isActive ? 1 : 0, id, cleanCompanyId);
    }
    if (input.password) {
      const passwordHash = this.hashPassword(input.password);
      db.prepare("UPDATE app_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(passwordHash, id, cleanCompanyId);
    }
    if (input.permissions) {
      const normalized = normalizePermissions(input.permissions, input.role || user.role);
      db.prepare("UPDATE app_users SET permissions_json = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(JSON.stringify(normalized), id, cleanCompanyId);
    }

    return this.getUserById(id, cleanCompanyId)!;
  }

  /**
   * Resets password for an existing user scoped to company
   */
  public static resetUserPassword(id: string, newPassword: string, companyId?: string): AppUser {
    if (!newPassword || newPassword.length < 3) {
      throw new Error('Password must be at least 3 characters.');
    }
    const db = getDatabase();
    const user = this.getUserById(id, companyId);
    if (!user) throw new Error('User not found.');

    const cleanCompanyId = companyId || user.company_id || DEFAULT_COMPANY_ID;
    const passwordHash = this.hashPassword(newPassword);
    db.prepare("UPDATE app_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(passwordHash, id, cleanCompanyId);
    return this.getUserById(id, cleanCompanyId)!;
  }

  /**
   * Gets granular permissions for a user scoped to company
   */
  public static getUserPermissions(userId: string, companyId?: string): UserPermissionsMap {
    const user = this.getUserById(userId, companyId);
    if (!user) throw new Error('User not found.');
    return user.permissions || getDefaultPermissionsForRole(user.role);
  }

  /**
   * Saves granular permissions for a user scoped to company
   */
  public static saveUserPermissions(userId: string, permissions: UserPermissionsMap, companyId?: string): AppUser {
    const user = this.getUserById(userId, companyId);
    if (!user) throw new Error('User not found.');

    const cleanCompanyId = companyId || user.company_id || DEFAULT_COMPANY_ID;
    const normalized = normalizePermissions(permissions, user.role);
    const db = getDatabase();
    db.prepare("UPDATE app_users SET permissions_json = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(
      JSON.stringify(normalized),
      userId,
      cleanCompanyId
    );

    return this.getUserById(userId, cleanCompanyId)!;
  }

  /**
   * Permanently deletes a user account (with root admin protection and company scope)
   */
  public static deleteUser(id: string, companyId?: string): { success: boolean; message: string } {
    const db = getDatabase();
    const user = this.getUserById(id, companyId);
    if (!user) throw new Error('User not found.');
    if (user.username === 'admin') {
      throw new Error('Primary system administrator "admin" cannot be deleted.');
    }

    const cleanCompanyId = companyId || user.company_id || DEFAULT_COMPANY_ID;
    db.prepare('DELETE FROM app_users WHERE id = ? AND company_id = ?').run(id, cleanCompanyId);
    return { success: true, message: `User "${user.username}" deleted successfully.` };
  }

  /**
   * Toggles user active/inactive state scoped to company
   */
  public static toggleUserStatus(id: string, companyId?: string): AppUser {
    const db = getDatabase();
    const user = this.getUserById(id, companyId);
    if (!user) throw new Error('User not found.');
    if (user.username === 'admin') {
      throw new Error('Default system administrator cannot be deactivated.');
    }
    const cleanCompanyId = companyId || user.company_id || DEFAULT_COMPANY_ID;
    const newStatus = user.is_active ? 0 : 1;
    db.prepare("UPDATE app_users SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(newStatus, id, cleanCompanyId);
    return this.getUserById(id, cleanCompanyId)!;
  }

  /**
   * Authenticates user with username and password, optionally scoped to company
   */
  public static authenticate(username: string, password: string, companyId?: string): AppUser | null {
    const db = getDatabase();
    const clean = username.trim().toLowerCase();
    let query = `
      SELECT 
        u.id,
        u.username,
        u.password_hash,
        u.full_name,
        u.role,
        u.staff_id,
        s.name as staff_name,
        u.is_active,
        u.permissions_json,
        u.created_at,
        u.updated_at,
        u.company_id
      FROM app_users u
      LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
      WHERE u.username = ?
    `;
    const params: any[] = [clean];
    if (companyId) {
      query += ' AND u.company_id = ?';
      params.push(companyId);
    }
    const row = db.prepare(query).get(...params) as any;

    if (!row || !row.is_active) return null;
    if (!this.verifyPassword(password, row.password_hash)) return null;

    return this.mapRowToUser(row);
  }


  /**
   * Route access verification matrix supporting granular permissions
   */
  public static hasRouteAccess(
    role: UserRole, 
    pathname: string, 
    permissions?: UserPermissionsMap
  ): boolean {
    const p = pathname.toLowerCase();

    // Dashboard root is accessible to all logged in users
    if (p === '/' || p === '') return true;

    // Check custom permissions first if available
    if (permissions) {
      // Find sub-module matching the pathname
      for (const sm of ALL_SUBMODULES) {
        const matches = sm.routePrefixes.some((pref) => {
          const lowerPref = pref.toLowerCase();
          return p === lowerPref || p.startsWith(lowerPref + '/');
        });

        if (matches) {
          const userPerm = permissions[sm.slug];
          if (userPerm !== undefined) {
            return Boolean(userPerm.access);
          }
        }
      }
    }

    // Default fallback by role
    if (role === 'ADMIN') return true;

    if (role === 'SALESMAN') {
      if (
        p === '/sales' ||
        p.startsWith('/sales/order-booking') ||
        p.startsWith('/sales/direct-sale') ||
        p.startsWith('/sales/collections') ||
        p.startsWith('/customers') ||
        p.startsWith('/returns/sales')
      ) {
        return true;
      }
      return false;
    }

    if (role === 'CASHIER') {
      if (
        p.startsWith('/expenses') ||
        p.startsWith('/closing') ||
        p.startsWith('/sales/collections') ||
        p.startsWith('/accounting') ||
        p.startsWith('/reports/ledgers') ||
        p.startsWith('/customers')
      ) {
        return true;
      }
      return false;
    }

    if (role === 'WAREHOUSE') {
      if (
        p.startsWith('/purchase') ||
        p.startsWith('/dispatch') ||
        p.startsWith('/inventory') ||
        p.startsWith('/returns') ||
        p.startsWith('/reports/stock')
      ) {
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Universal DAL Async User Creation for PostgreSQL & SQLite
   */
  public static async createUserAsync(
    input: any,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createAppUser(input, companyId, client);
  }
}
