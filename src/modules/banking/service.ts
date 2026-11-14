import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { BusinessReferenceResolver } from '@/core/accounting/business-reference-resolver';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/tenant-context';
import {
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  BankStatementFilter,
  BankStatementReport,
  BankStatementLine,
  BankDeletionCheckResult,
  PaymentAccountOption,
} from './types';

export class BankingService {
  /**
   * Get all bank accounts with live calculated GL balances
   */
  public static getBankAccounts(
    filters?: {
      search?: string;
      isActive?: boolean | number;
      accountType?: string;
    },
    companyId: string = DEFAULT_COMPANY_ID
  ): BankAccount[] {
    const db = getDatabase();

    let sql = `
      SELECT 
        b.*,
        coa.code as gl_account_code,
        coa.name as gl_account_name,
        COALESCE(SUM(CASE WHEN je.status = 'POSTED' THEN jl.debit_paisas ELSE 0 END), 0) as sum_debit_paisas,
        COALESCE(SUM(CASE WHEN je.status = 'POSTED' THEN jl.credit_paisas ELSE 0 END), 0) as sum_credit_paisas
      FROM bank_accounts b
      LEFT JOIN chart_of_accounts coa ON b.account_id = coa.id AND coa.company_id = b.company_id
      LEFT JOIN journal_lines jl ON b.account_id = jl.account_id AND jl.company_id = b.company_id
      LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = b.company_id
      WHERE b.company_id = ?
    `;

    const params: any[] = [companyId];

    if (filters?.isActive !== undefined) {
      const activeVal = filters.isActive === true || filters.isActive === 1 ? 1 : 0;
      sql += ' AND b.is_active = ?';
      params.push(activeVal);
    }

    if (filters?.accountType && filters.accountType !== 'ALL') {
      sql += ' AND b.account_type = ?';
      params.push(filters.accountType);
    }

    if (filters?.search && filters.search.trim() !== '') {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(b.bank_name) LIKE ? OR
        LOWER(b.account_title) LIKE ? OR
        LOWER(b.account_number) LIKE ? OR
        LOWER(COALESCE(b.iban, '')) LIKE ? OR
        LOWER(COALESCE(b.branch_name, '')) LIKE ?
      )`;
      params.push(term, term, term, term, term);
    }

    sql += ' GROUP BY b.id ORDER BY b.is_active DESC, b.bank_name ASC';

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map((r) => {
      const debitPaisas = Number(r.sum_debit_paisas) || 0;
      const creditPaisas = Number(r.sum_credit_paisas) || 0;
      const balancePaisas = debitPaisas - creditPaisas;

      return {
        id: r.id,
        bank_name: r.bank_name,
        account_title: r.account_title,
        account_number: r.account_number,
        iban: r.iban || null,
        branch_name: r.branch_name || null,
        branch_code: r.branch_code || null,
        account_type: r.account_type,
        currency: r.currency || 'PKR',
        opening_balance_paisas: Number(r.opening_balance_paisas) || 0,
        opening_balance: Number(r.opening_balance) || 0,
        account_id: r.account_id,
        is_active: Number(r.is_active),
        notes: r.notes || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        company_id: r.company_id,
        gl_account_code: r.gl_account_code || '—',
        gl_account_name: r.gl_account_name || '—',
        current_balance: fromPaisas(balancePaisas),
        current_balance_paisas: balancePaisas,
      };
    });
  }

  /**
   * Get single bank account by ID
   */
  public static getBankAccountById(id: string, companyId: string = DEFAULT_COMPANY_ID): BankAccount | null {
    const accounts = this.getBankAccounts(undefined, companyId);
    return accounts.find((a) => a.id === id) || null;
  }

  /**
   * Helper to find or generate a GL account for a bank
   */
  public static ensureBankGLAccount(
    bankName: string,
    accountNumber: string,
    accountTitle: string,
    specifiedAccountId?: string | null,
    companyId: string = DEFAULT_COMPANY_ID
  ): { id: string; code: string; name: string } {
    const db = getDatabase();

    if (specifiedAccountId) {
      const existing = db
        .prepare('SELECT id, code, name, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?')
        .get(specifiedAccountId, companyId) as any;
      if (!existing) {
        throw new Error('Selected GL account does not exist in Chart of Accounts.');
      }
      if (existing.type !== 'ASSET') {
        throw new Error(`Linked GL account must be of classification ASSET. Found: ${existing.type}`);
      }
      return { id: existing.id, code: existing.code, name: existing.name };
    }

    // Auto-create a new Bank GL Account under 102x series
    // Find highest 102x code
    const rows = db
      .prepare("SELECT code FROM chart_of_accounts WHERE code LIKE '102%' AND company_id = ? ORDER BY code DESC")
      .all(companyId) as { code: string }[];

    let nextCode = '1021';
    if (rows.length > 0) {
      const codes = rows
        .map((r) => parseInt(r.code, 10))
        .filter((n) => !isNaN(n));
      const maxCode = Math.max(...codes);
      nextCode = String(maxCode + 1);
    }

    const newId = generateUUID();
    const accountName = `${bankName} (${accountNumber.slice(-4)})`;
    const description = `Bank Account: ${bankName} - ${accountTitle} (A/C: ${accountNumber})`;

    db.prepare(`
      INSERT INTO chart_of_accounts (
        id, company_id, code, name, type, normal_balance, is_active, is_system, currency, description
      ) VALUES (?, ?, ?, ?, 'ASSET', 'DEBIT', 1, 0, 'PKR', ?)
    `).run(newId, companyId, nextCode, accountName, description);

    return { id: newId, code: nextCode, name: accountName };
  }

  /**
   * Create a new Bank Account Master record
   */
  public static createBankAccount(input: CreateBankAccountInput, companyId?: string): BankAccount {
    const db = getDatabase();
    const targetCompanyId = input.companyId || companyId || DEFAULT_COMPANY_ID;

    if (!input.bankName || !input.bankName.trim()) {
      throw new Error('Bank name is required.');
    }
    if (!input.accountTitle || !input.accountTitle.trim()) {
      throw new Error('Account title is required.');
    }
    if (!input.accountNumber || !input.accountNumber.trim()) {
      throw new Error('Account number is required.');
    }

    const cleanBankName = input.bankName.trim();
    const cleanAccountTitle = input.accountTitle.trim();
    const cleanAccountNumber = input.accountNumber.trim();

    // Check duplicate account number within company
    const dupCheck = db
      .prepare('SELECT id, bank_name FROM bank_accounts WHERE account_number = ? AND company_id = ?')
      .get(cleanAccountNumber, targetCompanyId) as any;
    if (dupCheck) {
      throw new Error(`A bank account with number "${cleanAccountNumber}" already exists (${dupCheck.bank_name}).`);
    }

    // Resolve GL Account linkage
    const glAccount = this.ensureBankGLAccount(
      cleanBankName,
      cleanAccountNumber,
      cleanAccountTitle,
      input.accountId,
      targetCompanyId
    );

    const bankId = generateUUID();
    const openingBalance = Number(input.openingBalance) || 0;
    const openingBalancePaisas = toPaisas(openingBalance);
    const currency = (input.currency || 'PKR').toUpperCase().trim();
    const isActive = input.isActive === false ? 0 : 1;

    // Post opening balance journal entry if specified > 0
    if (openingBalancePaisas > 0) {
      // Find 3010 Owner's Capital / Opening Equity
      let equityAccount = db
        .prepare("SELECT id FROM chart_of_accounts WHERE code = '3010' AND company_id = ?")
        .get(targetCompanyId) as { id: string } | undefined;

      if (!equityAccount) {
        equityAccount = db
          .prepare("SELECT id FROM chart_of_accounts WHERE type = 'EQUITY' AND company_id = ? LIMIT 1")
          .get(targetCompanyId) as { id: string } | undefined;
      }

      if (equityAccount) {
        const today = new Date().toISOString().split('T')[0];
        DoubleEntryEngine.postEntry({
          companyId: targetCompanyId,
          entryDate: today,
          description: `Opening Balance - ${cleanBankName} (${cleanAccountNumber})`,
          sourceModule: 'banking',
          sourceDocumentId: bankId,
          lines: [
            {
              accountId: glAccount.id,
              debit: openingBalance,
              credit: 0,
              memo: `Opening balance for ${cleanBankName} A/C ${cleanAccountNumber}`,
            },
            {
              accountId: equityAccount.id,
              debit: 0,
              credit: openingBalance,
              memo: `Opening bank equity - ${cleanBankName}`,
            },
          ],
          createdBy: 'Banking Module',
        });
      }
    }

    db.prepare(`
      INSERT INTO bank_accounts (
        id, company_id, bank_name, account_title, account_number, iban, branch_name, branch_code,
        account_type, currency, opening_balance_paisas, opening_balance, account_id,
        is_active, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      bankId,
      targetCompanyId,
      cleanBankName,
      cleanAccountTitle,
      cleanAccountNumber,
      input.iban ? input.iban.trim().toUpperCase() : null,
      input.branchName ? input.branchName.trim() : null,
      input.branchCode ? input.branchCode.trim() : null,
      input.accountType || 'CURRENT',
      currency,
      openingBalancePaisas,
      openingBalance,
      glAccount.id,
      isActive,
      input.notes ? input.notes.trim() : null
    );

    const created = this.getBankAccountById(bankId, targetCompanyId);
    if (!created) {
      throw new Error('Failed to retrieve newly created bank account.');
    }
    return created;
  }

