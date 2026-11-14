import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const client = getDatabaseClient();

    const staff = await client.queryOne(`
      SELECT 
        s.*,
        r.name as route_name,
        r.code as route_code
      FROM staff_members s
      LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = s.company_id
      WHERE s.id = ? AND s.company_id = ?
    `, [id, companyId]);

    if (!staff) {
      return NextResponse.json(
        { success: false, message: 'Staff member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch staff member' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const client = getDatabaseClient();
    const body = await req.json();
    const { name, role, phone, employeeCode, routeId, notes, isActive } = body;

    const existing = await client.queryOne('SELECT * FROM staff_members WHERE id = ? AND company_id = ?', [id, companyId]) as any;
    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Staff member not found.' },
        { status: 404 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Staff member name is required.' },
        { status: 400 }
      );
    }

    const validRoles = ['SALESMAN', 'SUPPLY_PERSON', 'BOTH', 'DRIVER', 'MANAGER'];
    const sanitizedRole = (role || existing.role).toUpperCase();
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

    // Verify employee code uniqueness if changed within company
    const finalCode = (employeeCode || existing.employee_code || '').trim();
    if (finalCode && finalCode !== existing.employee_code) {
      const duplicate = await client.queryOne('SELECT id FROM staff_members WHERE employee_code = ? AND id != ? AND company_id = ?', [finalCode, id, companyId]);
      if (duplicate) {
        return NextResponse.json(
          { success: false, message: `Employee code "${finalCode}" is already assigned to another staff member.` },
          { status: 400 }
        );
      }
    }

    const newActiveState = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;

    await client.execute(`
      UPDATE staff_members
      SET 
        name = ?,
        employee_code = ?,
        role = ?,
        phone = ?,
        route_id = ?,
        notes = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `, [
      name.trim(),
      finalCode || existing.employee_code,
      sanitizedRole,
      phone !== undefined ? (phone?.trim() || null) : existing.phone,
      routeId !== undefined ? (routeId || null) : existing.route_id,
      notes !== undefined ? (notes?.trim() || null) : existing.notes,
      newActiveState,
      id,
      companyId
    ]);

    const updated = await client.queryOne(`
      SELECT 
        s.*,
        r.name as route_name,
        r.code as route_code
      FROM staff_members s
      LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = s.company_id
      WHERE s.id = ? AND s.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({
      success: true,
      message: 'Staff member details updated successfully.',
      staff: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update staff member' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { id } = await params;
    const client = getDatabaseClient();

    const existing = await client.queryOne('SELECT * FROM staff_members WHERE id = ? AND company_id = ?', [id, companyId]) as any;
    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Staff member not found.' },
        { status: 404 }
      );
    }

    // Check transaction linkage before deletion within this company
    const ordersCount = ((await client.queryOne('SELECT COUNT(*) as c FROM sales_orders WHERE (salesman_id = ? OR supply_person_id = ?) AND company_id = ?', [id, id, companyId])) as any)?.c || 0;
    const invoicesCount = ((await client.queryOne('SELECT COUNT(*) as c FROM sales_invoices WHERE (salesman_id = ? OR supply_person_id = ?) AND company_id = ?', [id, id, companyId])) as any)?.c || 0;
    const returnsCount = ((await client.queryOne('SELECT COUNT(*) as c FROM sales_returns WHERE (salesman_id = ? OR supply_person_id = ?) AND company_id = ?', [id, id, companyId])) as any)?.c || 0;
    const paymentsCount = ((await client.queryOne('SELECT COUNT(*) as c FROM customer_payments WHERE salesman_id = ? AND company_id = ?', [id, companyId])) as any)?.c || 0;

    const totalUsage = Number(ordersCount) + Number(invoicesCount) + Number(returnsCount) + Number(paymentsCount);

    if (totalUsage > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete staff member "${existing.name}". They are permanently linked to ${ordersCount} order(s), ${invoicesCount} invoice(s), ${returnsCount} return(s), and ${paymentsCount} payment recovery(ies). Please toggle their status to "Inactive" instead to preserve audit trails.`,
          canDeactivate: true,
        },
        { status: 400 }
      );
    }

    await client.execute('DELETE FROM staff_members WHERE id = ? AND company_id = ?', [id, companyId]);

    return NextResponse.json({
      success: true,
      message: `Staff member "${existing.name}" deleted successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete staff member' },
      { status: 500 }
    );
  }
}
