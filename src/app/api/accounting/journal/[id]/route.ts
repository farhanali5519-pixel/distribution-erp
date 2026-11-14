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
    const entry = await client.queryOne('SELECT * FROM journal_entries WHERE id = ? AND company_id = ?', [id, tenant.companyId]);

    if (!entry) {
      return NextResponse.json(
        { success: false, message: 'Journal entry not found.' },
        { status: 404 }
      );
    }

    const lines = await client.query(`
      SELECT jl.*, 
        COALESCE(coa.code, '') as account_code, 
        COALESCE(coa.name, '') as account_name,
        COALESCE(c.name, v.name, sm.name, '') as entity_name
      FROM journal_lines jl
      LEFT JOIN chart_of_accounts coa ON jl.account_id = coa.id AND jl.company_id = coa.company_id
      LEFT JOIN customers c ON jl.entity_type = 'CUSTOMER' AND jl.entity_id = c.id AND jl.company_id = c.company_id
      LEFT JOIN vendors v ON jl.entity_type = 'VENDOR' AND jl.entity_id = v.id AND jl.company_id = v.company_id
      LEFT JOIN staff_members sm ON jl.entity_type = 'EMPLOYEE' AND jl.entity_id = sm.id AND jl.company_id = sm.company_id
      WHERE jl.journal_id = ? AND jl.company_id = ?
      ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
    `, [id, tenant.companyId]);

    return NextResponse.json({ success: true, entry, lines });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch journal entry.' },
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
    const result = TransactionDeleteService.deleteJournalEntry(id, context);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete journal entry.' },
      { status: 400 }
    );
  }
}