  /**
   * Update an existing Bank Account
   */
  public static updateBankAccount(
    id: string,
    input: UpdateBankAccountInput,
    companyId: string = DEFAULT_COMPANY_ID
  ): BankAccount {
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!existing) {
      throw new Error(`Bank account with ID "${id}" not found.`);
    }

    const bankName = input.bankName !== undefined ? input.bankName.trim() : existing.bank_name;
    const accountTitle = input.accountTitle !== undefined ? input.accountTitle.trim() : existing.account_title;
    const accountNumber = input.accountNumber !== undefined ? input.accountNumber.trim() : existing.account_number;

    if (!bankName) throw new Error('Bank name cannot be empty.');
    if (!accountTitle) throw new Error('Account title cannot be empty.');
    if (!accountNumber) throw new Error('Account number cannot be empty.');

    // If account number changed, check uniqueness within company
    if (accountNumber !== existing.account_number) {
      const dup = db
        .prepare('SELECT id FROM bank_accounts WHERE account_number = ? AND id != ? AND company_id = ?')
        .get(accountNumber, id, companyId) as any;
      if (dup) {
        throw new Error(`Another bank account with number "${accountNumber}" already exists.`);
      }
    }

    // Verify accountId if changing
    let glAccountId = existing.account_id;
    if (input.accountId && input.accountId !== existing.account_id) {
      const gl = db
        .prepare('SELECT id, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?')
        .get(input.accountId, companyId) as any;
      if (!gl) throw new Error('Specified GL account does not exist.');
      if (gl.type !== 'ASSET') throw new Error('Specified GL account must be an ASSET.');
      glAccountId = input.accountId;
    }

