import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const client = getDatabaseClient();
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const exactRole = searchParams.get('exactRole') === 'true' || searchParams.get('exactRole') === '1';
    const all = searchParams.get('all') === 'true' || searchParams.get('all') === '1';
    const active = searchParams.get('active');
    const search = searchParams.get('search')?.trim();

    let query = `
      SELECT 
        s.*,
        r.name as route_name,
        r.code as route_code,
        (
          (SELECT COUNT(*) FROM sales_orders WHERE (salesman_id = s.id OR supply_person_id = s.id) AND company_id = s.company_id) +
          (SELECT COUNT(*) FROM sales_invoices WHERE (salesman_id = s.id OR supply_person_id = s.id) AND company_id = s.company_id) +
          (SELECT COUNT(*) FROM sales_returns WHERE (salesman_id = s.id OR supply_person_id = s.id) AND company_id = s.company_id) +
          (SELECT COUNT(*) FROM customer_payments WHERE salesman_id = s.id AND company_id = s.company_id)
        ) as linked_transactions_count
      FROM staff_members s
      LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = s.company_id
      WHERE s.company_id = ?
    `;
    const params: any[] = [companyId];

    // Active status filter (defaults to active only unless all=true is specified)
    if (!all) {
      if (active === '0') {
        query += ' AND s.is_active = 0';
      } else {
        query += ' AND s.is_active = 1';
      }
    } else if (active !== null) {
      if (active === '1') {
        query += ' AND s.is_active = 1';
      } else if (active === '0') {
        query += ' AND s.is_active = 0';
      }
    }

    // Role filter with dual-role ('BOTH') support
    if (role) {
      const upperRole = role.toUpperCase();
      if (exactRole) {
        query += ' AND s.role = ?';
        params.push(upperRole);
      } else if (upperRole === 'SALESMAN') {
        query += " AND s.role IN ('SALESMAN', 'BOTH')";
      } else if (upperRole === 'SUPPLY_PERSON') {
        query += " AND s.role IN ('SUPPLY_PERSON', 'BOTH', 'DRIVER')";
      } else if (upperRole === 'BOTH') {
        query += " AND s.role = 'BOTH'";
      } else {
        query += ' AND s.role = ?';
        params.push(upperRole);
      }
    }

    // Search filter
    if (search) {
      query += ' AND (s.name LIKE ? OR s.employee_code LIKE ? OR s.phone LIKE ?)';
      const sTerm = `%${search}%`;
      params.push(sTerm, sTerm, sTerm);
    }

    query += ' ORDER BY s.is_active DESC, s.name ASC';
    const staff = await client.query(query, params);

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch staff members' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const client = getDatabaseClient();
    const body = await req.json();
    const { name, role, phone, employeeCode, routeId, notes, isActive } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Staff member name is required.' },
        { status: 400 }
      );
    }

    const validRoles = ['SALESMAN', 'SUPPLY_PERSON', 'BOTH', 'DRIVER', 'MANAGER'];
    const sanitizedRole = (role || 'SALESMAN').toUpperCase();
    if (!validRoles.includes(sanitizedRole)) {
      return NextResponse.json(
        { success: false, message: `Invalid role specified. Supported: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    if (routeId) {
      const route = await client.queryOne('SELECT id FROM routes WHERE id = ? AND company_id = ?', [routeId, companyId]);
      if (!route) {
        return NextResponse.json(
          { success: false, message: 'Assigned route does not exist or does not belong to this company.' },
          { status: 400 }
        );
      }
    }

    // Determine or generate unique employee code within company
    let finalCode = (employeeCode || '').trim();
    if (!finalCode) {
      // Find highest EMP-XXX number within company
      const existingCodes = await client.query<{ employee_code: string }>("SELECT employee_code FROM staff_members WHERE employee_code LIKE 'EMP-%' AND company_id = ?", [companyId]);
      let maxNum = 0;
      for (const row of existingCodes) {
        const match = row.employee_code.match(/^EMP-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      finalCode = `EMP-${String(maxNum + 1).padStart(3, '0')}`;
    } else {
      // Check code uniqueness within company
      const existing = await client.queryOne('SELECT id FROM staff_members WHERE employee_code = ? AND company_id = ?', [finalCode, companyId]);
      if (existing) {
        return NextResponse.json(
          { success: false, message: `Employee code "${finalCode}" is already assigned to another staff member.` },
          { status: 400 }
        );
      }
    }

    const id = generateUUID();
    await client.execute(`
      INSERT INTO staff_members (
        id, company_id, employee_code, name, role, phone, route_id, notes, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id,
      companyId,
      finalCode,
      name.trim(),
      sanitizedRole,
      phone?.trim() || null,
      routeId || null,
      notes?.trim() || null,
      isActive === false || isActive === 0 ? 0 : 1
    ]);

    const created = await client.queryOne(`
      SELECT s.*, r.name as route_name, r.code as route_code
      FROM staff_members s
      LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = s.company_id
      WHERE s.id = ? AND s.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({
      success: true,
      message: 'Staff member registered successfully.',
      staff: created,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to register staff member' },
      { status: 500 }
    );
  }
}

