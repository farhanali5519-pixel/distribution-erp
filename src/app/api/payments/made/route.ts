import { NextResponse } from 'next/server';
import { PaymentsMadeService } from '@/modules/payments/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'payments');
    if (errorResponse) return errorResponse;
    const companyId = tenant.companyId;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || searchParams.get('dateFrom') || undefined;
    const to = searchParams.get('to') || searchParams.get('dateTo') || undefined;
    const vendorId = searchParams.get('vendorId') || undefined;
    const accountId = searchParams.get('accountId') || undefined;
    const paymentMethod = searchParams.get('paymentMethod') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const payments = PaymentsMadeService.getPayments({
      from,
      to,
      vendorId,
      accountId,
      paymentMethod,
      status,
      search,
    }, companyId);

    return NextResponse.json({ success: true, payments });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch payments made.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'payments');
    if (errorResponse) return errorResponse;
    const body = await req.json();
    const {
      vendorId,
      paymentDate,
      amount,
      accountId,
      paymentMethod,
      referenceNo,
      notes,
      allocations,
      createdBy,
    } = body;

    if (!vendorId || !paymentDate || amount === undefined || !accountId) {
      return NextResponse.json(
        { success: false, message: 'Vendor, date, amount, and payment account are required.' },
        { status: 400 }
      );
    }

    const payment = PaymentsMadeService.recordPayment({
      companyId: tenant.companyId,
      vendorId,
      paymentDate,
      amount: Number(amount),
      accountId,
      paymentMethod: paymentMethod || 'CASH',
      referenceNo: referenceNo || null,
      notes: notes || null,
      allocations: Array.isArray(allocations) ? allocations : [],
      createdBy: tenant.fullName || tenant.username || 'Admin',
    });

    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Payment recording failed.' }, { status: 400 });
  }
}
