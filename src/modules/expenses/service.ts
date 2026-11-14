import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';

export interface CreateExpenseInput {
  companyId?: string;
  expenseDate: string; // YYYY-MM-DD
  expenseAccountId: string;
  paidFromAccountId: string;
  amount: number; // in PKR
  description: string;
  staffId?: string | null;
  vehicleNumber?: string | null;
  createdBy?: string;
}

export interface ExpenseRecord {
  id: string;
  company_id?: string;
  voucher_number: string;
  expense_date: string;
  expense_account_id: string;
  expense_account_name?: string;
  expense_account_code?: string;
  paid_from_account_id: string;
  paid_from_account_name?: string;
  paid_from_account_code?: string;
  amount_paisas: number;
  amount: number;
  staff_id?: string | null;
  staff_name?: string | null;
  vehicle_number?: string | null;
  description: string;
  journal_entry_id: string;
  journal_entry_number?: string;
  status: 'POSTED' | 'VOID';
  created_at: string;
}

export class ExpenseService {
  /**
   * Create and record a new daily operational expense with strict GL posting
   */
  public static createExpense(input: CreateExpenseInput): ExpenseRecord {
    const db = getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;

    if (!input.expenseDate) {
      throw new Error('Expense date is required.');
    }
    if (!input.expenseAccountId) {
      throw new Error('Please select an expense head account.');
    }
    if (!input.paidFromAccountId) {
      throw new Error('Please select a payment account (Cash in Hand or Bank).');
    }
    if (!input.amount || input.amount <= 0) {
      throw new Error('Expense amount must be greater zero.');
    }
    if (!input.description || !input.description.trim()) {
      throw new Error('Expense description / reason is required.');
    }

    // Verify Expense Account is of type EXPENSE and belongs to company
    const expAcc = db
      .prepare('SELECT id, code, name, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?')
      .get(input.expenseAccountId, companyId) as { id: string; code: string; name: string; type: string; is_active: number } | undefined;

    if (!expAcc) {
      throw new Error('Selected expense account does not exist in Chart of Accounts.');
    }
    if (expAcc.is_active !== 1) {
      throw new Error(`Expense account "${expAcc.name}" is deactivated.`);
    }

    // Verify Paid From Account is ASSET (Cash/Bank) and belongs to company
    const paidAcc = db
      .prepare('SELECT id, code, name, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?')
      .get(input.paidFromAccountId, companyId) as { id: string; code: string; name: string; type: string; is_active: number } | undefined;

    if (!paidAcc) {
      throw new Error('Selected payment account does not exist in Chart of Accounts.');
    }
    if (paidAcc.is_active !== 1) {
      throw new Error(`Payment account "${paidAcc.name}" is deactivated.`);
    }

    const expenseId = generateUUID();
    const amountPaisas = toPaisas(input.amount);

    // Generate unique sequential voucher number: EXP-YYYYMM-XXXX scoped by company_id
    const yearMonth = input.expenseDate.slice(0, 7).replace('-', '');
    const countRow = db
      .prepare("SELECT COUNT(*) as count FROM expenses WHERE company_id = ? AND voucher_number LIKE ?")
      .get(companyId, `EXP-${yearMonth}-%`) as { count: number };
    const nextSeq = (countRow?.count || 0) + 1;
    const voucherNumber = `EXP-${yearMonth}-${String(nextSeq).padStart(4, '0')}`;

    // 1. Post atomic balanced GL entry: Dr. Expense, Cr. Cash/Bank
    const staffText = input.staffId
      ? (db.prepare('SELECT name FROM staff_members WHERE id = ? AND company_id = ?').get(input.staffId, companyId) as { name: string } | undefined)?.name
      : null;

    const extraNotes = [
      input.vehicleNumber ? `Vehicle: ${input.vehicleNumber}` : null,
      staffText ? `Staff: ${staffText}` : null,
    ].filter(Boolean).join(' | ');

    const lineMemo = extraNotes ? `${input.description.trim()} (${extraNotes})` : input.description.trim();

    const journalEntry = DoubleEntryEngine.postEntry({
      companyId,
      entryDate: input.expenseDate,
      description: `Expense Voucher ${voucherNumber} - ${input.description.trim()}`,
      sourceModule: 'expenses',
      sourceDocumentId: expenseId,
      lines: [
        {
          accountId: input.expenseAccountId,
          debit: input.amount,
          credit: 0,
          memo: lineMemo,
        },
        {
          accountId: input.paidFromAccountId,
          debit: 0,
          credit: input.amount,
          memo: `Payment for ${voucherNumber} via ${paidAcc.name}`,
        },
      ],
      createdBy: input.createdBy || 'Expenses Module',
    });

    // Resolve bank_account_id if paidFromAccountId is linked to a bank account
    const bankRow = db.prepare('SELECT id FROM bank_accounts WHERE account_id = ? AND company_id = ? LIMIT 1').get(input.paidFromAccountId, companyId) as { id: string } | undefined;
    const bankAccountId = bankRow?.id || null;

    // 2. Insert into expenses table
    const stmt = db.prepare(`
      INSERT INTO expenses (
        id, company_id, voucher_number, expense_date, expense_account_id, paid_from_account_id, bank_account_id,
        amount_paisas, amount, staff_id, vehicle_number, description,
        journal_entry_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', datetime('now'))
    `);

    stmt.run(
      expenseId,
      companyId,
      voucherNumber,
      input.expenseDate,
      input.expenseAccountId,
      input.paidFromAccountId,
      bankAccountId,
      amountPaisas,
      input.amount,
      input.staffId || null,
      input.vehicleNumber?.trim() || null,
      input.description.trim(),
      journalEntry.id
    );

    return {
      id: expenseId,
      company_id: companyId,
      voucher_number: voucherNumber,
      expense_date: input.expenseDate,
      expense_account_id: input.expenseAccountId,
      expense_account_name: expAcc.name,
      expense_account_code: expAcc.code,
      paid_from_account_id: input.paidFromAccountId,
      paid_from_account_name: paidAcc.name,
      paid_from_account_code: paidAcc.code,
      amount_paisas: amountPaisas,
      amount: input.amount,
      staff_id: input.staffId || null,
      staff_name: staffText || null,
      vehicle_number: input.vehicleNumber?.trim() || null,
      description: input.description.trim(),
      journal_entry_id: journalEntry.id,
      journal_entry_number: journalEntry.entry_number,
      status: 'POSTED',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Void an expense voucher with audit trail and reversing GL voucher
   */
  public static voidExpense(expenseId: string, reason: string, companyId?: string): { originalExpense: ExpenseRecord; reversalEntryId: string } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND company_id = ?').get(expenseId, cleanCompanyId) as any;
    if (!expense) {
      throw new Error(`Expense voucher ${expenseId} not found.`);
    }

    if (expense.status === 'VOID') {
      throw new Error(`Expense voucher ${expense.voucher_number} is already voided.`);
    }

    // Post reversal journal entry
    const { reversalEntry } = DoubleEntryEngine.voidEntry(expense.journal_entry_id, reason, cleanCompanyId);

    // Update expense record status
    db.prepare(`
      UPDATE expenses
      SET status = 'VOID'
      WHERE id = ? AND company_id = ?
    `).run(expenseId, cleanCompanyId);

    expense.status = 'VOID';
    return {
      originalExpense: expense,
      reversalEntryId: reversalEntry.id,
    };
  }

  /**
   * Fetch expense records with optional filters
   */
  public static getExpenses(filter?: {
    companyId?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
    limit?: number;
  }): ExpenseRecord[] {
    const db = getDatabase();
    const cleanCompanyId = filter?.companyId || DEFAULT_COMPANY_ID;

    let query = `
      SELECT 
        e.*,
        exp_acc.name as expense_account_name,
        exp_acc.code as expense_account_code,
        paid_acc.name as paid_from_account_name,
        paid_acc.code as paid_from_account_code,
        sm.name as staff_name,
        je.entry_number as journal_entry_number
      FROM expenses e
      LEFT JOIN chart_of_accounts exp_acc ON e.expense_account_id = exp_acc.id AND exp_acc.company_id = e.company_id
      LEFT JOIN chart_of_accounts paid_acc ON e.paid_from_account_id = paid_acc.id AND paid_acc.company_id = e.company_id
      LEFT JOIN staff_members sm ON e.staff_id = sm.id AND sm.company_id = e.company_id
      LEFT JOIN journal_entries je ON e.journal_entry_id = je.id AND je.company_id = e.company_id
      WHERE e.company_id = ?
    `;

    const params: any[] = [cleanCompanyId];

    if (filter?.date) {
      query += ' AND e.expense_date = ?';
      params.push(filter.date);
    }
    if (filter?.startDate) {
      query += ' AND e.expense_date >= ?';
      params.push(filter.startDate);
    }
    if (filter?.endDate) {
      query += ' AND e.expense_date <= ?';
      params.push(filter.endDate);
    }
    if (filter?.status) {
      query += ' AND e.status = ?';
      params.push(filter.status);
    }
    if (filter?.search) {
      query += ' AND (e.voucher_number LIKE ? OR e.description LIKE ? OR e.vehicle_number LIKE ? OR sm.name LIKE ?)';
      const term = `%${filter.search}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY e.expense_date DESC, e.created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    return db.prepare(query).all(...params) as unknown as ExpenseRecord[];
  }

  /**
   * Retrieve a single expense record by ID scoped to company
   */
  public static getExpenseById(id: string, companyId: string = DEFAULT_COMPANY_ID): ExpenseRecord | null {
    const expenses = this.getExpenses({ companyId });
    return expenses.find((e) => e.id === id) || null;
  }

  /**
   * Get active Chart of Accounts under type EXPENSE (5000 heads)
   */
  public static getExpenseAccounts(companyId?: string): { id: string; code: string; name: string; description: string | null }[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    return db
      .prepare("SELECT id, code, name, description FROM chart_of_accounts WHERE type = 'EXPENSE' AND is_active = 1 AND company_id = ? ORDER BY code ASC")
      .all(cleanCompanyId) as any[];
  }

  /**
   * Get active Payment Accounts (1010 Cash in Hand and all Active Bank Accounts)
   */
  public static getPaymentAccounts(companyId?: string): { id: string; code: string; name: string; description: string | null }[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    
    // 1. Get 1010 Cash in Hand
    const cashAccounts = db
      .prepare("SELECT id, code, name, description FROM chart_of_accounts WHERE code = '1010' AND is_active = 1 AND company_id = ?")
      .all(cleanCompanyId) as { id: string; code: string; name: string; description: string | null }[];

    // 2. Get all active bank accounts from bank_accounts master
    const bankRows = db
      .prepare(`
        SELECT 
          coa.id,
          coa.code,
          (b.bank_name || ' - ' || b.account_number || ' (' || b.account_title || ')') as name,
          b.bank_name as description
        FROM bank_accounts b
        JOIN chart_of_accounts coa ON b.account_id = coa.id AND coa.company_id = b.company_id
        WHERE b.is_active = 1 AND coa.is_active = 1 AND b.company_id = ?
        ORDER BY b.bank_name ASC
      `)
      .all(cleanCompanyId) as { id: string; code: string; name: string; description: string | null }[];

    // 3. Fallback: Any other bank account in COA starting with 102 not already mapped
    const existingIds = new Set([...cashAccounts, ...bankRows].map(a => a.id));
    const fallbackBanks = db
      .prepare("SELECT id, code, name, description FROM chart_of_accounts WHERE code LIKE '102%' AND is_active = 1 AND company_id = ?")
      .all(cleanCompanyId) as { id: string; code: string; name: string; description: string | null }[];

    for (const fb of fallbackBanks) {
      if (!existingIds.has(fb.id)) {
        bankRows.push(fb);
        existingIds.add(fb.id);
      }
    }

    return [...cashAccounts, ...bankRows];
  }

  /**
   * Get staff members (Drivers, Supply Persons, Salesmen)
   */
  public static getStaffMembers(companyId?: string): { id: string; name: string; role: string; phone: string | null }[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    return db
      .prepare('SELECT id, name, role, phone FROM staff_members WHERE is_active = 1 AND company_id = ? ORDER BY role ASC, name ASC')
      .all(cleanCompanyId) as any[];
  }

  /**
   * Universal DAL Async Expenses Fetch for PostgreSQL & SQLite
   */
  public static async getExpensesAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getExpenses(companyId, client);
  }

  /**
   * Universal DAL Async Expense Creation for PostgreSQL & SQLite
   */
  public static async createExpenseAsync(
    input: any,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createExpense(input, companyId, client);
  }
}

