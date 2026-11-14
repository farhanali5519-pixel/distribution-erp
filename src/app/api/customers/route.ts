import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/modules/customers/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled, isModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    // Allow customer lookup if customers, sales, or payments module is enabled
    if (
      !isModuleEnabled(companyId, 'customers') &&
      !isModuleEnabled(companyId, 'sales') &&
      !isModuleEnabled(companyId, 'payments')
    ) {
      requireModuleEnabled(companyId, 'customers');
    }
    const customers = await CustomerService.getCustomersWithBalancesAsync(companyId);
    return NextResponse.json({ success: true, customers });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'customers');
    const body = await req.json();
    const { name, shopName, contactPerson, phone, email, address, city, cnicOrNtn, routeId, creditLimit, creditDays } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ success: false, message: 'Customer name is required.' }, { status: 400 });
    }

    const customer = CustomerService.createCustomer({
      name: name.trim(),
      shopName,
      contactPerson,
      phone,
      email,
      address,
      city,
      cnicOrNtn,
      routeId,
      creditLimit: Number(creditLimit) || 0,
      creditDays: Number(creditDays) || 0,
    }, companyId);

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}