    const iban = input.iban !== undefined ? (input.iban ? input.iban.trim().toUpperCase() : null) : existing.iban;
    const branchName = input.branchName !== undefined ? (input.branchName ? input.branchName.trim() : null) : existing.branch_name;
    const branchCode = input.branchCode !== undefined ? (input.branchCode ? input.branchCode.trim() : null) : existing.branch_code;
    const accountType = input.accountType || existing.account_type;
    const currency = input.currency ? input.currency.trim().toUpperCase() : existing.currency;
    const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.is_active;
    const notes = input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : existing.notes;

    db.prepare(`
      UPDATE bank_accounts SET
        bank_name = ?,
        account_title = ?,
        account_number = ?,
        iban = ?,
        branch_name = ?,
        branch_code = ?,
        account_type = ?,
        currency = ?,
        account_id = ?,
        is_active = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(
      bankName,
      accountTitle,
      accountNumber,
      iban,
      branchName,
      branchCode,
      accountType,
      currency,
      glAccountId,
      isActive,
      notes,
      id,
      companyId
    );

    const updated = this.getBankAccountById(id, companyId);
    if (!updated) {
      throw new Error('Failed to retrieve updated bank account.');
    }
    return updated;
  }

  /**
   * Check all dependencies and linked transactions for a bank account
   * Requirement 4: Bank deletion must be blocked if any transaction is linked.
   */
  public static checkDeletionDependencies(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID
  ): BankDeletionCheckResult {
    const db = getDatabase();

    const bank = db.prepare('SELECT * FROM bank_accounts WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!bank) {
      throw new Error(`Bank account with ID "${id}" not found.`);
    }

    // 1. Linked Customer Payments (Payments Received / Collections)
    const custPayments = db.prepare(`
      SELECT 
        cp.id,
        cp.payment_number as number,
        cp.payment_date as date,
        cp.amount,
        COALESCE(c.name, 'Customer') as party
      FROM customer_payments cp
      LEFT JOIN customers c ON cp.customer_id = c.id AND c.company_id = cp.company_id
      WHERE (cp.bank_account_id = ? OR cp.account_id = ?) AND cp.company_id = ?
      ORDER BY cp.payment_date DESC
      LIMIT 50
    `).all(id, bank.account_id, companyId) as any[];

    // 2. Linked Vendor Payments (Payments Made)
    const vendPayments = db.prepare(`
      SELECT 
        vp.id,
        vp.payment_number as number,
        vp.payment_date as date,
        vp.amount,
        COALESCE(v.name, 'Vendor') as party
      FROM vendor_payments vp
      LEFT JOIN vendors v ON vp.vendor_id = v.id AND v.company_id = vp.company_id
      WHERE (vp.bank_account_id = ? OR vp.account_id = ?) AND vp.company_id = ?
      ORDER BY vp.payment_date DESC
      LIMIT 50
    `).all(id, bank.account_id, companyId) as any[];

    // 3. Linked Daily Expenses
    const expenses = db.prepare(`
      SELECT 
        e.id,
        e.voucher_number as number,
        e.expense_date as date,
        e.amount,
        e.description
      FROM expenses e
      WHERE (e.bank_account_id = ? OR e.paid_from_account_id = ?) AND e.company_id = ?
      ORDER BY e.expense_date DESC
      LIMIT 50
    `).all(id, bank.account_id, companyId) as any[];

    // 4. Other General Journal Entries (excluding opening balance of this bank)
    const journalEntries = db.prepare(`
      SELECT DISTINCT
        je.id,
        je.entry_number as number,
        je.entry_date as date,
        je.description
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
      WHERE jl.account_id = ? AND jl.company_id = ?
        AND NOT (je.source_module = 'banking' AND je.source_document_id = ?)
      ORDER BY je.entry_date DESC
      LIMIT 50
    `).all(bank.account_id, companyId, id) as any[];

    const totalLinked =
      custPayments.length + vendPayments.length + expenses.length + journalEntries.length;

    const canDelete = totalLinked === 0;

    let message: string | undefined = undefined;
    if (!canDelete) {
      const parts: string[] = [];
      if (custPayments.length > 0) {
        parts.push(
          `${custPayments.length} Customer Payment(s) (${custPayments.slice(0, 3).map((p) => p.number).join(', ')}${custPayments.length > 3 ? '...' : ''})`
        );
      }
      if (vendPayments.length > 0) {
        parts.push(
          `${vendPayments.length} Vendor Payment(s) (${vendPayments.slice(0, 3).map((p) => p.number).join(', ')}${vendPayments.length > 3 ? '...' : ''})`
        );
      }
      if (expenses.length > 0) {
        parts.push(
          `${expenses.length} Expense Voucher(s) (${expenses.slice(0, 3).map((p) => p.number).join(', ')}${expenses.length > 3 ? '...' : ''})`
        );
      }
      if (journalEntries.length > 0) {
        parts.push(
          `${journalEntries.length} General Journal Entry(ies) (${journalEntries.slice(0, 3).map((p) => p.number).join(', ')}${journalEntries.length > 3 ? '...' : ''})`
        );
      }

      message = `Cannot delete bank account "${bank.bank_name} - ${bank.account_number}". It is actively linked to ${parts.join(', ')}. Please delete or reverse these transactions first before deleting this bank account.`;
    }

    return {
      canDelete,
      message,
      summary: {
        totalLinked,
        customerPaymentsCount: custPayments.length,
        vendorPaymentsCount: vendPayments.length,
        expensesCount: expenses.length,
        otherJournalEntriesCount: journalEntries.length,
      },
      linkedItems: {
        customerPayments: custPayments,
        vendorPayments: vendPayments,
        expenses,
        journalEntries,
      },
    };
  }

  /**
   * Delete bank account (strictly blocked if linked transactions exist)
   */
  public static deleteBankAccount(id: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const db = getDatabase();

    const check = this.checkDeletionDependencies(id, companyId);
    if (!check.canDelete) {
      throw new Error(check.message);
    }

    const bank = db.prepare('SELECT bank_name, account_number FROM bank_accounts WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!bank) {
      throw new Error('Bank account not found.');
    }

    // Void / remove any opening balance journal entry for this bank
    const opJe = db
      .prepare("SELECT id FROM journal_entries WHERE source_module = 'banking' AND source_document_id = ? AND company_id = ?")
      .get(id, companyId) as { id: string } | undefined;

    if (opJe) {
      db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(opJe.id, companyId);
      db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(opJe.id, companyId);
    }

    db.prepare('DELETE FROM bank_accounts WHERE id = ? AND company_id = ?').run(id, companyId);

    return {
      success: true,
      message: `Bank account "${bank.bank_name} - ${bank.account_number}" deleted successfully.`,
    };
  }

  /**
   * Bank-wise Ledger / Statement Report
   * Requirement 8: Filters by date and bank account
   */
  public static getBankStatement(filter: BankStatementFilter, companyId: string = DEFAULT_COMPANY_ID): BankStatementReport {
    const db = getDatabase();

    const bank = this.getBankAccountById(filter.bankAccountId, companyId);
    if (!bank) {
      throw new Error(`Bank account with ID "${filter.bankAccountId}" not found.`);
    }

    const today = new Date().toISOString().split('T')[0];
    const fromDate = filter.fromDate || `${today.slice(0, 7)}-01`;
    const toDate = filter.toDate || today;

    // 1. Calculate Opening Balance before fromDate
    const opRow = db
      .prepare(`
        SELECT 
          COALESCE(SUM(jl.debit_paisas), 0) as op_debit_paisas,
          COALESCE(SUM(jl.credit_paisas), 0) as op_credit_paisas
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
        WHERE jl.account_id = ? AND je.status = 'POSTED' AND je.entry_date < ? AND jl.company_id = ?
      `)
      .get(bank.account_id, fromDate, companyId) as { op_debit_paisas: number; op_credit_paisas: number };

    // Bank Account is an ASSET with DEBIT normal balance:
    // Debit increases bank balance (Deposits / Inflows), Credit decreases bank balance (Withdrawals / Outflows)
    const openingBalancePaisas = (opRow?.op_debit_paisas || 0) - (opRow?.op_credit_paisas || 0);

    // 2. Query chronological transactions between fromDate and toDate
    const lineRows = db
      .prepare(`
        SELECT 
          je.id as journalId,
          je.entry_date as date,
          je.entry_number as voucherNumber,
          je.source_module as sourceModule,
          je.source_document_id as sourceDocumentId,
          je.reversal_of_id as reversalOfId,
          je.description,
          jl.memo,
          jl.debit,
          jl.credit,
          jl.debit_paisas,
          jl.credit_paisas
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
        WHERE jl.account_id = ? AND je.status = 'POSTED'
          AND je.entry_date >= ? AND je.entry_date <= ? AND jl.company_id = ?
        ORDER BY je.entry_date ASC, je.created_at ASC, jl.id ASC
      `)
      .all(bank.account_id, fromDate, toDate, companyId) as any[];

    const resolvedLineRows = BusinessReferenceResolver.batchResolveSync(
      lineRows,
      companyId,
      db
    );

    let currentRunningPaisas = openingBalancePaisas;
    let totalDebitPaisas = 0;
    let totalCreditPaisas = 0;

    const formattedLines: BankStatementLine[] = resolvedLineRows.map((r) => {
      const dPaisas = Number(r.debit_paisas) || 0;
      const cPaisas = Number(r.credit_paisas) || 0;

      totalDebitPaisas += dPaisas;
      totalCreditPaisas += cPaisas;

      // Inflow (debit) adds to balance, outflow (credit) subtracts from balance
      currentRunningPaisas += dPaisas - cPaisas;

      let transType = 'JOURNAL_ENTRY';
      if (r.sourceModule === 'payments') {
        transType = dPaisas > 0 ? 'PAYMENT_RECEIVED' : 'PAYMENT_MADE';
      } else if (r.sourceModule === 'expenses') {
        transType = 'EXPENSE_PAYMENT';
      } else if (r.sourceModule === 'sales') {
        transType = 'CUSTOMER_COLLECTION';
      } else if (r.sourceModule === 'banking') {
        transType = 'OPENING_BALANCE';
      }

      const vNum = r.businessReference || r.voucherNumber;

      return {
        date: r.date,
        voucherNumber: vNum,
        entryNumber: r.voucherNumber,
        businessReference: r.businessReference,
        sourceModule: r.sourceModule,
        sourceDocumentId: r.sourceDocumentId || null,
        journalEntryId: r.journalId || null,
        transactionType: transType,
        description: r.description,
        memo: r.memo || null,
        debit: fromPaisas(dPaisas),
        credit: fromPaisas(cPaisas),
        runningBalance: fromPaisas(currentRunningPaisas),
        debitPaisas: dPaisas,
        creditPaisas: cPaisas,
        runningBalancePaisas: currentRunningPaisas,
      };
    });

    const totalDeposits = fromPaisas(totalDebitPaisas);
    const totalWithdrawals = fromPaisas(totalCreditPaisas);
    const netMovement = totalDeposits - totalWithdrawals;

    return {
      bankAccount: bank,
      fromDate,
      toDate,
      openingBalance: fromPaisas(openingBalancePaisas),
      totalDeposits,
      totalWithdrawals,
      netMovement,
      closingBalance: fromPaisas(currentRunningPaisas),
      lines: formattedLines,
    };
  }

  /**
   * Helper for transaction screens to get active Cash & Bank accounts
   * Requirement 5: Only ACTIVE bank accounts appear in dropdowns.
   * Requirement 6: Keep Cash in Hand separate from Bank Accounts.
   */
  public static getAvailablePaymentAccounts(companyId: string = DEFAULT_COMPANY_ID): {
    cashAccounts: PaymentAccountOption[];
    bankAccounts: PaymentAccountOption[];
    allAccounts: PaymentAccountOption[];
  } {
    const db = getDatabase();

    // 1. Get 1010 Cash in Hand
    const cashRow = db
      .prepare(`
        SELECT 
          coa.id,
          coa.code,
          coa.name,
          COALESCE(SUM(CASE WHEN je.status = 'POSTED' THEN jl.debit_paisas - jl.credit_paisas ELSE 0 END), 0) as balance_paisas
        FROM chart_of_accounts coa
        LEFT JOIN journal_lines jl ON coa.id = jl.account_id AND jl.company_id = coa.company_id
        LEFT JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = coa.company_id
        WHERE coa.code = '1010' AND coa.is_active = 1 AND coa.company_id = ?
        GROUP BY coa.id
      `)
      .get(companyId) as any;

    const cashAccounts: PaymentAccountOption[] = [];
    if (cashRow) {
      cashAccounts.push({
        id: cashRow.id,
        code: cashRow.code,
        name: 'Cash in Hand (Counter / Register)',
        accountType: 'CASH',
        currentBalance: fromPaisas(Number(cashRow.balance_paisas) || 0),
        isActive: true,
      });
    }

    // 2. Get active bank accounts
    const activeBanks = this.getBankAccounts({ isActive: 1 }, companyId);
    const bankAccounts: PaymentAccountOption[] = activeBanks.map((b) => ({
      id: b.account_id,
      bankAccountId: b.id,
      code: b.gl_account_code || 'BANK',
      name: `${b.bank_name} - ${b.account_number} (${b.account_title})`,
      accountType: 'BANK',
      bankName: b.bank_name,
      accountNumber: b.account_number,
      currentBalance: b.current_balance,
      isActive: true,
    }));

    return {
      cashAccounts,
      bankAccounts,
      allAccounts: [...cashAccounts, ...bankAccounts],
    };
  }

  /**
   * Universal DAL Async Bank Accounts Fetch for PostgreSQL & SQLite
   */
  public static async getBankAccountsAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getBankAccounts(companyId, client);
  }

  /**
   * Universal DAL Async Bank Account Creation for PostgreSQL & SQLite
   */
  public static async createBankAccountAsync(
    input: any,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createBankAccount(input, companyId, client);
  }
}
