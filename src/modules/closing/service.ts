import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';

import { DenominationBreakdown, DailyReconciliationResult, FinalizeDailyClosingInput } from './types';
export type { DenominationBreakdown, DailyReconciliationResult, FinalizeDailyClosingInput };

export class ClosingService {
  /**
   * Calculate real-time automated system cash reconciliation for a specific date
   */
  public static calculateDailyReconciliation(date: string, companyId?: string): DailyReconciliationResult {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    // 1. Get 1010 Cash in Hand account ID
    const cashAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(cleanCompanyId) as { id: string } | undefined;
    const cashAccId = cashAcc?.id;

    // 2. Get 1020 Bank account ID
    const bankAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1020' AND company_id = ?").get(cleanCompanyId) as { id: string } | undefined;
    const bankAccId = bankAcc?.id;

    // 3. Opening Cash in Hand
    // Strategy: Look for the most recent finalized daily closing strictly before `date`
    let openingCashPaisas = 0;
    const priorClosing = db
      .prepare('SELECT physical_cash_paisas, closing_date FROM daily_closings WHERE closing_date < ? AND company_id = ? ORDER BY closing_date DESC LIMIT 1')
      .get(date, cleanCompanyId) as { physical_cash_paisas: number; closing_date: string } | undefined;

    if (priorClosing) {
      openingCashPaisas = priorClosing.physical_cash_paisas;

      // Add any net cash postings between priorClosing.closing_date and this date
      if (cashAccId) {
        const gapPostings = db.prepare(`
          SELECT COALESCE(SUM(jl.debit_paisas - jl.credit_paisas), 0) as net_gap
          FROM journal_lines jl
          JOIN journal_entries je ON jl.journal_id = je.id
          WHERE jl.account_id = ?
            AND je.entry_date > ?
            AND je.entry_date < ?
            AND je.status = 'POSTED'
            AND je.company_id = ?
        `).get(cashAccId, priorClosing.closing_date, date, cleanCompanyId) as { net_gap: number };

        openingCashPaisas += (gapPostings?.net_gap || 0);
      }
    } else if (cashAccId) {
      // If no prior closing exists, calculate cumulative net GL balance of 1010 prior to `date`
      const openRow = db.prepare(`
        SELECT COALESCE(SUM(jl.debit_paisas - jl.credit_paisas), 0) as net_opening
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id
        WHERE jl.account_id = ?
          AND je.entry_date < ?
          AND je.status = 'POSTED'
          AND je.company_id = ?
      `).get(cashAccId, date, cleanCompanyId) as { net_opening: number };

      openingCashPaisas = Math.max(0, openRow?.net_opening || 0);
    }

    // 4. Spot Cash Sales on Date
    const salesRow = db.prepare(`
      SELECT COALESCE(SUM(cash_received_paisas), 0) as total_spot_cash
      FROM sales_orders
      WHERE order_date = ? AND status != 'VOID' AND company_id = ?
    `).get(date, cleanCompanyId) as { total_spot_cash: number };
    const spotCashSalesPaisas = salesRow?.total_spot_cash || 0;

    // 5. Customer Debt Recoveries on Date (Cash receipts)
    const recoveryRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paisas), 0) as total_recoveries
      FROM customer_payments
      WHERE payment_date = ? AND payment_method = 'CASH' AND company_id = ?
    `).get(date, cleanCompanyId) as { total_recoveries: number };
    const debtRecoveriesPaisas = recoveryRow?.total_recoveries || 0;

    // 6. Spot Cash Purchases on Date (Direct cash paid out for inventory or bills)
    let spotCashPurchasesPaisas = 0;
    if (cashAccId) {
      const purRow = db.prepare(`
        SELECT COALESCE(SUM(jl.credit_paisas), 0) as total_pur_cash
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id
        WHERE jl.account_id = ?
          AND je.source_module = 'purchase'
          AND je.entry_date = ?
          AND je.status = 'POSTED'
          AND je.company_id = ?
      `).get(cashAccId, date, cleanCompanyId) as { total_pur_cash: number };
      spotCashPurchasesPaisas = purRow?.total_pur_cash || 0;
    }

    // 7. Daily Cash Expenses on Date (Expenses paid from 1010)
    let dailyExpensesPaisas = 0;
    if (cashAccId) {
      const expRow = db.prepare(`
        SELECT COALESCE(SUM(amount_paisas), 0) as total_expenses
        FROM expenses
        WHERE expense_date = ?
          AND paid_from_account_id = ?
          AND status = 'POSTED'
          AND company_id = ?
      `).get(date, cashAccId, cleanCompanyId) as { total_expenses: number };
      dailyExpensesPaisas = expRow?.total_expenses || 0;
    }

    // 8. Bank Cash Deposits on Date (Transfers from 1010 to 1020)
    let bankDepositsPaisas = 0;
    if (cashAccId && bankAccId) {
      const bankRow = db.prepare(`
        SELECT COALESCE(SUM(jl.credit_paisas), 0) as total_bank_deposit
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id
        WHERE jl.account_id = ?
          AND je.entry_date = ?
          AND je.status = 'POSTED'
          AND je.source_module != 'expenses'
          AND je.source_module != 'purchase'
          AND je.company_id = ?
          AND EXISTS (
            SELECT 1 FROM journal_lines jl2 
            WHERE jl2.journal_id = je.id 
              AND jl2.account_id = ? 
              AND jl2.debit_paisas > 0
              AND jl2.company_id = ?
          )
      `).get(cashAccId, date, cleanCompanyId, bankAccId, cleanCompanyId) as { total_bank_deposit: number };
      bankDepositsPaisas = bankRow?.total_bank_deposit || 0;
    }

    // 9. Calculate Expected System Cash
    const expectedCashPaisas =
      openingCashPaisas +
      spotCashSalesPaisas +
      debtRecoveriesPaisas -
      spotCashPurchasesPaisas -
      dailyExpensesPaisas -
      bankDepositsPaisas;

    // 10. Check if this date has an existing finalized closing
    const existingClosing = db
      .prepare('SELECT * FROM daily_closings WHERE closing_date = ? AND company_id = ?')
      .get(date, cleanCompanyId) as any;

    let finalizedClosing;
    if (existingClosing) {
      let parsedDenoms: DenominationBreakdown = {
        note5000: 0,
        note1000: 0,
        note500: 0,
        note100: 0,
        note50: 0,
        note20: 0,
        note10: 0,
        coinsLoose: 0,
      };
      try {
        parsedDenoms = JSON.parse(existingClosing.denominations_json);
      } catch (e) {
        // use default
      }

      finalizedClosing = {
        id: existingClosing.id,
        company_id: existingClosing.company_id,
        closing_date: existingClosing.closing_date,
        physical_cash_paisas: existingClosing.physical_cash_paisas,
        physical_cash: fromPaisas(existingClosing.physical_cash_paisas),
        variance_paisas: existingClosing.variance_paisas,
        variance: fromPaisas(existingClosing.variance_paisas),
        denominations: parsedDenoms,
        status: existingClosing.status as 'OPEN' | 'CLOSED',
        notes: existingClosing.notes,
        closed_by: existingClosing.closed_by || 'Admin Cashier',
        closed_at: existingClosing.closed_at,
      };
    }

    return {
      company_id: cleanCompanyId,
      closingDate: date,
      openingCashPaisas,
      openingCash: fromPaisas(openingCashPaisas),
      spotCashSalesPaisas,
      spotCashSales: fromPaisas(spotCashSalesPaisas),
      debtRecoveriesPaisas,
      debtRecoveries: fromPaisas(debtRecoveriesPaisas),
      spotCashPurchasesPaisas,
      spotCashPurchases: fromPaisas(spotCashPurchasesPaisas),
      dailyExpensesPaisas,
      dailyExpenses: fromPaisas(dailyExpensesPaisas),
      bankDepositsPaisas,
      bankDeposits: fromPaisas(bankDepositsPaisas),
      expectedCashPaisas,
      expectedCash: fromPaisas(expectedCashPaisas),
      isFinalized: !!existingClosing,
      finalizedClosing,
    };
  }

  /**
   * Finalize and lock daily cash closing record (Day-End Lock)
   */
  public static finalizeDailyClosing(input: FinalizeDailyClosingInput): DailyReconciliationResult {
    const db = getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;

    if (!input.closingDate) {
      throw new Error('Closing date is required.');
    }

    const variancePaisas = input.physicalCashPaisas - input.expectedCashPaisas;
    const closingId = generateUUID();

    const insertOrReplace = db.prepare(`
      INSERT INTO daily_closings (
        id, company_id, closing_date, opening_cash_paisas, spot_cash_sales_paisas,
        debt_recoveries_paisas, spot_cash_purchases_paisas, daily_expenses_paisas,
        bank_deposits_paisas, expected_cash_paisas, physical_cash_paisas,
        variance_paisas, denominations_json, status, notes, closed_by, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, datetime('now'))
      ON CONFLICT(company_id, closing_date) DO UPDATE SET
        opening_cash_paisas = excluded.opening_cash_paisas,
        spot_cash_sales_paisas = excluded.spot_cash_sales_paisas,
        debt_recoveries_paisas = excluded.debt_recoveries_paisas,
        spot_cash_purchases_paisas = excluded.spot_cash_purchases_paisas,
        daily_expenses_paisas = excluded.daily_expenses_paisas,
        bank_deposits_paisas = excluded.bank_deposits_paisas,
        expected_cash_paisas = excluded.expected_cash_paisas,
        physical_cash_paisas = excluded.physical_cash_paisas,
        variance_paisas = excluded.variance_paisas,
        denominations_json = excluded.denominations_json,
        status = 'CLOSED',
        notes = excluded.notes,
        closed_by = excluded.closed_by,
        closed_at = datetime('now')
    `);

    insertOrReplace.run(
      closingId,
      companyId,
      input.closingDate,
      input.openingCashPaisas,
      input.spotCashSalesPaisas,
      input.debtRecoveriesPaisas,
      input.spotCashPurchasesPaisas,
      input.dailyExpensesPaisas,
      input.bankDepositsPaisas,
      input.expectedCashPaisas,
      input.physicalCashPaisas,
      variancePaisas,
      JSON.stringify(input.denominations),
      input.notes || null,
      input.closedBy || 'Admin Cashier'
    );

    return this.calculateDailyReconciliation(input.closingDate, companyId);
  }

  /**
   * Unlock / Re-open a closed day for corrections if authorized
   */
  public static reopenDay(date: string, companyId?: string): void {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    db.prepare("UPDATE daily_closings SET status = 'OPEN' WHERE closing_date = ? AND company_id = ?").run(date, cleanCompanyId);
  }

  /**
   * Fetch recent daily closings history
   */
  public static getClosingHistory(limit: number = 30, companyId?: string): any[] {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    return db
      .prepare('SELECT * FROM daily_closings WHERE company_id = ? ORDER BY closing_date DESC LIMIT ?')
      .all(cleanCompanyId, limit) as any[];
  }

  /**
   * Universal DAL Async Daily Closing Finalization for PostgreSQL & SQLite
   */
  public static async finalizeDailyClosingAsync(
    date: string,
    closedBy: string,
    notes = '',
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.finalizeDailyClosing(date, closedBy, notes, companyId, client);
  }

  /**
   * Universal DAL Async isDayClosed Check for PostgreSQL & SQLite
   */
  public static async isDayClosedAsync(
    date: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<boolean> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.isDayClosed(date, companyId, client);
  }
}
