import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import {
  Route,
  CreateRouteInput,
  UpdateRouteInput,
  RouteDeletionCheckResult,
} from './types';

import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export class RouteService {
  /**
   * Parse delivery_days JSON string safely
   */
  private static parseDays(daysStr: string | null | undefined): string[] {
    if (!daysStr) return [];
    try {
      const parsed = JSON.parse(daysStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Retrieve routes with flexible filtering
   * If all is false / omitted and isActive is not specified, defaults to is_active = 1
   */
  public static getRoutes(
    filters?: {
      all?: boolean;
      isActive?: boolean;
      search?: string;
      city?: string;
    },
    companyId: string = DEFAULT_COMPANY_ID
  ): Route[] {
    const db = getDatabase();

    let query = `
      SELECT 
        r.*,
        sp.name as assigned_salesperson_name,
        dp.name as assigned_supply_person_name,
        (SELECT COUNT(*) FROM customers c WHERE c.route_id = r.id AND c.company_id = r.company_id) as customers_count,
        (SELECT COUNT(*) FROM sales_orders so WHERE so.route_id = r.id AND so.company_id = r.company_id) as orders_count,
        (SELECT COUNT(*) FROM customer_payments cp WHERE cp.route_id = r.id AND cp.company_id = r.company_id) as collections_count,
        (SELECT COUNT(*) FROM staff_members sm WHERE sm.route_id = r.id AND sm.company_id = r.company_id) as staff_count
      FROM routes r
      LEFT JOIN staff_members sp ON r.assigned_salesperson_id = sp.id AND sp.company_id = r.company_id
      LEFT JOIN staff_members dp ON r.assigned_supply_person_id = dp.id AND dp.company_id = r.company_id
      WHERE r.company_id = ?
    `;

    const params: any[] = [companyId];

    // Filter by active status
    if (filters?.isActive !== undefined) {
      query += ' AND r.is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    } else if (!filters?.all) {
      // Default to active only for standard transaction dropdowns
      query += ' AND r.is_active = 1';
    }

    if (filters?.city) {
      query += ' AND LOWER(r.city) = LOWER(?)';
      params.push(filters.city.trim());
    }

    if (filters?.search) {
      const s = `%${filters.search.trim().toLowerCase()}%`;
      query += ` AND (
        LOWER(r.name) LIKE ? OR
        LOWER(r.code) LIKE ? OR
        LOWER(COALESCE(r.area_territory, '')) LIKE ? OR
        LOWER(COALESCE(r.city, '')) LIKE ? OR
        LOWER(COALESCE(sp.name, '')) LIKE ? OR
        LOWER(COALESCE(dp.name, '')) LIKE ?
      )`;
      params.push(s, s, s, s, s, s);
    }

    query += ' ORDER BY r.name ASC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      code: r.code,
      area_territory: r.area_territory || null,
      city: r.city || null,
      assigned_salesperson_id: r.assigned_salesperson_id || null,
      assigned_salesperson_name: r.assigned_salesperson_name || null,
      assigned_supply_person_id: r.assigned_supply_person_id || null,
      assigned_supply_person_name: r.assigned_supply_person_name || null,
      delivery_days: this.parseDays(r.delivery_days),
      is_active: r.is_active,
      notes: r.notes || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      customers_count: Number(r.customers_count) || 0,
      orders_count: Number(r.orders_count) || 0,
      collections_count: Number(r.collections_count) || 0,
      staff_count: Number(r.staff_count) || 0,
    }));
  }

  /**
   * Helper to retrieve all routes for a company regardless of active status
   */
  public static getAllRoutes(companyId: string = DEFAULT_COMPANY_ID): Route[] {
    return this.getRoutes({ all: true }, companyId);
  }

  /**
   * Retrieve single route by ID
   */
  public static getRouteById(id: string, companyId: string = DEFAULT_COMPANY_ID): Route | null {
    const db = getDatabase();

    const row = db
      .prepare(`
        SELECT 
          r.*,
          sp.name as assigned_salesperson_name,
          dp.name as assigned_supply_person_name,
          (SELECT COUNT(*) FROM customers c WHERE c.route_id = r.id AND c.company_id = r.company_id) as customers_count,
          (SELECT COUNT(*) FROM sales_orders so WHERE so.route_id = r.id AND so.company_id = r.company_id) as orders_count,
          (SELECT COUNT(*) FROM customer_payments cp WHERE cp.route_id = r.id AND cp.company_id = r.company_id) as collections_count,
          (SELECT COUNT(*) FROM staff_members sm WHERE sm.route_id = r.id AND sm.company_id = r.company_id) as staff_count
        FROM routes r
        LEFT JOIN staff_members sp ON r.assigned_salesperson_id = sp.id AND sp.company_id = r.company_id
        LEFT JOIN staff_members dp ON r.assigned_supply_person_id = dp.id AND dp.company_id = r.company_id
        WHERE r.id = ? AND r.company_id = ?
      `)
      .get(id, companyId) as any;

    if (!row) return null;

    return {
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      code: row.code,
      area_territory: row.area_territory || null,
      city: row.city || null,
      assigned_salesperson_id: row.assigned_salesperson_id || null,
      assigned_salesperson_name: row.assigned_salesperson_name || null,
      assigned_supply_person_id: row.assigned_supply_person_id || null,
      assigned_supply_person_name: row.assigned_supply_person_name || null,
      delivery_days: this.parseDays(row.delivery_days),
      is_active: row.is_active,
      notes: row.notes || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      customers_count: Number(row.customers_count) || 0,
      orders_count: Number(row.orders_count) || 0,
      collections_count: Number(row.collections_count) || 0,
      staff_count: Number(row.staff_count) || 0,
    };
  }

  /**
   * Create a new Route
   */
  public static createRoute(input: CreateRouteInput, companyId: string = DEFAULT_COMPANY_ID): Route {
    const db = getDatabase();

    if (!input.name || !input.name.trim()) {
      throw new Error('Route name is required.');
    }
    if (!input.code || !input.code.trim()) {
      throw new Error('Route code is required.');
    }

    const cleanName = input.name.trim();
    const cleanCode = input.code.trim().toUpperCase();

    // Check code uniqueness within company
    const existing = db
      .prepare('SELECT id, name FROM routes WHERE code = ? AND company_id = ?')
      .get(cleanCode, companyId) as any;
    if (existing) {
      throw new Error(`Route code "${cleanCode}" is already in use by "${existing.name}".`);
    }

    const assignedSalespersonId = input.assigned_salesperson_id || null;
    const assignedSupplyPersonId = input.assigned_supply_person_id || null;

    if (assignedSalespersonId) {
      const sp = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(assignedSalespersonId, companyId);
      if (!sp) throw new Error('Assigned salesperson does not exist or does not belong to this company.');
    }

    if (assignedSupplyPersonId) {
      const dp = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(assignedSupplyPersonId, companyId);
      if (!dp) throw new Error('Assigned supply person does not exist or does not belong to this company.');
    }

    const id = generateUUID();
    const areaTerritory = input.area_territory?.trim() || null;
    const city = input.city?.trim() || null;
    const deliveryDaysJson = JSON.stringify(input.delivery_days || []);
    const isActive = input.isActive === false ? 0 : 1;
    const notes = input.notes?.trim() || null;

    db.prepare(`
      INSERT INTO routes (
        id, company_id, name, code, area_territory, city,
        assigned_salesperson_id, assigned_supply_person_id,
        delivery_days, notes, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      companyId,
      cleanName,
      cleanCode,
      areaTerritory,
      city,
      assignedSalespersonId,
      assignedSupplyPersonId,
      deliveryDaysJson,
      notes,
      isActive
    );

    const created = this.getRouteById(id, companyId);
    if (!created) {
      throw new Error('Failed to retrieve newly created route.');
    }
    return created;
  }

  /**
   * Update an existing Route
   */
  public static updateRoute(id: string, input: UpdateRouteInput, companyId: string = DEFAULT_COMPANY_ID): Route {
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM routes WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!existing) {
      throw new Error(`Route with ID "${id}" not found.`);
    }

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const code = input.code !== undefined ? input.code.trim().toUpperCase() : existing.code;

    if (!name) throw new Error('Route name cannot be empty.');
    if (!code) throw new Error('Route code cannot be empty.');

    // If code changed, check uniqueness within company
    if (code !== existing.code) {
      const dup = db
        .prepare('SELECT id, name FROM routes WHERE code = ? AND id != ? AND company_id = ?')
        .get(code, id, companyId) as any;
      if (dup) {
        throw new Error(`Route code "${code}" is already in use by "${dup.name}".`);
      }
    }

    const areaTerritory =
      input.area_territory !== undefined
        ? input.area_territory?.trim() || null
        : existing.area_territory;
    const city =
      input.city !== undefined ? input.city?.trim() || null : existing.city;
    const assignedSalespersonId =
      input.assigned_salesperson_id !== undefined
        ? input.assigned_salesperson_id || null
        : existing.assigned_salesperson_id;
    const assignedSupplyPersonId =
      input.assigned_supply_person_id !== undefined
        ? input.assigned_supply_person_id || null
        : existing.assigned_supply_person_id;

    if (assignedSalespersonId) {
      const sp = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(assignedSalespersonId, companyId);
      if (!sp) throw new Error('Assigned salesperson does not exist or does not belong to this company.');
    }

    if (assignedSupplyPersonId) {
      const dp = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(assignedSupplyPersonId, companyId);
      if (!dp) throw new Error('Assigned supply person does not exist or does not belong to this company.');
    }

    const deliveryDaysJson =
      input.delivery_days !== undefined
        ? JSON.stringify(input.delivery_days)
        : existing.delivery_days;
    const isActive =
      input.isActive !== undefined
        ? input.isActive
          ? 1
          : 0
        : existing.is_active;
    const notes =
      input.notes !== undefined ? input.notes?.trim() || null : existing.notes;

    db.prepare(`
      UPDATE routes SET
        name = ?,
        code = ?,
        area_territory = ?,
        city = ?,
        assigned_salesperson_id = ?,
        assigned_supply_person_id = ?,
        delivery_days = ?,
        notes = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(
      name,
      code,
      areaTerritory,
      city,
      assignedSalespersonId,
      assignedSupplyPersonId,
      deliveryDaysJson,
      notes,
      isActive,
      id,
      companyId
    );

    const updated = this.getRouteById(id, companyId);
    if (!updated) {
      throw new Error('Failed to retrieve updated route.');
    }
    return updated;
  }

  /**
   * Check all dependencies and linked transactions for a route
   * Requirement: Block deletion if customers, orders, staff, collections, or any other transactions are linked.
   */
  public static checkDeletionDependencies(id: string, companyId: string = DEFAULT_COMPANY_ID): RouteDeletionCheckResult {
    const db = getDatabase();

    const route = db.prepare('SELECT * FROM routes WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!route) {
      throw new Error(`Route with ID "${id}" not found.`);
    }

    // 1. Linked Customers
    const customers = db.prepare(`
      SELECT id, name, shop_name, phone, balance
      FROM customers
      WHERE route_id = ? AND company_id = ?
      ORDER BY name ASC
      LIMIT 50
    `).all(id, companyId) as any[];

    // 2. Linked Sales Orders
    const orders = db.prepare(`
      SELECT 
        so.id,
        so.order_number,
        so.order_date,
        so.grand_total as total_amount,
        so.status,
        c.name as customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id AND c.company_id = so.company_id
      WHERE so.route_id = ? AND so.company_id = ?
      ORDER BY so.order_date DESC
      LIMIT 50
    `).all(id, companyId) as any[];

    // 3. Linked Sales Invoices
    const invoices = db.prepare(`
      SELECT 
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.grand_total as total_amount,
        si.status
      FROM sales_invoices si
      WHERE si.route_id = ? AND si.company_id = ?
      ORDER BY si.invoice_date DESC
      LIMIT 50
    `).all(id, companyId) as any[];

    // 4. Linked Customer Payments / Collections
    const collections = db.prepare(`
      SELECT 
        cp.id,
        cp.payment_number,
        cp.payment_date,
        cp.amount,
        c.name as customer_name
      FROM customer_payments cp
      LEFT JOIN customers c ON cp.customer_id = c.id AND c.company_id = cp.company_id
      WHERE cp.route_id = ? AND cp.company_id = ?
      ORDER BY cp.payment_date DESC
      LIMIT 50
    `).all(id, companyId) as any[];

    // 5. Linked Staff Members
    const staff = db.prepare(`
      SELECT DISTINCT
        sm.id,
        sm.name,
        sm.role,
        sm.phone
      FROM staff_members sm
      WHERE sm.company_id = ? AND (
        sm.route_id = ? 
        OR sm.id = ? 
        OR sm.id = ?
      )
      ORDER BY sm.name ASC
      LIMIT 50
    `).all(companyId, id, route.assigned_salesperson_id || '', route.assigned_supply_person_id || '') as any[];

    const totalLinked =
      customers.length +
      orders.length +
      invoices.length +
      collections.length +
      staff.length;

    const canDelete = totalLinked === 0;

    let message: string | undefined = undefined;
    if (!canDelete) {
      const parts: string[] = [];
      if (customers.length > 0) {
        parts.push(
          `${customers.length} Customer(s) (${customers.slice(0, 3).map((c) => c.name).join(', ')}${customers.length > 3 ? '...' : ''})`
        );
      }
      if (orders.length > 0) {
        parts.push(
          `${orders.length} Sale Order(s) (${orders.slice(0, 3).map((o) => o.order_number).join(', ')}${orders.length > 3 ? '...' : ''})`
        );
      }
      if (invoices.length > 0) {
        parts.push(
          `${invoices.length} Sales Invoice(s) (${invoices.slice(0, 3).map((i) => i.invoice_number).join(', ')}${invoices.length > 3 ? '...' : ''})`
        );
      }
      if (collections.length > 0) {
        parts.push(
          `${collections.length} Collection Payment(s) (${collections.slice(0, 3).map((cp) => cp.payment_number).join(', ')}${collections.length > 3 ? '...' : ''})`
        );
      }
      if (staff.length > 0) {
        parts.push(
          `${staff.length} Staff Member(s) (${staff.slice(0, 3).map((s) => s.name).join(', ')}${staff.length > 3 ? '...' : ''})`
        );
      }

      message = `Cannot delete route "${route.name}". It is actively linked to ${parts.join(', ')}. Please reassign or delete these records before deleting this route.`;
    }

    return {
      canDelete,
      message,
      summary: {
        totalLinked,
        customersCount: customers.length,
        ordersCount: orders.length,
        invoicesCount: invoices.length,
        collectionsCount: collections.length,
        staffCount: staff.length,
      },
      linkedItems: {
        customers,
        orders,
        invoices,
        collections,
        staff,
      },
    };
  }

  /**
   * Delete route if no dependencies exist
   */
  public static deleteRoute(id: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const db = getDatabase();

    const check = this.checkDeletionDependencies(id, companyId);
    if (!check.canDelete) {
      throw new Error(check.message || 'Cannot delete route because active transactions or records are linked to it.');
    }

    db.prepare('DELETE FROM routes WHERE id = ? AND company_id = ?').run(id, companyId);

    return {
      success: true,
      message: 'Route deleted successfully.',
    };
  }

  /**
   * Get staff members available for route assignment
   */
  public static getStaffOptions(companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();
    const allStaff = db
      .prepare(`
        SELECT id, name, role, phone, is_active
        FROM staff_members
        WHERE is_active = 1 AND company_id = ?
        ORDER BY name ASC
      `)
      .all(companyId) as any[];

    const salespersons = allStaff.filter(
      (s) => s.role === 'SALESMAN' || s.role === 'BOTH' || s.role === 'MANAGER'
    );
    const supplyPersons = allStaff.filter(
      (s) => s.role === 'SUPPLY_PERSON' || s.role === 'BOTH' || s.role === 'DRIVER'
    );

    return {
      allStaff,
      salespersons,
      supplyPersons,
    };
  }

  /**
   * Universal DAL Async Route Fetch for PostgreSQL & SQLite
   */
  public static async getAllRoutesAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getRoutes(companyId, client);
  }

  /**
   * Universal DAL Async Route Creation for PostgreSQL & SQLite
   */
  public static async createRouteAsync(
    input: CreateRouteInput,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createRoute(input, companyId, client);
  }

  /**
   * Universal DAL Async Staff Fetch for PostgreSQL & SQLite
   */
  public static async getAllStaffAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getStaff(companyId, client);
  }

  /**
   * Universal DAL Async Staff Creation for PostgreSQL & SQLite
   */
  public static async createStaffAsync(
    input: { name: string; role: string; phone?: string; email?: string; assignedRouteId?: string },
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createStaff(input, companyId, client);
  }
}
