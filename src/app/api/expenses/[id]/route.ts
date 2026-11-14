import { NextRequest, NextResponse } from 'next/server';
import { TransactionDeleteService } from '@/core/transactions/transaction-delete.service';
import { getDatabaseClient } from '@/core/database/factory';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await getTenantContext(req);
    const { id } = await params;
    const client = getDatabaseClient();
    const expense = await client.queryOne(`
      SELECT e.*, 
        ea.name as expense_account_name, ea.code as expense_account_code,
        pa.name as paid_from_account_name, pa.code as paid_from_account_code,
        sm.name as staff_name,
        je.entry_number as journal_entry_number
      FROM expenses e
      LEFT JOIN chart_of_accounts ea ON e.expense_account_id = ea.id AND e.company_id = ea.company_id
      LEFT JOIN chart_of_accounts pa ON e.paid_from_account_id = pa.id AND e.company_id = pa.company_id
      LEFT JOIN staff_members sm ON e.staff_id = sm.id AND e.company_id = sm.company_id
      LEFT JOIN journal_entries je ON e.journal_entry_id = je.id AND e.company_id = je.company_id
      WHERE e.id = ? AND e.company_id = ?
    `, [id, tenant.companyId]);

    if (!expense) {
      return NextResponse.json(
        { success: false, message: 'Expense record not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch expense record.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await TransactionDeleteService.extractContext(req);
    const result = TransactionDeleteService.deleteExpense(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    const isClosedDayForbidden =
      error.message?.includes('closed day') && error.message?.includes('Administrator');
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete expense voucher.' },
      { status: isClosedDayForbidden ? 403 : 400 }
    );
  }
}
