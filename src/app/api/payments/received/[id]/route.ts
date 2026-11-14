import { NextResponse } from 'next/server';
import { PaymentsReceivedService } from '@/modules/payments/service';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const payment = PaymentsReceivedService.getPaymentById(id, tenant.companyId);

    if (!payment) {
      return NextResponse.json(
        { success: false, message: 'Payment record not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, payment });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payment details.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const body = await req.json();
    const { action, reason } = body;

    if (action === 'void') {
      const result = PaymentsReceivedService.voidPayment(id, reason || 'Voided by user request', tenant.companyId);
      return NextResponse.json(result);
    }

    if (action === 'delete') {
      const { TransactionDeleteService } = await import('@/core/transactions/transaction-delete.service');
      const context = await TransactionDeleteService.extractContext(req);
      const result = TransactionDeleteService.deleteCustomerPayment(id, { ...context, reason: reason || context.reason });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, message: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Action failed.' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { TransactionDeleteService } = await import('@/core/transactions/transaction-delete.service');
    const context = await TransactionDeleteService.extractContext(req);
    const result = TransactionDeleteService.deleteCustomerPayment(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete payment receipt.' },
      { status: 400 }
    );
  }
}

