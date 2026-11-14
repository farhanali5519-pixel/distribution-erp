import { NextRequest, NextResponse } from 'next/server';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { getDatabaseClient } from '@/core/database/factory';
import { SalesService } from '@/modules/sales/service';
import { CustomerService } from '@/modules/customers/service';
import { InventoryService } from '@/modules/inventory/service';
import { getCurrentCompanyId, getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);

    // 1. Module guard: block API access if module is disabled
    if (!ModuleRegistry.isModuleEnabled('field_order_booking', companyId)) {
      return NextResponse.json(
        {
          success: false,
          moduleDisabled: true,
          message: 'The Field Order Booking module is currently disabled.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const staffId = searchParams.get('staffId');

    const client = getDatabaseClient();

    // 2. Fetch booker context if userId or staffId provided
    let bookerContext: any = null;
    if (userId || staffId) {
      if (userId) {
        bookerContext = await client.queryOne(`
          SELECT 
            u.id as user_id,
            u.username,
            u.full_name as user_full_name,
            u.role as user_role,
            s.id as staff_id,
            s.name as staff_name,
            s.employee_code,
            s.route_id as assigned_route_id,
            r.name as assigned_route_name
          FROM app_users u
          LEFT JOIN staff_members s ON u.staff_id = s.id AND s.company_id = u.company_id
          LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = u.company_id
          WHERE u.id = ? AND u.company_id = ?
        `, [userId, companyId]);
      } else if (staffId) {
        bookerContext = await client.queryOne(`
          SELECT 
            u.id as user_id,
            u.username,
            u.full_name as user_full_name,
            u.role as user_role,
            s.id as staff_id,
            s.name as staff_name,
            s.employee_code,
            s.route_id as assigned_route_id,
            r.name as assigned_route_name
          FROM staff_members s
          LEFT JOIN app_users u ON u.staff_id = s.id AND u.company_id = s.company_id
          LEFT JOIN routes r ON s.route_id = r.id AND r.company_id = s.company_id
          WHERE s.id = ? AND s.company_id = ?
        `, [staffId, companyId]);
      }
    }

    // 3. Fetch routes
    const routes = await client.query(`
      SELECT 
        id, 
        name, 
        code, 
        assigned_salesperson_id, 
        assigned_supply_person_id 
      FROM routes 
      WHERE is_active = 1 AND company_id = ?
      ORDER BY name ASC
    `, [companyId]);

    // 4. Fetch customers (with live ledger balance & credit limits)
    const allCustomers = await CustomerService.getCustomersWithBalancesAsync(companyId);
    const customers = allCustomers.filter((c: any) => c.is_active === 1);

    // 5. Fetch products (Exclude all cost prices and margins for booker security!)
    const rawProducts = await InventoryService.getProductsAsync({ maskCost: true, companyId });
    const products = rawProducts
      .filter((p: any) => p.is_active === 1)
      .map(({ cost_price, cost_price_paisas, margin_percentage, base_rate_per_piece, base_rate_per_piece_paisas, ...p }: any) => p);

    // 6. Fetch staff options (for assigning salesman and delivery / supply officers)
    const staff = await client.query(`
      SELECT id, employee_code, name, role, route_id
      FROM staff_members
      WHERE is_active = 1 AND company_id = ?
      ORDER BY name ASC
    `, [companyId]);

    return NextResponse.json({
      success: true,
      bookerContext,
      routes,
      customers,
      products,
      staff,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch field booking data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const tenantCtx = await getTenantContext(req);

    // 1. Module guard: block API access if module is disabled
    if (!ModuleRegistry.isModuleEnabled('field_order_booking', companyId)) {
      return NextResponse.json(
        {
          success: false,
          moduleDisabled: true,
          message: 'The Field Order Booking module is currently disabled.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Ensure source channel is FIELD_BOOKER and company identity is bound
    const orderInput = {
      ...body,
      companyId,
      createdByUserId: tenantCtx.userId,
      sourceChannel: 'FIELD_BOOKER' as const,
      clientCreatedAt: body.clientCreatedAt || new Date().toISOString(),
    };

    const order = SalesService.createOrder(orderInput, companyId);

    return NextResponse.json({
      success: true,
      message: `Field Order ${order.order_number} recorded successfully!`,
      order,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record field order' },
      { status: 400 }
    );
  }
}

