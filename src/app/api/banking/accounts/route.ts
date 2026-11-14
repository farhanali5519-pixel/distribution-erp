import { NextResponse } from 'next/server';
import { BankingService } from '@/modules/banking/service';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentDropdown = searchParams.get('paymentDropdown') === 'true';

    const { context: tenant, errorResponse } = await checkApiModuleAccess(
      req,
      paymentDropdown ? ['banking', 'payments', 'sales'] : 'banking'
    );
    if (errorResponse) return errorResponse;
    const companyId = tenant.companyId;

    const search = searchParams.get('search') || undefined;
    const accountType = searchParams.get('accountType') || undefined;
    const isActiveParam = searchParams.get('isActive');

    if (paymentDropdown) {
      const paymentAccounts = BankingService.getAvailablePaymentAccounts(companyId);
      return NextResponse.json({
        success: true,
        ...paymentAccounts,
      });
    }

    const isActive = isActiveParam !== null && isActiveParam !== undefined ? isActiveParam === 'true' || isActiveParam === '1' : undefined;

    const accounts = BankingService.getBankAccounts({
      search,
      accountType,
      isActive,
    }, companyId);

    return NextResponse.json({
      success: true,
      accounts,
      count: accounts.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch bank accounts.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'banking');
    if (errorResponse) return errorResponse;
    const body = await req.json();
    const {
      bankName,
      accountTitle,
      accountNumber,
      iban,
      branchName,
      branchCode,
      accountType,
      currency,
      openingBalance,
      accountId,
      isActive,
      notes,
    } = body;

    if (!bankName || !accountTitle || !accountNumber) {
      return NextResponse.json(
        { success: false, message: 'Bank name, account title, and account number are required.' },
        { status: 400 }
      );
    }

    const bankAccount = BankingService.createBankAccount({
      companyId: tenant.companyId,
      bankName,
      accountTitle,
      accountNumber,
      iban,
      branchName,
      branchCode,
      accountType: accountType || 'CURRENT',
      currency: currency || 'PKR',
      openingBalance: openingBalance !== undefined && openingBalance !== '' ? Number(openingBalance) : 0,
      accountId: accountId || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      notes: notes || null,
    });

    return NextResponse.json(
      {
        success: true,
        bankAccount,
        message: `Bank account "${bankAccount.bank_name} - ${bankAccount.account_number}" created successfully.`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create bank account.' },
      { status: 400 }
    );
  }
}
