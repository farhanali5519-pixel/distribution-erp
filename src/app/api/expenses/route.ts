import { NextResponse } from 'next/server';
import { ExpenseService } from '@/modules/expenses/service';
import { getTenantContext } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'expenses');
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const metaOnly = searchParams.get('metaOnly') === 'true';

    const expenseAccounts = ExpenseService.getExpenseAccounts(tenant.companyId);
    const paymentAccounts = ExpenseService.getPaymentAccounts(tenant.companyId);
    const staffMembers = ExpenseService.getStaffMembers(tenant.companyId);

    if (metaOnly) {
      return NextResponse.json({
        success: true,
        expenseAccounts,
        paymentAccounts,
        staffMembers,
      });
    }

    const expenses = ExpenseService.getExpenses({
      companyId: tenant.companyId,
      date,
      startDate,
      endDate,
      status,
      search,
    });

    return NextResponse.json({
      success: true,
      expenses,
      expenseAccounts,
      paymentAccounts,
      staffMembers,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to fetch expenses.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    requireModuleEnabled(tenant.companyId, 'expenses');
    const body = await request.json();
    const {
      expenseDate,
      expenseAccountId,
      paidFromAccountId,
      amount,
      description,
      staffId,
      vehicleNumber,
    } = body;

    const expense = ExpenseService.createExpense({
      companyId: tenant.companyId,
      expenseDate,
      expenseAccountId,
      paidFromAccountId,
      amount: Number(amount),
      description,
      staffId: staffId || null,
      vehicleNumber: vehicleNumber || null,
      createdBy: tenant.fullName || tenant.username || 'Expenses Module',
    });

    return NextResponse.json({
      success: true,
      expense,
      message: `Expense voucher ${expense.voucher_number} posted successfully.`,
    });
  } catch (err: any) {
    const status = err.status || (err.name?.includes('Disabled') ? 403 : 400);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to record expense.' },
      { status }
    );
  }
}

