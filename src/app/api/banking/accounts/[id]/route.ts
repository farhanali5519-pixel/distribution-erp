import { NextResponse } from 'next/server';
import { BankingService } from '@/modules/banking/service';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;

    const bankAccount = BankingService.getBankAccountById(id, companyId);
    if (!bankAccount) {
      return NextResponse.json(
        { success: false, message: 'Bank account not found.' },
        { status: 404 }
      );
    }

    const dependencies = BankingService.checkDeletionDependencies(id, companyId);

    return NextResponse.json({
      success: true,
      bankAccount,
      dependencies,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch bank account.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;
    const body = await req.json();

    const updated = BankingService.updateBankAccount(id, {
      bankName: body.bankName,
      accountTitle: body.accountTitle,
      accountNumber: body.accountNumber,
      iban: body.iban,
      branchName: body.branchName,
      branchCode: body.branchCode,
      accountType: body.accountType,
      currency: body.currency,
      accountId: body.accountId,
      isActive: body.isActive,
      notes: body.notes,
    }, companyId);

    return NextResponse.json({
      success: true,
      bankAccount: updated,
      message: `Bank account "${updated.bank_name} - ${updated.account_number}" updated successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update bank account.' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;

    // Requirement 4: Bank deletion must be blocked if any transaction is linked to that bank account.
    // Show exactly what is linked and ask the user to delete/reverse those transactions first.
    const check = BankingService.checkDeletionDependencies(id, companyId);
    if (!check.canDelete) {
      return NextResponse.json(
        {
          success: false,
          canDelete: false,
          message: check.message,
          dependencies: check,
        },
        { status: 400 }
      );
    }

    const result = BankingService.deleteBankAccount(id, companyId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete bank account.' },
      { status: 400 }
    );
  }
}
