import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/modules/customers/service';
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
    const customer = await client.queryOne('SELECT * FROM customers WHERE id = ? AND company_id = ?', [id, companyId]);

    if (!customer) {
      return NextResponse.json(
        { success: false, message: 'Customer not found.' },
        { status: 404 }
      );
    }

    const dependencies = CustomerService.checkDependencies(id, companyId);

    return NextResponse.json({
      success: true,
      customer,
      dependencies,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch customer.' },
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
    const result = CustomerService.deleteCustomer(id, companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete customer.' },
      { status: 400 }
    );
  }
}
